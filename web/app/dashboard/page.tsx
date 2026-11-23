import Link from "next/link";
import { paymentMethodLabel } from "@/lib/payment-methods";
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
import { parseBriefingTasks } from "@/lib/daily-briefing";

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
  const since56 = new Date(now.getTime() - 56 * 86400000);
  const [weekOrders, briefing, toShip, pendingCount] = await Promise.all([
    prisma.order.findMany({ where: { businessId, createdAt: { gte: since56 }, status: { not: "cancelled" } }, select: { total: true, status: true, createdAt: true } }),
    prisma.orchestratorMessage.findFirst({ where: { businessId, speaker: "briefing" }, orderBy: { createdAt: "desc" }, select: { tasks: true, createdAt: true } }),
    prisma.order.count({ where: { businessId, status: "confirmed" } }),
    prisma.order.count({ where: { businessId, status: "pending" } }),
  ]);
  // Sales per week, oldest first: settled (confirmed / shipped / delivered) vs still pending.
  const weeks = Array.from({ length: 8 }, (_, i) => {
    const end = new Date(now.getTime() - (7 - i) * 7 * 86400000);
    const start = new Date(end.getTime() - 7 * 86400000);
    const inWeek = weekOrders.filter((o) => o.createdAt > start && o.createdAt <= end);
    return {
      label: `${start.getDate()} ${start.toLocaleDateString("en-GB", { month: "short" })}`,
      settled: inWeek.filter((o) => o.status !== "pending").reduce((a, o) => a + o.total, 0),
      pending: inWeek.filter((o) => o.status === "pending").reduce((a, o) => a + o.total, 0),
    };
  });
  const weekMax = Math.max(1, ...weeks.map((w) => w.settled + w.pending));
  const briefTasks = parseBriefingTasks(briefing?.tasks).filter((t) => t.state !== "done" && t.state !== "skipped").slice(0, 4);
  const currency = business?.storeCurrency ?? "pkr";
  const visitors7 = Number(visitors[0]?.c ?? 0);
  const needsAttention = unconfirmed + flagged;

  // What to do next — only real, checkable facts, most urgent first.
  const todos: Todo[] = [];
  if (!productCount) todos.push({ href: "/dashboard/store#products", icon: PackageX, title: "Add your products", body: "Your store is empty — add what you sell, with prices and photos, so there's something to buy.", tone: "accent" });
  if (real.planWaiting) todos.push({ href: "/dashboard/orchestrator", icon: Sparkles, title: "Your growth plan is ready", body: "Talk it through with your Orchestrator and approve it.", tone: "accent" });
  if (flagged) todos.push({ href: "/dashboard/store", icon: AlertTriangle, title: `${flagged} order${flagged === 1 ? "" : "s"} look suspicious`, body: "Check them before you ship.", tone: "bad" });
  if (unconfirmed) todos.push({ href: "/dashboard/store", icon: MessageSquare, title: `${unconfirmed} COD order${unconfirmed === 1 ? "" : "s"} waiting for the customer`, body: "They were asked to confirm on WhatsApp.", tone: "warn" });
  if (lowStock.length) todos.push({ href: "/dashboard/store#products", icon: PackageX, title: `${lowStock.length} product${lowStock.length === 1 ? "" : "s"} running low`, body: lowStock.map((p) => `${p.name} (${p.stock})`).join(", "), tone: "warn" });
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
    accent: "bg-accent-soft text-accent",
    warn: "bg-warn-soft text-warn",
    bad: "bg-tomato-soft text-tomato-strong",
    neutral: "bg-panel-2 text-text-dim",
  };
  const revenueGrowth =
    orderGrowth.lastWeekRevenue > 0 ? ((orderGrowth.thisWeekRevenue - orderGrowth.lastWeekRevenue) / orderGrowth.lastWeekRevenue) * 100 : null;
  const conversion = visitors7 ? (orderGrowth.thisWeekOrders / visitors7) * 100 : null;
  const firstName = real.businessName;
  const todayCount = briefTasks.length || Math.min(todos.length, 4);
  const delta = (pct: number | null) =>
    pct === null ? null : (
      <span className={pct >= 0 ? "chip-up" : "chip-down"}>
        {pct >= 0 ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
        {Math.abs(pct).toFixed(0)}%
      </span>
    );

  return (
    <div>
      <header className="px-5 pb-2 pt-7 sm:px-8 sm:pt-9 xl:pl-2 xl:pr-10">
        <h1 className="text-[34px] font-semibold leading-[1.05] tracking-[-0.035em] sm:text-[48px]">
          {greeting(now)}, {firstName}
        </h1>
        <p className="mt-2.5 text-[16px] text-text-dim sm:text-[17px]">
          {todayCount ? `${todayCount} thing${todayCount === 1 ? "" : "s"} worth doing today` : "Nothing needs you right now"}
          {toShip ? ` · ${toShip} order${toShip === 1 ? "" : "s"} to ship` : ""}
          {needsAttention ? ` · ${needsAttention} to check` : ""}
        </p>
      </header>

      <div className="orbit-stagger grid grid-cols-1 gap-5 px-5 pt-6 sm:px-8 xl:grid-cols-12 xl:pl-2 xl:pr-10">
        {/* ---- Sales this week ---- */}
        <section className="app-card flex flex-col p-6 xl:col-span-4">
          <div className="flex items-center justify-between">
            <h2 className="text-[16px] font-medium text-text-dim">Sales this week</h2>
            <span className="rounded-full border border-border px-3 py-1 text-[12.5px] font-medium text-text-dim">{currency.toUpperCase()}</span>
          </div>
          <div className="mt-3 text-[40px] font-semibold leading-none tracking-[-0.035em] sm:text-[44px]">
            <CountUp value={orderGrowth.thisWeekRevenue} format="money" currency={currency} />
          </div>
          <div className="mt-3 flex items-center gap-2 text-[13.5px] text-text-faint">
            {delta(revenueGrowth)}
            <span>{revenueGrowth === null ? `${money(orderGrowth.lastWeekRevenue, currency)} last week` : "than last week"}</span>
          </div>
          <div className="mt-6 grid grid-cols-2 gap-2.5">
            <Link href="/dashboard/store#orders" className="btn-primary">
              <ShoppingBag className="h-4 w-4" /> Orders
            </Link>
            <Link href="/dashboard/orchestrator" className="btn-soft">
              <Sparkles className="h-4 w-4" /> Ask Orbit
            </Link>
          </div>
          <div className="app-tile mt-5 grid grid-cols-3 gap-2 p-2.5">
            {[
              { label: "To confirm", value: pendingCount, href: "/dashboard/store#orders" },
              { label: "To ship", value: toShip, href: "/dashboard/store#orders" },
              { label: "Low stock", value: lowStock.length, href: "/dashboard/store#products" },
            ].map((t) => (
              <Link key={t.label} href={t.href} className="hover-lift rounded-[14px] bg-panel p-3">
                <div className="text-[12.5px] text-text-faint">{t.label}</div>
                <div className="mt-1 text-[22px] font-semibold tracking-tight">{t.value}</div>
              </Link>
            ))}
          </div>
        </section>

        {/* ---- four numbers ---- */}
        <section className="app-card grid grid-cols-2 gap-3 p-3 xl:col-span-4">
          <div className="hover-lift flex flex-col justify-between rounded-[20px] bg-tomato p-5 text-white shadow-[0_18px_40px_-18px_var(--tomato)]">
            <div className="flex items-center justify-between">
              <span className="text-[14px] font-medium text-white/85">Orders</span>
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-white/20">
                <ShoppingBag className="h-4 w-4" />
              </span>
            </div>
            <div>
              <div className="mt-4 text-[34px] font-semibold leading-none tracking-tight">
                <CountUp value={orderGrowth.thisWeekOrders} />
              </div>
              <div className="mt-2 text-[13px] text-white/85">
                {growth !== null ? `${growth >= 0 ? "↑" : "↓"} ${Math.abs(growth).toFixed(0)}% · ` : ""}this week
              </div>
            </div>
          </div>
          {[
            { label: "Visitors", value: <CountUp value={visitors7} />, sub: "this week", icon: Eye },
            { label: "Bought", value: conversion === null ? "—" : `${conversion.toFixed(1)}%`, sub: "of visitors", icon: TrendingUp },
            { label: "To check", value: <CountUp value={needsAttention} />, sub: needsAttention ? `${flagged} flagged · ${unconfirmed} unconfirmed` : "all clear", icon: AlertTriangle, alert: needsAttention > 0 },
          ].map((k) => (
            <div key={k.label} className="hover-lift flex flex-col justify-between rounded-[20px] bg-panel-2 p-5">
              <div className="flex items-center justify-between">
                <span className="text-[14px] font-medium text-text-dim">{k.label}</span>
                <span className={`flex h-8 w-8 items-center justify-center rounded-full ${k.alert ? "bg-tomato-soft text-tomato-strong" : "bg-panel text-text-faint"}`}>
                  <k.icon className="h-4 w-4" />
                </span>
              </div>
              <div>
                <div className="mt-4 text-[30px] font-semibold leading-none tracking-tight">{k.value}</div>
                <div className="mt-2 truncate text-[12.5px] text-text-faint">{k.sub}</div>
              </div>
            </div>
          ))}
        </section>

        {/* ---- 8-week chart ---- */}
        <section className="app-card flex flex-col p-6 xl:col-span-4">
          <h2 className="text-[19px] font-semibold tracking-tight">Sales over time</h2>
          <p className="mt-1 text-[14px] text-text-faint">The last 8 weeks, from your real orders</p>
          <div className="app-tile mt-5 flex flex-1 flex-col p-4">
            <div className="flex items-center justify-between text-[13px]">
              <span className="font-medium">Weekly sales</span>
              <span className="flex items-center gap-3 text-text-faint">
                <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-[3px] bg-accent" />Confirmed</span>
                <span className="flex items-center gap-1.5"><span className="hatch h-2.5 w-2.5 rounded-[3px]" />Pending</span>
              </span>
            </div>
            <div className="mt-4 flex min-h-[150px] flex-1 items-end gap-2">
              {weeks.map((w, i) => {
                const total = w.settled + w.pending;
                const h = total ? Math.max(6, (total / weekMax) * 100) : 3;
                return (
                  <div key={i} className="group flex h-full flex-1 flex-col items-center justify-end gap-2" title={`${w.label}: ${money(total, currency)}`}>
                    <div className="grow-y flex w-full max-w-[30px] flex-col justify-end overflow-hidden rounded-[9px]" style={{ height: `${h}%`, animationDelay: `${i * 60}ms` }}>
                      {w.pending > 0 && <div className="hatch w-full" style={{ height: `${(w.pending / (total || 1)) * 100}%` }} />}
                      <div className={`w-full flex-1 ${total ? "bg-accent" : "bg-border-strong"} transition-opacity group-hover:opacity-80`} style={{ minHeight: w.settled ? 4 : 0 }} />
                    </div>
                    <span className="whitespace-nowrap text-[10.5px] text-text-faint">{w.label}</span>
                  </div>
                );
              })}
            </div>
          </div>
        </section>

        {/* ---- today ---- */}
        <section className="app-card p-6 xl:col-span-4">
          <div className="flex items-center justify-between">
            <h2 className="text-[19px] font-semibold tracking-tight">Today</h2>
            <Link href="/dashboard/orchestrator" className="text-[13.5px] font-medium text-text-dim hover:text-text">
              Open chat →
            </Link>
          </div>
          {briefTasks.length ? (
            <ul className="orbit-stagger mt-4 space-y-2.5">
              {briefTasks.map((t, i) => (
                <li key={t.id}>
                  <Link href="/dashboard/orchestrator" className="hover-lift group flex items-start gap-3 rounded-[18px] bg-panel-2 p-3.5">
                    <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[12.5px] font-bold ${i === 0 ? "bg-tomato text-white" : "bg-panel text-text-dim"}`}>{i + 1}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-[14.5px] font-semibold leading-snug">{t.title}</span>
                      <span className="mt-0.5 line-clamp-2 block text-[13px] leading-relaxed text-text-faint">{t.why}</span>
                    </span>
                    <ArrowRight className="mt-1 h-4 w-4 shrink-0 text-text-faint transition-transform group-hover:translate-x-0.5" />
                  </Link>
                </li>
              ))}
            </ul>
          ) : todos.length ? (
            <ul className="orbit-stagger mt-4 space-y-2.5">
              {todos.slice(0, 4).map((t) => (
                <li key={t.title}>
                  <Link href={t.href} className="hover-lift group flex items-center gap-3 rounded-[18px] bg-panel-2 p-3.5">
                    <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${toneCls[t.tone]}`}>
                      <t.icon className="h-4 w-4" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[14.5px] font-semibold">{t.title}</span>
                      <span className="block truncate text-[13px] text-text-faint">{t.body}</span>
                    </span>
                    <ArrowRight className="h-4 w-4 shrink-0 text-text-faint transition-transform group-hover:translate-x-0.5" />
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <div className="mt-6 flex flex-col items-center py-6 text-center">
              <CheckCircle2 className="h-8 w-8 text-good" />
              <p className="mt-3 text-[14.5px] text-text-dim">All clear. Ask Orbit what to push this week.</p>
            </div>
          )}
        </section>

        {/* ---- recent orders ---- */}
        <section className="app-card p-6 xl:col-span-8">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-[19px] font-semibold tracking-tight">Recent orders</h2>
            <Link href="/dashboard/store#orders" className="btn-soft !py-2 text-[13.5px]">
              All orders <ArrowUpRight className="h-4 w-4" />
            </Link>
          </div>
          {recentOrders.length === 0 ? (
            <div className="mt-6 flex flex-col items-center py-8 text-center">
              <Package className="h-8 w-8 text-text-faint" />
              <p className="mt-3 text-[14.5px] text-text-dim">No orders yet. They appear here the moment one comes in.</p>
            </div>
          ) : (
            <div className="app-tile mt-4 overflow-x-auto p-1.5">
              <table className="w-full min-w-[560px] text-left text-[14px]">
                <thead>
                  <tr className="text-[13px] text-text-faint">
                    <th className="px-3.5 py-3 font-medium">Order</th>
                    <th className="px-3.5 py-3 font-medium">Customer</th>
                    <th className="px-3.5 py-3 font-medium">Total</th>
                    <th className="px-3.5 py-3 font-medium">Payment</th>
                    <th className="px-3.5 py-3 font-medium">Status</th>
                    <th className="px-3.5 py-3 font-medium">When</th>
                  </tr>
                </thead>
                <tbody className="orbit-stagger">
                  {recentOrders.map((o) => {
                    const label = !o.verified && o.status === "pending" ? "Awaiting customer" : o.status.charAt(0).toUpperCase() + o.status.slice(1);
                    const dot =
                      o.status === "fulfilled" ? "bg-good" : o.status === "cancelled" ? "bg-text-faint" : o.status === "pending" ? "bg-tomato" : "bg-accent";
                    return (
                      <tr key={o.id} className="rounded-[14px] transition-colors hover:bg-panel">
                        <td className="whitespace-nowrap rounded-l-[14px] px-3.5 py-3 font-mono text-[13px] text-text-dim">#{o.id.slice(-6).toUpperCase()}</td>
                        <td className="whitespace-nowrap px-3.5 py-3 font-medium">{o.customerName}</td>
                        <td className="whitespace-nowrap px-3.5 py-3 font-semibold">{money(o.total, currency)}</td>
                        <td className="whitespace-nowrap px-3.5 py-3 text-text-dim">{o.paymentProvider === "cod" ? "Cash on delivery" : paymentMethodLabel(o.paymentProvider)}</td>
                        <td className="whitespace-nowrap px-3.5 py-3">
                          <span className="inline-flex items-center gap-2 text-text-dim">
                            <span className={`h-2 w-2 rounded-full ${dot}`} />
                            {label}
                          </span>
                        </td>
                        <td className="whitespace-nowrap rounded-r-[14px] px-3.5 py-3 text-text-faint">{formatRelativeTime(o.createdAt, now)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {lab?.active && (
          <div className="xl:col-span-12">
            <GrowthPlanOverview plan={lab.active} currency={currency} />
          </div>
        )}

        {/* ---- the AI team: what it did lately ---- */}
        {hasActivity && (
          <section className="app-card p-6 xl:col-span-12">
            <div className="flex items-center gap-2.5">
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-good opacity-60" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-good" />
              </span>
              <h2 className="text-[19px] font-semibold tracking-tight">What your AI team did</h2>
            </div>
            <ul className="orbit-stagger mt-4 grid gap-2.5 sm:grid-cols-2 xl:grid-cols-4">
              {feedItems.map((f, i) => (
                <li key={`${f.id}-${i}`} className="rounded-[16px] bg-panel-2 px-4 py-3">
                  <div className="truncate text-[14px] font-medium">{f.agentLabel}</div>
                  <div className="mt-0.5 text-[12.5px] text-text-faint">{f.when}</div>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </div>
  );
}
