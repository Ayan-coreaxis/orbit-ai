"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { addToCart } from "../../app/store/cart-store";
import { AuthWidget } from "./AuthWidget";
import { OrderTimeline } from "./TrackWidget";
import { RewardsWidget } from "./RewardsWidget";
import { wBtn, wBtnGhost, wCard, wErr, wHeading, wInput, wLabel, money, statusLabel, useToast, ToastHost } from "./widget-ui";
import { copyText, type WidgetCopyKey } from "@/lib/widget-copy";

type AuthMode = "otp" | "password" | "none" | "both";

interface Customer {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
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
interface Address {
  id: string;
  label: string | null;
  name: string;
  phone: string;
  line1: string;
  city: string;
  area: string | null;
  postalCode: string | null;
  province: string | null;
  isDefault: boolean;
}

const TABS = ["orders", "track", "rewards", "addresses", "profile"] as const;
type Tab = (typeof TABS)[number];
const TAB_LABEL: Record<Tab, string> = {
  orders: "Orders",
  track: "Track order",
  rewards: "Rewards",
  addresses: "Addresses",
  profile: "Profile",
};

export function AccountDashboard({
  businessId,
  authMode,
  currency,
  widgetCopy = {},
  widgetMotion = "standard",
  accountTabs,
}: {
  businessId: string;
  authMode: AuthMode;
  currency?: string;
  widgetCopy?: Partial<Record<WidgetCopyKey, string>>;
  widgetMotion?: string;
  /** Seller-chosen subset/order of TABS (Business.accountTabs) — undefined/empty = every tab, default order. */
  accountTabs?: string[];
}) {
  const router = useRouter();
  const base = `/api/store/${businessId}`;
  const visibleTabs = (accountTabs && accountTabs.length ? accountTabs.filter((t): t is Tab => (TABS as readonly string[]).includes(t)) : TABS) as readonly Tab[];
  const [me, setMe] = useState<Customer | null | undefined>(undefined); // undefined = loading
  const [tab, setTab] = useState<Tab>(visibleTabs[0] ?? "orders");
  const [orders, setOrders] = useState<AcctOrder[]>([]);
  const [addresses, setAddresses] = useState<Address[]>([]);
  const [acting, setActing] = useState<string | null>(null);
  const [toasts, toast] = useToast();

  const loadMe = useCallback(() => {
    fetch(`${base}/auth/me`)
      .then((r) => r.json())
      .then((d) => setMe(d.customer ?? null))
      .catch(() => setMe(null));
  }, [base]);

  useEffect(loadMe, [loadMe]);

  useEffect(() => {
    if (!me) return;
    fetch(`${base}/orders`)
      .then((r) => r.json())
      .then((d) => setOrders(Array.isArray(d.orders) ? d.orders : []))
      .catch(() => {});
    fetch(`${base}/account/addresses`)
      .then((r) => r.json())
      .then((d) => setAddresses(Array.isArray(d.addresses) ? d.addresses : []))
      .catch(() => {});
  }, [base, me]);

  if (me === undefined) return <p style={{ color: "var(--od-muted)" }}>Loading…</p>;
  if (me === null) {
    return (
      <div>
        <p style={{ color: "var(--od-muted)", marginTop: 0 }}>Sign in to see your orders, track deliveries and manage addresses.</p>
        <AuthWidget businessId={businessId} authMode={authMode} onDone={loadMe} widgetCopy={widgetCopy} widgetMotion={widgetMotion} />
      </div>
    );
  }

  async function logout() {
    await fetch(`${base}/auth/logout`, { method: "POST" });
    setMe(null);
    router.refresh();
  }

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
    const r = await fetch(`${base}/orders/${id}/cancel`, { method: "POST" });
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
    const r = await fetch(`${base}/returns`, {
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

  return (
    <div>
      <ToastHost items={toasts} />
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18, flexWrap: "wrap", gap: 10 }}>
        <h2 style={wHeading}>{copyText("account.hi", widgetCopy, { name: me.name ? `, ${me.name}` : "" })}</h2>
        <button onClick={logout} style={wBtnGhost}>
          {copyText("account.signOut", widgetCopy)}
        </button>
      </div>

      <div style={{ display: "flex", gap: 6, borderBottom: "1px solid var(--od-border)", marginBottom: 22, flexWrap: "wrap" }}>
        {visibleTabs.map((t) => (
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
            }}
          >
            {TAB_LABEL[t]}
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
                    #{o.id.slice(-8).toUpperCase()} · <span style={{ color: "var(--od-muted)" }}>{statusLabel(o.status, widgetCopy)}</span>
                  </span>
                  <strong style={{ fontSize: 13.5 }}>{money(o.total, currency)}</strong>
                </summary>
                <div style={{ marginTop: 14 }}>
                  <OrderTimeline order={o} currency={currency} widgetCopy={widgetCopy} />
                </div>
                <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
                  <button onClick={() => reorder(o)} style={wBtnGhost}>
                    {copyText("account.reorder", widgetCopy)}
                  </button>
                  {(o.status === "pending" || o.status === "confirmed") && (
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
          {orders.filter((o) => o.status !== "cancelled").length === 0 ? (
            <p style={{ color: "var(--od-muted)" }}>{copyText("account.noActiveTracking", widgetCopy)}</p>
          ) : (
            orders
              .filter((o) => o.status !== "cancelled")
              .map((o) => <OrderTimeline key={o.id} order={o} currency={currency} widgetCopy={widgetCopy} />)
          )}
        </div>
      )}

      {tab === "rewards" && <RewardsWidget businessId={businessId} currency={currency} widgetCopy={widgetCopy} widgetMotion={widgetMotion} />}

      {tab === "addresses" && (
        <AddressBook businessId={businessId} addresses={addresses} setAddresses={setAddresses} widgetCopy={widgetCopy} />
      )}

      {tab === "profile" && <ProfileForm businessId={businessId} me={me} onSaved={setMe} widgetCopy={widgetCopy} />}
    </div>
  );
}

// --------------------------------------------------------------------------

const empty = { label: "", name: "", phone: "", line1: "", city: "", area: "", postalCode: "", province: "" };

function AddressBook({
  businessId,
  addresses,
  setAddresses,
  widgetCopy,
}: {
  businessId: string;
  addresses: Address[];
  setAddresses: (a: Address[]) => void;
  widgetCopy: Partial<Record<WidgetCopyKey, string>>;
}) {
  const base = `/api/store/${businessId}/account/addresses`;
  const [editing, setEditing] = useState<string | "new" | null>(null);
  const [f, setF] = useState(empty);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const reload = () =>
    fetch(base)
      .then((r) => r.json())
      .then((d) => setAddresses(Array.isArray(d.addresses) ? d.addresses : []));

  function startNew() {
    setF(empty);
    setErr(null);
    setEditing("new");
  }
  function startEdit(a: Address) {
    setF({
      label: a.label ?? "",
      name: a.name,
      phone: a.phone,
      line1: a.line1,
      city: a.city,
      area: a.area ?? "",
      postalCode: a.postalCode ?? "",
      province: a.province ?? "",
    });
    setErr(null);
    setEditing(a.id);
  }

  async function save() {
    setBusy(true);
    setErr(null);
    const r = await fetch(editing === "new" ? base : `${base}/${editing}`, {
      method: editing === "new" ? "POST" : "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(f),
    });
    const d = await r.json();
    setBusy(false);
    if (!r.ok) {
      setErr(d.error || "Couldn't save.");
      return;
    }
    setEditing(null);
    reload();
  }

  async function remove(id: string) {
    if (!confirm(copyText("account.deleteAddressConfirm", widgetCopy))) return;
    await fetch(`${base}/${id}`, { method: "DELETE" });
    reload();
  }
  async function makeDefault(id: string) {
    await fetch(`${base}/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isDefault: true }),
    });
    reload();
  }

  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: e.target.value });

  return (
    <div style={{ display: "grid", gap: 14 }}>
      {addresses.map((a) => (
        <div key={a.id} style={wCard}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
            <div style={{ fontSize: 13.5, lineHeight: 1.5 }}>
              <strong>
                {a.label || a.name}
                {a.isDefault && (
                  <span style={{ marginLeft: 8, fontSize: 11, color: "var(--od-accent)", fontWeight: 600 }}>DEFAULT</span>
                )}
              </strong>
              <div style={{ color: "var(--od-muted)" }}>
                {a.name} · {a.phone}
                <br />
                {[a.line1, a.area, a.city, a.province, a.postalCode].filter(Boolean).join(", ")}
              </div>
            </div>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "flex-start" }}>
              {!a.isDefault && (
                <button onClick={() => makeDefault(a.id)} style={{ ...wBtnGhost, padding: "6px 10px", fontSize: 12.5 }}>
                  {copyText("account.setDefault", widgetCopy)}
                </button>
              )}
              <button onClick={() => startEdit(a)} style={{ ...wBtnGhost, padding: "6px 10px", fontSize: 12.5 }}>
                {copyText("account.edit", widgetCopy)}
              </button>
              <button onClick={() => remove(a.id)} style={{ ...wBtnGhost, padding: "6px 10px", fontSize: 12.5 }}>
                {copyText("account.delete", widgetCopy)}
              </button>
            </div>
          </div>
        </div>
      ))}

      {editing ? (
        <div style={wCard}>
          <div style={{ display: "grid", gap: 10 }}>
            <label style={wLabel}>
              Label (optional)
              <input value={f.label} onChange={set("label")} style={wInput} placeholder="Home, Office…" />
            </label>
            <div style={{ display: "grid", gap: 10, gridTemplateColumns: "1fr 1fr" }}>
              <label style={wLabel}>
                Full name
                <input value={f.name} onChange={set("name")} style={wInput} />
              </label>
              <label style={wLabel}>
                Phone
                <input value={f.phone} onChange={set("phone")} style={wInput} />
              </label>
            </div>
            <label style={wLabel}>
              Address (house / street)
              <input value={f.line1} onChange={set("line1")} style={wInput} />
            </label>
            <div style={{ display: "grid", gap: 10, gridTemplateColumns: "1fr 1fr" }}>
              <label style={wLabel}>
                City
                <input value={f.city} onChange={set("city")} style={wInput} />
              </label>
              <label style={wLabel}>
                Area / sector
                <input value={f.area} onChange={set("area")} style={wInput} />
              </label>
            </div>
            <div style={{ display: "grid", gap: 10, gridTemplateColumns: "1fr 1fr" }}>
              <label style={wLabel}>
                Province
                <input value={f.province} onChange={set("province")} style={wInput} />
              </label>
              <label style={wLabel}>
                Postal code
                <input value={f.postalCode} onChange={set("postalCode")} style={wInput} />
              </label>
            </div>
            {err && <p style={wErr}>{err}</p>}
            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={save} disabled={busy} style={{ ...wBtn, opacity: busy ? 0.7 : 1 }}>
                {busy ? copyText("account.saving", widgetCopy) : copyText("account.saveAddress", widgetCopy)}
              </button>
              <button onClick={() => setEditing(null)} style={wBtnGhost}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      ) : (
        <button onClick={startNew} style={{ ...wBtnGhost, justifySelf: "start" }}>
          {copyText("account.addAddress", widgetCopy)}
        </button>
      )}
    </div>
  );
}

function ProfileForm({
  businessId,
  me,
  onSaved,
  widgetCopy,
}: {
  businessId: string;
  me: Customer;
  onSaved: (c: Customer) => void;
  widgetCopy: Partial<Record<WidgetCopyKey, string>>;
}) {
  const [f, setF] = useState({ name: me.name, email: me.email ?? "", phone: me.phone ?? "" });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => {
    setF({ ...f, [k]: e.target.value });
    setSaved(false);
  };

  async function save() {
    setBusy(true);
    setErr(null);
    const r = await fetch(`/api/store/${businessId}/account/profile`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(f),
    });
    const d = await r.json();
    setBusy(false);
    if (!r.ok) {
      setErr(d.error || "Couldn't save.");
      return;
    }
    onSaved(d.customer);
    setSaved(true);
  }

  return (
    <div style={{ ...wCard, display: "grid", gap: 12, maxWidth: 420 }}>
      <label style={wLabel}>
        Name
        <input value={f.name} onChange={set("name")} style={wInput} />
      </label>
      <label style={wLabel}>
        Email
        <input type="email" value={f.email} onChange={set("email")} style={wInput} />
      </label>
      <label style={wLabel}>
        Phone
        <input type="tel" value={f.phone} onChange={set("phone")} style={wInput} />
      </label>
      {err && <p style={wErr}>{err}</p>}
      <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
        <button onClick={save} disabled={busy} style={{ ...wBtn, opacity: busy ? 0.7 : 1 }}>
          {busy ? copyText("account.saving", widgetCopy) : copyText("account.saveChanges", widgetCopy)}
        </button>
        {saved && <span style={{ fontSize: 12.5, color: "var(--od-accent)" }}>{copyText("account.saved", widgetCopy)}</span>}
      </div>
    </div>
  );
}
