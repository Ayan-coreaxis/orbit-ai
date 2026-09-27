import Link from "next/link";
import { Topbar } from "@/components/Topbar";
import { Card, SectionLabel, Pill } from "@/components/ui";
import { getPlatformStats, getBusinessRows } from "@/lib/admin-stats";
import { getUsageStatus, type UsageWindowId } from "@/lib/usage-limit";
import { setupChecklist } from "@/lib/setup-check";
import { SetupChecklist } from "@/components/admin/SetupChecklist";

const BLOCKED_LABEL: Record<UsageWindowId, string> = {
  session: "5-hour AI limit reached",
  weekly: "Weekly AI limit reached",
  monthly: "Monthly AI cap reached",
};

export default async function AdminOverview() {
  const [stats, businesses, setup] = await Promise.all([getPlatformStats(), getBusinessRows(), setupChecklist()]);

  // Only sellers who spent something this month can be blocked, so only they need the window check.
  const spenders = businesses.filter((b) => b.aiCostThisMonth > 0);
  const blocked = new Map(await Promise.all(spenders.map(async (b) => [b.id, (await getUsageStatus(b.id)).blockedWindow] as const)));

  const flagged = businesses.filter((b) => b.wantsToDiscuss || b.whatsappError || blocked.get(b.id) || b.subscriptionStatus === "past_due");
  const newest = businesses.slice(0, 5);

  const tiles = [
    { label: "Sellers", value: stats.businessCount.toLocaleString(), sub: `+${stats.newThisWeek} this week · ${stats.published} stores live`, href: "/admin/sellers" },
    { label: "Orders this month", value: stats.ordersThisMonth.toLocaleString(), sub: `Rs ${Math.round(stats.gmvThisMonth).toLocaleString()} across all stores` },
    { label: "AI cost today", value: `$${stats.costToday.toFixed(2)}`, sub: `${stats.agentRunsToday.toLocaleString()} AI calls`, href: "/admin/usage?period=today" },
    { label: "AI cost this month", value: `$${stats.costThisMonth.toFixed(2)}`, sub: `${stats.agentRunsThisMonth.toLocaleString()} AI calls`, href: "/admin/usage" },
  ];

  return (
    <div>
      <Topbar title="Overview" subtitle="How the platform is doing, and what needs you" />
      <div className="max-w-[1300px] space-y-6 p-5 sm:p-8 lg:p-10">
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          {tiles.map((t) => {
            const body = (
              <Card className="h-full p-5 transition-colors hover:border-border-strong">
                <div className="text-[12.5px] font-medium text-text-faint">{t.label}</div>
                <div className="mt-2 text-2xl font-semibold tabular-nums">{t.value}</div>
                <div className="mt-1 text-[12px] text-text-dim">{t.sub}</div>
              </Card>
            );
            return t.href ? (
              <Link key={t.label} href={t.href}>
                {body}
              </Link>
            ) : (
              <div key={t.label}>{body}</div>
            );
          })}
        </div>

        <div className="grid gap-6 lg:grid-cols-2">
          <Card className="p-6">
            <div className="flex items-center justify-between">
              <SectionLabel>Needs attention</SectionLabel>
              {flagged.length > 0 && (
                <Link href="/admin/sellers?filter=flagged" className="text-[12.5px] font-medium text-accent-strong hover:underline">
                  All →
                </Link>
              )}
            </div>
            <div className="mt-3 divide-y divide-border">
              {flagged.slice(0, 8).map((b) => (
                <div key={b.id} className="flex flex-wrap items-center justify-between gap-2 py-3">
                  <div>
                    <div className="text-[14px] font-medium">{b.name || "(unnamed)"}</div>
                    <div className="text-[12.5px] text-text-faint">{b.niche}</div>
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5">
                    {blocked.get(b.id) && <Pill tone="bad">{BLOCKED_LABEL[blocked.get(b.id)!]}</Pill>}
                    {b.subscriptionStatus === "past_due" && <Pill tone="bad">Payment past due</Pill>}
                    {b.wantsToDiscuss && <Pill tone="accent">Orchestrator wants to talk</Pill>}
                    {b.whatsappError && <Pill tone="warn">WhatsApp send failed</Pill>}
                  </div>
                </div>
              ))}
              {flagged.length === 0 && <p className="py-3 text-[13.5px] text-text-faint">Nothing needs you right now.</p>}
            </div>
          </Card>

          <Card className="p-6">
            <div className="flex items-center justify-between">
              <SectionLabel>Newest sellers</SectionLabel>
              <Link href="/admin/sellers" className="text-[12.5px] font-medium text-accent-strong hover:underline">
                All →
              </Link>
            </div>
            <div className="mt-3 divide-y divide-border">
              {newest.map((b) => (
                <div key={b.id} className="flex items-center justify-between gap-2 py-3">
                  <div className="min-w-0">
                    <div className="truncate text-[14px] font-medium">{b.name || "(unnamed)"}</div>
                    <div className="truncate text-[12.5px] text-text-faint">
                      {b.niche} · {b.createdAt.toLocaleDateString()}
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-1.5 text-[12.5px] text-text-dim">
                    {b.productCount} products · {b.orderCount} orders
                    <Pill tone={b.published ? "good" : "neutral"}>{b.published ? "Live" : "Draft"}</Pill>
                  </div>
                </div>
              ))}
              {newest.length === 0 && <p className="py-3 text-[13.5px] text-text-faint">No sellers yet.</p>}
            </div>
          </Card>
        </div>

        <SetupChecklist items={setup} />
      </div>
    </div>
  );
}
