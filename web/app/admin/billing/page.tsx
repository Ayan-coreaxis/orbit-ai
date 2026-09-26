import { Topbar } from "@/components/Topbar";
import { Card, SectionLabel } from "@/components/ui";
import { getRealPlatformStats } from "@/lib/admin-stats";
import { CircleDollarSign } from "lucide-react";

export default async function BillingPage() {
  const stats = await getRealPlatformStats();

  return (
    <div>
      <Topbar title="Billing & MRR" subtitle="Real AI cost tracked — subscription billing not connected yet" />
      <div className="max-w-[1300px] space-y-6 p-5 sm:p-8 lg:p-10">
        <Card className="p-7">
          <div className="flex items-start gap-3">
            <CircleDollarSign className="mt-0.5 h-5 w-5 shrink-0 text-text-faint" />
            <div>
              <SectionLabel>No real MRR to show yet</SectionLabel>
              <p className="mt-2 max-w-2xl text-[13.5px] leading-relaxed text-text-dim">
                Stripe isn&apos;t connected, and no business is on a paid plan — so there is no real
                subscription revenue. This page used to show a made-up $2,340 MRR with a fake growth
                chart and fake per-plan breakdown; that has been removed. Once Stripe is connected from
                the API Keys page and real subscriptions start, this page will show real MRR computed
                from actual charges — nothing before then.
              </p>
            </div>
          </div>
        </Card>

        <Card className="p-7">
          <SectionLabel>What is real today — platform cost, not revenue</SectionLabel>
          <div className="mt-4 grid grid-cols-1 gap-6 sm:grid-cols-3">
            <div>
              <div className="text-[12.5px] text-text-faint">Real AI cost this month</div>
              <div className="mt-1 text-2xl font-semibold">${stats.costThisMonth.toFixed(4)}</div>
            </div>
            <div>
              <div className="text-[12.5px] text-text-faint">Real AI cost, all time</div>
              <div className="mt-1 text-2xl font-semibold">${stats.totalCostAllTime.toFixed(4)}</div>
            </div>
            <div>
              <div className="text-[12.5px] text-text-faint">Real businesses on the platform</div>
              <div className="mt-1 text-2xl font-semibold">{stats.businessCount}</div>
            </div>
          </div>
          <p className="mt-4 text-[12.5px] text-text-faint">
            Full per-business and per-agent breakdown is on the{" "}
            <a href="/admin/usage" className="underline">
              AI Usage &amp; Cost
            </a>{" "}
            page — this is the real cost side of the business, while this page is reserved for real
            revenue once billing exists.
          </p>
        </Card>
      </div>
    </div>
  );
}
