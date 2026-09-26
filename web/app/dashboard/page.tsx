import Link from "next/link";
import { Topbar } from "@/components/Topbar";
import { Card, SectionLabel, StatusBadge } from "@/components/ui";
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
import { Sparkles, TrendingUp, TrendingDown, Store } from "lucide-react";
import { money } from "@/lib/money";

const layers = Array.from(new Set(agents.map((a) => a.layer)));
const ACTIVE_WINDOW_MS = 60 * 60 * 1000;

function agentLabel(agentId: string): string {
  if (agentId === "orchestrator-chat") return "Orchestrator Chat";
  if (agentId === "orchestrator-meeting-router") return "Orchestrator (deciding who to consult)";
  if (agentId.startsWith("orchestrator-meeting-")) {
    const specialistId = agentId.replace("orchestrator-meeting-", "");
    const name = agents.find((a) => a.id === specialistId)?.name;
    return name ? `${name} (in meeting)` : agentId;
  }
  return agents.find((a) => a.id === agentId)?.name ?? agentId;
}

export default async function DashboardPage() {
  const real = await getBusinessSummary();
  const now = new Date();

  const activityMap = real ? await getRealAgentActivity(real.businessId) : {};
  const recent = real ? await getRecentAgentActivity(real.businessId, 8) : [];
  const orderGrowth = real ? await getOrderGrowth(real.businessId) : null;

  const lab = real ? await loadStrategyLab(real.businessId) : null;
  const currency = real ? (await prisma.business.findUnique({ where: { id: real.businessId }, select: { storeCurrency: true } }))?.storeCurrency ?? "usd" : "usd";

  const planDraft = real
    ? await prisma.growthPlan.findFirst({
        where: { businessId: real.businessId, status: "draft" },
        select: { title: true, _count: { select: { strategies: true } } },
      })
    : null;

  const store = real
    ? {
        published: (await prisma.storeDesign.findUnique({ where: { businessId: real.businessId }, select: { published: true } }))?.published ?? false,
        productCount: await prisma.product.count({ where: { businessId: real.businessId } }),
      }
    : null;

  // A specialist speaking in an Orchestrator meeting is real activity for that specialist too —
  // fold "orchestrator-meeting-<id>" calls into the base agent's own activity for the network
  // diagram, so its node lights up, without losing the distinct id in the raw feed below.
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
    const status = !a.lastRunAt
      ? "never"
      : now.getTime() - a.lastRunAt.getTime() < ACTIVE_WINDOW_MS
        ? "active"
        : "idle";
    activity[agentId] = {
      status,
      lastRunLabel: a.lastRunAt
        ? `Last real call ${formatRelativeTime(a.lastRunAt, now)} · ${a.callsAllTime} call${a.callsAllTime === 1 ? "" : "s"} all time`
        : "Not run yet",
    };
  }

  const feedItems: RealFeedItem[] = recent.map((r, i) => ({
    id: `${r.agentId}-${i}`,
    agentLabel: agentLabel(r.agentId),
    when: formatRelativeTime(r.createdAt, now),
  }));

  return (
    <div>
      <Topbar title="Overview" subtitle={real ? real.businessName : "No business yet"} />
      <div className="max-w-[1400px] space-y-10 p-10">
        {!real && (
          <div className="flex items-start gap-3 rounded-xl border border-accent/25 bg-accent-soft px-4 py-3.5">
            <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-accent-strong" />
            <p className="text-[13.5px] leading-relaxed text-accent-strong">
              No business yet. <a href="/onboarding" className="underline">Complete onboarding</a> to set up your store and growth plan — nothing fake is shown here in the meantime.
            </p>
          </div>
        )}

        {real && lab?.active && <GrowthPlanOverview plan={lab.active} currency={currency} />}

        {real && planDraft && (
          <Card className="flex flex-wrap items-center justify-between gap-4 border-accent/25 bg-accent-soft p-5">
            <div className="flex items-start gap-3">
              <Sparkles className="mt-0.5 h-4.5 w-4.5 shrink-0 text-accent-strong" />
              <div>
                <div className="text-[14px] font-semibold text-accent-strong">Your growth plan is ready to discuss</div>
                <p className="mt-0.5 text-[13px] leading-relaxed text-accent-strong/80">
                  &ldquo;{planDraft.title}&rdquo; — {planDraft._count.strategies} strategies built from your own numbers. Talk it through with your
                  Orchestrator, change anything, and approve it when it&apos;s right. Nothing runs before that.
                </p>
              </div>
            </div>
            <Link
              href="/dashboard/orchestrator"
              className="shrink-0 rounded-lg bg-accent px-4 py-2 text-[13.5px] font-semibold text-white hover:opacity-90"
            >
              Talk to your Orchestrator
            </Link>
          </Card>
        )}

        {real && store && !store.published && (
          <Card className="flex flex-wrap items-center justify-between gap-4 border-accent/25 bg-accent-soft p-5">
            <div className="flex items-start gap-3">
              <Store className="mt-0.5 h-4.5 w-4.5 shrink-0 text-accent-strong" />
              <div>
                <div className="text-[14px] font-semibold text-accent-strong">Design your storefront</div>
                <p className="mt-0.5 text-[13px] leading-relaxed text-accent-strong/80">
                  {store.productCount > 0
                    ? `${store.productCount} product${store.productCount === 1 ? "" : "s"} imported from your website. Tell Orbit Design what you want and it builds your store live — publish it when ready.`
                    : "Tell Orbit Design what kind of store you want and it builds it live — home, shop, about, and more. Publish it when ready."}
                </p>
              </div>
            </div>
            <Link
              href="/dashboard/orbit-design"
              className="shrink-0 rounded-lg bg-accent px-4 py-2 text-[13.5px] font-semibold text-white hover:opacity-90"
            >
              Open Orbit Design
            </Link>
          </Card>
        )}

        {/* Real orders + growth — the actual thing this whole platform exists to move */}
        {orderGrowth && (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Card className="p-6">
              <SectionLabel>Real orders — last 7 days</SectionLabel>
              <div className="mt-2 flex items-baseline gap-3">
                <span className="text-3xl font-semibold">{orderGrowth.thisWeekOrders}</span>
                {orderGrowth.orderGrowthPct !== null ? (
                  <span
                    className={`flex items-center gap-1 text-[13px] font-medium ${orderGrowth.orderGrowthPct >= 0 ? "text-good" : "text-bad"}`}
                  >
                    {orderGrowth.orderGrowthPct >= 0 ? (
                      <TrendingUp className="h-3.5 w-3.5" />
                    ) : (
                      <TrendingDown className="h-3.5 w-3.5" />
                    )}
                    {orderGrowth.orderGrowthPct >= 0 ? "+" : ""}
                    {orderGrowth.orderGrowthPct.toFixed(0)}% vs prior week
                  </span>
                ) : (
                  <span className="text-[12.5px] text-text-faint">
                    {orderGrowth.lastWeekOrders === 0 && orderGrowth.thisWeekOrders === 0
                      ? "no real orders yet this period or last"
                      : "no orders last week to compare against"}
                  </span>
                )}
              </div>
              <p className="mt-1.5 text-[12px] text-text-faint">
                {orderGrowth.lastWeekOrders} order{orderGrowth.lastWeekOrders === 1 ? "" : "s"} the week before — real orders, computed directly, never estimated.
              </p>
            </Card>
            <Card className="p-6">
              <SectionLabel>Real revenue — last 7 days</SectionLabel>
              <div className="mt-2 text-3xl font-semibold">{money(orderGrowth.thisWeekRevenue, currency)}</div>
              <p className="mt-1.5 text-[12px] text-text-faint">
                {money(orderGrowth.lastWeekRevenue, currency)} the week before.
              </p>
            </Card>
          </div>
        )}

        {/* Agent network + real activity */}
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_300px]">
          <Card className="p-7">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <span className="relative flex h-2 w-2">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-good opacity-60" />
                  <span className="relative inline-flex h-2 w-2 rounded-full bg-good" />
                </span>
                <SectionLabel>Real agent activity</SectionLabel>
              </div>
              <span className="text-[12.5px] text-text-faint">Hover to preview, click to pin</span>
            </div>
            <div className="mt-6">
              <AgentNetwork activity={activity} />
            </div>
            <div className="mt-2 flex items-center justify-center gap-5 text-[12px] text-text-faint">
              <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-good" /> Ran recently</span>
              <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full" style={{ background: "#8a8578" }} /> Ran before</span>
              <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full" style={{ background: "#c7c4bb" }} /> Not run yet</span>
            </div>
          </Card>
          <Card className="max-h-[560px] overflow-y-auto p-6">
            <LiveFeed items={feedItems} />
          </Card>
        </div>

        {/* Agent grid */}
        <div>
          <SectionLabel>Your AI team — 19 people you never have to hire</SectionLabel>
          <p className="mt-1.5 text-[13px] text-text-faint">
            <span className="text-good">● Live</span> agents run real AI today. <span className="text-text-faint">○ Preview</span> agents show the plan — not built yet.
          </p>
          <div className="mt-5 space-y-8">
            {layers.map((layer) => (
              <div key={layer}>
                <div className="mb-3 text-[14px] font-semibold text-accent-strong">{layer}</div>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {agents
                    .filter((a) => a.layer === layer)
                    .map((a) => {
                      const summary = activity[a.id];
                      return (
                        <Link key={a.id} href={`/dashboard/agents/${a.id}`}>
                          <Card
                            className={
                              "p-5 transition-colors hover:border-border-strong" +
                              (a.live ? "" : " opacity-60")
                            }
                          >
                            <div className="flex items-start justify-between gap-2">
                              <span className="text-[14.5px] font-medium">{a.name}</span>
                              {a.live ? (
                                <StatusBadge status={summary?.status ?? "never"} />
                              ) : (
                                <span className="rounded-full bg-panel-2 px-2.5 py-1 text-[11px] font-medium text-text-faint">
                                  Preview
                                </span>
                              )}
                            </div>
                            <p className="mt-2.5 text-[13.5px] leading-relaxed text-text-dim">
                              {a.live ? (summary?.lastRunLabel ?? "Not run yet") : "Not built yet"}
                            </p>
                          </Card>
                        </Link>
                      );
                    })}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
