"use client";

import { useEffect, useState } from "react";
import { Card, Button } from "@/components/ui";
import { CreditCard } from "lucide-react";
import { money } from "@/lib/money";

interface Settings {
  giftCardsEnabled: boolean;
}
interface GiftCard {
  id: string;
  code: string;
  initialValue: number;
  balance: number;
  status: string;
  recipientName: string | null;
  recipientEmail: string | null;
  purchaserName: string | null;
  createdAt: string;
}

export function GiftCardsManager({ businessId, currency }: { businessId: string; currency?: string }) {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [cards, setCards] = useState<GiftCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [issueOpen, setIssueOpen] = useState(false);
  const [issueValue, setIssueValue] = useState("");
  const [issueName, setIssueName] = useState("");
  const [issueEmail, setIssueEmail] = useState("");
  const [issueMsg, setIssueMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [justIssued, setJustIssued] = useState<string | null>(null);

  const load = () =>
    Promise.all([
      fetch("/api/business/gift-card-settings").then((r) => r.json()),
      fetch(`/api/store/${businessId}/admin/gift-cards`).then((r) => r.json()),
    ])
      .then(([s, l]) => {
        if (s.settings) setSettings(s.settings);
        if (Array.isArray(l.cards)) setCards(l.cards);
      })
      .catch(() => {})
      .finally(() => setLoading(false));

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [businessId]);

  async function save(patch: Partial<Settings>) {
    if (!settings) return;
    const next = { ...settings, ...patch };
    setSettings(next);
    setSaving(true);
    await fetch("/api/business/gift-card-settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    }).catch(() => {});
    setSaving(false);
  }

  async function submitIssue() {
    setError(null);
    const value = Number(issueValue);
    if (!Number.isFinite(value) || value <= 0) {
      setError("Enter a value greater than 0.");
      return;
    }
    setBusy(true);
    const r = await fetch(`/api/store/${businessId}/admin/gift-cards`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ value, recipientName: issueName, recipientEmail: issueEmail, message: issueMsg }),
    });
    const d = await r.json();
    setBusy(false);
    if (r.ok && d.card) {
      setJustIssued(d.card.code);
      setIssueValue("");
      setIssueName("");
      setIssueEmail("");
      setIssueMsg("");
      load();
    } else {
      setError(d.error ?? "Couldn't issue that gift card.");
    }
  }

  async function toggleStatus(card: GiftCard) {
    const next = card.status === "active" ? "disabled" : "active";
    setCards((cur) => cur.map((c) => (c.id === card.id ? { ...c, status: next } : c)));
    await fetch(`/api/store/${businessId}/admin/gift-cards`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ giftCardId: card.id, status: next }),
    }).catch(() => {});
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
          <CreditCard className="h-4 w-4 text-text-dim" /> Gift cards
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={settings.giftCardsEnabled}
          onClick={() => save({ giftCardsEnabled: !settings.giftCardsEnabled })}
          className="flex items-center gap-2 text-[13px] font-medium"
        >
          <span className={settings.giftCardsEnabled ? "text-good" : "text-text-faint"}>
            {settings.giftCardsEnabled ? "On" : "Off"}
          </span>
          <span
            className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors ${
              settings.giftCardsEnabled ? "bg-good" : "bg-panel-2 border border-border"
            }`}
          >
            <span
              className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform ${
                settings.giftCardsEnabled ? "translate-x-[18px]" : "translate-x-1"
              }`}
            />
          </span>
        </button>
      </div>
      <p className="mt-1 text-[12.5px] text-text-dim">
        Issue a card with a real balance — for a refund as store credit, goodwill, or a sale made over WhatsApp. Shoppers redeem the code at checkout.
      </p>
      {saving && <p className="mt-2 text-[11px] text-text-faint">saving…</p>}

      <div className="mt-4">
        <Button onClick={() => setIssueOpen(true)} className="!py-2 !text-[13px]">
          Issue a gift card
        </Button>
      </div>

      <div className="mt-6">
        <div className="text-[13px] font-semibold">Cards ({cards.length})</div>
        {cards.length === 0 ? (
          <p className="mt-3 rounded-lg border border-dashed border-border py-6 text-center text-[13px] text-text-faint">
            No gift cards issued yet.
          </p>
        ) : (
          <div className="mt-3 divide-y divide-border">
            {cards.map((c) => (
              <div key={c.id} className="flex flex-wrap items-center gap-3 py-2.5 text-[13px]">
                <span className="font-mono font-medium">{c.code}</span>
                <span className="text-text-faint">
                  {c.recipientName || c.purchaserName || "—"}
                </span>
                <span className="ml-auto font-mono font-semibold tabular-nums">
                  {money(c.balance, currency)} / {money(c.initialValue, currency)}
                </span>
                <button
                  onClick={() => toggleStatus(c)}
                  className={`rounded-lg border px-2 py-1 text-[11.5px] font-medium ${
                    c.status === "active"
                      ? "border-border text-text-dim hover:border-accent-strong/40 hover:text-text"
                      : "border-bad/30 text-bad"
                  }`}
                >
                  {c.status === "active" ? "Disable" : "Disabled"}
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {issueOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={() => {
            setIssueOpen(false);
            setJustIssued(null);
            setError(null);
          }}
        >
          <div className="w-full max-w-sm rounded-xl border border-border bg-panel p-5" onClick={(e) => e.stopPropagation()}>
            {justIssued ? (
              <>
                <div className="text-[13.5px] font-semibold">Gift card issued</div>
                <p className="mt-2 text-[12.5px] text-text-dim">Share this code with the recipient:</p>
                <div className="mt-2 rounded-lg border border-border bg-panel-2 px-3 py-2 text-center font-mono text-[15px] font-semibold tracking-wide">
                  {justIssued}
                </div>
                <div className="mt-4 flex justify-end">
                  <Button
                    onClick={() => {
                      setIssueOpen(false);
                      setJustIssued(null);
                    }}
                    className="!py-2 !text-[13px]"
                  >
                    Done
                  </Button>
                </div>
              </>
            ) : (
              <>
                <div className="text-[13.5px] font-semibold">Issue a gift card</div>
                <div className="mt-3 grid gap-3">
                  <label className="grid gap-1.5">
                    <span className="text-[12px] font-medium text-text-dim">Value ({currency ?? "unit"})</span>
                    <input className={input} type="number" min={0} step={1} value={issueValue} onChange={(e) => setIssueValue(e.target.value)} placeholder="e.g. 2000" />
                  </label>
                  <label className="grid gap-1.5">
                    <span className="text-[12px] font-medium text-text-dim">Recipient name (optional)</span>
                    <input className={input} value={issueName} onChange={(e) => setIssueName(e.target.value)} />
                  </label>
                  <label className="grid gap-1.5">
                    <span className="text-[12px] font-medium text-text-dim">Recipient email (optional)</span>
                    <input className={input} value={issueEmail} onChange={(e) => setIssueEmail(e.target.value)} />
                  </label>
                  <label className="grid gap-1.5">
                    <span className="text-[12px] font-medium text-text-dim">Note (optional)</span>
                    <input className={input} value={issueMsg} onChange={(e) => setIssueMsg(e.target.value)} placeholder="Reason for this card" />
                  </label>
                </div>
                {error && <p className="mt-2 text-[12px] text-bad">{error}</p>}
                <div className="mt-4 flex justify-end gap-2">
                  <Button variant="secondary" onClick={() => setIssueOpen(false)} className="!py-2 !text-[13px]">
                    Cancel
                  </Button>
                  <Button onClick={submitIssue} disabled={busy || !issueValue} className="!py-2 !text-[13px]">
                    {busy ? "Issuing…" : "Issue"}
                  </Button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </Card>
  );
}
