import Link from "next/link";
import { Topbar } from "@/components/Topbar";
import { Card, SectionLabel, Pill } from "@/components/ui";
import { getRealPlatformStats, getRealBusinessRows } from "@/lib/admin-stats";
import { getUsageStatus, type UsageWindowId } from "@/lib/usage-limit";
import { MessageCircle, AlertTriangle, CircleDollarSign } from "lucide-react";

const BLOCKED_LABEL: Record<UsageWindowId, string> = {
  session: "At 5-hour cap — blocked",
  weekly: "At weekly cap — blocked",
  monthly: "At monthly cap — blocked",
};

export default async function AdminOverview() {
  const [stats, businesses] = await Promise.all([getRealPlatformStats(), getRealBusinessRows()]);

  // Real blocking status per business — checks the same rolling session/weekly/monthly windows
  // that actually gate a new AI cycle, not just the monthly headline number.
  const blockedWindows = new Map(
    (await Promise.all(businesses.map(async (b) => [b.id, (await getUsageStatus(b.id)).blockedWindow] as const))),
  );

  const flagged = businesses.filter((b) => b.wantsToDiscuss || b.whatsappError || blockedWindows.get(b.id));

  const tiles = [
    { label: "Real businesses on the platform", value: stats.businessCount.toLocaleString() },
    { label: "Agent runs today", value: stats.agentRunsToday.toLocaleString() },
    { label: "AI cost today", value: `$${stats.costToday.toFixed(4)}` },
    { label: "AI cost this month", value: `$${stats.costThisMonth.toFixed(4)}` },
  ];

  return (
    <div>
      <Topbar title="Platform Overview" subtitle="Real numbers only — nothing here is seeded or estimated" />
      <div className="max-w-[1300px] space-y-8 p-10">
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          {tiles.map((t) => (
            <Card key={t.label} className="p-5">
              <div className="text-[12.5px] font-medium text-text-faint">{t.label}</div>
              <div className="mt-2.5 text-2xl font-semibold">{t.value}</div>
            </Card>
          ))}
        </div>

        <Card className="p-6">
          <div className="flex items-start gap-3">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-text-faint" />
            <div>
              <div className="text-[13.5px] font-medium text-text-dim">
                No MRR, plan, or agent-uptime numbers shown here
              </div>
              <p className="mt-1 text-[13px] leading-relaxed text-text-faint">
                Stripe billing isn&apos;t connected yet, so there is no real subscription revenue to
                report — showing a made-up MRR number would be exactly the kind of fake data this
                page used to have. Same for agent uptime/error-rate: no monitoring system exists yet,
                so that section has been removed rather than filled with invented numbers.
              </p>
            </div>
          </div>
        </Card>

        <Card className="p-6">
          <div className="flex items-center gap-2">
            <MessageCircle className="h-4 w-4 text-warn" />
            <SectionLabel>Businesses with a real signal worth checking</SectionLabel>
          </div>
          <p className="mt-2 text-[13px] text-text-faint">
            Flagged when the Orchestrator itself decided something is worth discussing, a real
            WhatsApp send failed, or a business hit its usage cap mid-month and is blocked until you
            raise it — all real, checkable events, not estimates.
          </p>
          <div className="mt-4 divide-y divide-border">
            {flagged.map((b) => (
              <div key={b.id} className="flex items-center justify-between py-3">
                <div>
                  <div className="text-[14px] font-medium">{b.name || "(unnamed)"}</div>
                  <div className="text-[12.5px] text-text-faint">{b.niche}</div>
                </div>
                <div className="flex items-center gap-2">
                  {blockedWindows.get(b.id) && (
                    <>
                      <Pill tone="bad">
                        <CircleDollarSign className="mr-1 inline h-3 w-3" />
                        {BLOCKED_LABEL[blockedWindows.get(b.id)!]}
                      </Pill>
                      <Link href="/admin/sellers" className="text-[12px] font-medium text-accent-strong hover:underline">
                        Raise cap →
                      </Link>
                    </>
                  )}
                  {b.wantsToDiscuss && <Pill tone="accent">Orchestrator wants to talk</Pill>}
                  {b.whatsappError && <Pill tone="warn">WhatsApp send failed</Pill>}
                </div>
              </div>
            ))}
            {flagged.length === 0 && (
              <p className="py-4 text-[13.5px] text-text-faint">Nothing flagged right now.</p>
            )}
          </div>
        </Card>
      </div>
    </div>
  );
}
