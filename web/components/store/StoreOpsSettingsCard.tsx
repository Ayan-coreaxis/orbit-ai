"use client";

import { useState } from "react";
import { Card, SectionLabel } from "@/components/ui";

interface Ops {
  shippingFee: number;
  freeShippingOver: number | null;
  taxRatePercent: number | null;
  taxLabel: string;
  taxInclusive: boolean;
  codVerification: boolean;
  notifyNewOrders: boolean;
  ga4MeasurementId: string | null;
  metaPixelId: string | null;
  metaCapiTokenSet: boolean;
  metaCapiNote: string | null;
  relatedProductsEnabled: boolean;
  recentlyViewedEnabled: boolean;
  chatWidgetEnabled: boolean;
  currency: string;
}

export type OpsPart = "delivery" | "tax" | "orders" | "storefront" | "tracking";

const PART_FIELDS: Record<OpsPart, string[]> = {
  delivery: ["shippingFee", "freeShippingOver"],
  tax: ["taxRatePercent", "taxLabel", "taxInclusive"],
  orders: ["codVerification", "notifyNewOrders"],
  storefront: ["relatedProductsEnabled", "recentlyViewedEnabled", "chatWidgetEnabled"],
  tracking: ["ga4MeasurementId", "metaPixelId"],
};

/**
 * Store settings saved to /api/business/store-ops-settings. Each settings page shows only the
 * `parts` it's about, and Save sends only those fields — so one page never overwrites another's.
 */
export function StoreOpsSettingsCard({
  initial,
  parts,
  title,
  description,
}: {
  initial: Ops;
  parts: OpsPart[];
  title: string;
  description?: string;
}) {
  const has = (p: OpsPart) => parts.includes(p);
  const [f, setF] = useState({
    shippingFee: String(initial.shippingFee || ""),
    freeShippingOver: initial.freeShippingOver == null ? "" : String(initial.freeShippingOver),
    taxRatePercent: initial.taxRatePercent == null ? "" : String(initial.taxRatePercent),
    taxLabel: initial.taxLabel || "Tax",
    taxInclusive: initial.taxInclusive,
    codVerification: initial.codVerification,
    notifyNewOrders: initial.notifyNewOrders,
    ga4MeasurementId: initial.ga4MeasurementId ?? "",
    metaPixelId: initial.metaPixelId ?? "",
    metaCapiToken: "",
    relatedProductsEnabled: initial.relatedProductsEnabled,
    recentlyViewedEnabled: initial.recentlyViewedEnabled,
    chatWidgetEnabled: initial.chatWidgetEnabled,
  });
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const cur = initial.currency.toUpperCase();

  async function save() {
    setBusy(true);
    setSaved(false);
    const all: Record<string, unknown> = {
      shippingFee: Number(f.shippingFee) || 0,
      freeShippingOver: f.freeShippingOver === "" ? null : Number(f.freeShippingOver),
      taxRatePercent: f.taxRatePercent === "" ? null : Number(f.taxRatePercent),
      taxLabel: f.taxLabel,
      taxInclusive: f.taxInclusive,
      codVerification: f.codVerification,
      notifyNewOrders: f.notifyNewOrders,
      ga4MeasurementId: f.ga4MeasurementId,
      metaPixelId: f.metaPixelId,
      relatedProductsEnabled: f.relatedProductsEnabled,
      recentlyViewedEnabled: f.recentlyViewedEnabled,
      chatWidgetEnabled: f.chatWidgetEnabled,
    };
    const body: Record<string, unknown> = Object.fromEntries(parts.flatMap((p) => PART_FIELDS[p]).map((k) => [k, all[k]]));
    if (has("tracking") && f.metaCapiToken.trim()) body.metaCapiToken = f.metaCapiToken.trim();
    const r = await fetch("/api/business/store-ops-settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    setBusy(false);
    if (r.ok) {
      setSaved(true);
      setError(null);
      setF((s) => ({ ...s, metaCapiToken: "" }));
    } else {
      setError(((await r.json().catch(() => ({}))) as { error?: string }).error ?? "Couldn't save.");
    }
  }

  const input = "w-full rounded-lg border border-border bg-panel px-3 py-2 text-[13px] outline-none focus:border-accent-strong/40";

  return (
    <Card className="p-6 sm:p-7">
      <SectionLabel>{title}</SectionLabel>
      {description && <p className="mt-1.5 text-[13px] text-text-dim">{description}</p>}

      {has("delivery") && (
        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <label className="grid gap-1.5">
            <span className="text-[12px] font-medium text-text-dim">Delivery fee ({cur})</span>
            <input className={input} type="number" inputMode="decimal" value={f.shippingFee} onChange={(e) => setF({ ...f, shippingFee: e.target.value })} />
            <span className="text-[11.5px] text-text-faint">Used wherever no delivery zone below matches the customer&apos;s city.</span>
          </label>
          <label className="grid gap-1.5">
            <span className="text-[12px] font-medium text-text-dim">Free delivery over ({cur}) — optional</span>
            <input className={input} type="number" inputMode="decimal" value={f.freeShippingOver} onChange={(e) => setF({ ...f, freeShippingOver: e.target.value })} />
          </label>
        </div>
      )}

      {has("tax") && (
        <>
          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            <label className="grid gap-1.5">
              <span className="text-[12px] font-medium text-text-dim">Tax rate (%) — optional</span>
              <input className={input} type="number" inputMode="decimal" value={f.taxRatePercent} onChange={(e) => setF({ ...f, taxRatePercent: e.target.value })} />
            </label>
            <label className="grid gap-1.5">
              <span className="text-[12px] font-medium text-text-dim">Tax label</span>
              <input className={input} value={f.taxLabel} onChange={(e) => setF({ ...f, taxLabel: e.target.value })} placeholder="GST / VAT / Sales tax" />
            </label>
          </div>
          <div className="mt-4">
            <Toggle checked={f.taxInclusive} onChange={(v) => setF({ ...f, taxInclusive: v })} label="Prices already include tax (don't add it on top)" />
          </div>
        </>
      )}

      {has("orders") && (
        <div className="mt-5 space-y-3">
          <Toggle
            checked={f.codVerification}
            onChange={(v) => setF({ ...f, codVerification: v })}
            label="Confirm cash-on-delivery orders"
            hint="The shopper replies YES on WhatsApp or taps a link before the order counts — cuts fake orders and returns."
          />
          <Toggle checked={f.notifyNewOrders} onChange={(v) => setF({ ...f, notifyNewOrders: v })} label="Alert me on every new order" hint="On WhatsApp and email." />
        </div>
      )}

      {has("storefront") && (
        <div className="mt-5 space-y-3">
          <Toggle checked={f.relatedProductsEnabled} onChange={(v) => setF({ ...f, relatedProductsEnabled: v })} label={'"You may also like" on product pages'} />
          <Toggle checked={f.recentlyViewedEnabled} onChange={(v) => setF({ ...f, recentlyViewedEnabled: v })} label={'"Recently viewed" on product pages'} />
          <Toggle
            checked={f.chatWidgetEnabled}
            onChange={(v) => setF({ ...f, chatWidgetEnabled: v })}
            label="Chat bubble on your store"
            hint="Your Chatbot answers from your products and delivery settings; every chat lands in Inbox."
          />
        </div>
      )}

      {has("tracking") && (
        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <label className="grid gap-1.5">
            <span className="text-[12px] font-medium text-text-dim">Google Analytics 4 ID</span>
            <input className={input} value={f.ga4MeasurementId} onChange={(e) => setF({ ...f, ga4MeasurementId: e.target.value })} placeholder="G-XXXXXXX" />
          </label>
          <label className="grid gap-1.5">
            <span className="text-[12px] font-medium text-text-dim">Meta Pixel ID</span>
            <input className={input} value={f.metaPixelId} onChange={(e) => setF({ ...f, metaPixelId: e.target.value })} placeholder="1234567890" />
          </label>
          <label className="grid gap-1.5 sm:col-span-2">
            <span className="text-[12px] font-medium text-text-dim">
              Meta Conversions API token {initial.metaCapiTokenSet && <span className="text-good">· saved</span>}
            </span>
            <input
              className={input}
              type="password"
              value={f.metaCapiToken}
              onChange={(e) => setF({ ...f, metaCapiToken: e.target.value })}
              placeholder={initial.metaCapiTokenSet ? "Saved — paste a new one to replace it" : "Events Manager > your pixel > Settings > Generate access token"}
              autoComplete="new-password"
            />
            <span className="text-[11.5px] leading-relaxed text-text-faint">
              With the Pixel ID set, every order is sent to Meta as a Purchase (from the shopper&apos;s browser and from Orbit&apos;s server), and ads made in Orbit optimise for
              sales instead of clicks. The token makes the server side reliable; without it Orbit uses your Meta connection.
            </span>
            {initial.metaCapiNote && (
              <span className={`text-[12px] ${initial.metaCapiNote.startsWith("ok:") ? "text-good" : "text-bad"}`}>
                {initial.metaCapiNote.startsWith("ok:") ? `Last purchase reached Meta ${new Date(initial.metaCapiNote.slice(3)).toLocaleString()}.` : initial.metaCapiNote}
              </span>
            )}
          </label>
        </div>
      )}

      <div className="mt-6 flex items-center gap-3 border-t border-border pt-4">
        <button onClick={save} disabled={busy} className="rounded-lg bg-accent px-4 py-2 text-[13px] font-semibold text-white hover:opacity-90 disabled:opacity-50">
          {busy ? "Saving…" : "Save"}
        </button>
        {saved && <span className="text-[12.5px] text-good">Saved</span>}
        {error && <span className="text-[12.5px] text-bad">{error}</span>}
      </div>
    </Card>
  );
}

function Toggle({ checked, onChange, label, hint }: { checked: boolean; onChange: (v: boolean) => void; label: string; hint?: string }) {
  return (
    <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-border bg-panel px-3.5 py-3 text-[13px] hover:border-border-strong">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="mt-0.5 h-4 w-4 accent-[var(--accent)]" />
      <span>
        <span className="font-medium">{label}</span>
        {hint && <span className="mt-0.5 block text-[12px] text-text-faint">{hint}</span>}
      </span>
    </label>
  );
}
