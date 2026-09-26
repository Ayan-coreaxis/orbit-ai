import { Topbar } from "@/components/Topbar";
import { Card, Pill } from "@/components/ui";
import { getRealBusinessRows } from "@/lib/admin-stats";
import { PlanEditor } from "@/components/admin/PlanEditor";
import { WhatsAppNumberEditor } from "@/components/admin/WhatsAppNumberEditor";

export default async function SellersPage() {
  const businesses = await getRealBusinessRows();

  return (
    <div>
      <Topbar
        title="Businesses"
        subtitle={`${businesses.length} real business${businesses.length === 1 ? "" : "es"} on the platform — plan/cap set manually here, Stripe billing isn't connected yet`}
      />
      <div className="max-w-[1400px] space-y-6 p-5 sm:p-8 lg:p-10">
        <Card className="overflow-hidden">
          {businesses.length === 0 ? (
            <p className="p-6 text-[13.5px] text-text-faint">
              No businesses yet — this fills in as real sellers complete onboarding.
            </p>
          ) : (
            <div className="overflow-x-auto"><table className="w-full min-w-[640px] text-[14px]">
              <thead>
                <tr className="border-b border-border bg-panel-2/60 text-left text-[12.5px] font-medium text-text-faint">
                  <th className="px-6 py-3.5 font-medium">Business</th>
                  <th className="px-6 py-3.5 font-medium">Owner</th>
                  <th className="px-6 py-3.5 font-medium">Plan / usage cap</th>
                  <th className="px-6 py-3.5 font-medium">Real WhatsApp number</th>
                  <th className="px-6 py-3.5 font-medium">Usage this month</th>
                  <th className="px-6 py-3.5 font-medium">Real revenue</th>
                  <th className="px-6 py-3.5 font-medium">Joined</th>
                  <th className="px-6 py-3.5 font-medium">Signal</th>
                </tr>
              </thead>
              <tbody>
                {businesses.map((b) => {
                  const overCap = b.monthlyUsageCapUsd !== null && b.aiCostThisMonth >= b.monthlyUsageCapUsd;
                  return (
                    <tr key={b.id} className="border-b border-border last:border-0">
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-panel-2 text-[11px] font-medium text-text-dim">
                            {(b.name || "?").slice(0, 2).toUpperCase()}
                          </div>
                          <div>
                            <div className="font-medium">{b.name || "(unnamed)"}</div>
                            <div className="text-[12px] text-text-faint">{b.niche}</div>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4 text-text-dim">{b.ownerEmail ?? "—"}</td>
                      <td className="px-6 py-4">
                        <PlanEditor businessId={b.id} initialPlan={b.plan} initialCap={b.monthlyUsageCapUsd} />
                        {b.subscriptionStatus && (
                          <Pill tone={b.subscriptionStatus === "active" ? "good" : b.subscriptionStatus === "canceled" ? "bad" : "warn"}>
                            Stripe: {b.subscriptionStatus}
                          </Pill>
                        )}
                      </td>
                      <td className="px-6 py-4">
                        <WhatsAppNumberEditor businessId={b.id} initialNumber={b.whatsappInboundNumber} />
                      </td>
                      <td className="px-6 py-4">
                        <span className={overCap ? "font-medium text-bad" : "text-text-dim"}>
                          ${b.aiCostThisMonth.toFixed(4)}
                        </span>
                        {b.monthlyUsageCapUsd !== null && (
                          <span className="text-text-faint"> / ${b.monthlyUsageCapUsd.toFixed(0)}</span>
                        )}
                        {overCap && <Pill tone="bad">At cap</Pill>}
                      </td>
                      <td className="px-6 py-4">Rs {b.revenue.toLocaleString()}</td>
                      <td className="px-6 py-4 text-text-dim">{b.createdAt.toLocaleDateString()}</td>
                      <td className="px-6 py-4">
                        {b.wantsToDiscuss ? (
                          <Pill tone="accent">Orchestrator flagged</Pill>
                        ) : b.whatsappError ? (
                          <Pill tone="warn">WhatsApp failed</Pill>
                        ) : (
                          <Pill tone="neutral">—</Pill>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table></div>
          )}
        </Card>

        <Card className="p-6">
          <p className="text-[13px] leading-relaxed text-text-dim">
            No MRR or subscription-status column — Stripe billing isn&apos;t connected yet, so there&apos;s
            no real charge to report. Plan and usage cap are real, stored fields you set here manually;
            once a business&apos;s real AI cost this month reaches its cap, new AI cycles are blocked for
            that business until next month or you raise the cap. The server refuses to save a cap at or
            above that plan&apos;s price — a business can&apos;t be configured to cost more than it pays.
          </p>
        </Card>
      </div>
    </div>
  );
}
