import Link from "next/link";
import { Card, Pill } from "@/components/ui";
import { money } from "@/lib/money";
import type { PlanView } from "@/lib/strategy-lab";
import { ArrowRight, CheckCircle2, User, TrendingUp, TrendingDown } from "lucide-react";

/**
 * Overview card for the ACTIVE growth plan: what's running, how each strategy is doing (real,
 * code-measured), what Orbit has done, and the owner's own to-do list. Discussion happens in the
 * Orchestrator chat — this card links there.
 */
export function GrowthPlanOverview({ plan, currency }: { plan: PlanView; currency: string }) {
  const live = plan.strategies.filter((s) => s.status === "running" || s.status === "paused");
  const todos = live.flatMap((s) => s.steps.filter((st) => st.owner === "seller").map((st) => ({ strategy: s.title, text: st.text })));
  const orbitDone = plan.strategies.flatMap((s) => s.actions).filter((a) => a.status === "done" || a.status === "deliverable").length;
  const fmt = (v: number | null, unit: string) => (v == null ? "—" : unit === "money" ? money(v, currency) : unit === "percent" ? `${v}%` : v.toLocaleString());

  return (
    <Card className="p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <Pill tone="good">Active growth plan</Pill>
            <span className="text-[12.5px] text-text-faint">
              {live.length} running · Orbit has done {orbitDone} thing{orbitDone === 1 ? "" : "s"}
            </span>
          </div>
          <h2 className="mt-2 text-[19px] font-semibold leading-tight">{plan.title}</h2>
        </div>
        <Link
          href="/dashboard/orchestrator"
          className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-border-strong px-3.5 py-2 text-[13px] font-medium text-text-dim hover:border-accent/50 hover:text-text"
        >
          Discuss with your Orchestrator <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      </div>

      <div className="mt-5 grid gap-5 lg:grid-cols-2">
        <div>
          <div className="text-[11.5px] font-semibold uppercase tracking-[0.05em] text-text-faint">How it&apos;s going</div>
          <ul className="mt-2 space-y-2">
            {live.map((s) => {
              const r = s.result;
              const measured = r && r.measurable && r.value != null;
              const delta = measured && r!.baseline != null ? r!.value! - r!.baseline : null;
              const good = delta != null && (s.metric.type === "cancel_rate" ? delta < 0 : delta > 0);
              return (
                <li key={s.id} className="flex items-center justify-between gap-3 rounded-lg bg-panel-2 px-3 py-2">
                  <div className="min-w-0">
                    <div className="truncate text-[13px] font-medium">{s.title}</div>
                    <div className="truncate text-[11.5px] text-text-faint">{s.metric.label}</div>
                  </div>
                  <div className="flex flex-none items-center gap-1 text-[13px] font-semibold tabular-nums">
                    {measured ? (
                      <>
                        {delta ? good ? <TrendingUp className="h-3.5 w-3.5 text-good" /> : <TrendingDown className="h-3.5 w-3.5 text-bad" /> : null}
                        {fmt(r!.value, r!.unit)}
                      </>
                    ) : (
                      <span className="text-[11.5px] font-normal text-text-faint">{s.status === "paused" ? "paused" : "you track it"}</span>
                    )}
                  </div>
                </li>
              );
            })}
            {live.length === 0 && <li className="text-[12.5px] text-text-faint">Nothing running right now.</li>}
          </ul>
        </div>
        <div>
          <div className="text-[11.5px] font-semibold uppercase tracking-[0.05em] text-text-faint">Your to-do</div>
          {todos.length ? (
            <ul className="mt-2 space-y-2">
              {todos.slice(0, 6).map((t, i) => (
                <li key={i} className="flex gap-2 text-[12.5px] leading-relaxed">
                  <User className="mt-0.5 h-3.5 w-3.5 flex-none text-warn" />
                  <div className="min-w-0">
                    {t.text}
                    <div className="text-[11.5px] text-text-faint">{t.strategy}</div>
                  </div>
                </li>
              ))}
              {todos.length > 6 && <li className="text-[12px] text-text-faint">+{todos.length - 6} more in the plan</li>}
            </ul>
          ) : (
            <p className="mt-2 flex items-center gap-1.5 text-[12.5px] text-text-dim">
              <CheckCircle2 className="h-3.5 w-3.5 text-good" /> Nothing on your side right now — Orbit is handling it.
            </p>
          )}
        </div>
      </div>
    </Card>
  );
}
