"use client";

import { useState } from "react";
import { Pill } from "@/components/ui";

export interface WalletStatus {
  jazzcash: { configured: boolean; sandbox: boolean; merchantIdLast4: string | null; passwordLast4: string | null; integritySaltLast4: string | null };
  easypaisa: { configured: boolean; sandbox: boolean; storeIdLast4: string | null; hashKeyLast4: string | null };
}

type Message = { tone: "good" | "bad"; text: string } | null;

function Field({
  label,
  value,
  onChange,
  savedLast4,
  secret,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  savedLast4: string | null;
  secret?: boolean;
  placeholder: string;
}) {
  return (
    <div>
      <label className="text-[11.5px] font-medium text-text-faint">{label}</label>
      <input
        type={secret ? "password" : "text"}
        autoComplete="off"
        className="input mt-1 w-full"
        placeholder={savedLast4 ? `Saved ••••${savedLast4} — type to replace` : placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
}

/**
 * JazzCash and Easypaisa on the seller's own merchant accounts. After saving, the browser only
 * ever gets "saved" and the last 4 characters back — never the credentials themselves.
 */
export function WalletSettings({ initial, isPkr, easypaisaIpnUrl }: { initial: WalletStatus; isPkr: boolean; easypaisaIpnUrl: string }) {
  const [status, setStatus] = useState(initial);
  const [saving, setSaving] = useState<null | "jazzcash" | "easypaisa">(null);

  const [jc, setJc] = useState({ merchantId: "", password: "", integritySalt: "" });
  const [jcSandbox, setJcSandbox] = useState(initial.jazzcash.sandbox);
  const [jcMsg, setJcMsg] = useState<Message>(null);

  const [ep, setEp] = useState({ storeId: "", hashKey: "" });
  const [epSandbox, setEpSandbox] = useState(initial.easypaisa.sandbox);
  const [epMsg, setEpMsg] = useState<Message>(null);

  async function send(which: "jazzcash" | "easypaisa", payload: unknown, setMsg: (m: Message) => void, done: string): Promise<boolean> {
    setSaving(which);
    setMsg(null);
    try {
      const res = await fetch("/api/business/payment-settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [which]: payload }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Couldn't save.");
      setStatus({ jazzcash: data.jazzcash, easypaisa: data.easypaisa });
      setMsg({ tone: "good", text: done });
      return true;
    } catch (e) {
      setMsg({ tone: "bad", text: e instanceof Error ? e.message : "Something went wrong." });
      return false;
    } finally {
      setSaving(null);
    }
  }

  const blank = (o: Record<string, string>) => Object.fromEntries(Object.entries(o).filter(([, v]) => v.trim()));

  return (
    <div className="mt-6 border-t border-border pt-5">
      <p className="text-[13px] font-semibold">JazzCash &amp; Easypaisa</p>
      <p className="mt-1 text-[12.5px] leading-relaxed text-text-dim">
        Customers pay from their wallet on JazzCash&apos;s or Easypaisa&apos;s own page and the money lands in your merchant account — Orbit takes
        nothing. Each one shows at checkout as soon as its details are saved; cash on delivery stays the first choice.
      </p>
      {!isPkr && (
        <p className="mt-2 text-[12.5px] text-bad">
          Both wallets charge in rupees, so they only show at checkout when your store currency is PKR.
        </p>
      )}

      {/* ---------- JazzCash ---------- */}
      <div className="mt-4 rounded-lg border border-border p-4">
        <div className="flex items-center gap-2">
          <p className="text-[13px] font-semibold">JazzCash</p>
          {status.jazzcash.configured && <Pill tone="good">Saved{status.jazzcash.sandbox ? " · test mode" : ""}</Pill>}
        </div>
        <p className="mt-1 text-[11.5px] text-text-faint">
          Where do I get these? JazzCash merchant portal → Sandbox / Integration settings (Merchant ID, Password, Integrity Salt). No merchant
          account yet? Apply at jazzcash.com.pk under &quot;Online Payments&quot;.
        </p>
        <div className="mt-3 grid gap-3 sm:grid-cols-3">
          <Field label="Merchant ID" value={jc.merchantId} onChange={(v) => setJc({ ...jc, merchantId: v })} savedLast4={status.jazzcash.merchantIdLast4} placeholder="MC12345" />
          <Field label="Password" secret value={jc.password} onChange={(v) => setJc({ ...jc, password: v })} savedLast4={status.jazzcash.passwordLast4} placeholder="Password" />
          <Field label="Integrity Salt" secret value={jc.integritySalt} onChange={(v) => setJc({ ...jc, integritySalt: v })} savedLast4={status.jazzcash.integritySaltLast4} placeholder="Integrity Salt" />
        </div>
        <label className="mt-3 flex items-center gap-2 text-[12.5px] text-text-dim">
          <input type="checkbox" checked={jcSandbox} onChange={(e) => setJcSandbox(e.target.checked)} />
          Test mode (JazzCash sandbox — no real money)
        </label>
        <div className="mt-3 flex items-center gap-2">
          <button
            disabled={saving !== null}
            onClick={async () => {
              if (await send("jazzcash", { ...blank(jc), sandbox: jcSandbox }, setJcMsg, "Saved.")) setJc({ merchantId: "", password: "", integritySalt: "" });
            }}
            className="rounded-lg bg-accent px-4 py-2 text-[12.5px] font-semibold text-white disabled:opacity-50"
          >
            {saving === "jazzcash" ? "Saving…" : "Save"}
          </button>
          {status.jazzcash.configured && (
            <button
              disabled={saving !== null}
              onClick={() => send("jazzcash", null, setJcMsg, "Removed — JazzCash no longer shows at checkout.")}
              className="rounded-lg border border-border px-3 py-2 text-[12.5px] text-text-dim disabled:opacity-50"
            >
              Remove
            </button>
          )}
        </div>
        {jcMsg && <p className={`mt-2 text-[12.5px] ${jcMsg.tone === "good" ? "text-good" : "text-bad"}`}>{jcMsg.text}</p>}
      </div>

      {/* ---------- Easypaisa ---------- */}
      <div className="mt-4 rounded-lg border border-border p-4">
        <div className="flex items-center gap-2">
          <p className="text-[13px] font-semibold">Easypaisa</p>
          {status.easypaisa.configured && <Pill tone="good">Saved{status.easypaisa.sandbox ? " · test mode" : ""}</Pill>}
        </div>
        <p className="mt-1 text-[11.5px] text-text-faint">
          Where do I get these? Easypaisa (Easypay) merchant portal → Account Settings (Store ID, and &quot;Generate Hash Key&quot;). No merchant
          account yet? Apply at easypaisa.com.pk under &quot;Easypay / Online Payments&quot;.
        </p>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <Field label="Store ID" value={ep.storeId} onChange={(v) => setEp({ ...ep, storeId: v })} savedLast4={status.easypaisa.storeIdLast4} placeholder="12345" />
          <Field label="Hash Key" secret value={ep.hashKey} onChange={(v) => setEp({ ...ep, hashKey: v })} savedLast4={status.easypaisa.hashKeyLast4} placeholder="Hash Key" />
        </div>
        <label className="mt-3 flex items-center gap-2 text-[12.5px] text-text-dim">
          <input type="checkbox" checked={epSandbox} onChange={(e) => setEpSandbox(e.target.checked)} />
          Test mode (Easypaisa staging — no real money)
        </label>
        <p className="mt-3 text-[11.5px] leading-relaxed text-text-faint">
          One more step in the Easypaisa portal: set this as your <b>IPN / notification address</b>. Easypaisa uses it to tell Orbit a payment
          really arrived — without it, Easypaisa orders stay on &quot;waiting for payment&quot;.
        </p>
        <code className="mt-1 block break-all rounded bg-black/5 px-2 py-1 text-[11.5px]">{easypaisaIpnUrl}</code>
        <div className="mt-3 flex items-center gap-2">
          <button
            disabled={saving !== null}
            onClick={async () => {
              if (await send("easypaisa", { ...blank(ep), sandbox: epSandbox }, setEpMsg, "Saved.")) setEp({ storeId: "", hashKey: "" });
            }}
            className="rounded-lg bg-accent px-4 py-2 text-[12.5px] font-semibold text-white disabled:opacity-50"
          >
            {saving === "easypaisa" ? "Saving…" : "Save"}
          </button>
          {status.easypaisa.configured && (
            <button
              disabled={saving !== null}
              onClick={() => send("easypaisa", null, setEpMsg, "Removed — Easypaisa no longer shows at checkout.")}
              className="rounded-lg border border-border px-3 py-2 text-[12.5px] text-text-dim disabled:opacity-50"
            >
              Remove
            </button>
          )}
        </div>
        {epMsg && <p className={`mt-2 text-[12.5px] ${epMsg.tone === "good" ? "text-good" : "text-bad"}`}>{epMsg.text}</p>}
      </div>
    </div>
  );
}
