"use client";

import { useState } from "react";
import { Button } from "@/components/ui";

/**
 * "Orbit on WhatsApp" inside Settings > Channels > WhatsApp: the owner gets the daily store check
 * on their own number and runs it by replying (1, 2…, APPLY, NO, STOP).
 */
export function WhatsAppBossCard({ initialEnabled, ownerNumber, numberOk }: { initialEnabled: boolean; ownerNumber: string | null; numberOk: boolean }) {
  const [enabled, setEnabled] = useState(initialEnabled);
  const [busy, setBusy] = useState<"toggle" | "test" | null>(null);
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);

  async function toggle(next: boolean) {
    setBusy("toggle");
    setNote(null);
    try {
      const res = await fetch("/api/settings/whatsapp-boss", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ enabled: next }) });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) setNote({ ok: false, text: data.error ?? "Couldn't save." });
      else setEnabled(next);
    } catch {
      setNote({ ok: false, text: "Couldn't save — check your connection." });
    }
    setBusy(null);
  }

  async function test() {
    setBusy("test");
    setNote(null);
    try {
      const res = await fetch("/api/settings/whatsapp-boss", { method: "POST" });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      setNote(res.ok ? { ok: true, text: `Sent — check WhatsApp on ${ownerNumber}.` } : { ok: false, text: data.error ?? "Couldn't send." });
    } catch {
      setNote({ ok: false, text: "Couldn't send — check your connection." });
    }
    setBusy(null);
  }

  return (
    <div className="mt-5 border-t border-border pt-5">
      <label className={"flex items-start gap-3 rounded-lg border border-border bg-panel px-3.5 py-3 text-[13px] " + (numberOk ? "cursor-pointer hover:border-border-strong" : "opacity-70")}>
        <input
          type="checkbox"
          checked={enabled}
          disabled={!numberOk || busy !== null}
          onChange={(e) => toggle(e.target.checked)}
          className="mt-0.5 h-4 w-4 accent-[var(--accent)]"
        />
        <span>
          <span className="font-medium text-text">Orbit on WhatsApp</span>
          <span className="mt-0.5 block text-[12px] leading-relaxed text-text-faint">
            Every morning Orbit sends your store check to your own WhatsApp. Reply 1, 2… and it prepares that task, reply APPLY to make the change or NO to drop it, STOP to turn
            this off. Nothing changes in your store without your APPLY.
          </span>
        </span>
      </label>

      <p className="mt-3 text-[12.5px] text-text-dim">
        {ownerNumber ? (
          <>
            Your number: <b className="text-text">{ownerNumber}</b>
            {!numberOk && <span className="text-bad"> — this isn&apos;t a complete number (use 03xx xxxxxxx or +92…). Ask the Orbit team to correct it.</span>}
          </>
        ) : (
          "No owner WhatsApp number on file yet — ask the Orbit team to add yours."
        )}
      </p>
      {numberOk && <p className="mt-1 text-[12px] text-text-faint">Only messages from this exact number can run your store.</p>}

      <div className="mt-3 flex flex-wrap items-center gap-3">
        <Button variant="secondary" className="disabled:cursor-not-allowed disabled:opacity-50" onClick={test}disabled={!enabled || !numberOk || busy !== null}>
          {busy === "test" ? "Sending…" : "Send me a test briefing"}
        </Button>
        {note && <span className={"text-[12.5px] " + (note.ok ? "text-good" : "text-bad")}>{note.text}</span>}
      </div>
    </div>
  );
}
