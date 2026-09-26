"use client";

import { useEffect, useState } from "react";
import { Loader2, Truck } from "lucide-react";
import { Card, SectionLabel } from "@/components/ui";

type Field = { key: string; label: string; secret?: boolean; optional?: boolean; hint?: string };
type Data = { provider: string; fields: Record<string, Field[]>; saved: Record<string, Record<string, string | boolean>> };

const OPTIONS = [
  { v: "manual", label: "None — I type tracking numbers myself" },
  { v: "postex", label: "PostEx" },
  { v: "leopards", label: "Leopards" },
  { v: "tcs", label: "TCS" },
];

/** Settings > Courier: connect the seller's own courier account, then book and track from Orders. */
export function CourierCard() {
  const [d, setD] = useState<Data | null>(null);
  const [provider, setProvider] = useState("manual");
  const [values, setValues] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; message: string } | null>(null);

  useEffect(() => {
    let alive = true;
    fetch("/api/courier")
      .then((r) => r.json())
      .then((x: Data) => {
        if (!alive) return;
        setD(x);
        setProvider(x.provider || "manual");
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  function pick(p: string) {
    setProvider(p);
    setValues({});
    setMsg(null);
  }

  async function save() {
    setBusy(true);
    setMsg(null);
    const res = await fetch("/api/courier", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ provider, values }) });
    const r = (await res.json().catch(() => ({ ok: false, message: "Couldn't save." }))) as { ok: boolean; message?: string; error?: string };
    setMsg({ ok: !!r.ok, message: r.message ?? r.error ?? "" });
    const fresh = (await (await fetch("/api/courier")).json()) as Data;
    setD(fresh);
    setValues({});
    setBusy(false);
  }

  const input = "w-full rounded-lg border border-border bg-panel px-3 py-2 text-[13px] outline-none focus:border-accent-strong/40";
  const fields = provider !== "manual" ? (d?.fields[provider] ?? []) : [];
  const saved = d?.saved[provider] ?? {};

  return (
    <Card className="p-7">
      <div className="flex items-center gap-2">
        <Truck className="h-4 w-4 text-text-faint" />
        <SectionLabel>Courier</SectionLabel>
      </div>
      <p className="mt-1.5 text-[13px] text-text-dim">
        Connect your own courier account. Then &quot;Book&quot; on an order creates the parcel and sends the tracking number to your customer, and Orbit checks the
        status every 2 hours — delivered orders are marked fulfilled, returned ones are flagged for you.
      </p>
      <div className="mt-5 grid gap-4 sm:grid-cols-2">
        <label className="grid gap-1.5 sm:col-span-2">
          <span className="text-[12px] font-medium text-text-dim">Courier</span>
          <select className={input} value={provider} onChange={(e) => pick(e.target.value)}>
            {OPTIONS.map((o) => (
              <option key={o.v} value={o.v}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
        {fields.map((f) => {
          const has = saved[f.key];
          return (
            <label key={f.key} className="grid gap-1.5">
              <span className="text-[12px] font-medium text-text-dim">
                {f.label}
                {f.optional && <span className="text-text-faint"> (optional)</span>}
                {f.secret && has === true && <span className="text-good"> · saved</span>}
              </span>
              <input
                className={input}
                type={f.secret ? "password" : "text"}
                value={values[f.key] ?? (f.secret ? "" : String(has || ""))}
                onChange={(e) => setValues({ ...values, [f.key]: e.target.value })}
                placeholder={f.secret && has === true ? "Saved — type to replace" : (f.hint ?? "")}
              />
              {f.hint && <span className="text-[11px] text-text-faint">{f.hint}</span>}
            </label>
          );
        })}
      </div>
      {provider === "tcs" && (
        <p className="mt-3 text-[11.5px] text-text-faint">TCS gives API access on request — ask your TCS account manager for an API client id for the COD portal.</p>
      )}
      <div className="mt-5 flex flex-wrap items-center gap-3">
        <button
          onClick={save}
          disabled={busy || !d}
          className="flex items-center gap-2 rounded-lg bg-accent-soft px-4 py-2 text-[13px] font-semibold text-accent-strong hover:opacity-90 disabled:opacity-50"
        >
          {busy && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
          {provider === "manual" ? "Save" : "Save & test connection"}
        </button>
        {msg && <span className={`text-[12.5px] ${msg.ok ? "text-good" : "text-bad"}`}>{msg.message}</span>}
      </div>
    </Card>
  );
}
