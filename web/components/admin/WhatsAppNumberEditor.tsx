"use client";

import { useState } from "react";

/** The Twilio number this store's customers message. Saves on blur / Enter, only when it changed. */
export function WhatsAppNumberEditor({ businessId, initialNumber }: { businessId: string; initialNumber: string | null }) {
  const [value, setValue] = useState(initialNumber ?? "");
  const [saved, setSaved] = useState(initialNumber ?? "");
  const [state, setState] = useState<{ kind: "idle" | "saving" | "ok" | "error"; message?: string }>({ kind: "idle" });

  async function save() {
    const next = value.trim();
    if (next === saved) return;
    setState({ kind: "saving" });
    try {
      const res = await fetch(`/api/admin/business/${businessId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ whatsappInboundNumber: next || null }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Couldn't save.");
      setSaved(next);
      setState({ kind: "ok" });
    } catch (e) {
      setState({ kind: "error", message: e instanceof Error ? e.message : "Couldn't save." });
    }
  }

  return (
    <div className="max-w-[180px]">
      <input
        type="text"
        value={value}
        onChange={(e) => {
          setValue(e.target.value);
          if (state.kind !== "saving") setState({ kind: "idle" });
        }}
        onBlur={save}
        onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
        placeholder="Not assigned"
        className={`w-36 rounded-md border bg-panel-2 px-1.5 py-1 text-[12.5px] placeholder:italic placeholder:text-text-faint ${state.kind === "error" ? "border-bad" : "border-border"}`}
      />
      {state.kind === "saving" && <div className="mt-0.5 text-[11px] text-text-faint">Saving…</div>}
      {state.kind === "ok" && <div className="mt-0.5 text-[11px] text-good">Saved</div>}
      {state.kind === "error" && <div className="mt-0.5 text-[11px] leading-snug text-bad">{state.message}</div>}
    </div>
  );
}
