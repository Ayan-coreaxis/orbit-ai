import Link from "next/link";
import { Topbar } from "@/components/Topbar";
import { Card, Pill } from "@/components/ui";
import { getBusinessRows, type BusinessRow } from "@/lib/admin-stats";
import { PlanEditor } from "@/components/admin/PlanEditor";
import { WhatsAppNumberEditor } from "@/components/admin/WhatsAppNumberEditor";
import { ArrowUpRight, Search } from "lucide-react";
import { whatsAppNumberKey } from "@/lib/whatsapp";
import { PLAN_PRICE_USD } from "@/lib/usage-limit";

const FILTERS = [
  { id: "all", label: "All" },
  { id: "live", label: "Store live" },
  { id: "flagged", label: "Needs attention" },
  { id: "paying", label: "Paying" },
] as const;
type Filter = (typeof FILTERS)[number]["id"];

const atCap = (b: BusinessRow) => b.monthlyUsageCapUsd !== null && b.aiCostThisMonth >= b.monthlyUsageCapUsd;
/** A cap at or above the plan price means the seller can cost more than they pay (the API refuses to save one; old rows may still have it). */
const capTooHigh = (b: BusinessRow) => b.monthlyUsageCapUsd !== null && PLAN_PRICE_USD[b.plan] !== undefined && b.monthlyUsageCapUsd >= PLAN_PRICE_USD[b.plan];

export default async function SellersPage({ searchParams }: { searchParams: Promise<{ q?: string; filter?: string }> }) {
  const { q = "", filter: rawFilter } = await searchParams;
  const filter: Filter = FILTERS.some((f) => f.id === rawFilter) ? (rawFilter as Filter) : "all";
  const all = await getBusinessRows();
  // Incoming WhatsApp is routed by number, so a number used by two stores sends one store's customers to the other.
  const numberUse = new Map<string, number>();
  for (const b of all) if (b.whatsappInboundNumber) numberUse.set(whatsAppNumberKey(b.whatsappInboundNumber), (numberUse.get(whatsAppNumberKey(b.whatsappInboundNumber)) ?? 0) + 1);
  const sharedNumber = (b: BusinessRow) => (b.whatsappInboundNumber ? (numberUse.get(whatsAppNumberKey(b.whatsappInboundNumber)) ?? 0) > 1 : false);
  const needsAttention = (b: BusinessRow) =>
    b.wantsToDiscuss || !!b.whatsappError || atCap(b) || capTooHigh(b) || sharedNumber(b) || b.subscriptionStatus === "past_due";
  const needle = q.trim().toLowerCase();
  const rows = all.filter((b) => {
    if (needle && ![b.name, b.niche, b.ownerEmail ?? ""].some((s) => s.toLowerCase().includes(needle))) return false;
    if (filter === "live") return b.published;
    if (filter === "flagged") return needsAttention(b);
    if (filter === "paying") return b.subscriptionStatus === "active";
    return true;
  });
  const count = (f: Filter) => (f === "all" ? all.length : f === "live" ? all.filter((b) => b.published).length : f === "flagged" ? all.filter(needsAttention).length : all.filter((b) => b.subscriptionStatus === "active").length);

  return (
    <div>
      <Topbar title="Sellers" subtitle={`${all.length} business${all.length === 1 ? "" : "es"} — set plan, AI cap and WhatsApp number here`} />
      <div className="max-w-[1400px] space-y-5 p-5 sm:p-8 lg:p-10">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap gap-1.5">
            {FILTERS.map((f) => (
              <Link
                key={f.id}
                href={`/admin/sellers?filter=${f.id}${q ? `&q=${encodeURIComponent(q)}` : ""}`}
                className={`rounded-full px-3.5 py-1.5 text-[13px] font-medium ${f.id === filter ? "bg-accent text-white" : "bg-panel-2 text-text-dim hover:text-text"}`}
              >
                {f.label} <span className="opacity-60">{count(f.id)}</span>
              </Link>
            ))}
          </div>
          <form className="flex items-center gap-2 rounded-xl border border-border-strong bg-panel px-3 py-2">
            <Search className="h-4 w-4 text-text-faint" />
            <input type="hidden" name="filter" value={filter} />
            <input name="q" defaultValue={q} placeholder="Search name, niche, email" className="w-56 bg-transparent text-[13.5px] outline-none placeholder:text-text-faint" />
          </form>
        </div>

        <Card className="overflow-hidden">
          {rows.length === 0 ? (
            <p className="p-6 text-[13.5px] text-text-faint">{all.length ? "No seller matches." : "No sellers yet — they appear here after onboarding."}</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[1050px] text-[14px]">
                <thead>
                  <tr className="border-b border-border bg-panel-2/60 text-left text-[12.5px] text-text-faint">
                    <th className="px-5 py-3 font-medium">Seller</th>
                    <th className="px-5 py-3 font-medium">Store</th>
                    <th className="px-5 py-3 font-medium">Plan / AI cap</th>
                    <th className="px-5 py-3 font-medium">AI this month</th>
                    <th className="px-5 py-3 font-medium">WhatsApp number</th>
                    <th className="px-5 py-3 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((b) => (
                    <tr key={b.id} className="border-b border-border align-top last:border-0">
                      <td className="px-5 py-4">
                        <div className="font-medium">{b.name || "(unnamed)"}</div>
                        <div className="text-[12px] text-text-faint">{b.niche}</div>
                        <div className="mt-0.5 text-[12px] text-text-dim">{b.ownerEmail ?? "—"}</div>
                        <div className="text-[11.5px] text-text-faint">Joined {b.createdAt.toLocaleDateString()}</div>
                      </td>
                      <td className="whitespace-nowrap px-5 py-4 text-[13px]">
                        <div className="flex items-center gap-1.5">
                          <Pill tone={b.published ? "good" : "neutral"}>{b.published ? "Live" : "Draft"}</Pill>
                          {b.published && (
                            <a href={`/store/${b.id}`} target="_blank" rel="noreferrer" className="text-text-faint hover:text-text" aria-label="Open store">
                              <ArrowUpRight className="h-4 w-4" />
                            </a>
                          )}
                        </div>
                        <div className="mt-1.5 text-text-dim">
                          {b.productCount} products · {b.orderCount} orders
                        </div>
                        <div className="text-text-dim">Rs {b.revenue.toLocaleString()} sales</div>
                      </td>
                      <td className="px-5 py-4">
                        <PlanEditor businessId={b.id} initialPlan={b.plan} initialCap={b.monthlyUsageCapUsd} />
                      </td>
                      <td className="px-5 py-4 tabular-nums">
                        <span className={atCap(b) ? "font-medium text-bad" : "text-text-dim"}>${b.aiCostThisMonth.toFixed(2)}</span>
                        {b.monthlyUsageCapUsd !== null && <span className="text-text-faint"> / ${b.monthlyUsageCapUsd.toFixed(0)}</span>}
                      </td>
                      <td className="px-5 py-4">
                        <WhatsAppNumberEditor businessId={b.id} initialNumber={b.whatsappInboundNumber} />
                      </td>
                      <td className="px-5 py-4">
                        <div className="flex flex-col items-start gap-1">
                          {b.subscriptionStatus && (
                            <Pill tone={b.subscriptionStatus === "active" ? "good" : b.subscriptionStatus === "canceled" ? "bad" : "warn"}>
                              Stripe: {b.subscriptionStatus}
                            </Pill>
                          )}
                          {atCap(b) && <Pill tone="bad">AI cap reached</Pill>}
                          {capTooHigh(b) && <Pill tone="bad">Cap ≥ plan price</Pill>}
                          {sharedNumber(b) && <Pill tone="warn">WhatsApp number shared</Pill>}
                          {b.wantsToDiscuss && <Pill tone="accent">Orchestrator flagged</Pill>}
                          {b.whatsappError && <Pill tone="warn">WhatsApp failed</Pill>}
                          {!b.subscriptionStatus && !needsAttention(b) && <span className="text-text-faint">—</span>}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        <p className="text-[12.5px] leading-relaxed text-text-faint">
          When a seller&apos;s AI cost this month reaches their cap, new AI work pauses until next month or until you raise it. A cap can&apos;t be set at or
          above the plan&apos;s price.
        </p>
      </div>
    </div>
  );
}
