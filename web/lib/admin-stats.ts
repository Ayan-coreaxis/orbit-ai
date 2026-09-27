import { prisma } from "@/lib/prisma";
import { PLAN_PRICE_USD } from "@/lib/usage-limit";

/** Readable names for the agentIds written to AgentUsage. Unknown ids fall back to prefix rules. */
const AGENT_LABELS: Record<string, string> = {
  "orchestrator-chat": "Orchestrator chat",
  "orchestrator-hiring": "Orchestrator — hiring",
  "orchestrator-meeting-router": "Orchestrator — meeting router",
  "strategy-planner": "Growth plan — planner",
  "strategy-ideas": "Growth plan — brainstorm",
  "strategy-review": "Growth plan — review",
  "market-research": "Market research (web)",
  competitor: "Competitor intelligence",
  chatbot: "Store chatbot",
  "orbit-design": "Orbit Design",
  "orbit-design-qa": "Orbit Design — QA",
  "orbit-design-visual-qa": "Orbit Design — visual QA",
  "orbit-design-audit": "Orbit Design — audit",
  "orbit-design-tweaks": "Orbit Design — tweaks",
  "orbit-code": "Orbit Code",
  "orbit-code-plan": "Orbit Code — plan",
  "orbit-wiring": "Orbit Design — wiring",
  "web-search": "Web search (Brave)",
};

export function agentLabel(id: string): string {
  if (AGENT_LABELS[id]) return AGENT_LABELS[id];
  const meeting = id.match(/^orchestrator-meeting-(.+)$/);
  if (meeting) return `Specialist — ${meeting[1].replace(/-/g, " ")}`;
  if (id.startsWith("studio")) return `Studio — ${id.slice(6).replace(/^[-:]/, "").replace(/-/g, " ") || "media"}`;
  return id.replace(/[-_:]/g, " ").replace(/^\w/, (c) => c.toUpperCase());
}

function startOfToday(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

export function startOfMonth(): Date {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

export async function getPlatformStats() {
  const weekAgo = new Date(Date.now() - 7 * 86400_000);
  const [businessCount, newThisWeek, published, usageToday, usageThisMonth, allUsage, ordersThisMonth] = await Promise.all([
    prisma.business.count(),
    prisma.business.count({ where: { createdAt: { gte: weekAgo } } }),
    prisma.storeDesign.count({ where: { published: true } }),
    prisma.agentUsage.aggregate({ where: { createdAt: { gte: startOfToday() } }, _count: true, _sum: { costUsd: true } }),
    prisma.agentUsage.aggregate({ where: { createdAt: { gte: startOfMonth() } }, _count: true, _sum: { costUsd: true } }),
    prisma.agentUsage.aggregate({ _count: true, _sum: { costUsd: true } }),
    prisma.order.aggregate({ where: { createdAt: { gte: startOfMonth() }, status: { not: "cancelled" } }, _count: true, _sum: { total: true } }),
  ]);

  return {
    businessCount,
    newThisWeek,
    published,
    agentRunsToday: usageToday._count,
    costToday: usageToday._sum.costUsd ?? 0,
    agentRunsThisMonth: usageThisMonth._count,
    costThisMonth: usageThisMonth._sum.costUsd ?? 0,
    totalRuns: allUsage._count,
    totalCostAllTime: allUsage._sum.costUsd ?? 0,
    ordersThisMonth: ordersThisMonth._count,
    gmvThisMonth: ordersThisMonth._sum.total ?? 0,
  };
}

export interface BusinessRow {
  id: string;
  name: string;
  niche: string;
  createdAt: Date;
  ownerEmail: string | null;
  published: boolean;
  productCount: number;
  orderCount: number;
  revenue: number;
  aiCostThisMonth: number;
  plan: string;
  monthlyUsageCapUsd: number | null;
  wantsToDiscuss: boolean;
  whatsappError: string | null;
  whatsappInboundNumber: string | null;
  subscriptionStatus: string | null;
}

/** One row per business. Counts and sums come from grouped queries, so this stays fast as orders grow. */
export async function getBusinessRows(): Promise<BusinessRow[]> {
  const [businesses, products, orders, usage] = await Promise.all([
    prisma.business.findMany({
      select: {
        id: true,
        name: true,
        niche: true,
        createdAt: true,
        storeDesign: { select: { published: true } },
        plan: true,
        monthlyUsageCapUsd: true,
        whatsappInboundNumber: true,
        subscriptionStatus: true,
        owner: { select: { email: true } },
        reports: { orderBy: { createdAt: "desc" }, take: 1, select: { content: true } },
      },
      orderBy: { createdAt: "desc" },
    }),
    prisma.product.groupBy({ by: ["businessId"], _count: true }),
    prisma.order.groupBy({ by: ["businessId"], where: { status: { not: "cancelled" } }, _count: true, _sum: { total: true } }),
    prisma.agentUsage.groupBy({ by: ["businessId"], where: { createdAt: { gte: startOfMonth() } }, _sum: { costUsd: true } }),
  ]);
  const productsBy = new Map(products.map((p) => [p.businessId, p._count]));
  const ordersBy = new Map(orders.map((o) => [o.businessId, o]));
  const usageBy = new Map(usage.map((u) => [u.businessId, u._sum.costUsd ?? 0]));

  return businesses.map((b) => {
    let wantsToDiscuss = false;
    let whatsappError: string | null = null;
    if (b.reports[0]) {
      try {
        const content = JSON.parse(b.reports[0].content);
        wantsToDiscuss = content.wantsToDiscuss === true;
        whatsappError = content.whatsappError ?? null;
      } catch {
        // leave defaults
      }
    }
    const o = ordersBy.get(b.id);
    return {
      id: b.id,
      name: b.name,
      niche: b.niche,
      createdAt: b.createdAt,
      ownerEmail: b.owner?.email ?? null,
      published: b.storeDesign?.published ?? false,
      productCount: productsBy.get(b.id) ?? 0,
      orderCount: o?._count ?? 0,
      revenue: o?._sum.total ?? 0,
      aiCostThisMonth: usageBy.get(b.id) ?? 0,
      plan: b.plan,
      monthlyUsageCapUsd: b.monthlyUsageCapUsd,
      whatsappInboundNumber: b.whatsappInboundNumber,
      subscriptionStatus: b.subscriptionStatus,
      wantsToDiscuss,
      whatsappError,
    };
  });
}

export type UsagePeriod = "today" | "month" | "30d" | "all";

export function periodStart(period: UsagePeriod): Date | undefined {
  if (period === "today") return startOfToday();
  if (period === "month") return startOfMonth();
  if (period === "30d") return new Date(Date.now() - 30 * 86400_000);
  return undefined;
}

export interface UsageRow {
  id: string;
  label: string;
  sub?: string;
  calls: number;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
  lastAt: Date | null;
}

/** AI spend for a period, grouped by business and by agent. */
export async function getUsage(period: UsagePeriod) {
  const since = periodStart(period);
  const where = since ? { createdAt: { gte: since } } : {};
  const sums = { _count: true, _sum: { inputTokens: true, outputTokens: true, costUsd: true }, _max: { createdAt: true } } as const;
  const [byBiz, byAgent, byModel] = await Promise.all([
    prisma.agentUsage.groupBy({ by: ["businessId"], where, ...sums }),
    prisma.agentUsage.groupBy({ by: ["agentId"], where, ...sums }),
    prisma.agentUsage.groupBy({ by: ["model"], where, _count: true, _sum: { costUsd: true } }),
  ]);
  const names = new Map(
    (await prisma.business.findMany({ where: { id: { in: byBiz.map((b) => b.businessId) } }, select: { id: true, name: true, niche: true } })).map((b) => [b.id, b]),
  );
  type Group = { _count: number; _sum: { inputTokens: number | null; outputTokens: number | null; costUsd: number | null }; _max: { createdAt: Date | null } };
  const row = (id: string, label: string, sub: string | undefined, g: Group): UsageRow => ({
    id,
    label,
    sub,
    calls: g._count,
    inputTokens: g._sum.inputTokens ?? 0,
    outputTokens: g._sum.outputTokens ?? 0,
    costUsd: g._sum.costUsd ?? 0,
    lastAt: g._max.createdAt,
  });
  const businesses = byBiz
    .map((g) => row(g.businessId, names.get(g.businessId)?.name || "(deleted business)", names.get(g.businessId)?.niche, g))
    .sort((a, b) => b.costUsd - a.costUsd);
  const agents = byAgent.map((g) => row(g.agentId, agentLabel(g.agentId), g.agentId, g)).sort((a, b) => b.costUsd - a.costUsd);
  const models = byModel.map((m) => ({ model: m.model, calls: m._count, costUsd: m._sum.costUsd ?? 0 })).sort((a, b) => b.costUsd - a.costUsd);
  const total = agents.reduce(
    (t, a) => ({ calls: t.calls + a.calls, input: t.input + a.inputTokens, output: t.output + a.outputTokens, cost: t.cost + a.costUsd }),
    { calls: 0, input: 0, output: 0, cost: 0 },
  );
  return { businesses, agents, models, total };
}

/** Plan mix and real subscription revenue (only businesses whose Stripe subscription is active count). */
export async function getBillingSummary() {
  const rows = await prisma.business.groupBy({ by: ["plan", "subscriptionStatus"], _count: true });
  const plans = Object.keys(PLAN_PRICE_USD).map((plan) => {
    const inPlan = rows.filter((r) => r.plan === plan);
    const paying = inPlan.filter((r) => r.subscriptionStatus === "active").reduce((s, r) => s + r._count, 0);
    return { plan, priceUsd: PLAN_PRICE_USD[plan], businesses: inPlan.reduce((s, r) => s + r._count, 0), paying };
  });
  const problem = rows.filter((r) => r.subscriptionStatus === "past_due").reduce((s, r) => s + r._count, 0);
  const mrr = plans.reduce((s, p) => s + p.paying * p.priceUsd, 0);
  return { plans, mrr, paying: plans.reduce((s, p) => s + p.paying, 0), pastDue: problem };
}
