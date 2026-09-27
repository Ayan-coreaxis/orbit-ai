import Link from "next/link";
import { Topbar } from "@/components/Topbar";
import { Card, SectionLabel } from "@/components/ui";
import { getUsage, type UsagePeriod, type UsageRow } from "@/lib/admin-stats";

const PERIODS: { id: UsagePeriod; label: string }[] = [
  { id: "today", label: "Today" },
  { id: "month", label: "This month" },
  { id: "30d", label: "Last 30 days" },
  { id: "all", label: "All time" },
];

const usd = (n: number) => (n >= 1 ? `$${n.toFixed(2)}` : `$${n.toFixed(4)}`);

export default async function UsagePage({ searchParams }: { searchParams: Promise<{ period?: string }> }) {
  const { period: raw } = await searchParams;
  const period: UsagePeriod = PERIODS.some((p) => p.id === raw) ? (raw as UsagePeriod) : "month";
  const { businesses, agents, models, total } = await getUsage(period);

  return (
    <div>
      <Topbar title="AI usage & cost" subtitle="Anthropic spend from actual token counts, by seller, agent and model" />
      <div className="max-w-[1300px] space-y-6 p-5 sm:p-8 lg:p-10">
        <div className="flex flex-wrap gap-1.5">
          {PERIODS.map((p) => (
            <Link
              key={p.id}
              href={`/admin/usage?period=${p.id}`}
              className={`rounded-full px-3.5 py-1.5 text-[13px] font-medium ${p.id === period ? "bg-accent text-white" : "bg-panel-2 text-text-dim hover:text-text"}`}
            >
              {p.label}
            </Link>
          ))}
        </div>

        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <Stat label="Spend" value={usd(total.cost)} />
          <Stat label="AI calls" value={total.calls.toLocaleString()} />
          <Stat label="Tokens" value={(total.input + total.output).toLocaleString()} sub={`${total.input.toLocaleString()} in · ${total.output.toLocaleString()} out`} />
          <Stat label="Sellers using AI" value={String(businesses.length)} sub={businesses.length ? `avg ${usd(total.cost / businesses.length)} each` : undefined} />
        </div>

        <UsageTable title="By seller" first="Seller" rows={businesses} empty="No AI usage in this period." />
        <div id="agents">
          <UsageTable title="By agent" first="Agent" rows={agents} empty="No agent calls in this period." />
        </div>

        {models.length > 0 && (
          <Card className="p-6">
            <SectionLabel>By model</SectionLabel>
            <ul className="mt-3 divide-y divide-border text-[13.5px]">
              {models.map((m) => (
                <li key={m.model} className="flex items-center justify-between py-2.5">
                  <span className="font-mono text-[12.5px]">{m.model}</span>
                  <span className="text-text-dim">
                    {m.calls.toLocaleString()} calls · <span className="font-medium text-text">{usd(m.costUsd)}</span>
                  </span>
                </li>
              ))}
            </ul>
          </Card>
        )}
      </div>
    </div>
  );
}

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <Card className="p-5">
      <div className="text-[12.5px] font-medium text-text-faint">{label}</div>
      <div className="mt-2 text-2xl font-semibold tabular-nums">{value}</div>
      {sub && <div className="mt-1 text-[12px] text-text-dim">{sub}</div>}
    </Card>
  );
}

function UsageTable({ title, first, rows, empty }: { title: string; first: string; rows: UsageRow[]; empty: string }) {
  const max = rows[0]?.costUsd || 1;
  return (
    <div className="space-y-3">
      <SectionLabel>{title}</SectionLabel>
      <Card className="overflow-hidden">
        {rows.length === 0 ? (
          <p className="p-6 text-[13.5px] text-text-faint">{empty}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[680px] text-[14px]">
              <thead>
                <tr className="border-b border-border bg-panel-2/60 text-left text-[12.5px] text-text-faint">
                  <th className="px-6 py-3 font-medium">{first}</th>
                  <th className="px-6 py-3 text-right font-medium">Calls</th>
                  <th className="px-6 py-3 text-right font-medium">Tokens</th>
                  <th className="px-6 py-3 text-right font-medium">Cost</th>
                  <th className="px-6 py-3 text-right font-medium">Avg / call</th>
                  <th className="px-6 py-3 font-medium">Last call</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className="border-b border-border last:border-0">
                    <td className="px-6 py-3">
                      <div className="font-medium">{r.label}</div>
                      {r.sub && <div className="text-[12px] text-text-faint">{r.sub}</div>}
                      <div className="mt-1.5 h-1 w-full max-w-[220px] overflow-hidden rounded-full bg-panel-2">
                        <div className="h-full rounded-full bg-accent" style={{ width: `${Math.max(2, (r.costUsd / max) * 100)}%` }} />
                      </div>
                    </td>
                    <td className="px-6 py-3 text-right tabular-nums text-text-dim">{r.calls.toLocaleString()}</td>
                    <td className="px-6 py-3 text-right tabular-nums text-text-dim">{(r.inputTokens + r.outputTokens).toLocaleString()}</td>
                    <td className="px-6 py-3 text-right font-medium tabular-nums">{usd(r.costUsd)}</td>
                    <td className="px-6 py-3 text-right tabular-nums text-text-dim">{usd(r.costUsd / r.calls)}</td>
                    <td className="px-6 py-3 text-[13px] text-text-dim">{r.lastAt ? r.lastAt.toLocaleString() : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
