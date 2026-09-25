"use client";

import { useEffect, useState } from "react";
import { Check, Loader2, ScanEye, X } from "lucide-react";
import type { AuditFinding } from "@/lib/orbit-design-generate";
import { BuildingCanvas } from "./BuildingCanvas";

const AUDIT_STEPS = [
  "Screenshotting every page",
  "Checking alignment & spacing",
  "Checking mobile responsiveness",
  "Checking contrast & colour",
  "Checking motion & interactive parts",
  "Writing up what it found",
];

/**
 * A dedicated deep-QA sweep — screenshots every real page, reports every alignment / responsive /
 * contrast / polish defect it can see, and waits for the seller to pick which fixes to apply. Same
 * BuildingCanvas skeleton as Handoff, told apart only by its soft-focus (blur) variant instead of
 * Handoff's film-grain, and by the step label actually naming what's being checked right now.
 */
export function AuditOverlay({
  phase,
  summary,
  findings,
  error,
  onApply,
  onClose,
}: {
  phase: "scanning" | "review" | "applying" | "done";
  summary: string | null;
  findings: AuditFinding[];
  error: string | null;
  onApply: (approvedIds: string[]) => void;
  onClose: () => void;
}) {
  const [checked, setChecked] = useState<Set<string>>(() => new Set(findings.filter((f) => f.fix).map((f) => f.id)));
  useEffect(() => {
    setChecked(new Set(findings.filter((f) => f.fix).map((f) => f.id)));
  }, [findings]);

  const scanning = phase === "scanning" || phase === "applying";
  const toggle = (id: string) =>
    setChecked((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const [stepIdx, setStepIdx] = useState(0);
  useEffect(() => {
    if (phase !== "scanning") return;
    setStepIdx(0);
    const id = setInterval(() => setStepIdx((s) => Math.min(s + 1, AUDIT_STEPS.length - 1)), 1600);
    return () => clearInterval(id);
  }, [phase]);
  const canvasLabel = phase === "scanning" ? AUDIT_STEPS[stepIdx] : phase === "applying" ? "Applying fixes" : "Done";

  return (
    <div className="od-audit absolute inset-0 z-40 flex flex-col overflow-hidden">
      <div className="absolute inset-0">
        <div className="h-full w-full p-6 pt-24 sm:p-12 sm:pt-28">
          <BuildingCanvas label={canvasLabel} variant="blur" dark />
        </div>
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-black/80 via-black/20 to-black/75" />
      </div>

      <div className="relative z-10 flex items-center justify-between border-b border-white/10 px-6 py-4">
        <div className="flex items-center gap-2.5">
          <span className="od-audit-badge flex h-8 w-8 items-center justify-center rounded-xl">
            {scanning ? <Loader2 className="h-4 w-4 animate-spin text-white" /> : <ScanEye className="h-4 w-4 text-white" strokeWidth={2.2} />}
          </span>
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-white/45">Audit Design</div>
            <div className="text-[14px] font-semibold text-white">
              {scanning ? `${canvasLabel}…` : null}
              {phase === "review" && `${findings.length} thing${findings.length === 1 ? "" : "s"} found`}
              {phase === "done" && "Applied"}
            </div>
          </div>
        </div>
        {phase !== "scanning" && phase !== "applying" && (
          <button onClick={onClose} className="flex h-7 w-7 items-center justify-center rounded-lg text-white/50 hover:bg-white/10 hover:text-white" aria-label="Close">
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      <div className="relative z-10 flex-1 overflow-y-auto px-6 py-5">
        {phase === "scanning" && (
          <div className="flex h-full flex-col items-center justify-center text-center">
            <p className="max-w-[320px] text-[13px] leading-relaxed text-white/55">
              Checking alignment, responsiveness, contrast and every small detail across every page — desktop and mobile.
            </p>
          </div>
        )}

        {error && (
          <div className="mt-6 rounded-xl border border-white/10 bg-white/5 p-5 text-center text-[13px] text-white/60">
            Couldn&apos;t finish the audit — {error === "screenshot engine unavailable" ? "the screenshot engine isn't available right now." : "try again in a moment."}
          </div>
        )}

        {phase === "review" && !error && (
          <>
            {summary && <p className="mb-4 text-[13px] leading-relaxed text-white/65">{summary}</p>}
            {findings.length === 0 ? (
              <div className="flex flex-col items-center justify-center gap-2 py-16 text-center">
                <Check className="h-6 w-6 text-emerald-400" />
                <p className="text-[13px] text-white/60">Nothing wrong found — the store checked out clean on every page.</p>
              </div>
            ) : (
              <div className="space-y-2">
                {findings.map((f) => (
                  <label
                    key={f.id}
                    className={`flex items-start gap-3 rounded-xl border border-white/10 bg-white/[0.04] p-3.5 transition ${f.fix ? "cursor-pointer hover:bg-white/[0.07]" : "opacity-70"}`}
                  >
                    <input
                      type="checkbox"
                      checked={checked.has(f.id)}
                      onChange={() => f.fix && toggle(f.id)}
                      disabled={!f.fix}
                      className="mt-0.5 h-4 w-4 shrink-0 accent-[var(--od-accent,#c9803f)]"
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className={`od-audit-sev od-audit-sev-${f.severity}`} />
                        <span className="text-[11.5px] font-semibold uppercase tracking-wide text-white/45">{f.area}</span>
                      </div>
                      <p className="mt-1 text-[13px] leading-snug text-white/85">{f.issue}</p>
                      <p className="mt-0.5 text-[12px] leading-snug text-white/45">
                        {f.fix ? `Fix: ${f.fixSummary}` : `Needs a manual edit — ${f.fixSummary}`}
                      </p>
                    </div>
                  </label>
                ))}
              </div>
            )}
          </>
        )}

        {phase === "done" && (
          <div className="flex h-full flex-col items-center justify-center gap-2 text-center">
            <Check className="h-6 w-6 text-emerald-400" />
            <p className="text-[13px] text-white/70">Fixes applied — the preview is updated.</p>
          </div>
        )}
      </div>

      {phase === "review" && !error && findings.length > 0 && (
        <div className="relative z-10 flex items-center justify-between gap-3 border-t border-white/10 px-6 py-4">
          <button onClick={onClose} className="text-[12.5px] font-medium text-white/50 hover:text-white/80">
            Skip all
          </button>
          <button
            onClick={() => onApply([...checked])}
            disabled={!checked.size}
            className="flex items-center gap-1.5 rounded-lg gradient-fill px-4 py-2 text-[12.5px] font-semibold text-white disabled:opacity-40"
          >
            Apply {checked.size} fix{checked.size === 1 ? "" : "es"}
          </button>
        </div>
      )}

      <style>{`
        .od-audit{background:#07060c}
        .od-audit-badge{background:linear-gradient(135deg,#0ea5b8,#22c55e);box-shadow:0 0 0 6px rgba(14,165,184,.14),0 10px 30px -8px rgba(14,165,184,.5)}
        .od-audit-sev{display:inline-block;width:6px;height:6px;border-radius:999px}
        .od-audit-sev-high{background:#f87171}
        .od-audit-sev-medium{background:#fbbf24}
        .od-audit-sev-low{background:#60a5fa}
      `}</style>
    </div>
  );
}

