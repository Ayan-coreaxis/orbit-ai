import Link from "next/link";
import { Topbar } from "@/components/Topbar";
import { Card, SectionLabel, Pill } from "@/components/ui";
import { getBillingSummary, getPlatformStats } from "@/lib/admin-stats";
import { PLAN_LABELS } from "@/lib/usage-limit";

export default async function BillingPage() {
  const [billing, stats] = await Promise.all([getBillingSummary(), getPlatformStats()]);
  const stripeOn = !!process.env.STRIPE_SECRET_KEY?.trim() && !!process.env.STRIPE_WEBHOOK_SECRET?.trim();
  const margin = billing.mrr > 0 ? ((billing.mrr - stats.costThisMonth) / billing.mrr) * 100 : null;

  return (
    <div>
      <Topbar title="Billing" subtitle="Subscription revenue from Stripe against what the AI costs" />
      <div className="max-w-[1300px] space-y-6 p-5 sm:p-8 lg:p-10">
        {!stripeOn && (
          <Card className="flex flex-wrap items-center justify-between gap-3 p-5">
            <p className="text-[13.5px] text-text-dim">
              Stripe isn&apos;t connected, so no seller can pay yet — plans are set by hand on the Sellers page.
            </p>
            <Link href="/admin/api-keys#stripe" className="text-[13px] font-medium text-accent-strong hover:underline">
              Connect Stripe →
            </Link>
          </Card>
        )}

        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <Stat label="MRR (active subscriptions)" value={`$${billing.mrr.toLocaleString()}`} />
          <Stat label="Paying sellers" value={`${billing.paying} / ${stats.businessCount}`} />
          <Stat label="AI cost this month" value={`$${stats.costThisMonth.toFixed(2)}`} />
          <Stat label="Gross margin this month" value={margin === null ? "—" : `${margin.toFixed(0)}%`} />
        </div>

        <Card className="overflow-hidden">
          <div className="p-6 pb-3">
            <SectionLabel>Plans</SectionLabel>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[520px] text-[14px]">
              <thead>
                <tr className="border-y border-border bg-panel-2/60 text-left text-[12.5px] text-text-faint">
                  <th className="px-6 py-3 font-medium">Plan</th>
                  <th className="px-6 py-3 text-right font-medium">Price</th>
                  <th className="px-6 py-3 text-right font-medium">Sellers on it</th>
                  <th className="px-6 py-3 text-right font-medium">Paying</th>
                  <th className="px-6 py-3 text-right font-medium">MRR</th>
                </tr>
              </thead>
              <tbody>
                {billing.plans.map((p) => (
                  <tr key={p.plan} className="border-b border-border last:border-0">
                    <td className="px-6 py-3 font-medium">{PLAN_LABELS[p.plan] ?? p.plan}</td>
                    <td className="px-6 py-3 text-right tabular-nums text-text-dim">${p.priceUsd}/mo</td>
                    <td className="px-6 py-3 text-right tabular-nums">{p.businesses}</td>
                    <td className="px-6 py-3 text-right tabular-nums">{p.paying}</td>
                    <td className="px-6 py-3 text-right font-medium tabular-nums">${(p.paying * p.priceUsd).toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>

        {billing.pastDue > 0 && (
          <Card className="flex items-center gap-3 p-5">
            <Pill tone="bad">{billing.pastDue} past due</Pill>
            <span className="text-[13.5px] text-text-dim">Stripe couldn&apos;t charge these sellers — see the Sellers page.</span>
          </Card>
        )}

        <p className="text-[12.5px] text-text-faint">
          Only subscriptions Stripe reports as active count towards MRR. A seller set to a plan by hand but not paying shows under
          &quot;Sellers on it&quot;, not &quot;Paying&quot;. Cost breakdown: <Link href="/admin/usage" className="underline">AI usage &amp; cost</Link>.
        </p>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <Card className="p-5">
      <div className="text-[12.5px] font-medium text-text-faint">{label}</div>
      <div className="mt-2 text-2xl font-semibold tabular-nums">{value}</div>
    </Card>
  );
}
