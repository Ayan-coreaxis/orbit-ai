"use client";

import { useEffect, useState } from "react";
import { Card } from "@/components/ui";
import { money } from "@/lib/money";
import type { StoreAnalytics } from "@/lib/store-analytics";
import { AreaChart } from "./mini-chart";
import { Users, TrendingDown, Package, Globe, AlertTriangle } from "lucide-react";

const RANGES = [7, 30, 90] as const;

export function StoreAnalyticsCard({
  businessId,
  currency,
  initial,
}: {
  businessId: string;
  currency?: string;
  initial?: StoreAnalytics;
}) {
  const [range, setRange] = useState<number>(initial?.rangeDays ?? 30);
  const [data, setData] = useState<StoreAnalytics | null>(initial ?? null);
  const [loadedRange, setLoadedRange] = useState<number | null>(null);
  const loading = loadedRange !== range; // true until the numbers for the picked range arrive

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/store/${businessId}/admin/analytics?range=${range}`)
      .then((r) => r.json())
      .then((d: StoreAnalytics) => {
        if (!cancelled && d && Array.isArray(d.funnel)) setData(d);
      })
      .catch(() => {})
      .finally(() => !cancelled && setLoadedRange(range));
    return () => {
      cancelled = true;
    };
  }, [range, businessId]);

  if (!data) {
    return (
      <Card className="p-6" aria-busy>
        <div className="text-[14px] font-semibold">Store analytics</div>
        <Skeleton />
      </Card>
    );
  }

  const fmt = (n: number) => money(Math.round(n), currency);
  const pct = (n: number) => `${n.toFixed(n < 10 ? 1 : 0)}%`;
  const maxStep = Math.max(1, data.funnel[0]?.sessions ?? 1);
  const hasData = data.visitors > 0 || data.orders > 0;

  return (
    <Card className="p-6" aria-busy={loading}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="text-[14px] font-semibold">Store analytics</div>
        <div role="tablist" aria-label="Date range" className="flex items-center gap-1 rounded-lg bg-panel-2 p-0.5">
          {RANGES.map((r) => (
            <button
              key={r}
              role="tab"
              aria-selected={range === r}
              onClick={() => setRange(r)}
              className={`rounded-md px-2.5 py-1 text-[12px] font-medium transition-colors ${
                range === r ? "bg-panel text-text shadow-[0_1px_2px_rgba(0,0,0,0.06)]" : "text-text-faint hover:text-text-dim"
              }`}
            >
              {r}d
            </button>
          ))}
        </div>
      </div>

      {!hasData ? (
        <p className="mt-5 rounded-lg border border-dashed border-border py-8 text-center text-[13px] text-text-faint">
          No visits recorded yet. Once shoppers land on your published store, the funnel and revenue fill in here.
        </p>
      ) : loading ? (
        <Skeleton />
      ) : (
        <>
          {/* headline stats */}
          <div className="mt-5 grid grid-cols-2 gap-x-4 gap-y-4 sm:grid-cols-3 lg:grid-cols-5">
            <Stat label="Visitors" value={data.visitors.toLocaleString()} />
            <Stat label="Orders" value={data.orders.toLocaleString()} />
            <Stat label="Revenue" value={fmt(data.revenue)} />
            <Stat label="Conversion" value={pct(data.conversionRate)} />
            <Stat label="Avg order" value={fmt(data.aov)} />
          </div>

          {/* funnel — a funnel never widens, so clamp each bar to the step above it */}
          <Section icon={TrendingDown} title="Shopper funnel">
            <div className="space-y-1">
              {(() => {
                let prevPct = 100;
                return data.funnel.map((s, i) => {
                  const rawPct = (s.sessions / maxStep) * 100;
                  const barPct = Math.min(rawPct, prevPct);
                  prevPct = barPct;
                  return (
                    <div key={s.type} className="flex items-center gap-3">
                      <div className="w-32 flex-none text-[12px] text-text-dim">{s.label}</div>
                      <div className="h-6 flex-1 overflow-hidden rounded-md bg-panel-2">
                        <div
                          className="h-full rounded-md bg-accent-strong/70 transition-[width] duration-500"
                          style={{ width: `${Math.max(2, barPct)}%` }}
                        />
                      </div>
                      <div className="w-24 flex-none text-right text-[12px] tabular-nums">
                        <span className="font-medium">{s.sessions.toLocaleString()}</span>
                        {i > 0 && s.fromPrev != null && s.sessions > 0 && (
                          <span className="ml-1 text-text-faint">{pct(Math.min(100, s.fromPrev))}</span>
                        )}
                      </div>
                    </div>
                  );
                });
              })()}
            </div>
          </Section>

          {/* revenue */}
          <Section title={`Revenue · last ${data.rangeDays} days`}>
            <AreaChart
              points={data.series.map((d) => ({
                label: new Date(d.day).toLocaleDateString(undefined, { month: "short", day: "numeric" }),
                value: d.revenue,
                sub: `${d.orders} order${d.orders === 1 ? "" : "s"}`,
              }))}
              format={fmt}
            />
          </Section>

          <div className="mt-6 grid gap-6 lg:grid-cols-2">
            <Section icon={Package} title="Top products">
              {data.topProducts.length === 0 ? (
                <p className="text-[12.5px] text-text-faint">No sales in this window.</p>
              ) : (
                <div className="divide-y divide-border">
                  {data.topProducts.map((p) => (
                    <div key={p.productId || p.name} className="flex items-center justify-between py-2 text-[12.5px]">
                      <span className="min-w-0 truncate">{p.name}</span>
                      <span className="flex-none tabular-nums text-text-dim">
                        {p.units} sold · {fmt(p.revenue)}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </Section>

            <div className="space-y-5">
              <Section icon={Users} title="Customers" tight>
                <p className="text-[12.5px] text-text-dim">
                  <span className="font-medium tabular-nums text-text">{data.newCustomers}</span> new ·{" "}
                  <span className="font-medium tabular-nums text-text">{data.repeatCustomers}</span> returning
                </p>
              </Section>

              <Section icon={Globe} title="Traffic sources" tight>
                {data.referrers.length === 0 ? (
                  <p className="text-[12.5px] text-text-faint">All direct / unknown so far.</p>
                ) : (
                  <div className="space-y-0.5">
                    {data.referrers.map((r) => (
                      <div key={r.source} className="flex justify-between text-[12.5px] text-text-dim">
                        <span className="truncate">{r.source}</span>
                        <span className="flex-none tabular-nums">{r.sessions}</span>
                      </div>
                    ))}
                  </div>
                )}
              </Section>

              {data.lowStock.length > 0 && (
                <Section icon={AlertTriangle} title="Low stock" tight>
                  <div className="flex flex-wrap gap-1.5">
                    {data.lowStock.map((p) => (
                      <span key={p.id} className="rounded bg-warn-soft px-1.5 py-0.5 text-[11.5px] tabular-nums text-warn">
                        {p.name} · {p.stock}
                      </span>
                    ))}
                  </div>
                </Section>
              )}
            </div>
          </div>
        </>
      )}
    </Card>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[11px] font-medium uppercase tracking-[0.04em] text-text-faint">{label}</div>
      <div className="mt-1 text-[18px] font-semibold tabular-nums leading-none">{value}</div>
    </div>
  );
}

function Section({
  icon: Icon,
  title,
  children,
  tight,
}: {
  icon?: typeof Users;
  title: string;
  children: React.ReactNode;
  tight?: boolean;
}) {
  return (
    <div className={tight ? "" : "mt-6"}>
      <div className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.04em] text-text-faint">
        {Icon && <Icon className="h-3.5 w-3.5" strokeWidth={2} />}
        {title}
      </div>
      {children}
    </div>
  );
}

function Skeleton() {
  return (
    <div className="mt-5 animate-pulse space-y-6">
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-5">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i}>
            <div className="h-2.5 w-14 rounded bg-panel-2" />
            <div className="mt-2 h-4 w-16 rounded bg-panel-2" />
          </div>
        ))}
      </div>
      <div className="space-y-1.5">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="h-6 rounded-md bg-panel-2" style={{ width: `${100 - i * 15}%` }} />
        ))}
      </div>
      <div className="h-24 rounded bg-panel-2" />
    </div>
  );
}
