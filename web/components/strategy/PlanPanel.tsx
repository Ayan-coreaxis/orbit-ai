"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Card, Pill, Button } from "@/components/ui";
import { money } from "@/lib/money";
import type { PlanView, StrategyView, StrategyStep, ActionView, AgentView } from "@/lib/strategy-lab";
import { Sparkles, CheckCircle2, User, Ban, Pause, Play, Square, Flag, Trash2, TrendingUp, TrendingDown, Loader2, ShieldAlert, ShieldCheck, X, ClipboardCheck, Plus, ChevronDown, Copy, Check, RefreshCw, AlertTriangle, CircleDashed, Link2, Users } from "lucide-react";

const KIND_LABEL: Record<string, string> = {
  word_of_mouth: "Word of mouth",
  loyalty: "Loyalty",
  retention: "Retention",
  offer: "Offer",
  content: "Content",
  partnership: "Partnership",
  ads: "Ads",
  operations: "Operations",
  other: "Other",
};

const STATUS_TONE: Record<string, "neutral" | "good" | "warn" | "bad" | "accent"> = {
  proposed: "accent",
  running: "good",
  paused: "warn",
  stopped: "neutral",
  done: "neutral",
};

function OwnerChip({ owner }: { owner: StrategyStep["owner"] }) {
  if (owner === "orbit")
    return (
      <span className="inline-flex h-fit flex-none items-center gap-1 self-start rounded-md bg-accent-soft px-1.5 py-0.5 text-[11px] font-semibold text-accent-strong">
        <CheckCircle2 className="h-3 w-3" /> Orbit
      </span>
    );
  if (owner === "seller")
    return (
      <span className="inline-flex h-fit flex-none items-center gap-1 self-start rounded-md bg-warn-soft px-1.5 py-0.5 text-[11px] font-semibold text-warn">
        <User className="h-3 w-3" /> You
      </span>
    );
  return (
    <span className="inline-flex h-fit flex-none items-center gap-1 self-start rounded-md bg-bad-soft px-1.5 py-0.5 text-[11px] font-semibold text-bad">
      <Ban className="h-3 w-3" /> Not possible yet
    </span>
  );
}

function fmt(v: number | null, unit: "count" | "money" | "percent", currency: string) {
  if (v == null) return "—";
  if (unit === "money") return money(v, currency);
  if (unit === "percent") return `${v}%`;
  return v.toLocaleString();
}

function ResultBox({ s, currency }: { s: StrategyView; currency: string }) {
  const r = s.result;
  if (!r) return null;
  if (!r.measurable || r.value == null) {
    return <div className="rounded-lg bg-panel-2 px-3 py-2 text-[12.5px] text-text-dim">{r.note ?? "No measurement yet."}</div>;
  }
  const lowerIsBetter = s.metric.type === "cancel_rate";
  const delta = r.baseline != null ? r.value - r.baseline : null;
  const good = delta != null && (lowerIsBetter ? delta < 0 : delta > 0);
  return (
    <div className="flex flex-wrap items-end gap-x-6 gap-y-2 rounded-lg bg-panel-2 px-3 py-2.5">
      <div>
        <div className="text-[11px] font-medium uppercase tracking-[0.05em] text-text-faint">{r.label}</div>
        <div className="mt-0.5 text-[20px] font-semibold tabular-nums leading-none">{fmt(r.value, r.unit, currency)}</div>
      </div>
      <div className="text-[12.5px] text-text-dim">
        {r.baseline != null ? (
          <span className="inline-flex items-center gap-1">
            {delta !== 0 &&
              (good ? <TrendingUp className="h-3.5 w-3.5 text-good" /> : <TrendingDown className="h-3.5 w-3.5 text-bad" />)}
            before: {fmt(r.baseline, r.unit, currency)} (same {r.windowDays} days just before)
          </span>
        ) : null}
        {r.target != null && <div>target: {fmt(r.target, r.unit, currency)}</div>}
      </div>
    </div>
  );
}

const KIND_DOT: Record<string, string> = {
  word_of_mouth: "#e0730f",
  loyalty: "#c2185b",
  retention: "#8a3e8a",
  offer: "#2b8a6f",
  content: "#a8730f",
  partnership: "#2b7bb3",
  ads: "#b3541e",
  operations: "#5b5fc7",
  other: "#6b7280",
};

function ownerCounts(steps: StrategyStep[]) {
  return steps.reduce((a, st) => ({ ...a, [st.owner]: (a[st.owner] ?? 0) + 1 }), {} as Record<string, number>);
}

function MiniResult({ s, currency }: { s: StrategyView; currency: string }) {
  const r = s.result;
  if (!r || !r.measurable || r.value == null) return null;
  const lowerIsBetter = s.metric.type === "cancel_rate";
  const delta = r.baseline != null ? r.value - r.baseline : null;
  const good = delta != null && (lowerIsBetter ? delta < 0 : delta > 0);
  return (
    <span className={`inline-flex items-center gap-1 tabular-nums ${delta ? (good ? "text-good" : "text-bad") : "text-text-dim"}`}>
      {delta ? good ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" /> : null}
      {fmt(r.value, r.unit, currency)} so far
    </span>
  );
}


const ACTION_STYLE: Record<ActionView["status"], { cls: string; label: string }> = {
  done: { cls: "text-good", label: "Done" },
  deliverable: { cls: "text-accent-strong", label: "Written for you" },
  skipped: { cls: "text-text-faint", label: "Skipped" },
  needs_connection: { cls: "text-warn", label: "Needs a connection" },
  failed: { cls: "text-bad", label: "Failed" },
};

function ActionRow({ a }: { a: ActionView }) {
  const [copied, setCopied] = useState(false);
  const [show, setShow] = useState(false);
  const st = ACTION_STYLE[a.status] ?? ACTION_STYLE.done;
  const Icon = a.status === "done" ? Check : a.status === "failed" ? AlertTriangle : a.status === "needs_connection" ? Link2 : a.status === "skipped" ? CircleDashed : Copy;
  return (
    <li className="rounded-lg bg-panel-2 px-2.5 py-2">
      <div className="flex items-start gap-2 text-[12px] leading-relaxed">
        <Icon className={`mt-0.5 h-3.5 w-3.5 flex-none ${st.cls}`} />
        <div className="min-w-0 flex-1">
          <span className={`mr-1.5 font-semibold ${st.cls}`}>{st.label}</span>
          <span className="text-text-dim">{a.summary}</span>
        </div>
        {a.output && (
          <button onClick={() => setShow((v) => !v)} className="flex-none text-[11.5px] font-medium text-accent-strong hover:underline">
            {show ? "Hide" : "View"}
          </button>
        )}
      </div>
      {a.output && show && (
        <div className="mt-2">
          <pre className="max-h-64 overflow-y-auto whitespace-pre-wrap rounded-md border border-border bg-panel p-2.5 font-sans text-[12px] leading-relaxed text-text">{a.output}</pre>
          <button
            onClick={() => {
              navigator.clipboard?.writeText(a.output ?? "").then(() => {
                setCopied(true);
                setTimeout(() => setCopied(false), 1500);
              });
            }}
            className="mt-1.5 inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11.5px] font-medium text-text-dim hover:bg-panel hover:text-text"
          >
            {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />} {copied ? "Copied" : "Copy"}
          </button>
        </div>
      )}
    </li>
  );
}

function OrbitWork({ s, onRerun, busy }: { s: StrategyView; onRerun: () => void; busy: boolean }) {
  const hasOrbitSteps = s.steps.some((st) => st.owner === "orbit");
  if (!hasOrbitSteps) return null;
  const working = s.status === "running" && !s.executedAt;
  return (
    <div className="mt-3 rounded-lg border border-border p-2.5">
      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="text-[11.5px] font-semibold uppercase tracking-[0.05em] text-text-faint">What Orbit did</div>
        {s.status === "running" && s.executedAt && (
          <button
            disabled={busy}
            onClick={onRerun}
            className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11.5px] font-medium text-text-dim hover:bg-panel-2 hover:text-text disabled:opacity-50"
          >
            <RefreshCw className={`h-3 w-3 ${busy ? "animate-spin" : ""}`} /> Run again
          </button>
        )}
      </div>
      {working ? (
        <div className="flex items-center gap-2 text-[12px] text-text-dim">
          <Loader2 className="h-3.5 w-3.5 animate-spin" /> Orbit is doing its steps now…
        </div>
      ) : s.actions.length === 0 ? (
        <div className="text-[12px] text-text-faint">{s.executedAt ? "Nothing needed doing." : "Starts once the plan is approved."}</div>
      ) : (
        <ul className="space-y-1.5">
          {s.actions.map((a) => (
            <ActionRow key={a.id} a={a} />
          ))}
        </ul>
      )}
    </div>
  );
}

const TOOL_LABEL: Record<string, string> = {
  create_coupon: "Coupons",
  enable_loyalty: "Loyalty",
  enable_referral: "Referrals",
  enable_gift_cards: "Gift cards",
  enable_cod_confirmation: "COD confirm",
  add_checkout_field: "Checkout fields",
  create_bundle: "Bundles",
  write_for_seller: "Writing",
  publish_facebook_post: "Facebook posts",
};

function TeamBlock({ agents }: { agents: AgentView[] }) {
  if (!agents.length) return null;
  return (
    <div className="rounded-xl border border-border bg-panel p-3.5">
      <div className="mb-2.5 flex items-center gap-1.5 text-[11.5px] font-semibold uppercase tracking-[0.05em] text-text-faint">
        <Users className="h-3.5 w-3.5" /> Team the Orchestrator hired
      </div>
      <ul className="space-y-2.5">
        {agents.map((a) => {
          const pct = a.budgetUsd > 0 ? Math.min(100, Math.round((a.spentUsd / a.budgetUsd) * 100)) : 0;
          return (
            <li key={a.id} className={a.status === "retired" ? "opacity-55" : ""}>
              <div className="flex items-center justify-between gap-2">
                <div className="text-[13px] font-semibold">{a.name}</div>
                <span className="text-[11px] text-text-faint">{a.status === "retired" ? "Retired" : "Working"}</span>
              </div>
              <div className="text-[12px] text-text-dim">{a.role}</div>
              <div className="mt-1.5 flex flex-wrap gap-1">
                {a.tools.map((t) => (
                  <span key={t} className="rounded bg-panel-2 px-1.5 py-0.5 text-[10.5px] text-text-dim">{TOOL_LABEL[t] ?? t}</span>
                ))}
                {a.dataScopes.map((d) => (
                  <span key={d} className="rounded bg-accent-soft px-1.5 py-0.5 text-[10.5px] text-accent-strong">reads {d.replace("_", " ")}</span>
                ))}
              </div>
              <div className="mt-1.5 flex items-center gap-2 text-[11px] text-text-faint">
                <div className="h-1 flex-1 overflow-hidden rounded-full bg-panel-2">
                  <div className="h-full rounded-full gradient-fill" style={{ width: `${pct}%` }} />
                </div>
                ${a.spentUsd.toFixed(2)} / ${a.budgetUsd.toFixed(2)} budget
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function StrategyCard({ s, index, draft, currency, onAction, busy }: {
  s: StrategyView;
  index: number;
  draft: boolean;
  currency: string;
  onAction: (id: string, action: "pause" | "resume" | "stop" | "done" | "remove" | "rerun") => void;
  busy: boolean;
}) {
  const [open, setOpen] = useState(false);
  const counts = ownerCounts(s.steps);
  const guardBad = s.profitNote && /^(Loses money|Thin margin|Gives)/.test(s.profitNote);
  const dim = s.status === "stopped" || s.status === "done";
  const act = (label: string, icon: React.ReactNode, action: "pause" | "resume" | "stop" | "done" | "remove") => (
    <button
      disabled={busy}
      onClick={() => onAction(s.id, action)}
      className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[12px] font-medium text-text-dim transition-colors hover:bg-panel-2 hover:text-text disabled:opacity-50"
    >
      {icon} {label}
    </button>
  );

  return (
    <div className={`rounded-xl border border-border bg-panel transition-colors ${open ? "border-border-strong" : "hover:border-border-strong"} ${dim ? "opacity-60" : ""}`}>
      <button onClick={() => setOpen((v) => !v)} className="flex w-full items-start gap-3 px-4 py-3 text-left" aria-expanded={open}>
        <span className="mt-0.5 flex h-6 w-6 flex-none items-center justify-center rounded-md bg-panel-2 text-[11.5px] font-semibold tabular-nums text-text-dim">
          {index + 1}
        </span>
        <div className="min-w-0 flex-1">
          <div className="text-[13.5px] font-semibold leading-snug">{s.title}</div>
          <div className="mt-1 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[11.5px] text-text-faint">
            <span className="inline-flex items-center gap-1.5">
              <span className="h-1.5 w-1.5 rounded-full" style={{ background: KIND_DOT[s.kind] ?? KIND_DOT.other }} />
              {KIND_LABEL[s.kind] ?? s.kind}
            </span>
            <span>{s.durationDays ? `${s.durationDays} days` : "Ongoing"}</span>
            {(counts.seller ?? 0) > 0 && <span className="text-warn">{counts.seller} for you</span>}
            {(counts.not_possible ?? 0) > 0 && <span className="text-bad">{counts.not_possible} not possible</span>}
            {guardBad && <span className="text-warn">profit check</span>}
            {!draft && s.status === "running" && !s.executedAt && s.steps.some((st) => st.owner === "orbit") && (
              <span className="inline-flex items-center gap-1 text-accent-strong">
                <Loader2 className="h-3 w-3 animate-spin" /> Orbit working
              </span>
            )}
            {!draft && s.actions.length > 0 && (
              <span className="text-accent-strong">
                Orbit: {s.actions.filter((a) => a.status === "done" || a.status === "deliverable").length}/{s.actions.length} done
              </span>
            )}
            {!draft && <MiniResult s={s} currency={currency} />}
          </div>
        </div>
        {!draft && <Pill tone={STATUS_TONE[s.status] ?? "neutral"}>{s.status}</Pill>}
        <ChevronDown className={`mt-1 h-4 w-4 flex-none text-text-faint transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div className="border-t border-border px-4 pb-4 pt-3">
          <p className="text-[12.5px] text-text-dim">
            <span className="font-medium text-text">For:</span> {s.audience}
          </p>
          <p className="mt-2 text-[13px] leading-relaxed">{s.why}</p>

          <ol className="mt-3 space-y-2">
            {s.steps.map((st, i) => (
              <li key={i} className="flex gap-2 text-[12.5px] leading-relaxed">
                <OwnerChip owner={st.owner} />
                <div className="min-w-0 flex-1">
                  {st.text}
                  {st.note && <div className="mt-0.5 text-[11.5px] text-text-faint">{st.note}</div>}
                </div>
              </li>
            ))}
          </ol>

          <div className="mt-3 space-y-2 text-[12px] text-text-dim">
            <div>
              <span className="font-medium text-text">Measured by:</span> {s.metric.label}
              {s.metric.couponCode && <span className="ml-1.5 rounded bg-panel-2 px-1.5 py-0.5 font-mono text-[11px]">{s.metric.couponCode}</span>}
            </div>
            {s.costNote && (
              <div>
                <span className="font-medium text-text">Cost:</span> {s.costNote}
              </div>
            )}
            {s.profitNote && (
              <div className={`flex items-start gap-1.5 rounded-lg px-2.5 py-2 ${guardBad ? "bg-warn-soft text-warn" : "bg-good-soft text-good"}`}>
                {guardBad ? <ShieldAlert className="mt-0.5 h-3.5 w-3.5 flex-none" /> : <ShieldCheck className="mt-0.5 h-3.5 w-3.5 flex-none" />}
                {s.profitNote}
              </div>
            )}
            {!draft && <ResultBox s={s} currency={currency} />}
          </div>
          {!draft && <OrbitWork s={s} busy={busy} onRerun={() => onAction(s.id, "rerun")} />}

          <div className="mt-3 flex flex-wrap gap-1 border-t border-border pt-2.5">
            {draft
              ? act("Remove", <Trash2 className="h-3.5 w-3.5" />, "remove")
              : s.status === "running"
                ? (
                  <>
                    {act("Pause", <Pause className="h-3.5 w-3.5" />, "pause")}
                    {act("Mark done", <Flag className="h-3.5 w-3.5" />, "done")}
                    {act("Stop", <Square className="h-3.5 w-3.5" />, "stop")}
                  </>
                )
                : s.status === "paused"
                  ? (
                    <>
                      {act("Resume", <Play className="h-3.5 w-3.5" />, "resume")}
                      {act("Stop", <Square className="h-3.5 w-3.5" />, "stop")}
                    </>
                  )
                  : null}
          </div>
        </div>
      )}
    </div>
  );
}

function FinalReview({ plan, busy, canHire, onClose, onApprove }: { plan: PlanView; busy: boolean; canHire: boolean; onClose: () => void; onApprove: () => void }) {
  const group = (owner: StrategyStep["owner"]) =>
    plan.strategies.map((s) => ({ s, steps: s.steps.filter((st) => st.owner === owner) })).filter((g) => g.steps.length > 0);
  const warnings = plan.strategies.filter((s) => s.profitNote && /^(Loses money|Thin margin|Gives)/.test(s.profitNote));
  const section = (title: string, tone: string, owner: StrategyStep["owner"]) => {
    const g = group(owner);
    if (!g.length) return null;
    return (
      <div>
        <div className={`text-[12px] font-semibold uppercase tracking-[0.05em] ${tone}`}>{title}</div>
        <div className="mt-2 space-y-2.5">
          {g.map(({ s, steps }) => (
            <div key={s.id}>
              <div className="text-[13px] font-medium">{s.title}</div>
              <ul className="mt-1 space-y-1 pl-4 text-[12.5px] text-text-dim">
                {steps.map((st, i) => (
                  <li key={i} className="list-disc">
                    {st.text}
                    {st.note ? <span className="text-text-faint"> — {st.note}</span> : null}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>
    );
  };
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/50 p-4 sm:p-10" role="dialog" aria-modal="true">
      <Card className="w-full max-w-[720px] p-6">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-[12px] font-semibold uppercase tracking-[0.05em] text-text-faint">Final plan</div>
            <h2 className="mt-1 text-[20px] font-semibold">{plan.title}</h2>
            <p className="mt-1 text-[13px] text-text-dim">
              {plan.strategies.length} strategies. Once approved they start running and Orbit starts measuring each one.
            </p>
          </div>
          <button onClick={onClose} className="rounded-md p-1 text-text-dim hover:bg-panel-2" aria-label="Close">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="mt-5 space-y-5">
          {section("Your to-do", "text-warn", "seller")}
          {section("Orbit will do", "text-accent-strong", "orbit")}
          {section("Not possible yet", "text-bad", "not_possible")}
          <div className="rounded-lg bg-panel-2 px-3 py-2 text-[12.5px] text-text-dim">
            {canHire
              ? "On your Max plan the Orchestrator will hire specialist agents for this plan, give each only the tools and data it needs, and split a budget from your monthly AI limit between them. You'll see the team next to the plan."
              : "Orbit carries out its steps right after you approve, and tells you in the chat what it did. Things it writes for you (captions, messages) appear inside each strategy to copy."}
          </div>
          {warnings.length > 0 && (
            <div className="rounded-lg bg-warn-soft px-3 py-2 text-[12.5px] text-warn">
              <div className="font-semibold">Profit warnings</div>
              {warnings.map((w) => (
                <div key={w.id}>
                  • {w.title}: {w.profitNote}
                </div>
              ))}
            </div>
          )}
        </div>
        <div className="mt-6 flex flex-wrap justify-end gap-2">
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            Keep discussing
          </Button>
          <Button onClick={onApprove} disabled={busy || plan.strategies.length === 0}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />} Approve &amp; run
          </Button>
        </div>
      </Card>
    </div>
  );
}

function PlanBlock({ plan, currency, busy, onAction, onApprove }: {
  plan: PlanView;
  currency: string;
  busy: boolean;
  onAction: (id: string, action: "pause" | "resume" | "stop" | "done" | "remove" | "rerun") => void;
  onApprove?: () => void;
}) {
  const draft = plan.status === "draft";
  const [more, setMore] = useState(false);
  const counts = ownerCounts(plan.strategies.flatMap((s) => s.steps));
  return (
    <div className="space-y-3">
      <div className="rounded-xl border border-border bg-panel p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <Pill tone={draft ? "accent" : "good"}>{draft ? "Draft · not running" : "Active"}</Pill>
            <h2 className="mt-2 text-[16px] font-semibold leading-snug">{plan.title}</h2>
          </div>
          {draft && onApprove && (
            <Button className="flex-none px-3 py-2 text-[12.5px]" disabled={busy || plan.strategies.length === 0} onClick={onApprove}>
              <ClipboardCheck className="h-3.5 w-3.5" /> Review &amp; approve
            </Button>
          )}
        </div>
        <p className={`mt-2.5 text-[12.5px] leading-relaxed text-text-dim ${more ? "" : "line-clamp-3"}`}>{plan.diagnosis}</p>
        <button onClick={() => setMore((v) => !v)} className="mt-1 text-[12px] font-medium text-accent-strong hover:underline">
          {more ? "Show less" : "Read more"}
        </button>
        <div className="mt-3 flex flex-wrap gap-1.5 text-[11.5px]">
          <span className="rounded-md bg-panel-2 px-2 py-0.5 text-text-dim">{plan.strategies.length} strategies</span>
          <span className="rounded-md bg-accent-soft px-2 py-0.5 text-accent-strong">{counts.orbit ?? 0} Orbit does</span>
          <span className="rounded-md bg-warn-soft px-2 py-0.5 text-warn">{counts.seller ?? 0} you do</span>
          {(counts.not_possible ?? 0) > 0 && <span className="rounded-md bg-bad-soft px-2 py-0.5 text-bad">{counts.not_possible} not possible yet</span>}
        </div>
      </div>
      {!draft && <TeamBlock agents={plan.agents} />}
      {plan.strategies.map((s, i) => (
        <StrategyCard key={s.id} s={s} index={i} draft={draft} currency={currency} busy={busy} onAction={onAction} />
      ))}
      {draft && (
        <p className="px-1 text-[11.5px] leading-relaxed text-text-faint">
          Nothing runs until you approve. Ask the Orchestrator to change anything, then Review &amp; approve.
        </p>
      )}
    </div>
  );
}

/**
 * The growth plan, shown next to "Talk to your Orchestrator". Discussion happens in that chat;
 * this panel shows the plan, drafts a new one, and handles approve / pause / stop / remove.
 */
export function PlanPanel({
  active,
  draft,
  currency,
  canHire,
  reviewing,
  onReviewingChange,
}: {
  active: PlanView | null;
  draft: PlanView | null;
  currency: string;
  canHire: boolean;
  reviewing: boolean;
  onReviewingChange: (v: boolean) => void;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [drafting, setDrafting] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [tabPref, setTab] = useState<"draft" | "active" | null>(null);
  // A new draft (e.g. drafted from the chat) comes to the front: reset the manual choice when it appears.
  const [seenDraftId, setSeenDraftId] = useState(draft?.id ?? null);
  if ((draft?.id ?? null) !== seenDraftId) {
    setSeenDraftId(draft?.id ?? null);
    setTab(null);
  }
  const tab: "draft" | "active" = tabPref ?? (draft ? "draft" : "active");

  async function call(url: string, init: RequestInit) {
    setError(null);
    const res = await fetch(url, { headers: { "Content-Type": "application/json" }, ...init });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error ?? "Something went wrong.");
    return data;
  }

  async function draftPlan() {
    setDrafting(true);
    try {
      await call("/api/strategy-lab/draft", { method: "POST", body: JSON.stringify({ note }) });
      setNote("");
      setShowNew(false);
      setTab("draft");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setDrafting(false);
    }
  }

  async function approve(planId: string) {
    setBusy(true);
    try {
      await call(`/api/strategy-lab/${planId}/approve`, { method: "POST" });
      onReviewingChange(false);
      setTab("active");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function onAction(id: string, action: "pause" | "resume" | "stop" | "done" | "remove" | "rerun") {
    setBusy(true);
    try {
      if (action === "rerun") await call(`/api/strategy-lab/strategy/${id}/run`, { method: "POST" });
      else if (action === "remove") await call(`/api/strategy-lab/strategy/${id}`, { method: "DELETE" });
      else {
        const status = ({ pause: "paused", resume: "running", stop: "stopped", done: "done" } as Record<string, string>)[action];
        await call(`/api/strategy-lab/strategy/${id}`, { method: "PATCH", body: JSON.stringify({ status }) });
      }
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  const shown = tab === "draft" ? draft : active;
  const hasAny = !!(draft || active);

  // While Orbit is carrying out steps in the background, refresh until it's done.
  const orbitWorking = !!active?.strategies.some((x) => x.status === "running" && !x.executedAt && x.steps.some((st) => st.owner === "orbit"));
  useEffect(() => {
    if (!orbitWorking) return;
    const t = window.setInterval(() => router.refresh(), 5000);
    return () => window.clearInterval(t);
  }, [orbitWorking, router]);

  const newPlanBox = (
    <Card className="p-4">
      <div className="flex items-center gap-2 text-[13.5px] font-semibold">
        <Sparkles className="h-4 w-4 text-accent-strong" /> {hasAny ? "Draft a new plan" : "Draft your first growth plan"}
      </div>
      <p className="mt-1 text-[12.5px] text-text-dim">
        Orbit reads your real numbers, finds what&apos;s holding you back and proposes different strategies to test. You can also just ask the
        Orchestrator: &ldquo;naya plan banao&rdquo;.
      </p>
      <textarea
        value={note}
        onChange={(e) => setNote(e.target.value)}
        rows={2}
        placeholder="Anything it should know (optional) — e.g. only 40 boxes a week · no ad budget · Eid in 3 weeks"
        className="mt-2.5 w-full resize-y rounded-lg border border-border bg-panel-2 px-3 py-2 text-[13px] outline-none focus:border-accent-strong/50"
      />
      <div className="mt-2.5 flex items-center gap-3">
        <Button className="px-3 py-2 text-[13px]" onClick={draftPlan} disabled={drafting}>
          {drafting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
          {drafting ? "Thinking through your business…" : "Draft plan"}
        </Button>
        {drafting && <span className="text-[12px] text-text-faint">About a minute.</span>}
      </div>
    </Card>
  );

  return (
    <div className="space-y-3">
      <div className="sticky top-0 z-10 -mx-1 flex flex-wrap items-center justify-between gap-2 bg-bg/95 px-1 pb-2 pt-0.5 backdrop-blur">
        <div className="text-[12px] font-semibold uppercase tracking-[0.06em] text-text-dim">Growth plan</div>
        <div className="flex items-center gap-2">
          {hasAny && (
            <div className="flex gap-1 rounded-lg bg-panel-2 p-1 text-[12.5px] font-medium">
              {draft && (
                <button className={`rounded-md px-2.5 py-1 ${tab === "draft" ? "bg-panel shadow-sm" : "text-text-dim"}`} onClick={() => setTab("draft")}>
                  Draft
                </button>
              )}
              {active && (
                <button className={`rounded-md px-2.5 py-1 ${tab === "active" ? "bg-panel shadow-sm" : "text-text-dim"}`} onClick={() => setTab("active")}>
                  Active
                </button>
              )}
            </div>
          )}
          {hasAny && (
            <Button variant="ghost" className="px-2.5 py-1.5 text-[12.5px]" onClick={() => setShowNew((v) => !v)}>
              <Plus className="h-3.5 w-3.5" /> New draft
            </Button>
          )}
        </div>
      </div>

      {(!hasAny || showNew) && newPlanBox}
      {error && <p className="text-[13px] text-bad">{error}</p>}

      {shown ? (
        <>
          <PlanBlock
            plan={shown}
            currency={currency}
            busy={busy}
            onAction={onAction}
            onApprove={shown.status === "draft" ? () => onReviewingChange(true) : undefined}
          />
          {reviewing && shown.status === "draft" && (
            <FinalReview plan={shown} busy={busy} canHire={canHire} onClose={() => onReviewingChange(false)} onApprove={() => approve(shown.id)} />
          )}
        </>
      ) : null}
    </div>
  );
}
