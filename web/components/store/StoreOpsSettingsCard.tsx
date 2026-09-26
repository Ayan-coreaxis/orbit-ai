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


export function StoreOpsSettingsCard({ initial }: { initial: Ops }) {
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
    const body: Record<string, unknown> = {
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
    if (f.metaCapiToken.trim()) body.metaCapiToken = f.metaCapiToken.trim();
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
    <Card className="p-7">
      <SectionLabel>Store operations</SectionLabel>
      <p className="mt-1.5 text-[13px] text-text-dim">Delivery fee, tax, order confirmation and tracking — all applied at checkout.</p>

      <div className="mt-5 grid gap-4 sm:grid-cols-2">
        <label className="grid gap-1.5">
          <span className="text-[12px] font-medium text-text-dim">Delivery fee ({cur})</span>
          <input className={input} type="number" inputMode="decimal" value={f.shippingFee} onChange={(e) => setF({ ...f, shippingFee: e.target.value })} />
        </label>
        <label className="grid gap-1.5">
          <span className="text-[12px] font-medium text-text-dim">Free delivery over ({cur}) — optional</span>
          <input className={input} type="number" inputMode="decimal" value={f.freeShippingOver} onChange={(e) => setF({ ...f, freeShippingOver: e.target.value })} />
        </label>
        <label className="grid gap-1.5">
          <span className="text-[12px] font-medium text-text-dim">Tax rate (%) — optional</span>
          <input className={input} type="number" inputMode="decimal" value={f.taxRatePercent} onChange={(e) => setF({ ...f, taxRatePercent: e.target.value })} />
        </label>
        <label className="grid gap-1.5">
          <span className="text-[12px] font-medium text-text-dim">Tax label</span>
          <input className={input} value={f.taxLabel} onChange={(e) => setF({ ...f, taxLabel: e.target.value })} placeholder="GST / VAT / Sales tax" />
        </label>
      </div>

      <div className="mt-4 space-y-2.5">
        <Toggle checked={f.taxInclusive} onChange={(v) => setF({ ...f, taxInclusive: v })} label="Prices already include tax (don't add it on top)" />
        <Toggle
          checked={f.codVerification}
          onChange={(v) => setF({ ...f, codVerification: v })}
          label="Require COD confirmation — shopper must reply YES / tap a link before the order counts"
        />
        <Toggle checked={f.notifyNewOrders} onChange={(v) => setF({ ...f, notifyNewOrders: v })} label="Alert me (WhatsApp + email) on every new order" />
        <Toggle
          checked={f.relatedProductsEnabled}
          onChange={(v) => setF({ ...f, relatedProductsEnabled: v })}
          label={'Show "You may also like" on product pages'}
        />
        <Toggle
          checked={f.recentlyViewedEnabled}
          onChange={(v) => setF({ ...f, recentlyViewedEnabled: v })}
          label={'Show "Recently viewed" on product pages'}
        />
        <Toggle
          checked={f.chatWidgetEnabled}
          onChange={(v) => setF({ ...f, chatWidgetEnabled: v })}
          label="Show the chat bubble on your store — your Chatbot answers from your products and delivery settings; every chat lands in Inbox"
        />
      </div>

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
          <span className="text-[12px] font-medium text-text-dim">Meta Conversions API token {initial.metaCapiTokenSet && <span className="text-good">· saved</span>}</span>
          <input
            className={input}
            type="password"
            value={f.metaCapiToken}
            onChange={(e) => setF({ ...f, metaCapiToken: e.target.value })}
            placeholder={initial.metaCapiTokenSet ? "Saved — paste a new one to replace it" : "Events Manager > your pixel > Settings > Generate access token"}
          />
          <span className="text-[11.5px] leading-relaxed text-text-faint">
            With the Pixel ID set, every order is sent to Meta as a Purchase (from the shopper&apos;s browser and from Orbit&apos;s server), and ads made in Orbit optimise for sales
            instead of clicks. The token makes the server side reliable; without it Orbit uses your Meta connection.
          </span>
          {initial.metaCapiNote && (
            <span className={`text-[12px] ${initial.metaCapiNote.startsWith("ok:") ? "text-good" : "text-bad"}`}>
              {initial.metaCapiNote.startsWith("ok:")
                ? `Last purchase reached Meta ${new Date(initial.metaCapiNote.slice(3)).toLocaleString()}.`
                : initial.metaCapiNote}
            </span>
          )}
        </label>
      </div>

      <div className="mt-5 flex items-center gap-3">
        <button
          onClick={save}
          disabled={busy}
          className="rounded-lg bg-accent-soft px-4 py-2 text-[13px] font-semibold text-accent-strong hover:opacity-90 disabled:opacity-50"
        >
          {busy ? "Saving…" : "Save"}
        </button>
        {saved && <span className="text-[12.5px] text-good">Saved</span>}
        {error && <span className="text-[12.5px] text-bad">{error}</span>}
      </div>
    </Card>
  );
}

function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <label className="flex cursor-pointer items-start gap-2.5 text-[13px]">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="mt-0.5" />
      <span className="text-text-dim">{label}</span>
    </label>
  );
}
