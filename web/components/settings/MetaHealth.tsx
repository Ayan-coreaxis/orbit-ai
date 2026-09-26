"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, Check, Loader2, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";

type Health = {
  ready: boolean;
  checks: { id: string; label: string; ok: boolean; fix?: string }[];
  pages: { id: string; name: string; hasInstagram: boolean }[];
  adAccounts: { id: string; name: string; currency: string | null; active: boolean }[];
  current: { pageId: string | null; adAccountId: string | null };
};

/** "Is Meta ready?" — every check with its fix, plus Page / ad account pickers. */
export function MetaHealth() {
  const [h, setH] = useState<Health | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let alive = true;
    fetch("/api/meta/status")
      .then((r) => r.json())
      .then((d) => alive && (d.error ? setErr(d.error) : setH(d)))
      .catch(() => alive && setErr("Couldn't check the Meta connection."));
    return () => {
      alive = false;
    };
  }, [tick]);

  async function choose(body: { pageId?: string; adAccountId?: string }) {
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch("/api/meta/status", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || "Couldn't switch.");
      setH(d);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Couldn't switch.");
    } finally {
      setBusy(false);
    }
  }

  if (!h) return <div className="mt-4 flex items-center gap-2 text-[12.5px] text-text-faint">{err ?? <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Checking your Meta connection…</>}</div>;

  const select = "rounded-lg border border-border bg-panel-2 px-2.5 py-1.5 text-[12.5px] outline-none focus:border-accent/60";
  return (
    <div className="mt-5 rounded-xl border border-border bg-panel/60 p-4">
      <div className="flex items-center justify-between">
        <div className="text-[12.5px] font-semibold">{h.ready ? "Everything is ready for posting and ads" : "Connection check"}</div>
        <button onClick={() => setTick((t) => t + 1)} className="inline-flex items-center gap-1 text-[12px] text-text-faint hover:text-text" aria-label="Check again">
          <RefreshCw className="h-3 w-3" /> Check again
        </button>
      </div>
      <ul className="mt-3 grid gap-1.5">
        {h.checks.map((c) => (
          <li key={c.id} className="text-[12.5px]">
            <div className={cn("flex items-start gap-2", c.ok ? "text-text-dim" : "text-warn")}>
              {c.ok ? <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-good" /> : <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />}
              <span>{c.label}</span>
            </div>
            {!c.ok && c.fix && <p className="ml-5 text-[12px] text-text-faint">{c.fix}</p>}
          </li>
        ))}
      </ul>
      {(h.pages.length > 1 || h.adAccounts.length > 1) && (
        <div className="mt-4 flex flex-wrap gap-4">
          {h.pages.length > 1 && (
            <label className="grid gap-1 text-[12px] text-text-faint">
              Page Orbit posts to
              <select className={select} disabled={busy} value={h.current.pageId ?? ""} onChange={(e) => choose({ pageId: e.target.value })}>
                {h.pages.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                    {p.hasInstagram ? " (+ Instagram)" : ""}
                  </option>
                ))}
              </select>
            </label>
          )}
          {h.adAccounts.length > 1 && (
            <label className="grid gap-1 text-[12px] text-text-faint">
              Ad account for ads
              <select className={select} disabled={busy} value={h.current.adAccountId ?? ""} onChange={(e) => choose({ adAccountId: e.target.value })}>
                {h.adAccounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                    {a.currency ? ` · ${a.currency}` : ""}
                    {a.active ? "" : " (not active)"}
                  </option>
                ))}
              </select>
            </label>
          )}
        </div>
      )}
      {err && <p className="mt-2 text-[12px] text-bad">{err}</p>}
    </div>
  );
}
