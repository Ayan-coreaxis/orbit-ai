import Link from "next/link";
import { Topbar } from "@/components/Topbar";
import { Card, SectionLabel, Pill } from "@/components/ui";
import { COST_LABELS, FINANCE_PERIODS, getFinance, type CostKey, type FinancePeriod, type SellerPnl } from "@/lib/admin-finance";
import { getBillingSummary } from "@/lib/admin-stats";
import { PLAN_LABELS, PLAN_PRICE_USD } from "@/lib/usage-limit";
import { FinanceChart } from "@/components/admin/FinanceChart";
import { DeletePayment, RecordPayment } from "@/components/admin/RecordPayment";
import { prisma } from "@/lib/prisma";
import { Download } from "lucide-react";

const COST_KEYS: CostKey[] = ["claude", "search", "images", "video", "fees"];
const SORTS = [
  { id: "profit", label: "Least profitable first" },
  { id: "cost", label: "Highest cost" },
  { id: "revenue", label: "Highest revenue" },
] as const;
type Sort = (typeof SORTS)[number]["id"];

/** $1,234 for big numbers, $0.0421 for tiny AI costs — precise where it matters. */
function usd(n: number) {
  const a = Math.abs(n);
  const s = a >= 100 ? Math.round(a).toLocaleString() : a >= 1 ? a.toFixed(2) : a === 0 ? "0" : a.toFixed(4);
  return `${n < 0 ? "−" : ""}$${s}`;
}

/** Change vs the previous period; `upIsGood` false for costs (going up is shown red). */
function Delta({ now, before, upIsGood = true, points = false }: { now: number | null; before: number | null | undefined; upIsGood?: boolean; points?: boolean }) {
  if (now === null || before === null || before === undefined) return <span className="text-text-faint">—</span>;
  const diff = now - before;
  if (Math.abs(diff) < 0.00005) return <span className="text-text-faint">no change</span>;
  const good = diff > 0 === upIsGood;
  const text = points ? `${diff > 0 ? "+" : ""}${diff.toFixed(1)} pts` : before === 0 ? `${diff > 0 ? "+" : "−"}${usd(Math.abs(diff))}` : `${diff > 0 ? "+" : ""}${((diff / Math.abs(before)) * 100).toFixed(0)}%`;
  return <span className={good ? "text-good" : "text-bad"}>{diff > 0 ? "▲" : "▼"} {text}</span>;
}

export default async function RevenueCostPage({ searchParams }: { searchParams: Promise<{ period?: string; sort?: string }> }) {
  const { period: rawPeriod, sort: rawSort } = await searchParams;
  const period: FinancePeriod = FINANCE_PERIODS.some((p) => p.id === rawPeriod) ? (rawPeriod as FinancePeriod) : "mtd";
  const sort: Sort = SORTS.some((s) => s.id === rawSort) ? (rawSort as Sort) : "profit";
  const [f, billing, sellerList] = await Promise.all([
    getFinance(period),
    getBillingSummary(),
    prisma.business.findMany({ select: { id: true, name: true, plan: true }, orderBy: { name: "asc" } }),
  ]);
  const { current: cur, previous: prev, ranges } = f;
  const stripeOn = !!process.env.STRIPE_SECRET_KEY?.trim() && !!process.env.STRIPE_WEBHOOK_SECRET?.trim();
  const monthly = period === "mtd" || period === "last_month";
  const sellers = [...f.sellers].sort((a, b) => (sort === "profit" ? a.profit - b.profit : sort === "cost" ? b.totalCost - a.totalCost : b.revenue - a.revenue));
  const q = (extra: Record<string, string>) => `/admin/billing?${new URLSearchParams({ period, sort, ...extra })}`;
  const compareNote = ranges.previousLabel ? `vs ${ranges.previousLabel}` : "";

  const tiles = [
    { label: "Revenue", value: usd(cur.revenue), sub: cur.refunds ? `${usd(cur.refunds)} refunded` : `${cur.payments} payment${cur.payments === 1 ? "" : "s"}`, now: cur.revenue, before: prev?.revenue, upIsGood: true },
    { label: "Total cost", value: usd(cur.totalCost), sub: "AI, search, media, fees", now: cur.totalCost, before: prev?.totalCost, upIsGood: false },
    { label: "Profit", value: usd(cur.profit), sub: "revenue − cost", now: cur.profit, before: prev?.profit, upIsGood: true, tone: cur.profit < 0 ? "text-bad" : "" },
    { label: "Margin", value: cur.margin === null ? "—" : `${cur.margin.toFixed(1)}%`, sub: "profit ÷ revenue", now: cur.margin, before: prev?.margin, upIsGood: true, points: true },
  ];

  return (
    <div>
      <Topbar
        title="Revenue & cost"
        subtitle="What sellers paid against what running them cost — to the cent, compared with the period before"
        actions={
          <a href={`/api/admin/finance/export?period=${period}`} className="inline-flex items-center gap-1.5 rounded-lg border border-border-strong px-3 py-2 text-[13px] text-text-dim hover:text-text">
            <Download className="h-4 w-4" /> CSV
          </a>
        }
      />
      <div className="max-w-[1300px] space-y-6 p-5 sm:p-8 lg:p-10">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap gap-1.5">
            {FINANCE_PERIODS.map((p) => (
              <Link key={p.id} href={q({ period: p.id })} className={`rounded-full px-3.5 py-1.5 text-[13px] font-medium ${p.id === period ? "bg-accent text-white" : "bg-panel-2 text-text-dim hover:text-text"}`}>
                {p.label}
              </Link>
            ))}
          </div>
          {compareNote && <span className="text-[12.5px] text-text-faint">Changes shown {compareNote}</span>}
        </div>

        {!stripeOn && (
          <Card className="flex flex-wrap items-center justify-between gap-3 p-4">
            <p className="text-[13px] text-text-dim">
              Stripe isn&apos;t connected — revenue here is only what you record by hand below (bank transfer, JazzCash…).
            </p>
            <Link href="/admin/api-keys#stripe" className="text-[13px] font-medium text-accent-strong hover:underline">
              Connect Stripe →
            </Link>
          </Card>
        )}

        {/* Headline numbers */}
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          {tiles.map((t) => (
            <Card key={t.label} className="p-5">
              <div className="text-[12.5px] font-medium text-text-faint">{t.label}</div>
              <div className={`mt-2 text-2xl font-semibold tabular-nums ${t.tone ?? ""}`}>{t.value}</div>
              <div className="mt-1 flex flex-wrap items-center justify-between gap-1 text-[12px]">
                <span className="text-text-dim">{t.sub}</span>
                <Delta now={t.now} before={t.before} upIsGood={t.upIsGood} points={t.points} />
              </div>
            </Card>
          ))}
        </div>

        {/* Over time */}
        <Card className="p-6">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <SectionLabel>Revenue vs cost — {ranges.label}</SectionLabel>
            <span className="text-[12px] text-text-faint">{f.series.length > 62 || period === "ytd" || period === "all" ? "by month" : "by day"}</span>
          </div>
          <div className="mt-4">{f.series.length ? <FinanceChart data={f.series} /> : <p className="text-[13px] text-text-faint">Nothing recorded yet.</p>}</div>
        </Card>

        <div className="grid gap-6 lg:grid-cols-5">
          {/* Where the money goes */}
          <Card className="overflow-hidden lg:col-span-3">
            <div className="p-6 pb-3">
              <SectionLabel>Where the money goes</SectionLabel>
            </div>
            <table className="w-full text-[13.5px]">
              <thead>
                <tr className="border-y border-border bg-panel-2/60 text-left text-[12px] text-text-faint">
                  <th className="px-6 py-2.5 font-medium">Cost</th>
                  <th className="px-3 py-2.5 text-right font-medium">Now</th>
                  {prev && <th className="px-3 py-2.5 text-right font-medium">Before</th>}
                  {prev && <th className="px-3 py-2.5 text-right font-medium">Change</th>}
                  <th className="px-6 py-2.5 text-right font-medium">Share</th>
                </tr>
              </thead>
              <tbody>
                {COST_KEYS.map((k) => (
                  <tr key={k} className="border-b border-border">
                    <td className="px-6 py-2.5">{COST_LABELS[k]}</td>
                    <td className="px-3 py-2.5 text-right font-medium tabular-nums">{usd(cur.costs[k])}</td>
                    {prev && <td className="px-3 py-2.5 text-right tabular-nums text-text-dim">{usd(prev.costs[k])}</td>}
                    {prev && (
                      <td className="px-3 py-2.5 text-right text-[12.5px] tabular-nums">
                        <Delta now={cur.costs[k]} before={prev.costs[k]} upIsGood={false} />
                      </td>
                    )}
                    <td className="px-6 py-2.5 text-right tabular-nums text-text-dim">{cur.totalCost > 0 ? `${((cur.costs[k] / cur.totalCost) * 100).toFixed(1)}%` : "—"}</td>
                  </tr>
                ))}
                <tr className="font-semibold">
                  <td className="px-6 py-3">Total</td>
                  <td className="px-3 py-3 text-right tabular-nums">{usd(cur.totalCost)}</td>
                  {prev && <td className="px-3 py-3 text-right tabular-nums text-text-dim">{usd(prev.totalCost)}</td>}
                  {prev && (
                    <td className="px-3 py-3 text-right text-[12.5px] tabular-nums">
                      <Delta now={cur.totalCost} before={prev.totalCost} upIsGood={false} />
                    </td>
                  )}
                  <td className="px-6 py-3 text-right">100%</td>
                </tr>
              </tbody>
            </table>
          </Card>

          {/* Unit economics */}
          <Card className="p-6 lg:col-span-2">
            <SectionLabel>Per seller</SectionLabel>
            <dl className="mt-3 divide-y divide-border text-[13.5px]">
              <Row label="MRR (active Stripe subscriptions)" value={`$${billing.mrr.toLocaleString()}`} hint={`${billing.paying} paying on Stripe`} />
              <Row label="Sellers who paid in this period" value={String(f.unit.payingSellers)} />
              <Row label="Revenue per paying seller" value={f.unit.arpu === null ? "—" : usd(f.unit.arpu)} />
              <Row label="Sellers who used AI" value={String(f.unit.activeSellers)} />
              <Row label="Cost per active seller" value={f.unit.costPerActiveSeller === null ? "—" : usd(f.unit.costPerActiveSeller)} />
              <Row label="Cost as % of revenue" value={f.unit.costShare === null ? "—" : `${f.unit.costShare.toFixed(1)}%`} />
              <Row label="Sellers losing money" value={String(f.unit.losingSellers)} tone={f.unit.losingSellers ? "text-bad" : ""} hint="cost higher than what they paid" />
            </dl>
          </Card>
        </div>

        {/* Per-seller P&L */}
        <div className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <SectionLabel>Profit &amp; loss by seller — {ranges.label}</SectionLabel>
            <div className="flex flex-wrap gap-1.5">
              {SORTS.map((s) => (
                <Link key={s.id} href={q({ sort: s.id })} className={`rounded-full px-3 py-1 text-[12.5px] font-medium ${s.id === sort ? "bg-accent text-white" : "bg-panel-2 text-text-dim hover:text-text"}`}>
                  {s.label}
                </Link>
              ))}
            </div>
          </div>
          <Card className="overflow-hidden">
            {sellers.length === 0 ? (
              <p className="p-6 text-[13.5px] text-text-faint">No revenue or cost in this period.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[980px] text-[13.5px]">
                  <thead>
                    <tr className="border-b border-border bg-panel-2/60 text-right text-[12px] text-text-faint">
                      <th className="px-5 py-3 text-left font-medium">Seller</th>
                      <th className="px-3 py-3 font-medium">Revenue</th>
                      <th className="px-3 py-3 font-medium">Claude</th>
                      <th className="px-3 py-3 font-medium">Search</th>
                      <th className="px-3 py-3 font-medium">Studio</th>
                      <th className="px-3 py-3 font-medium">Fees</th>
                      <th className="px-3 py-3 font-medium">Total cost</th>
                      <th className="px-3 py-3 font-medium">Profit</th>
                      <th className="px-3 py-3 font-medium">Margin</th>
                      {monthly && <th className="px-5 py-3 font-medium" title="Cost this month as a share of the plan's monthly price">Cost / plan price</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {sellers.map((s) => (
                      <SellerRow key={s.id} s={s} monthly={monthly} />
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </div>

        {/* Payments ledger */}
        <Card className="p-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <SectionLabel>Payments — {ranges.label}</SectionLabel>
          </div>
          <div className="mt-3">
            <RecordPayment sellers={sellerList.map((s) => ({ id: s.id, name: s.name || "(unnamed)", plan: s.plan }))} />
          </div>
          {f.payments.length === 0 ? (
            <p className="mt-4 text-[13px] text-text-faint">No payments in this period.</p>
          ) : (
            <div className="mt-4 overflow-x-auto">
              <table className="w-full min-w-[720px] text-[13.5px]">
                <thead>
                  <tr className="border-b border-border text-left text-[12px] text-text-faint">
                    <th className="py-2 font-medium">Date</th>
                    <th className="py-2 font-medium">Seller</th>
                    <th className="py-2 text-right font-medium">Amount</th>
                    <th className="py-2 text-right font-medium">Fee</th>
                    <th className="py-2 pl-4 font-medium">How</th>
                    <th className="py-2 font-medium">Note</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {f.payments.map((p) => (
                    <tr key={p.id} className="border-b border-border last:border-0">
                      <td className="py-2 text-text-dim">{p.paidAt.toLocaleDateString()}</td>
                      <td className="py-2">{p.business.name || "(unnamed)"}</td>
                      <td className={`py-2 text-right font-medium tabular-nums ${p.amountUsd < 0 ? "text-bad" : ""}`}>{usd(p.amountUsd)}</td>
                      <td className="py-2 text-right tabular-nums text-text-dim">
                        {p.feeUsd ? usd(p.feeUsd) : "—"}
                        {p.feeEstimated && <span className="ml-1 text-[11px] text-warn" title="Stripe's real fee couldn't be read; 2.9% + $0.30 used">est.</span>}
                      </td>
                      <td className="py-2 pl-4">
                        <Pill tone={p.source === "stripe" ? "good" : "neutral"}>{p.source === "stripe" ? "Stripe" : (p.method ?? "manual").replace("_", " ")}</Pill>
                      </td>
                      <td className="max-w-[260px] truncate py-2 text-[12.5px] text-text-faint" title={p.note ?? ""}>
                        {p.note ?? ""}
                      </td>
                      <td className="py-2 text-right">{p.source === "manual" && <DeletePayment id={p.id} />}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        <p className="text-[12px] leading-relaxed text-text-faint">
          Revenue = payments received (Stripe invoices automatically, others recorded above), minus refunds. Cost = every AI call as it was billed (Claude tokens at
          each model&apos;s price, Brave searches, Studio images and reels) plus payment fees. Not counted yet: Twilio WhatsApp messages, hosting and file storage. Plan
          prices: {Object.entries(PLAN_PRICE_USD).map(([k, v]) => `${PLAN_LABELS[k]} $${v}`).join(" · ")}.
        </p>
      </div>
    </div>
  );
}

function Row({ label, value, hint, tone = "" }: { label: string; value: string; hint?: string; tone?: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-2.5">
      <dt className="text-text-dim">
        {label}
        {hint && <div className="text-[11.5px] text-text-faint">{hint}</div>}
      </dt>
      <dd className={`font-semibold tabular-nums ${tone}`}>{value}</dd>
    </div>
  );
}

function SellerRow({ s, monthly }: { s: SellerPnl; monthly: boolean }) {
  const loss = s.profit < 0;
  const price = PLAN_PRICE_USD[s.plan];
  const ofPrice = price ? (s.totalCost / price) * 100 : null;
  return (
    <tr className={`border-b border-border text-right tabular-nums last:border-0 ${loss ? "bg-bad-soft/40" : ""}`}>
      <td className="px-5 py-3 text-left">
        <div className="font-medium">{s.name}</div>
        <div className="text-[12px] text-text-faint">
          {PLAN_LABELS[s.plan] ?? s.plan}
          {s.paying ? " · paying on Stripe" : ""}
        </div>
      </td>
      <td className="px-3 py-3 font-medium">{usd(s.revenue)}</td>
      <td className="px-3 py-3 text-text-dim">{usd(s.costs.claude)}</td>
      <td className="px-3 py-3 text-text-dim">{usd(s.costs.search)}</td>
      <td className="px-3 py-3 text-text-dim">{usd(s.costs.images + s.costs.video)}</td>
      <td className="px-3 py-3 text-text-dim">{usd(s.costs.fees)}</td>
      <td className="px-3 py-3">{usd(s.totalCost)}</td>
      <td className={`px-3 py-3 font-semibold ${loss ? "text-bad" : "text-good"}`}>{usd(s.profit)}</td>
      <td className="px-3 py-3 text-text-dim">{s.margin === null ? "—" : `${s.margin.toFixed(0)}%`}</td>
      {monthly && (
        <td className="px-5 py-3">
          {ofPrice === null ? (
            "—"
          ) : (
            <div className="ml-auto flex max-w-[140px] items-center justify-end gap-2">
              <div className="h-1.5 w-16 overflow-hidden rounded-full bg-panel-2">
                <div className={`h-full rounded-full ${ofPrice >= 50 ? "bg-bad" : ofPrice >= 25 ? "bg-warn" : "bg-good"}`} style={{ width: `${Math.min(100, Math.max(2, ofPrice))}%` }} />
              </div>
              <span className={`text-[12.5px] ${ofPrice >= 50 ? "text-bad" : "text-text-dim"}`}>{ofPrice.toFixed(1)}%</span>
            </div>
          )}
        </td>
      )}
    </tr>
  );
}
