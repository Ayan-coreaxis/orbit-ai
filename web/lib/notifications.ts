import { prisma } from "@/lib/prisma";
import { money } from "@/lib/money";
import { totalStock } from "@/lib/variants";
import { parseBriefingTasks } from "@/lib/daily-briefing";

export interface Notice {
  id: string;
  kind: "order" | "flag" | "stock" | "briefing" | "proposal" | "message";
  title: string;
  body: string;
  href: string;
  at: string; // ISO
}

/** The bell: things that happened or need the owner, newest first. Read straight from the data. */
export async function notificationsFor(businessId: string): Promise<Notice[]> {
  const since = new Date(Date.now() - 3 * 86_400_000);
  const [business, orders, flagged, products, briefing, proposals, chats] = await Promise.all([
    prisma.business.findUnique({ where: { id: businessId }, select: { storeCurrency: true } }),
    prisma.order.findMany({ where: { businessId, createdAt: { gte: since } }, orderBy: { createdAt: "desc" }, take: 12, select: { id: true, customerName: true, total: true, createdAt: true } }),
    prisma.order.findMany({ where: { businessId, flagged: true, status: { in: ["pending", "confirmed"] } }, orderBy: { createdAt: "desc" }, take: 5, select: { id: true, customerName: true, createdAt: true, riskScore: true } }),
    prisma.product.findMany({ where: { businessId }, select: { id: true, name: true, stock: true, optionTypes: true, createdAt: true, variants: { select: { stock: true } } }, take: 500 }),
    prisma.orchestratorMessage.findFirst({ where: { businessId, speaker: "briefing" }, orderBy: { createdAt: "desc" }, select: { id: true, tasks: true, createdAt: true } }),
    prisma.orchestratorMessage.findMany({ where: { businessId, opsState: "pending" }, orderBy: { createdAt: "desc" }, take: 5, select: { id: true, createdAt: true, opsSummary: true } }),
    prisma.chatMessage.findMany({ where: { businessId, role: "user", createdAt: { gte: since } }, orderBy: { createdAt: "desc" }, take: 30, select: { customerRef: true, channel: true, content: true, createdAt: true } }),
  ]);
  const cur = business?.storeCurrency ?? "pkr";
  const out: Notice[] = [];
  for (const o of orders) {
    out.push({ id: `order-${o.id}`, kind: "order", title: `New order · ${money(o.total, cur)}`, body: `${o.customerName} · #${o.id.slice(-6).toUpperCase()}`, href: "/dashboard/store#orders", at: o.createdAt.toISOString() });
  }
  for (const o of flagged) {
    out.push({ id: `flag-${o.id}`, kind: "flag", title: "Order needs a check before shipping", body: `${o.customerName}${o.riskScore != null ? ` · risk ${o.riskScore}/100` : ""}`, href: "/dashboard/store#orders", at: o.createdAt.toISOString() });
  }
  const low = products
    .map((p) => ({ p, s: totalStock(p, p.variants) }))
    .filter((x) => x.s <= 3)
    .slice(0, 4);
  for (const { p, s } of low) {
    out.push({ id: `stock-${p.id}-${s}`, kind: "stock", title: s <= 0 ? `Sold out: ${p.name}` : `Almost out: ${p.name}`, body: s <= 0 ? "Restock or hide it from the store" : `${s} left`, href: "/dashboard/store#products", at: new Date(Math.max(Date.now() - 3600_000, p.createdAt.getTime())).toISOString() });
  }
  if (briefing) {
    const open = parseBriefingTasks(briefing.tasks).filter((t) => t.state !== "done" && t.state !== "skipped");
    if (open.length) out.push({ id: `brief-${briefing.id}`, kind: "briefing", title: `Today's store check · ${open.length} to do`, body: open[0].title, href: "/dashboard/orchestrator", at: briefing.createdAt.toISOString() });
  }
  for (const p of proposals) {
    let first = "A change is waiting for your Apply";
    try {
      const lines = JSON.parse(p.opsSummary ?? "[]") as string[];
      if (lines[0]) first = lines[0];
    } catch {
      /* keep default */
    }
    out.push({ id: `prop-${p.id}`, kind: "proposal", title: "Waiting for your Apply", body: first.slice(0, 120), href: "/dashboard/orchestrator", at: p.createdAt.toISOString() });
  }
  const seen = new Set<string>();
  for (const c of chats) {
    if (seen.has(c.customerRef)) continue;
    seen.add(c.customerRef);
    out.push({ id: `msg-${c.customerRef}-${c.createdAt.getTime()}`, kind: "message", title: `New message · ${c.channel === "whatsapp" ? "WhatsApp" : c.channel === "instagram" ? "Instagram" : "Website chat"}`, body: c.content.slice(0, 100), href: "/dashboard/inbox", at: c.createdAt.toISOString() });
    if (seen.size >= 4) break;
  }
  return out.sort((a, b) => b.at.localeCompare(a.at)).slice(0, 20);
}
