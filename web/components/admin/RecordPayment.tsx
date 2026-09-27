"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui";
import { Loader2, Plus, Trash2 } from "lucide-react";

const METHODS = [
  { id: "bank_transfer", label: "Bank transfer" },
  { id: "jazzcash", label: "JazzCash" },
  { id: "easypaisa", label: "Easypaisa" },
  { id: "cash", label: "Cash" },
  { id: "card", label: "Card (outside Stripe)" },
  { id: "other", label: "Other" },
];

/** Record a plan payment taken outside Stripe, so revenue here matches the bank. */
export function RecordPayment({ sellers }: { sellers: { id: string; name: string; plan: string }[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ businessId: "", amountUsd: "", method: "bank_transfer", paidAt: new Date().toISOString().slice(0, 10), note: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/payments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, amountUsd: Number(form.amountUsd), paidAt: `${form.paidAt}T12:00:00` }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Couldn't save.");
      setForm((f) => ({ ...f, amountUsd: "", note: "" }));
      setOpen(false);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't save.");
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <Button variant="secondary" onClick={() => setOpen(true)}>
        <Plus className="h-4 w-4" /> Record a payment
      </Button>
    );
  }

  return (
    <div className="w-full rounded-xl border border-border bg-panel-2 p-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <label className="text-[12px] text-text-dim lg:col-span-2">
          Seller
          <select value={form.businessId} onChange={(e) => setForm({ ...form, businessId: e.target.value })} className="input mt-1 block w-full">
            <option value="">Choose…</option>
            {sellers.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name} ({s.plan})
              </option>
            ))}
          </select>
        </label>
        <label className="text-[12px] text-text-dim">
          Amount (USD)
          <input type="number" step="0.01" value={form.amountUsd} onChange={(e) => setForm({ ...form, amountUsd: e.target.value })} placeholder="75 · -75 for a refund" className="input mt-1 block w-full" />
        </label>
        <label className="text-[12px] text-text-dim">
          Method
          <select value={form.method} onChange={(e) => setForm({ ...form, method: e.target.value })} className="input mt-1 block w-full">
            {METHODS.map((m) => (
              <option key={m.id} value={m.id}>
                {m.label}
              </option>
            ))}
          </select>
        </label>
        <label className="text-[12px] text-text-dim">
          Paid on
          <input type="date" value={form.paidAt} max={new Date().toISOString().slice(0, 10)} onChange={(e) => setForm({ ...form, paidAt: e.target.value })} className="input mt-1 block w-full" />
        </label>
        <label className="text-[12px] text-text-dim sm:col-span-2 lg:col-span-5">
          Note (optional)
          <input value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} placeholder="e.g. Meezan transfer ref 88213, paid Rs 21,000" className="input mt-1 block w-full" />
        </label>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2.5">
        <Button variant="primary" onClick={submit} disabled={busy || !form.businessId || !form.amountUsd}>
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} Save payment
        </Button>
        <Button variant="ghost" onClick={() => setOpen(false)}>
          Cancel
        </Button>
        {error && <span className="text-[12.5px] text-bad">{error}</span>}
      </div>
    </div>
  );
}

export function DeletePayment({ id }: { id: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  return (
    <button
      type="button"
      disabled={busy}
      aria-label="Remove this payment"
      title="Remove (typo)"
      onClick={async () => {
        if (!confirm("Remove this hand-recorded payment?")) return;
        setBusy(true);
        await fetch(`/api/admin/payments?id=${encodeURIComponent(id)}`, { method: "DELETE" });
        router.refresh();
      }}
      className="rounded-md p-1 text-text-faint hover:bg-panel-2 hover:text-bad"
    >
      {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
    </button>
  );
}
