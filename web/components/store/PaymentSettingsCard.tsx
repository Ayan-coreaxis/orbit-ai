"use client";

import { useState } from "react";
import { Card, SectionLabel, Pill } from "@/components/ui";
import { CreditCard } from "lucide-react";
import { STORE_CURRENCIES } from "@/lib/currencies";

export function PaymentSettingsCard({
  initialProvider,
  initialStripeConfigured,
  initialCurrency,
}: {
  initialProvider: string;
  initialStripeConfigured: boolean;
  initialCurrency: string;
}) {
  const [provider, setProvider] = useState(initialProvider);
  const [secretKey, setSecretKey] = useState("");
  const [publishableKey, setPublishableKey] = useState("");
  const [currency, setCurrency] = useState(initialCurrency);
  const [configured, setConfigured] = useState(initialStripeConfigured);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ tone: "good" | "bad"; text: string } | null>(null);

  async function save(next: { paymentProvider?: string; stripeSecretKey?: string; stripePublishableKey?: string; storeCurrency?: string }) {
    setSaving(true);
    setMessage(null);
    try {
      const res = await fetch("/api/business/payment-settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(next),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Couldn't save.");
      setProvider(data.paymentProvider);
      setConfigured(data.stripeConfigured);
      setMessage({ tone: "good", text: "Saved." });
    } catch (e) {
      setMessage({ tone: "bad", text: e instanceof Error ? e.message : "Something went wrong." });
    } finally {
      setSaving(false);
    }
  }

  const stripeActive = provider === "stripe";

  return (
    <Card
      className="p-7 transition-colors"
      style={
        stripeActive
          ? { background: "rgba(99, 91, 255, 0.08)", border: "1px solid rgba(99, 91, 255, 0.35)" }
          : undefined
      }
    >
      <div className="flex items-center gap-2">
        <CreditCard className="h-4 w-4" style={{ color: stripeActive ? "#635BFF" : undefined }} />
        <SectionLabel>Payment method for your store</SectionLabel>
      </div>
      <p className="mt-2 text-[13px] leading-relaxed text-text-dim">
        Real customer payments go straight to your own account — the platform never touches this
        money. Bring your own Stripe account to accept real cards, or stay on cash on delivery.
      </p>

      <div className="mt-4">
        <label className="text-[11.5px] font-medium text-text-faint">Store currency</label>
        <select
          className="input mt-1 block w-64"
          value={currency}
          disabled={saving}
          onChange={(e) => {
            setCurrency(e.target.value);
            save({ storeCurrency: e.target.value });
          }}
        >
          {!STORE_CURRENCIES.some((c) => c.code === currency) && <option value={currency}>{currency.toUpperCase()}</option>}
          {STORE_CURRENCIES.map((c) => (
            <option key={c.code} value={c.code}>
              {c.label}
            </option>
          ))}
        </select>
        <p className="mt-1 text-[11px] text-text-faint">
          Prices, delivery fees and reports all show in this currency. Changing it doesn&apos;t convert your prices — enter them in this currency.
          {stripeActive && " With Stripe, it must match the currency your Stripe account settles in."}
        </p>
      </div>

      <div className="mt-4 flex items-center gap-2">
        <button
          onClick={() => save({ paymentProvider: "cod" })}
          disabled={saving}
          className={`rounded-lg px-3.5 py-1.5 text-[12.5px] font-medium ${provider === "cod" ? "bg-accent text-white" : "border border-border text-text-dim"}`}
        >
          Cash on delivery
        </button>
        <button
          onClick={() => setProvider("stripe")}
          disabled={saving}
          className="rounded-lg px-3.5 py-1.5 text-[12.5px] font-medium text-white disabled:opacity-60"
          style={{ background: "#635BFF", opacity: stripeActive ? 1 : 0.55 }}
        >
          Stripe (your own account)
        </button>
        {stripeActive && configured && <Pill tone="good">Connected</Pill>}
      </div>

      {stripeActive && (
        <div className="mt-4 space-y-3">
          <div>
            <label className="text-[11.5px] font-medium text-text-faint">Your Stripe secret key</label>
            <input
              type="password"
              className="input mt-1 w-full"
              placeholder={configured ? "•••••••• (already saved — enter to replace)" : "sk_live_… or sk_test_…"}
              value={secretKey}
              onChange={(e) => setSecretKey(e.target.value)}
            />
          </div>
          <div>
            <label className="text-[11.5px] font-medium text-text-faint">Your Stripe publishable key</label>
            <input
              type="text"
              className="input mt-1 w-full"
              placeholder="pk_live_… or pk_test_…"
              value={publishableKey}
              onChange={(e) => setPublishableKey(e.target.value)}
            />
          </div>
          <button
            onClick={() =>
              save({
                paymentProvider: "stripe",
                ...(secretKey && { stripeSecretKey: secretKey }),
                ...(publishableKey && { stripePublishableKey: publishableKey }),
                storeCurrency: currency || "usd",
              })
            }
            disabled={saving}
            className="rounded-lg px-4 py-2 text-[12.5px] font-semibold text-white disabled:opacity-50"
            style={{ background: "#635BFF" }}
          >
            {saving ? "Saving…" : "Save & enable"}
          </button>
        </div>
      )}

      {message && (
        <p className={`mt-3 text-[12.5px] ${message.tone === "good" ? "text-good" : "text-bad"}`}>{message.text}</p>
      )}
    </Card>
  );
}
