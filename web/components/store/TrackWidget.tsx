"use client";

import { useState } from "react";
import { wLabel, wInput, wBtn, wErr, wCard, money, statusLabel } from "./widget-ui";
import { copyText, type WidgetCopyKey } from "@/lib/widget-copy";

interface TrackedOrder {
  id: string;
  total: number;
  status: string;
  items: { name: string; qty: number; price: number }[];
  createdAt: string;
  courierName: string | null;
  trackingNumber: string | null;
  trackingUrl: string | null;
  shippedAt: string | null;
  confirmedAt: string | null;
}

const STEPS = ["pending", "confirmed", "shipped", "fulfilled"];

/** Guest order tracking — no account. Order number + phone → status timeline. */
export function TrackWidget({
  businessId,
  currency,
  widgetCopy = {},
  widgetMotion: _widgetMotion = "standard",
}: {
  businessId: string;
  currency?: string;
  widgetCopy?: Partial<Record<WidgetCopyKey, string>>;
  widgetMotion?: string;
}) {
  const [orderId, setOrderId] = useState("");
  const [phone, setPhone] = useState("");
  const [order, setOrder] = useState<TrackedOrder | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function look(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    setBusy(true);
    try {
      const res = await fetch(`/api/store/${businessId}/orders/lookup`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderId: orderId.trim(), phone }),
      });
      const d = await res.json();
      setBusy(false);
      if (!res.ok) return setErr(d.error ?? copyText("track.notFound", widgetCopy));
      setOrder(d.order);
    } catch {
      setBusy(false);
      setErr(copyText("track.networkError", widgetCopy));
    }
  }

  return (
    <div style={{ maxWidth: 460, display: "grid", gap: 20 }}>
      <form onSubmit={look} style={{ display: "grid", gap: 12 }}>
        <label style={wLabel}>
          {copyText("track.orderNumber", widgetCopy)}
          <input required value={orderId} onChange={(e) => setOrderId(e.target.value)} style={wInput} />
        </label>
        <label style={wLabel}>
          {copyText("track.phoneOnOrder", widgetCopy)}
          <input required type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} style={wInput} />
        </label>
        {err && <p role="alert" style={wErr}>{err}</p>}
        <button type="submit" disabled={busy} style={{ ...wBtn, opacity: busy ? 0.7 : 1 }}>
          {busy ? "…" : copyText("track.trackOrder", widgetCopy)}
        </button>
      </form>

      {order && <OrderTimeline order={order} currency={currency} widgetCopy={widgetCopy} />}
    </div>
  );
}

export function OrderTimeline({
  order,
  currency,
  widgetCopy = {},
}: {
  order: TrackedOrder;
  currency?: string;
  widgetCopy?: Partial<Record<WidgetCopyKey, string>>;
}) {
  const idx = STEPS.indexOf(order.status === "cancelled" ? "pending" : order.status);
  return (
    <div style={wCard}>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13 }}>
        <span style={{ color: "var(--od-muted)" }}>#{order.id.slice(-8)}</span>
        <strong>{money(order.total, currency)}</strong>
      </div>
      <ol style={{ listStyle: "none", padding: 0, margin: "14px 0 0", display: "grid", gap: 10 }}>
        {STEPS.map((s, i) => (
          <li key={s} style={{ display: "flex", gap: 10, alignItems: "center", opacity: i <= idx ? 1 : 0.4 }}>
            <span
              style={{
                width: 18,
                height: 18,
                borderRadius: "50%",
                flex: "none",
                background: i <= idx ? "var(--od-accent)" : "transparent",
                border: `2px solid ${i <= idx ? "var(--od-accent)" : "var(--od-border)"}`,
              }}
            />
            <span style={{ fontSize: 13.5, color: "var(--od-text)" }}>{statusLabel(s, widgetCopy)}</span>
          </li>
        ))}
      </ol>
      {order.status === "cancelled" && <p style={{ ...wErr, marginTop: 12 }}>{copyText("track.cancelled", widgetCopy)}</p>}
      {order.trackingNumber && (
        <p style={{ marginTop: 12, fontSize: 13, color: "var(--od-muted)" }}>
          {order.courierName ? `${order.courierName}: ` : ""}
          {order.trackingUrl ? (
            <a href={order.trackingUrl} target="_blank" rel="noopener" style={{ color: "var(--od-accent)" }}>
              {order.trackingNumber}
            </a>
          ) : (
            order.trackingNumber
          )}
        </p>
      )}
      <ul style={{ listStyle: "none", padding: 0, margin: "12px 0 0", fontSize: 13, color: "var(--od-muted)" }}>
        {order.items.map((it, i) => (
          <li key={i}>
            {it.qty}× {it.name}
          </li>
        ))}
      </ul>
    </div>
  );
}
