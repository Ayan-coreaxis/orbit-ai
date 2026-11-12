"use client";

import { useState } from "react";
import Link from "next/link";
import { Check, Sparkles, X } from "lucide-react";
import type { BriefingTask } from "@/lib/daily-briefing";

/**
 * The daily store check's tasks, under the briefing message in the Orchestrator chat. "Prepare"
 * hands the task's instruction to the Orchestrator (which drafts it as an Apply proposal);
 * "Skip" hides it for a week; the link opens the page to do it by hand.
 */
export function BriefingTasks({
  messageId,
  tasks: initial,
  onPrepare,
  disabled,
}: {
  messageId: string;
  tasks: BriefingTask[];
  onPrepare: (prompt: string) => void;
  disabled?: boolean;
}) {
  const [tasks, setTasks] = useState(initial);
  const [busy, setBusy] = useState<string | null>(null);

  async function mark(id: string, state: "done" | "skipped" | "open") {
    setBusy(id);
    setTasks((ts) => ts.map((t) => (t.id === id ? { ...t, state } : t)));
    await fetch("/api/orchestrator/briefing", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messageId, taskId: id, state }),
    }).catch(() => {});
    setBusy(null);
  }

  if (!tasks.length) return null;
  return (
    <ol className="ml-8 mt-2 grid w-[calc(100%-2rem)] max-w-[608px] gap-2">
      {tasks.map((t, i) => {
        const closed = t.state === "done" || t.state === "skipped";
        return (
          <li
            key={t.id}
            className={`rounded-xl border px-4 py-3 transition-opacity ${closed ? "border-border bg-panel-2/40 opacity-60" : "border-border-strong bg-panel-2/70"}`}
          >
            <div className="flex items-start gap-3">
              <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-accent-soft text-[11px] font-bold text-accent">{i + 1}</span>
              <div className="min-w-0 flex-1">
                <div className="text-[13.5px] font-semibold text-text">{t.title}</div>
                <p className="mt-0.5 text-[12.5px] leading-relaxed text-text-dim">{t.why}</p>
                {closed ? (
                  <div className="mt-2 flex items-center gap-3 text-[12px] text-text-faint">
                    <span>{t.state === "done" ? "Sent to the Orchestrator" : "Skipped for a week"}</span>
                    <button className="underline hover:text-text" onClick={() => mark(t.id, "open")} disabled={busy === t.id}>
                      Undo
                    </button>
                  </div>
                ) : (
                  <div className="mt-2.5 flex flex-wrap items-center gap-2">
                    <button
                      className="inline-flex items-center gap-1.5 rounded-lg gradient-fill px-3 py-1.5 text-[12.5px] font-semibold text-white disabled:opacity-50"
                      disabled={disabled || busy === t.id}
                      onClick={() => {
                        onPrepare(t.prompt);
                        void mark(t.id, "done");
                      }}
                    >
                      <Sparkles className="h-3.5 w-3.5" /> Prepare
                    </button>
                    {t.href && (
                      <Link href={t.href} className="inline-flex items-center gap-1.5 rounded-lg border border-border-strong px-3 py-1.5 text-[12.5px] text-text-dim hover:text-text">
                        <Check className="h-3.5 w-3.5" /> Do it myself
                      </Link>
                    )}
                    <button
                      className="inline-flex items-center gap-1 rounded-lg px-2 py-1.5 text-[12px] text-text-faint hover:text-text"
                      disabled={busy === t.id}
                      onClick={() => mark(t.id, "skipped")}
                    >
                      <X className="h-3.5 w-3.5" /> Skip
                    </button>
                  </div>
                )}
              </div>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
