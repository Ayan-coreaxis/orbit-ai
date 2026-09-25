"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { StoreBackendSpec } from "@/lib/orbit-backend-spec";
import { addToCart } from "../../app/store/cart-store";
import { AuthWidget } from "./AuthWidget";
import { CollectionWidget } from "./CollectionWidget";
import { OrderTimeline } from "./TrackWidget";
import { wBtnGhost, wCard, wHeading, money, statusLabel, useToast, ToastHost } from "./widget-ui";
import { copyText, type WidgetCopyKey } from "@/lib/widget-copy";

interface Me {
  authMode: "otp" | "password" | "none" | "both";
  customer: { id: string; name: string; email: string | null; phone: string | null } | null;
}
interface AcctOrder {
  id: string;
  total: number;
  status: string;
  items: { productId: string | null; variantId: string | null; variantLabel: string | null; name: string; qty: number; price: number }[];
  createdAt: string;
  courierName: string | null;
  trackingNumber: string | null;
  trackingUrl: string | null;
  shippedAt: string | null;
  confirmedAt: string | null;
  fulfilledAt: string | null;
  returnStatus: string | null;
}

/** The customer account area. Tabs come from the StoreBackendSpec. Not signed in → sign-in form. */
export function AccountWidget({
  businessId,
  spec,
  currency,
  widgetCopy = {},
  widgetMotion = "standard",
}: {
  businessId: string;
  spec: StoreBackendSpec;
  currency?: string;
  widgetCopy?: Partial<Record<WidgetCopyKey, string>>;
  widgetMotion?: string;
}) {
  const router = useRouter();
  const [me, setMe] = useState<Me | null>(null);
  const [orders, setOrders] = useState<AcctOrder[]>([]);
  const tabs = spec.accountTabs.length ? spec.accountTabs : (["orders", "profile"] as const);
  const [tab, setTab] = useState<string>(tabs[0]);

  useEffect(() => {
    fetch(`/api/store/${businessId}/auth/me`)
      .then((r) => r.json())
      .then(setMe)
      .catch(() => setMe({ authMode: "none", customer: null }));
  }, [businessId]);

  useEffect(() => {
    if (!me?.customer) return;
    fetch(`/api/store/${businessId}/orders`)
      .then((r) => r.json())
      .then((d) => setOrders(Array.isArray(d.orders) ? d.orders : []))
      .catch(() => {});
  }, [businessId, me?.customer]);

  if (me && !me.customer) {
    return <AuthWidget businessId={businessId} authMode={me.authMode} widgetCopy={widgetCopy} widgetMotion={widgetMotion} />;
  }
  if (!me) return <p style={{ color: "var(--od-muted)" }}>Loading…</p>;

  async function logout() {
    await fetch(`/api/store/${businessId}/auth/logout`, { method: "POST" });
    router.refresh();
  }

  const [acting, setActing] = useState<string | null>(null);
  const [toasts, toast] = useToast();

  function reorder(o: AcctOrder) {
    for (const it of o.items) {
      if (it.productId)
        addToCart(
          businessId,
          { productId: it.productId, variantId: it.variantId, variantLabel: it.variantLabel, name: it.name, price: it.price, imageUrl: null },
          it.qty,
        );
    }
    router.push(`/store/${businessId}/cart`);
  }

  async function cancelOrder(id: string) {
    if (!confirm(copyText("account.cancelOrderConfirm", widgetCopy))) return;
    setActing(id + "cancel");
    const r = await fetch(`/api/store/${businessId}/orders/${id}/cancel`, { method: "POST" });
    const d = await r.json();
    if (r.ok) {
      setOrders((cur) => cur.map((o) => (o.id === id ? { ...o, status: "cancelled" } : o)));
      toast(copyText("account.orderCancelled", widgetCopy));
    } else toast(d.error || copyText("account.cancelFailed", widgetCopy), "err");
    setActing(null);
  }

  async function requestReturn(id: string) {
    const reason = prompt(copyText("account.returnReasonPrompt", widgetCopy));
    if (!reason?.trim()) return;
    setActing(id + "return");
    const r = await fetch(`/api/store/${businessId}/returns`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ orderId: id, reason }),
    });
    const d = await r.json();
    if (r.ok) {
      setOrders((cur) => cur.map((o) => (o.id === id ? { ...o, returnStatus: "requested" } : o)));
      toast(copyText("account.returnSubmitted", widgetCopy));
    } else toast(d.error || copyText("account.returnFailed", widgetCopy), "err");
    setActing(null);
  }

  const tabLabel = (t: string) =>
    t === "orders" ? "Orders" : t === "track" ? "Track" : t === "profile" ? "Profile" : t.replace("collection:", "").replace(/-/g, " ");

  return (
    <div>
      <ToastHost items={toasts} />
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18, flexWrap: "wrap", gap: 10 }}>
        <h2 style={wHeading}>{copyText("account.hi", widgetCopy, { name: me.customer?.name ? `, ${me.customer.name}` : "" })}</h2>
        <button onClick={logout} style={wBtnGhost}>{copyText("account.signOut", widgetCopy)}</button>
      </div>

      <div style={{ display: "flex", gap: 6, borderBottom: "1px solid var(--od-border)", marginBottom: 20, flexWrap: "wrap" }}>
        {tabs.map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            style={{
              padding: "9px 12px",
              fontSize: 13.5,
              fontWeight: 600,
              border: "none",
              borderBottom: `2px solid ${tab === t ? "var(--od-accent)" : "transparent"}`,
              background: "transparent",
              color: tab === t ? "var(--od-text)" : "var(--od-muted)",
              cursor: "pointer",
              textTransform: "capitalize",
            }}
          >
            {tabLabel(t)}
          </button>
        ))}
      </div>

      {tab === "orders" && (
        <div style={{ display: "grid", gap: 14 }}>
          {orders.length === 0 ? (
            <p style={{ color: "var(--od-muted)" }}>{copyText("account.noOrders", widgetCopy)}</p>
          ) : (
            orders.map((o) => (
              <details key={o.id} style={wCard}>
                <summary style={{ display: "flex", justifyContent: "space-between", cursor: "pointer", listStyle: "none" }}>
                  <span style={{ fontSize: 13.5 }}>
                    #{o.id.slice(-8)} · <span style={{ color: "var(--od-muted)" }}>{statusLabel(o.status, widgetCopy)}</span>
                  </span>
                  <strong style={{ fontSize: 13.5 }}>{money(o.total, currency)}</strong>
                </summary>
                <div style={{ marginTop: 14 }}>
                  <OrderTimeline order={o} currency={currency} widgetCopy={widgetCopy} />
                </div>
                <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
                  <button onClick={() => reorder(o)} style={wBtnGhost}>{copyText("account.reorder", widgetCopy)}</button>
                  {o.status === "pending" && (
                    <button onClick={() => cancelOrder(o.id)} disabled={acting === o.id + "cancel"} style={wBtnGhost}>
                      {acting === o.id + "cancel" ? "…" : copyText("account.cancelOrder", widgetCopy)}
                    </button>
                  )}
                  {o.status === "fulfilled" && !o.returnStatus && (
                    <button onClick={() => requestReturn(o.id)} disabled={acting === o.id + "return"} style={wBtnGhost}>
                      {acting === o.id + "return" ? "…" : copyText("account.requestReturn", widgetCopy)}
                    </button>
                  )}
                  {o.returnStatus && (
                    <span style={{ fontSize: 12.5, color: "var(--od-muted)", alignSelf: "center" }}>
                      {copyText("account.returnStatus", widgetCopy, { status: o.returnStatus })}
                    </span>
                  )}
                </div>
              </details>
            ))
          )}
        </div>
      )}

      {tab === "track" && (
        <div style={{ display: "grid", gap: 14 }}>
          {orders.map((o) => (
            <OrderTimeline key={o.id} order={o} currency={currency} widgetCopy={widgetCopy} />
          ))}
        </div>
      )}

      {tab === "profile" && (
        <div style={wCard}>
          <p style={{ margin: 0, fontSize: 14 }}>{me.customer?.name}</p>
          {me.customer?.email && <p style={{ margin: "6px 0 0", fontSize: 13.5, color: "var(--od-muted)" }}>{me.customer.email}</p>}
          {me.customer?.phone && <p style={{ margin: "6px 0 0", fontSize: 13.5, color: "var(--od-muted)" }}>{me.customer.phone}</p>}
        </div>
      )}

      {tab.startsWith("collection:") &&
        (() => {
          const name = tab.slice("collection:".length);
          const col = spec.collections.find((c) => c.name === name);
          return col ? (
            <CollectionWidget businessId={businessId} collection={col.name} fields={col.fields} moderated={col.moderated} title={col.label} />
          ) : null;
        })()}
    </div>
  );
}
