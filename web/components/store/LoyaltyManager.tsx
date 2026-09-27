"use client";

import { useEffect, useState } from "react";
import { Card, Button } from "@/components/ui";
import { Gift } from "lucide-react";

interface Settings {
  loyaltyEnabled: boolean;
  loyaltyEarnRate: number;
  loyaltyRedeemRate: number;
  loyaltyMinRedeem: number;
}
interface Account {
  customerId: string;
  name: string;
  email: string | null;
  phone: string | null;
  points: number;
}
interface Txn {
  id: string;
  customerName: string;
  points: number;
  reason: string;
  note: string | null;
  orderId: string | null;
  createdAt: string;
}

export function LoyaltyManager({ businessId, currency }: { businessId: string; currency?: string }) {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [recent, setRecent] = useState<Txn[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [adjust, setAdjust] = useState<{ customerId: string; name: string } | null>(null);
  const [adjustPoints, setAdjustPoints] = useState("");
  const [adjustNote, setAdjustNote] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    Promise.all([
      fetch("/api/business/loyalty-settings").then((r) => r.json()),
      fetch(`/api/store/${businessId}/admin/loyalty`).then((r) => r.json()),
    ])
      .then(([s, l]) => {
        if (s.settings) setSettings(s.settings);
        if (Array.isArray(l.accounts)) setAccounts(l.accounts);
        if (Array.isArray(l.recent)) setRecent(l.recent);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [businessId]);

  async function save(patch: Partial<Settings>) {
    if (!settings) return;
    const next = { ...settings, ...patch };
    setSettings(next);
    setSaving(true);
    await fetch("/api/business/loyalty-settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    }).catch(() => {});
    setSaving(false);
  }

  async function submitAdjust() {
    if (!adjust) return;
    const points = Math.trunc(Number(adjustPoints));
    if (!points) return;
    setBusy(true);
    const r = await fetch(`/api/store/${businessId}/admin/loyalty`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ customerId: adjust.customerId, points, note: adjustNote }),
    });
    setBusy(false);
    if (r.ok) {
      setAccounts((cur) => {
        const found = cur.find((a) => a.customerId === adjust.customerId);
        if (found) return cur.map((a) => (a.customerId === adjust.customerId ? { ...a, points: a.points + points } : a));
        return [...cur, { customerId: adjust.customerId, name: adjust.name, email: null, phone: null, points }];
      });
      setAdjust(null);
      setAdjustPoints("");
      setAdjustNote("");
    }
  }

  const input = "w-full rounded-lg border border-border bg-panel px-3 py-2 text-[13px] outline-none focus:border-accent-strong/40";

  if (loading || !settings) {
    return (
      <Card className="p-6">
        <p className="text-[13px] text-text-faint">Loading…</p>
      </Card>
    );
  }

  return (
    <Card className="p-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-[14px] font-semibold">
          <Gift className="h-4 w-4 text-text-dim" /> Loyalty points
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={settings.loyaltyEnabled}
          aria-label="Loyalty points on"
          onClick={() => save({ loyaltyEnabled: !settings.loyaltyEnabled })}
          className="flex items-center gap-2 text-[13px] font-medium"
        >
          <span className={settings.loyaltyEnabled ? "text-good" : "text-text-faint"}>
            {settings.loyaltyEnabled ? "On" : "Off"}
          </span>
          <span
            className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors ${
              settings.loyaltyEnabled ? "bg-good" : "bg-panel-2 border border-border"
            }`}
          >
            <span
              className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform ${
                settings.loyaltyEnabled ? "translate-x-[18px]" : "translate-x-1"
              }`}
            />
          </span>
        </button>
      </div>
      <p className="mt-1 text-[12.5px] text-text-dim">
        Shoppers earn points on every confirmed order and can redeem them for a discount at checkout.
      </p>

      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        <label className="grid gap-1.5">
          <span className="text-[12px] font-medium text-text-dim">Earn rate (points per 1 {currency ?? "unit"})</span>
          <input
            className={input}
            type="number"
            min={0}
            step={0.1}
            value={settings.loyaltyEarnRate}
            onChange={(e) => setSettings({ ...settings, loyaltyEarnRate: Number(e.target.value) })}
            onBlur={() => save({ loyaltyEarnRate: settings.loyaltyEarnRate })}
          />
        </label>
        <label className="grid gap-1.5">
          <span className="text-[12px] font-medium text-text-dim">Discount per point redeemed</span>
          <input
            className={input}
            type="number"
            min={0}
            step={0.01}
            value={settings.loyaltyRedeemRate}
            onChange={(e) => setSettings({ ...settings, loyaltyRedeemRate: Number(e.target.value) })}
            onBlur={() => save({ loyaltyRedeemRate: settings.loyaltyRedeemRate })}
          />
        </label>
        <label className="grid gap-1.5">
          <span className="text-[12px] font-medium text-text-dim">Minimum points to redeem</span>
          <input
            className={input}
            type="number"
            min={0}
            step={1}
            value={settings.loyaltyMinRedeem}
            onChange={(e) => setSettings({ ...settings, loyaltyMinRedeem: Number(e.target.value) })}
            onBlur={() => save({ loyaltyMinRedeem: settings.loyaltyMinRedeem })}
          />
        </label>
      </div>
      {saving && <p className="mt-2 text-[11px] text-text-faint">saving…</p>}

      <div className="mt-6">
        <div className="text-[13px] font-semibold">Top balances</div>
        {accounts.length === 0 ? (
          <p className="mt-3 rounded-lg border border-dashed border-border py-6 text-center text-[13px] text-text-faint">
            No points earned yet.
          </p>
        ) : (
          <div className="mt-3 divide-y divide-border">
            {accounts.map((a) => (
              <div key={a.customerId} className="flex items-center gap-3 py-2.5 text-[13px]">
                <span className="font-medium">{a.name}</span>
                <span className="text-text-faint">{a.email || a.phone}</span>
                <span className="ml-auto font-mono font-semibold tabular-nums">{a.points.toLocaleString()} pts</span>
                <button
                  onClick={() => setAdjust({ customerId: a.customerId, name: a.name })}
                  className="rounded-lg border border-border px-2 py-1 text-[11.5px] font-medium text-text-dim hover:border-accent-strong/40 hover:text-text"
                >
                  Adjust
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {recent.length > 0 && (
        <div className="mt-6">
          <div className="text-[13px] font-semibold">Recent activity</div>
          <div className="mt-3 divide-y divide-border">
            {recent.map((t) => (
              <div key={t.id} className="flex items-center gap-3 py-2 text-[12.5px]">
                <span className="text-text-dim">{t.customerName}</span>
                <span className="text-text-faint">{t.reason}{t.note ? ` — ${t.note}` : ""}</span>
                <span className={`ml-auto font-mono font-semibold tabular-nums ${t.points >= 0 ? "text-good" : "text-bad"}`}>
                  {t.points >= 0 ? "+" : ""}
                  {t.points}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {adjust && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setAdjust(null)}>
          <div className="w-full max-w-sm rounded-xl border border-border bg-panel p-5" onClick={(e) => e.stopPropagation()}>
            <div className="text-[13.5px] font-semibold">Adjust {adjust.name}&apos;s points</div>
            <div className="mt-3 grid gap-3">
              <label className="grid gap-1.5">
                <span className="text-[12px] font-medium text-text-dim">Points (negative to deduct)</span>
                <input className={input} type="number" value={adjustPoints} onChange={(e) => setAdjustPoints(e.target.value)} placeholder="e.g. 500 or -200" />
              </label>
              <label className="grid gap-1.5">
                <span className="text-[12px] font-medium text-text-dim">Note</span>
                <input className={input} value={adjustNote} onChange={(e) => setAdjustNote(e.target.value)} placeholder="Reason for this adjustment" />
              </label>
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setAdjust(null)} className="!py-2 !text-[13px]">
                Cancel
              </Button>
              <Button onClick={submitAdjust} disabled={busy || !adjustPoints} className="!py-2 !text-[13px]">
                {busy ? "Saving…" : "Apply"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </Card>
  );
}
