"use client";

import { useEffect, useState } from "react";
import { Card, Button } from "@/components/ui";
import { money } from "@/lib/money";
import { Plus, Trash2, X } from "lucide-react";

interface Coupon {
  id: string;
  code: string;
  type: string;
  value: number;
  active: boolean;
  usageLimit: number | null;
  usedCount: number;
  perCustomerLimit: number | null;
  minSubtotal: number | null;
  firstOrderOnly: boolean;
  freeShipping: boolean;
  autoApply: boolean;
  expiresAt: string | null;
}

const blank = {
  code: "",
  type: "percent",
  value: "10",
  usageLimit: "",
  perCustomerLimit: "",
  minSubtotal: "",
  firstOrderOnly: false,
  freeShipping: false,
  autoApply: false,
  expiresAt: "",
};

export function CouponsManager({ businessId, currency }: { businessId: string; currency?: string }) {
  const [coupons, setCoupons] = useState<Coupon[]>([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState<typeof blank | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/store/${businessId}/admin/coupons`)
      .then((r) => r.json())
      .then((d) => Array.isArray(d.coupons) && setCoupons(d.coupons))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [businessId]);

  async function create() {
    if (!form) return;
    setBusy(true);
    setError(null);
    const r = await fetch(`/api/store/${businessId}/admin/coupons`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...form,
        value: Number(form.value),
        usageLimit: form.usageLimit || null,
        perCustomerLimit: form.perCustomerLimit || null,
        minSubtotal: form.minSubtotal || null,
        expiresAt: form.expiresAt || null,
      }),
    });
    const d = await r.json();
    setBusy(false);
    if (!r.ok) return setError(d.error ?? "Couldn't create.");
    setCoupons((c) => [d.coupon, ...c]);
    setForm(null);
  }

  async function toggle(c: Coupon) {
    setCoupons((cur) => cur.map((x) => (x.id === c.id ? { ...x, active: !x.active } : x)));
    await fetch(`/api/store/${businessId}/admin/coupons/${c.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ active: !c.active }),
    }).catch(() => {});
  }

  async function remove(id: string) {
    if (!confirm("Delete this code?")) return;
    setCoupons((c) => c.filter((x) => x.id !== id));
    await fetch(`/api/store/${businessId}/admin/coupons/${id}`, { method: "DELETE" }).catch(() => {});
  }

  const input = "w-full rounded-lg border border-border bg-panel px-3 py-2 text-[13px] outline-none focus:border-accent-strong/40";

  return (
    <Card className="p-6">
      <div className="flex items-center justify-between">
        <div className="text-[14px] font-semibold">
          Discount codes <span className="text-text-faint">({coupons.length})</span>
        </div>
        {!form && (
          <Button variant="secondary" onClick={() => setForm(blank)} className="!py-2 !text-[13px]">
            <Plus className="h-4 w-4" /> New code
          </Button>
        )}
      </div>

      {form && (
        <div className="mt-4 rounded-xl border border-border-strong bg-panel-2 p-4">
          <div className="flex items-center justify-between">
            <div className="text-[13.5px] font-semibold">New discount code</div>
            <button onClick={() => setForm(null)} className="text-text-faint hover:text-text" aria-label="Close">
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="mt-3 grid gap-3 sm:grid-cols-3">
            <label className="grid gap-1.5">
              <span className="text-[12px] font-medium text-text-dim">Code</span>
              <input className={input} value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })} placeholder="SAVE10" />
            </label>
            <label className="grid gap-1.5">
              <span className="text-[12px] font-medium text-text-dim">Type</span>
              <select className={input} value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
                <option value="percent">% off</option>
                <option value="fixed">{(currency ?? "usd").toUpperCase()} off</option>
              </select>
            </label>
            <label className="grid gap-1.5">
              <span className="text-[12px] font-medium text-text-dim">{form.type === "percent" ? "Percent" : "Amount"}</span>
              <input className={input} type="number" value={form.value} onChange={(e) => setForm({ ...form, value: e.target.value })} />
            </label>
            <label className="grid gap-1.5">
              <span className="text-[12px] font-medium text-text-dim">Min cart total</span>
              <input className={input} type="number" value={form.minSubtotal} onChange={(e) => setForm({ ...form, minSubtotal: e.target.value })} placeholder="optional" />
            </label>
            <label className="grid gap-1.5">
              <span className="text-[12px] font-medium text-text-dim">Total uses</span>
              <input className={input} type="number" value={form.usageLimit} onChange={(e) => setForm({ ...form, usageLimit: e.target.value })} placeholder="unlimited" />
            </label>
            <label className="grid gap-1.5">
              <span className="text-[12px] font-medium text-text-dim">Uses per customer</span>
              <input className={input} type="number" value={form.perCustomerLimit} onChange={(e) => setForm({ ...form, perCustomerLimit: e.target.value })} placeholder="unlimited" />
            </label>
            <label className="grid gap-1.5">
              <span className="text-[12px] font-medium text-text-dim">Expires</span>
              <input className={input} type="date" value={form.expiresAt} onChange={(e) => setForm({ ...form, expiresAt: e.target.value })} />
            </label>
          </div>
          <div className="mt-3 flex flex-wrap gap-4 text-[13px]">
            <Chk label="First order only" checked={form.firstOrderOnly} onChange={(v) => setForm({ ...form, firstOrderOnly: v })} />
            <Chk label="Also free delivery" checked={form.freeShipping} onChange={(v) => setForm({ ...form, freeShipping: v })} />
            <Chk label="Apply automatically" checked={form.autoApply} onChange={(v) => setForm({ ...form, autoApply: v })} />
          </div>
          {error && <p className="mt-2 text-[13px] text-bad">{error}</p>}
          <div className="mt-3">
            <Button onClick={create} disabled={busy} className="!py-2 !text-[13px]">
              {busy ? "Creating…" : "Create code"}
            </Button>
          </div>
        </div>
      )}

      <div className="mt-4 divide-y divide-border">
        {loading ? (
          <p className="py-6 text-center text-[13px] text-text-faint">Loading…</p>
        ) : coupons.length === 0 && !form ? (
          <p className="rounded-lg border border-dashed border-border py-8 text-center text-[13px] text-text-faint">
            No discount codes yet. Create one to run a promotion.
          </p>
        ) : (
          coupons.map((c) => (
            <div key={c.id} className="flex items-center gap-3 py-3 text-[13px]">
              <span className="font-mono font-semibold">{c.code}</span>
              <span className="text-text-dim">
                {c.type === "percent" ? `${c.value}% off` : `${money(c.value, currency)} off`}
                {c.freeShipping && " + free delivery"}
                {c.autoApply && " · auto"}
                {c.firstOrderOnly && " · 1st order"}
                {c.minSubtotal ? ` · min ${money(c.minSubtotal, currency)}` : ""}
              </span>
              <span className="text-[12px] text-text-faint">
                {c.usedCount} used{c.usageLimit ? ` / ${c.usageLimit}` : ""}
                {c.expiresAt ? ` · exp ${new Date(c.expiresAt).toLocaleDateString()}` : ""}
              </span>
              <button
                onClick={() => toggle(c)}
                className={`ml-auto rounded px-2 py-0.5 text-[11px] font-semibold ${c.active ? "bg-good-soft text-good" : "bg-panel-2 text-text-faint"}`}
              >
                {c.active ? "Active" : "Off"}
              </button>
              <button onClick={() => remove(c.id)} className="rounded-lg p-1.5 text-text-faint hover:bg-bad-soft hover:text-bad" aria-label="Delete">
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          ))
        )}
      </div>
    </Card>
  );
}

function Chk({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex cursor-pointer items-center gap-2 text-text-dim">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      {label}
    </label>
  );
}
