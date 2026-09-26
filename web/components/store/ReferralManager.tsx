"use client";

import { useEffect, useState } from "react";
import { Card } from "@/components/ui";
import { Users } from "lucide-react";

interface Settings {
  referralEnabled: boolean;
  referralReferrerPoints: number;
  referralRefereePoints: number;
}
interface Row {
  id: string;
  referrerName: string;
  refereeName: string;
  status: string;
  createdAt: string;
  rewardedAt: string | null;
}

export function ReferralManager({ businessId }: { businessId: string }) {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    Promise.all([
      fetch("/api/business/referral-settings").then((r) => r.json()),
      fetch(`/api/store/${businessId}/admin/referral`).then((r) => r.json()),
    ])
      .then(([s, l]) => {
        if (s.settings) setSettings(s.settings);
        if (Array.isArray(l.referrals)) setRows(l.referrals);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [businessId]);

  async function save(patch: Partial<Settings>) {
    if (!settings) return;
    const next = { ...settings, ...patch };
    setSettings(next);
    setSaving(true);
    await fetch("/api/business/referral-settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    }).catch(() => {});
    setSaving(false);
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
          <Users className="h-4 w-4 text-text-dim" /> Refer a friend
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={settings.referralEnabled}
          onClick={() => save({ referralEnabled: !settings.referralEnabled })}
          className="flex items-center gap-2 text-[13px] font-medium"
        >
          <span className={settings.referralEnabled ? "text-good" : "text-text-faint"}>
            {settings.referralEnabled ? "On" : "Off"}
          </span>
          <span
            className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors ${
              settings.referralEnabled ? "bg-good" : "bg-panel-2 border border-border"
            }`}
          >
            <span
              className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform ${
                settings.referralEnabled ? "translate-x-[18px]" : "translate-x-1"
              }`}
            />
          </span>
        </button>
      </div>
      <p className="mt-1 text-[12.5px] text-text-dim">
        Shoppers get their own referral link. A new customer gets a welcome bonus on signup; the referrer gets rewarded once that friend&apos;s first order is confirmed.
      </p>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <label className="grid gap-1.5">
          <span className="text-[12px] font-medium text-text-dim">Referrer reward (points)</span>
          <input
            className={input}
            type="number"
            min={0}
            step={1}
            value={settings.referralReferrerPoints}
            onChange={(e) => setSettings({ ...settings, referralReferrerPoints: Number(e.target.value) })}
            onBlur={() => save({ referralReferrerPoints: settings.referralReferrerPoints })}
          />
        </label>
        <label className="grid gap-1.5">
          <span className="text-[12px] font-medium text-text-dim">New shopper welcome bonus (points)</span>
          <input
            className={input}
            type="number"
            min={0}
            step={1}
            value={settings.referralRefereePoints}
            onChange={(e) => setSettings({ ...settings, referralRefereePoints: Number(e.target.value) })}
            onBlur={() => save({ referralRefereePoints: settings.referralRefereePoints })}
          />
        </label>
      </div>
      {saving && <p className="mt-2 text-[11px] text-text-faint">saving…</p>}

      <div className="mt-6">
        <div className="text-[13px] font-semibold">Referrals</div>
        {rows.length === 0 ? (
          <p className="mt-3 rounded-lg border border-dashed border-border py-6 text-center text-[13px] text-text-faint">
            No referrals yet.
          </p>
        ) : (
          <div className="mt-3 divide-y divide-border">
            {rows.map((r) => (
              <div key={r.id} className="flex items-center gap-3 py-2.5 text-[13px]">
                <span className="font-medium">{r.referrerName}</span>
                <span className="text-text-faint">→ {r.refereeName}</span>
                <span
                  className={`ml-auto rounded-full px-2 py-0.5 text-[11px] font-medium ${
                    r.status === "rewarded" ? "bg-good/15 text-good" : "bg-panel-2 text-text-faint"
                  }`}
                >
                  {r.status === "rewarded" ? "Rewarded" : "Pending"}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </Card>
  );
}
