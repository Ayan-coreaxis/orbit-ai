import Link from "next/link";
import {
  AlertTriangle,
  ArrowRight,
  ArrowUpRight,
  CheckCircle2,
  Clapperboard,
  Eye,
  Globe,
  Megaphone,
  MessageSquare,
  Package,
  PackageX,
  ShoppingBag,
  Sparkles,
  Store,
  Truck,
  TrendingDown,
  TrendingUp,
  Wallet,
} from "lucide-react";
import { Topbar } from "@/components/Topbar";
import { Card, SectionLabel } from "@/components/ui";
import { AgentNetwork, type AgentActivitySummary } from "@/components/AgentNetwork";
import { LiveFeed, type RealFeedItem } from "@/components/LiveFeed";
import { agents } from "@/lib/mock-data";
import { getBusinessSummary } from "@/lib/get-business";
import { getRealAgentActivity, getRecentAgentActivity } from "@/lib/get-agent-activity";
import { getOrderGrowth } from "@/lib/get-order-growth";
import { formatRelativeTime } from "@/lib/format-time";
import { prisma } from "@/lib/prisma";
import { loadStrategyLab } from "@/lib/strategy-lab";
import { GrowthPlanOverview } from "@/components/strategy/GrowthPlanOverview";
import { CountUp } from "@/components/dashboard/CountUp";
import { money } from "@/lib/money";
import { totalStock } from "@/lib/variants";
import { agentLabel as readableAgent } from "@/lib/admin-stats";

export const dynamic = "force-dynamic";

const ACTIVE_WINDOW_MS = 60 * 60 * 1000;

function agentLabel(agentId: string): string {
  if (agentId === "orchestrator-chat") return "Orchestrator chat";
  if (agentId === "orchestrator-meeting-router") return "Orchestrator (choosing who to consult)";
  if (agentId.startsWith("orchestrator-meeting-")) {
    const name = agents.find((a) => a.id === agentId.replace("orchestrator-meeting-", ""))?.name;
    return name ? `${name} (in meeting)` : agentId;
  }
  return agents.find((a) => a.id === agentId)?.name ?? readableAgent(agentId);
}

function greeting(d: Date) {
  const h = d.getHours();
  return h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
}

const STATUS_PILL: Record<string, string> = {
  pending: "bg-warn-soft text-warn",
  confirmed: "bg-accent-soft text-accent-strong",
  shipped: "bg-panel-2 text-text-dim",
  fulfilled: "bg-good-soft text-good",
  cancelled: "bg-bad-soft text-bad",
};

type Todo = { href: string; icon: React.ComponentType<{ className?: string }>; title: string; body: string; tone: "accent" | "warn" | "bad" | "neutral" };

export default async function DashboardPage() {
  const real = await getBusinessSummary();
  const now = new Date();

  if (!real) {
    return (
      <div>
        <Topbar title="Overview" subtitle="Let's set up your store" />
        <div className="p-5 sm:p-8 lg:p-10">
          <Card className="orbit-scale-in mx-auto max-w-xl p-8 text-center">
            <Sparkles className="mx-auto h-8 w-8 text-accent-strong" />
            <h2 className="mt-4 text-xl font-semibold">Welcome to Orbit</h2>
            <p className="mt-2 text-[14px] text-text-dim">Tell Orbit about your business and your AI team gets to work — it takes a few minutes.</p>
            <Link href="/onboarding" className="press mt-6 inline-flex items-center gap-2 rounded-xl bg-accent px-5 py-2.5 text-[14px] font-semibold text-white">
              Start setup <ArrowRight className="h-4 w-4" />
            </Link>
          </Card>
        </div>
      </div>
    );
  }

  const businessId = real.businessId;
  const since7 = new Date(now.getTime() - 7 * 86400000);
  const [business, orderGrowth, lab, recentOrders, unconfirmed, flagged, lowStock, storeDesign, productCount, visitors, activityMap, recent] = await Promise.all([
    prisma.business.findUnique({
      where: { id: businessId },
      select: { storeCurrency: true, metaPageId: true, courierProvider: true, metaPixelId: true, customDomainStatus: true, whatsappInboundNumber: true },
    }),
    getOrderGrowth(businessId),
    loadStrategyLab(businessId),
    prisma.order.findMany({ where: { businessId }, orderBy: { createdAt: "desc" }, take: 6, select: { id: true, customerName: true, total: true, status: true, verified: true, createdAt: true, paymentProvider: true } }),
    prisma.order.count({ where: { businessId, verified: false, status: "pending" } }),
    prisma.order.count({ where: { businessId, flagged: true, status: { in: ["pending", "confirmed"] } } }),
    // variant products keep stock per size/colour — count those, not the (unused) product-level number
    prisma.product
      .findMany({ where: { businessId }, select: { name: true, stock: true, optionTypes: true, variants: { select: { stock: true } } } })
      .then((ps) => ps.map((p) => ({ name: p.name, stock: totalStock(p, p.variants) })).filter((p) => p.stock <= 5).sort((a, b) => a.stock - b.stock).slice(0, 5)),
    prisma.storeDesign.findUnique({ where: { businessId }, select: { published: true } }),
    prisma.product.count({ where: { businessId } }),
    prisma.$queryRaw<{ c: bigint }[]>`SELECT COUNT(DISTINCT "sessionId") AS c FROM "StoreEvent" WHERE "businessId" = ${businessId} AND "type" = 'view_store' AND "createdAt" >= ${since7}`.catch(() => [{ c: BigInt(0) }]),
    getRealAgentActivity(businessId),
    getRecentAgentActivity(businessId, 40),
  ]);
  const currency = business?.storeCurrency ?? "pkr";
  const visitors7 = Number(visitors[0]?.c ?? 0);
  const needsAttention = unconfirmed + flagged;

  // What to do next — only real, checkable facts, most urgent first.
  const todos: Todo[] = [];
  if (!productCount) todos.push({ href: "/dashboard/store", icon: PackageX, title: "Add your products", body: "Your store is empty — add what you sell, with prices and photos, so there's something to buy.", tone: "accent" });
  if (real.planWaiting) todos.push({ href: "/dashboard/orchestrator", icon: Sparkles, title: "Your growth plan is ready", body: "Talk it through with your Orchestrator and approve it.", tone: "accent" });
  if (flagged) todos.push({ href: "/dashboard/store", icon: AlertTriangle, title: `${flagged} order${flagged === 1 ? "" : "s"} look suspicious`, body: "Check them before you ship.", tone: "bad" });
  if (unconfirmed) todos.push({ href: "/dashboard/store", icon: MessageSquare, title: `${unconfirmed} COD order${unconfirmed === 1 ? "" : "s"} waiting for the customer`, body: "They were asked to confirm on WhatsApp.", tone: "warn" });
  if (lowStock.length) todos.push({ href: "/dashboard/store", icon: PackageX, title: `${lowStock.length} product${lowStock.length === 1 ? "" : "s"} running low`, body: lowStock.map((p) => `${p.name} (${p.stock})`).join(", "), tone: "warn" });
  if (!storeDesign?.published) todos.push({ href: "/dashboard/orbit-design", icon: Store, title: "Publish your storefront", body: productCount ? `${productCount} products are ready — design the store and publish it.` : "Tell Orbit Design what you want and it builds it live.", tone: "accent" });
  if (!business?.courierProvider || business.courierProvider === "manual") todos.push({ href: "/dashboard/settings/delivery", icon: Truck, title: "Connect your courier", body: "Book PostEx, Leopards or TCS from an order and track deliveries automatically.", tone: "neutral" });
  if (!business?.metaPageId) todos.push({ href: "/dashboard/settings/channels", icon: Megaphone, title: "Connect Facebook & Instagram", body: "Post reels and run ads straight from Orbit.", tone: "neutral" });
  if (!business?.metaPixelId) todos.push({ href: "/dashboard/settings/tracking", icon: Eye, title: "Add your Meta Pixel", body: "So ads can optimise for real sales.", tone: "neutral" });
  if (business?.customDomainStatus !== "verified") todos.push({ href: "/dashboard/settings/domain", icon: Globe, title: "Use your own domain", body: "Put the store on yourbrand.com.", tone: "neutral" });

  // agent activity (meeting calls count for the specialist too)
  for (const [agentId, a] of Object.entries(activityMap)) {
    if (!agentId.startsWith("orchestrator-meeting-") || agentId === "orchestrator-meeting-router") continue;
    const baseId = agentId.replace("orchestrator-meeting-", "");
    const existing = activityMap[baseId] ?? { lastRunAt: null, callsToday: 0, callsAllTime: 0 };
    activityMap[baseId] = {
      lastRunAt: !existing.lastRunAt || (a.lastRunAt && a.lastRunAt > existing.lastRunAt) ? a.lastRunAt : existing.lastRunAt,
      callsToday: existing.callsToday + a.callsToday,
      callsAllTime: existing.callsAllTime + a.callsAllTime,
    };
  }
  const activity: Record<string, AgentActivitySummary> = {};
  for (const [agentId, a] of Object.entries(activityMap)) {
    activity[agentId] = {
      status: !a.lastRunAt ? "never" : now.getTime() - a.lastRunAt.getTime() < ACTIVE_WINDOW_MS ? "active" : "idle",
      lastRunLabel: a.lastRunAt ? `Last call ${formatRelativeTime(a.lastRunAt, now)} · ${a.callsAllTime} all time` : "Not run yet",
    };
  }
  // One line per run of the same agent ("Orbit Design — wiring ×8"), newest first, at most 8 lines.
  const feedItems: RealFeedItem[] = [];
  for (const r of recent) {
    const last = feedItems[feedItems.length - 1];
    if (last && last.id.startsWith(`${r.agentId}|`)) {
      const n = Number(last.id.split("|")[1]) + 1;
      last.id = `${r.agentId}|${n}`;
      last.agentLabel = `${agentLabel(r.agentId)} ×${n}`;
    } else if (feedItems.length < 8) {
      feedItems.push({ id: `${r.agentId}|1`, agentLabel: agentLabel(r.agentId), when: formatRelativeTime(r.createdAt, now) });
    }
  }
  const hasActivity = recent.length > 0;

  const growth = orderGrowth.orderGrowthPct;
  const kpis = [
    {
      label: "Orders · 7 days",
      value: <CountUp value={orderGrowth.thisWeekOrders} />,
      icon: ShoppingBag,
      sub:
        growth !== null ? (
          <span className={`inline-flex items-center gap-1 font-medium ${growth >= 0 ? "text-good" : "text-bad"}`}>
            {growth >= 0 ? <TrendingUp className="h-3.5 w-3.5" /> : <TrendingDown className="h-3.5 w-3.5" />}
            {growth >= 0 ? "+" : ""}
            {growth.toFixed(0)}% vs last week
          </span>
        ) : (
          `${orderGrowth.lastWeekOrders} the week before`
        ),
    },
    { label: "Revenue · 7 days", value: <CountUp value={orderGrowth.thisWeekRevenue} format="money" currency={currency} />, icon: Wallet, sub: `${money(orderGrowth.lastWeekRevenue, currency)} the week before` },
    { label: "Store visitors · 7 days", value: <CountUp value={visitors7} />, icon: Eye, sub: visitors7 && orderGrowth.thisWeekOrders ? `${((orderGrowth.thisWeekOrders / visitors7) * 100).toFixed(1)}% bought` : "Tracked on your storefront" },
    { label: "Needs your attention", value: <CountUp value={needsAttention} />, icon: AlertTriangle, sub: needsAttention ? `${unconfirmed} unconfirmed · ${flagged} flagged` : "All clear", alert: needsAttention > 0 },
  ];

  const toneCls: Record<Todo["tone"], string> = {
    accent: "bg-accent-soft text-accent-strong",
    warn: "bg-warn-soft text-warn",
    bad: "bg-bad-soft text-bad",
    neutral: "bg-panel-2 text-text-dim",
  };

  return (
    <div>
      <Topbar title={`${greeting(now)} 👋`} subtitle={`${real.businessName} · ${now.toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long" })}`} />
      <div className="max-w-[1400px] space-y-6 p-5 sm:p-8 lg:p-10">
        {/* KPIs */}
        <div className="orbit-stagger grid grid-cols-2 gap-3 lg:grid-cols-4 lg:gap-4">
          {kpis.map((k) => (
            <Card key={k.label} className={`hover-lift p-4 sm:p-5 ${k.alert ? "border-warn/40" : ""}`}>
              <div className="flex items-center justify-between gap-2">
                <span className="text-[12px] font-medium text-text-faint sm:text-[12.5px]">{k.label}</span>
                <k.icon className={`h-4 w-4 ${k.alert ? "text-warn" : "text-text-faint"}`} />
              </div>
              <div className="mt-2 text-[22px] font-semibold tracking-tight sm:text-[26px]">{k.value}</div>
              <div className="mt-1 truncate text-[11.5px] text-text-faint sm:text-[12px]">{k.sub}</div>
            </Card>
          ))}
        </div>

        {lab?.active && <GrowthPlanOverview plan={lab.active} currency={currency} />}

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)]">
          {/* Do next */}
          <Card className="p-5 sm:p-6">
            <div className="flex items-center justify-between">
              <SectionLabel>Do next</SectionLabel>
              {todos.length === 0 && (
                <span className="inline-flex items-center gap-1.5 text-[12.5px] text-good">
                  <CheckCircle2 className="h-4 w-4" /> You&apos;re all set
                </span>
              )}
            </div>
            {todos.length === 0 ? (
              <p className="mt-4 text-[13.5px] text-text-dim">Nothing needs you right now. Ask your Orchestrator what to push this week.</p>
            ) : (
              <ul className="orbit-stagger mt-4 space-y-2">
                {todos.slice(0, 6).map((t) => (
                  <li key={t.title}>
                    <Link href={t.href} className="group flex items-center gap-3 rounded-xl border border-transparent p-2.5 transition-all hover:border-border hover:bg-panel-2">
                      <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${toneCls[t.tone]}`}>
                        <t.icon className="h-4 w-4" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[14px] font-medium">{t.title}</span>
                        <span className="block truncate text-[12.5px] text-text-faint">{t.body}</span>
                      </span>
                      <ArrowRight className="h-4 w-4 shrink-0 text-text-faint transition-transform group-hover:translate-x-0.5 group-hover:text-text" />
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          {/* Recent orders */}
          <Card className="p-5 sm:p-6">
            <div className="flex items-center justify-between">
              <SectionLabel>Latest orders</SectionLabel>
              <Link href="/dashboard/store" className="inline-flex items-center gap-1 text-[12.5px] text-text-faint hover:text-text">
                All orders <ArrowUpRight className="h-3.5 w-3.5" />
              </Link>
            </div>
            {recentOrders.length === 0 ? (
              <div className="mt-6 flex flex-col items-center py-6 text-center">
                <Package className="h-7 w-7 text-text-faint" />
                <p className="mt-3 text-[13.5px] text-text-dim">No orders yet — they show up here the moment one comes in.</p>
              </div>
            ) : (
              <ul className="orbit-stagger mt-3 divide-y divide-border">
                {recentOrders.map((o) => (
                  <li key={o.id} className="flex items-center gap-3 py-2.5">
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-panel-2 text-[12px] font-semibold text-text-dim">
                      {o.customerName.slice(0, 1).toUpperCase()}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-[13.5px] font-medium">{o.customerName}</div>
                      <div className="text-[11.5px] text-text-faint">
                        #{o.id.slice(-6).toUpperCase()} · {formatRelativeTime(o.createdAt, now)} · {o.paymentProvider === "cod" ? "COD" : "Card"}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-[13.5px] font-semibold">{money(o.total, currency)}</div>
                      <span className={`mt-0.5 inline-block rounded-full px-2 py-0.5 text-[10.5px] font-medium ${STATUS_PILL[o.status] ?? "bg-panel-2 text-text-dim"}`}>
                        {!o.verified && o.status === "pending" ? "awaiting customer" : o.status}
                      </span>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>

        {/* Quick actions */}
        <div className="orbit-stagger grid grid-cols-2 gap-3 md:grid-cols-4">
          {[
            { href: "/dashboard/orchestrator", icon: Sparkles, label: "Ask the Orchestrator" },
            { href: "/dashboard/content", icon: Clapperboard, label: "Make a photo or reel" },
            { href: "/dashboard/ads", icon: Megaphone, label: "Create an ad" },
            { href: "/dashboard/orbit-design", icon: Store, label: "Edit your store" },
          ].map((a) => (
            <Link key={a.href} href={a.href} className="hover-lift press group flex items-center gap-3 rounded-2xl border border-border bg-panel p-4">
              <span className="flex h-9 w-9 items-center justify-center rounded-xl gradient-fill text-white transition-transform duration-300 group-hover:rotate-6">
                <a.icon className="h-4 w-4" />
              </span>
              <span className="text-[13.5px] font-medium">{a.label}</span>
            </Link>
          ))}
        </div>

        {/* Agent activity — only once something has happened */}
        {hasActivity ? (
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_300px]">
            <Card className="p-5 sm:p-7">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <span className="relative flex h-2 w-2">
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-good opacity-60" />
                    <span className="relative inline-flex h-2 w-2 rounded-full bg-good" />
                  </span>
                  <SectionLabel>Your AI team at work</SectionLabel>
                </div>
                <span className="hidden text-[12.5px] text-text-faint sm:block">Hover to preview, click to pin</span>
              </div>
              <div className="mt-6">
                <AgentNetwork activity={activity} />
              </div>
            </Card>
            <Card className="max-h-[560px] overflow-y-auto p-6">
              <LiveFeed items={feedItems} />
            </Card>
          </div>
        ) : (
          <Card className="flex items-center gap-4 p-5">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-panel-2">
              <Sparkles className="h-5 w-5 text-text-faint" />
            </span>
            <p className="text-[13.5px] text-text-dim">Your AI team&apos;s work will show up here — every call it makes, as it happens.</p>
          </Card>
        )}
      </div>
    </div>
  );
}
