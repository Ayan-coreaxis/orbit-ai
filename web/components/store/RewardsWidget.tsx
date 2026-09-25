"use client";

import { useEffect, useState } from "react";
import { wBtn, wBtnGhost, wCard, wInput, money } from "./widget-ui";
import { copyText, type WidgetCopyKey } from "@/lib/widget-copy";

interface LoyaltyHistoryRow {
  id: string;
  points: number;
  reason: string;
  orderId: string | null;
  createdAt: string;
}
interface LoyaltyData {
  enabled: boolean;
  signedIn?: boolean;
  points: number;
  history: LoyaltyHistoryRow[];
}
interface ReferralData {
  enabled: boolean;
  signedIn: boolean;
  code?: string;
  totalReferred?: number;
  rewarded?: number;
  pointsEarned?: number;
  refereePoints?: number;
}
interface GiftCardSettings {
  enabled: boolean;
}

/**
 * The shopper's rewards hub — loyalty balance/history, their referral link/stats, and a gift card
 * balance lookup, each shown only when the seller has actually turned that program on. Used both
 * inside the account dashboard's "Rewards" tab and standalone as an Orbit Design page (the
 * `"rewards"` widget kind — see StoreWidgets.tsx / lib/orbit-backend-spec.ts).
 */
export function RewardsWidget({
  businessId,
  currency,
  widgetCopy = {},
  widgetMotion = "standard",
}: {
  businessId: string;
  currency?: string;
  widgetCopy?: Partial<Record<WidgetCopyKey, string>>;
  widgetMotion?: string;
}) {
  const [loyalty, setLoyalty] = useState<LoyaltyData | null>(null);
  const [referral, setReferral] = useState<ReferralData | null>(null);
  const [giftCards, setGiftCards] = useState<GiftCardSettings | null>(null);

  useEffect(() => {
    fetch(`/api/store/${businessId}/loyalty`)
      .then((r) => r.json())
      .then(setLoyalty)
      .catch(() => setLoyalty({ enabled: false, points: 0, history: [] }));
    fetch(`/api/store/${businessId}/referral`)
      .then((r) => r.json())
      .then(setReferral)
      .catch(() => setReferral({ enabled: false, signedIn: false }));
    fetch(`/api/store/${businessId}/gift-card`)
      .then((r) => r.json())
      .then(setGiftCards)
      .catch(() => setGiftCards({ enabled: false }));
  }, [businessId]);

  if (!loyalty || !referral || !giftCards) return <p style={{ color: "var(--od-muted)" }}>Loading…</p>;

  const nothingOn = !loyalty.enabled && !referral.enabled && !giftCards.enabled;
  if (nothingOn) return <p style={{ color: "var(--od-muted)" }}>This store doesn&apos;t have a rewards program yet.</p>;

  return (
    <div style={{ display: "grid", gap: 20 }}>
      {loyalty.enabled && <LoyaltyBlock data={loyalty} widgetCopy={widgetCopy} />}
      {referral.enabled && <ReferralBlock businessId={businessId} data={referral} widgetCopy={widgetCopy} />}
      {giftCards.enabled && <GiftCardBlock businessId={businessId} currency={currency} widgetCopy={widgetCopy} />}
    </div>
  );
}

function LoyaltyBlock({ data, widgetCopy }: { data: LoyaltyData; widgetCopy: Partial<Record<WidgetCopyKey, string>> }) {
  const reasonLabel: Record<string, string> = { earn: "Earned", redeem: "Redeemed", adjust: "Adjusted", expire: "Expired" };
  return (
    <div>
      <div style={{ ...wCard, textAlign: "center", padding: "28px 20px" }}>
        <div style={{ fontSize: 12.5, color: "var(--od-muted)", textTransform: "uppercase", letterSpacing: "0.06em" }}>{copyText("rewards.yourBalance", widgetCopy)}</div>
        <div style={{ fontSize: 36, fontWeight: 700, marginTop: 6 }}>{data.points.toLocaleString()} pts</div>
      </div>
      <div style={{ marginTop: 16 }}>
        {data.history.length === 0 ? (
          <p style={{ color: "var(--od-muted)" }}>{copyText("rewards.noActivity", widgetCopy)}</p>
        ) : (
          <div style={{ display: "grid", gap: 10 }}>
            {data.history.map((h) => (
              <div key={h.id} style={{ display: "flex", justifyContent: "space-between", fontSize: 13.5 }}>
                <span style={{ color: "var(--od-muted)" }}>
                  {reasonLabel[h.reason] ?? h.reason} · {new Date(h.createdAt).toLocaleDateString()}
                </span>
                <strong style={{ color: h.points >= 0 ? "var(--od-text)" : "var(--od-muted)" }}>
                  {h.points >= 0 ? "+" : ""}
                  {h.points}
                </strong>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function ReferralBlock({ businessId, data, widgetCopy }: { businessId: string; data: ReferralData; widgetCopy: Partial<Record<WidgetCopyKey, string>> }) {
  const [copied, setCopied] = useState(false);
  if (!data.code) return null;

  const link = typeof window !== "undefined" ? `${window.location.origin}/store/${businessId}?ref=${data.code}` : "";

  return (
    <div style={wCard}>
      <div style={{ fontSize: 13.5, fontWeight: 600 }}>{copyText("rewards.referAFriend", widgetCopy)}</div>
      <p style={{ marginTop: 4, fontSize: 12.5, color: "var(--od-muted)" }}>
        Share your link — a friend who signs up gets {data.refereePoints ?? 0} welcome points, and you get rewarded once their first order is confirmed.
      </p>
      <div style={{ marginTop: 10, display: "flex", gap: 8 }}>
        <input readOnly value={link} style={{ ...wInput, flex: 1, fontSize: 12.5 }} onFocus={(e) => e.currentTarget.select()} />
        <button
          type="button"
          style={wBtnGhost}
          onClick={() => {
            navigator.clipboard?.writeText(link).then(() => {
              setCopied(true);
              setTimeout(() => setCopied(false), 1500);
            });
          }}
        >
          {copied ? copyText("rewards.copied", widgetCopy) : copyText("rewards.copy", widgetCopy)}
        </button>
      </div>
      <div style={{ marginTop: 10, display: "flex", gap: 16, fontSize: 12.5, color: "var(--od-muted)" }}>
        <span>Referred: <strong style={{ color: "var(--od-text)" }}>{data.totalReferred ?? 0}</strong></span>
        <span>Rewarded: <strong style={{ color: "var(--od-text)" }}>{data.rewarded ?? 0}</strong></span>
        <span>Points earned: <strong style={{ color: "var(--od-text)" }}>{data.pointsEarned ?? 0}</strong></span>
      </div>
    </div>
  );
}

function GiftCardBlock({
  businessId,
  currency,
  widgetCopy,
}: {
  businessId: string;
  currency?: string;
  widgetCopy: Partial<Record<WidgetCopyKey, string>>;
}) {
  const [code, setCode] = useState("");
  const [result, setResult] = useState<{ ok: boolean; balance?: number; error?: string } | null>(null);
  const [busy, setBusy] = useState(false);

  async function check() {
    const c = code.trim();
    if (!c) return;
    setBusy(true);
    const d = await fetch(`/api/store/${businessId}/gift-card?code=${encodeURIComponent(c)}`)
      .then((r) => r.json())
      .catch(() => ({ ok: false, error: "Network error." }));
    setBusy(false);
    setResult(d);
  }

  return (
    <div style={wCard}>
      <div style={{ fontSize: 13.5, fontWeight: 600 }}>{copyText("rewards.checkGiftCard", widgetCopy)}</div>
      <p style={{ marginTop: 4, fontSize: 12.5, color: "var(--od-muted)" }}>Enter a gift card code to see what's left on it.</p>
      <div style={{ marginTop: 10, display: "flex", gap: 8 }}>
        <input
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase())}
          placeholder="e.g. A1B2-C3D4-E5F6"
          style={{ ...wInput, flex: 1 }}
          onKeyDown={(e) => e.key === "Enter" && check()}
        />
        <button type="button" style={wBtn} onClick={check} disabled={busy}>
          {busy ? "…" : "Check"}
        </button>
      </div>
      {result && (
        <p style={{ marginTop: 10, fontSize: 13.5, color: result.ok ? "var(--od-text)" : "var(--od-muted)" }}>
          {result.ok ? (
            <>
              Balance: <strong>{money(result.balance ?? 0, currency)}</strong>
            </>
          ) : (
            result.error ?? copyText("rewards.invalidCode", widgetCopy)
          )}
        </p>
      )}
    </div>
  );
}
