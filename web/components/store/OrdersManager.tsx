"use client";

import { useCallback, useEffect, useState } from "react";
import { Card } from "@/components/ui";
import { useDashToast, DashToastHost } from "@/components/dash-toast";
import type { CheckoutCustomField } from "@/lib/checkout-fields";
import { money } from "@/lib/money";
import {
  Search,
  ChevronDown,
  Check,
  Truck,
  PackageCheck,
  Clock,
  XCircle,
  RotateCcw,
  Loader2,
  Download,
  FileText,
} from "lucide-react";

interface OrderItem {
  productId?: string;
  name?: string;
  price?: number;
  qty?: number;
}
interface Order {
  id: string;
  number: string;
  createdAt: string;
  customerName: string;
  customerPhone: string;
  customerEmail: string | null;
  address: string;
  customFields: Record<string, string> | null;
  items: OrderItem[];
  total: number;
  subtotal: number;
  shippingFee: number;
  taxAmount: number;
  discountAmount: number;
  couponCode: string | null;
  status: string;
  verified: boolean;
  flagged: boolean;
  flagReason: string | null;
  paymentProvider: string;
  paymentStatus: string;
  courierName: string | null;
  trackingNumber: string | null;
  trackingUrl: string | null;
  sellerNote: string | null;
  confirmationNotifiedAt: string | null;
  confirmationNotifyError: string | null;
  trackingNotifiedAt: string | null;
  trackingNotifyError: string | null;
  fulfilledAt: string | null;
  cancelledAt: string | null;
}

const FLOW = ["pending", "confirmed", "shipped", "fulfilled"];
const NEXT_LABEL: Record<string, string> = {
  pending: "Confirm order",
  confirmed: "Mark shipped",
  shipped: "Mark delivered",
};
const STATUS: Record<string, { cls: string; icon: typeof Clock; label: string }> = {
  pending: { cls: "bg-warn-soft text-warn", icon: Clock, label: "Pending" },
  confirmed: { cls: "bg-accent-soft text-accent-strong", icon: Check, label: "Confirmed" },
  shipped: { cls: "bg-accent-soft text-accent-strong", icon: Truck, label: "Shipped" },
  fulfilled: { cls: "bg-good-soft text-good", icon: PackageCheck, label: "Delivered" },
  cancelled: { cls: "bg-panel-2 text-text-faint", icon: XCircle, label: "Cancelled" },
};

export function OrdersManager({
  businessId,
  currency,
  courierProvider,
  checkoutCustomFields = [],
}: {
  businessId: string;
  currency?: string;
  courierProvider?: string | null;
  checkoutCustomFields?: CheckoutCustomField[];
}) {
  const fieldLabel = (key: string) => checkoutCustomFields.find((f) => f.key === key)?.label ?? key;
  const [orders, setOrders] = useState<Order[]>([]);
  const [byStatus, setByStatus] = useState<Record<string, number>>({});
  const [total, setTotal] = useState(0);
  const [filter, setFilter] = useState<string>("");
  const [q, setQ] = useState("");
  const [skip, setSkip] = useState(0);
  const [loading, setLoading] = useState(true);
  const [firstLoad, setFirstLoad] = useState(true);
  const [open, setOpen] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [toasts, toast] = useDashToast();

  function qs() {
    const p = new URLSearchParams();
    if (filter) p.set("status", filter);
    if (q.trim()) p.set("q", q.trim());
    if (from) p.set("from", from);
    if (to) p.set("to", to);
    return p;
  }

  const load = useCallback(() => {
    setLoading(true);
    setSel(new Set());
    const p = new URLSearchParams();
    if (filter) p.set("status", filter);
    if (q.trim()) p.set("q", q.trim());
    if (from) p.set("from", from);
    if (to) p.set("to", to);
    if (skip) p.set("skip", String(skip));
    fetch(`/api/store/${businessId}/admin/orders?${p}`)
      .then((r) => r.json())
      .then((d) => {
        if (d && Array.isArray(d.orders)) {
          setOrders(d.orders);
          setByStatus(d.byStatus || {});
          setTotal(d.total || 0);
        }
      })
      .catch(() => {})
      .finally(() => {
        setLoading(false);
        setFirstLoad(false);
      });
  }, [businessId, filter, q, from, to, skip]);

  useEffect(() => {
    const t = setTimeout(load, q ? 300 : 0);
    return () => clearTimeout(t);
  }, [load, q]);

  async function bulk(status: string) {
    const ids = [...sel];
    if (!ids.length) return;
    if (status === "cancelled" && !confirm(`Cancel ${ids.length} order(s) and restock?`)) return;
    setBusy("bulk");
    try {
      const r = await fetch(`/api/store/${businessId}/admin/orders/bulk`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids, status }),
      });
      const d = await r.json();
      if (!r.ok) toast(d.error || "Bulk update failed.", "err");
      load();
    } finally {
      setBusy(null);
    }
  }

  async function patch(id: string, body: Record<string, unknown>, tag: string) {
    setBusy(id + tag);
    try {
      const r = await fetch(`/api/store/${businessId}/admin/orders/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const d = await r.json();
      if (r.ok && d.order) load();
      else toast(d.error || "Update failed.", "err");
    } catch {
      toast("Network error.", "err");
    } finally {
      setBusy(null);
    }
  }

  const totalAll = FLOW.reduce((s, k) => s + (byStatus[k] || 0), 0) + (byStatus.cancelled || 0);
  const chips = [
    { key: "", label: "All", n: totalAll },
    ...(byStatus.unconfirmed ? [{ key: "unconfirmed", label: "Unconfirmed", n: byStatus.unconfirmed }] : []),
    ...(byStatus.flagged ? [{ key: "flagged", label: "Flagged", n: byStatus.flagged }] : []),
    ...FLOW.map((s) => ({ key: s, label: STATUS[s].label, n: byStatus[s] || 0 })),
    { key: "cancelled", label: "Cancelled", n: byStatus.cancelled || 0 },
  ];

  return (
    <Card className="overflow-hidden p-0">
      <DashToastHost items={toasts} />
      {/* filter bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-3">
        <div className="flex flex-wrap gap-1">
          {chips.map((c) => (
            <button
              key={c.key}
              onClick={() => {
                setFilter(c.key);
                setSkip(0);
              }}
              className={`rounded-md px-2.5 py-1 text-[12.5px] font-medium transition-colors ${
                filter === c.key ? "bg-accent-soft text-accent-strong" : "text-text-faint hover:bg-panel-2 hover:text-text-dim"
              }`}
            >
              {c.label}
              <span className="ml-1 tabular-nums opacity-70">{c.n}</span>
            </button>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <input
            type="date"
            value={from}
            onChange={(e) => {
              setFrom(e.target.value);
              setSkip(0);
            }}
            className="rounded-md border border-border bg-panel-2 px-2 py-1.5 text-[12px] text-text-dim outline-none"
            aria-label="From date"
          />
          <span className="text-text-faint">–</span>
          <input
            type="date"
            value={to}
            onChange={(e) => {
              setTo(e.target.value);
              setSkip(0);
            }}
            className="rounded-md border border-border bg-panel-2 px-2 py-1.5 text-[12px] text-text-dim outline-none"
            aria-label="To date"
          />
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-text-faint" />
            <input
              value={q}
              onChange={(e) => {
                setQ(e.target.value);
                setSkip(0);
              }}
              placeholder="Name, phone, #"
              className="w-40 rounded-md border border-border bg-panel-2 py-1.5 pl-8 pr-2.5 text-[12.5px] outline-none transition-colors focus:border-accent-strong/40"
            />
          </div>
          <a
            href={`/api/store/${businessId}/admin/orders/export?${qs()}`}
            className="inline-flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1.5 text-[12px] font-medium text-text-dim transition-colors hover:border-accent-strong/40 hover:text-text"
          >
            <Download className="h-3.5 w-3.5" />
            CSV
          </a>
        </div>
      </div>

      {/* bulk bar */}
      {sel.size > 0 && (
        <div className="flex flex-wrap items-center gap-2 border-b border-border bg-accent-soft/50 px-4 py-2 text-[12.5px]">
          <span className="font-medium text-accent-strong">{sel.size} selected</span>
          <button onClick={() => bulk("confirmed")} disabled={busy === "bulk"} className="rounded border border-border bg-panel px-2 py-1 hover:border-accent-strong/40">
            Confirm
          </button>
          <button onClick={() => bulk("shipped")} disabled={busy === "bulk"} className="rounded border border-border bg-panel px-2 py-1 hover:border-accent-strong/40">
            Mark shipped
          </button>
          <button onClick={() => bulk("fulfilled")} disabled={busy === "bulk"} className="rounded border border-border bg-panel px-2 py-1 hover:border-accent-strong/40">
            Mark delivered
          </button>
          <button onClick={() => bulk("cancelled")} disabled={busy === "bulk"} className="rounded border border-border bg-panel px-2 py-1 text-bad hover:border-bad/40">
            Cancel
          </button>
          <button onClick={() => setSel(new Set())} className="ml-auto text-text-faint hover:text-text">
            Clear
          </button>
        </div>
      )}

      {/* body */}
      {firstLoad && loading ? (
        <SkeletonRows />
      ) : orders.length === 0 ? (
        <div className="px-4 py-14 text-center">
          <p className="text-[13px] text-text-faint">
            {filter || q ? "No orders match this filter." : "No orders yet — they appear here the moment a shopper checks out."}
          </p>
        </div>
      ) : (
        <div aria-busy={loading} className="divide-y divide-border">
          {orders.map((o) => {
            const expanded = open === o.id;
            const s = STATUS[o.status] ?? STATUS.pending;
            const SIcon = s.icon;
            return (
              <div key={o.id} className={`flex items-stretch ${loading ? "opacity-60 transition-opacity" : "transition-opacity"}`}>
                <label className="flex flex-none cursor-pointer items-center pl-3" onClick={(e) => e.stopPropagation()}>
                  <input
                    type="checkbox"
                    checked={sel.has(o.id)}
                    onChange={(e) =>
                      setSel((cur) => {
                        const next = new Set(cur);
                        e.target.checked ? next.add(o.id) : next.delete(o.id);
                        return next;
                      })
                    }
                  />
                </label>
                <div className="min-w-0 flex-1">
                <button
                  onClick={() => setOpen(expanded ? null : o.id)}
                  aria-expanded={expanded}
                  className="flex w-full items-center gap-3 px-3 py-3 text-left text-[13px] outline-none hover:bg-panel-2 focus-visible:bg-panel-2"
                >
                  <ChevronDown
                    className={`h-4 w-4 flex-none text-text-faint transition-transform ${expanded ? "rotate-180" : ""}`}
                  />
                  <span className="w-16 flex-none font-mono text-[12px] text-text-faint">#{o.number}</span>
                  <span className="min-w-0 flex-1 truncate font-medium">{o.customerName}</span>
                  {o.flagged && (
                    <span className="flex-none rounded-md bg-bad-soft px-1.5 py-0.5 text-[11px] font-semibold text-bad" title={o.flagReason ?? ""}>
                      Flagged
                    </span>
                  )}
                  {!o.verified && (
                    <span className="flex-none rounded-md bg-warn-soft px-1.5 py-0.5 text-[11px] font-semibold text-warn">Unconfirmed</span>
                  )}
                  <span className={`inline-flex flex-none items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-semibold ${s.cls}`}>
                    <SIcon className="h-3 w-3" />
                    {s.label}
                  </span>
                  <span className="w-20 flex-none text-right tabular-nums">{money(o.total, currency)}</span>
                  <span className="hidden w-20 flex-none text-right text-[12px] tabular-nums text-text-faint sm:inline">
                    {new Date(o.createdAt).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
                  </span>
                </button>

                {expanded && (
                  <div className="grid gap-5 bg-panel-2 px-4 py-4 text-[12.5px] lg:grid-cols-[1fr_1fr]">
                    {/* left: order contents */}
                    <div>
                      <SubHead>Items</SubHead>
                      <div className="mt-1.5 space-y-1">
                        {o.items.map((it, i) => (
                          <div key={i} className="flex justify-between">
                            <span className="text-text-dim">
                              {it.name} <span className="text-text-faint">× {it.qty}</span>
                            </span>
                            <span className="tabular-nums">{money((it.price || 0) * (it.qty || 0), currency)}</span>
                          </div>
                        ))}
                        {o.discountAmount > 0 && (
                          <div className="flex justify-between text-good">
                            <span>Discount {o.couponCode ? `(${o.couponCode})` : ""}</span>
                            <span className="tabular-nums">−{money(o.discountAmount, currency)}</span>
                          </div>
                        )}
                        {o.shippingFee > 0 && (
                          <div className="flex justify-between text-text-faint">
                            <span>Delivery</span>
                            <span className="tabular-nums">{money(o.shippingFee, currency)}</span>
                          </div>
                        )}
                        {o.taxAmount > 0 && (
                          <div className="flex justify-between text-text-faint">
                            <span>Tax</span>
                            <span className="tabular-nums">{money(o.taxAmount, currency)}</span>
                          </div>
                        )}
                        <div className="flex justify-between border-t border-border pt-1 font-semibold">
                          <span>Total · {o.paymentProvider.toUpperCase()}</span>
                          <span className="tabular-nums">{money(o.total, currency)}</span>
                        </div>
                      </div>

                      {o.flagged && o.flagReason && (
                        <p className="mt-2 rounded-md bg-bad-soft px-2 py-1 text-[11.5px] text-bad">⚠️ {o.flagReason}</p>
                      )}

                      <SubHead className="mt-4">Deliver to</SubHead>
                      <p className="mt-1 whitespace-pre-wrap leading-relaxed text-text-dim">
                        {o.customerName}
                        {"\n"}
                        {o.customerPhone}
                        {o.customerEmail ? `\n${o.customerEmail}` : ""}
                        {"\n"}
                        {o.address}
                      </p>
                      {o.customFields && Object.keys(o.customFields).length > 0 && (
                        <>
                          <SubHead className="mt-4">Extra details</SubHead>
                          <div className="mt-1 space-y-1 text-text-dim">
                            {Object.entries(o.customFields).map(([k, v]) => (
                              <p key={k} className="whitespace-pre-wrap leading-relaxed">
                                <span className="text-text-faint">{fieldLabel(k)}:</span> {v}
                              </p>
                            ))}
                          </div>
                        </>
                      )}
                      {(o.confirmationNotifyError || o.trackingNotifyError) && (
                        <p className="mt-2 rounded-md bg-warn-soft px-2 py-1 text-[11.5px] text-warn">
                          Buyer notification: {o.confirmationNotifyError || o.trackingNotifyError}
                        </p>
                      )}
                    </div>

                    {/* right: actions */}
                    <div className="space-y-3.5">
                      <div>
                        <SubHead>Status</SubHead>
                        <div className="mt-1.5 flex flex-wrap gap-1.5">
                          {!o.verified && o.status !== "cancelled" && (
                            <button
                              onClick={() => patch(o.id, { verified: true }, "verify")}
                              disabled={busy === o.id + "verify"}
                              className="inline-flex items-center gap-1.5 rounded-md bg-warn-soft px-2.5 py-1.5 text-[11.5px] font-semibold text-warn transition-opacity hover:opacity-90 disabled:opacity-50"
                            >
                              {busy === o.id + "verify" ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
                              Confirm manually
                            </button>
                          )}
                          {o.verified && o.status !== "cancelled" && o.status !== "fulfilled" && NEXT_LABEL[o.status] && (
                            <button
                              onClick={() => patch(o.id, { status: FLOW[FLOW.indexOf(o.status) + 1] }, "next")}
                              disabled={busy === o.id + "next"}
                              className="inline-flex items-center gap-1.5 rounded-md bg-accent-soft px-2.5 py-1.5 text-[11.5px] font-semibold text-accent-strong transition-opacity hover:opacity-90 disabled:opacity-50"
                            >
                              {busy === o.id + "next" ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
                              {NEXT_LABEL[o.status]}
                            </button>
                          )}
                          {o.status !== "cancelled" && (
                            <button
                              onClick={() => {
                                if (confirm("Cancel this order? Stock will be returned to inventory.")) patch(o.id, { status: "cancelled" }, "cancel");
                              }}
                              disabled={busy === o.id + "cancel"}
                              className="inline-flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1.5 text-[11.5px] font-medium text-text-faint transition-colors hover:border-bad/40 hover:text-bad disabled:opacity-50"
                            >
                              <RotateCcw className="h-3 w-3" />
                              Cancel &amp; restock
                            </button>
                          )}
                        </div>
                        {(o.confirmationNotifiedAt || o.trackingNotifiedAt) && (
                          <p className="mt-1.5 text-[11px] text-text-faint">
                            {o.confirmationNotifiedAt && "Buyer notified on confirm. "}
                            {o.trackingNotifiedAt && "Shipping update sent."}
                          </p>
                        )}
                      </div>

                      {courierProvider && courierProvider !== "manual" && !o.trackingNumber && o.status !== "cancelled" && (
                        <button
                          onClick={() => patch(o.id, { book: true }, "book")}
                          disabled={busy === o.id + "book"}
                          className="inline-flex items-center gap-1.5 rounded-md bg-accent-soft px-2.5 py-1.5 text-[11.5px] font-semibold text-accent-strong transition-opacity hover:opacity-90 disabled:opacity-50"
                        >
                          {busy === o.id + "book" ? <Loader2 className="h-3 w-3 animate-spin" /> : <Truck className="h-3 w-3" />}
                          Book with {courierProvider}
                        </button>
                      )}

                      <TrackingForm key={o.id} order={o} busy={busy === o.id + "track"} onSave={(vals) => patch(o.id, vals, "track")} />

                      <a
                        href={`/dashboard/store/invoice/${o.id}`}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1.5 text-[11.5px] font-medium text-text-faint hover:text-text"
                      >
                        <FileText className="h-3.5 w-3.5" />
                        Invoice / packing slip
                      </a>
                    </div>
                  </div>
                )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {total > orders.length + skip && (
        <button
          onClick={() => setSkip(skip + 30)}
          className="w-full border-t border-border py-2.5 text-[12.5px] font-medium text-accent-strong transition-colors hover:bg-panel-2"
        >
          Load more ({total - orders.length - skip} left)
        </button>
      )}
    </Card>
  );
}

function SkeletonRows() {
  return (
    <div className="divide-y divide-border">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="flex items-center gap-3 px-4 py-3.5">
          <div className="h-3 w-16 rounded bg-panel-2" />
          <div className="h-3 flex-1 rounded bg-panel-2" style={{ maxWidth: `${120 + ((i * 37) % 90)}px` }} />
          <div className="h-4 w-16 rounded-md bg-panel-2" />
          <div className="h-3 w-14 rounded bg-panel-2" />
        </div>
      ))}
    </div>
  );
}

function SubHead({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <div className={`text-[11px] font-semibold uppercase tracking-[0.04em] text-text-faint ${className}`}>{children}</div>;
}

function TrackingForm({
  order,
  busy,
  onSave,
}: {
  order: Order;
  busy: boolean;
  onSave: (v: Record<string, unknown>) => void;
}) {
  const [courierName, setCourier] = useState(order.courierName || "");
  const [trackingNumber, setNum] = useState(order.trackingNumber || "");
  const [trackingUrl, setUrl] = useState(order.trackingUrl || "");
  const [sellerNote, setNote] = useState(order.sellerNote || "");
  const [saved, setSaved] = useState(false);
  const dirty =
    courierName !== (order.courierName || "") ||
    trackingNumber !== (order.trackingNumber || "") ||
    trackingUrl !== (order.trackingUrl || "") ||
    sellerNote !== (order.sellerNote || "");

  useEffect(() => {
    if (!busy && saved) {
      const t = setTimeout(() => setSaved(false), 2000);
      return () => clearTimeout(t);
    }
  }, [busy, saved]);

  const inp = "w-full rounded-md border border-border bg-panel px-2 py-1.5 text-[12px] outline-none transition-colors focus:border-accent-strong/40";
  return (
    <div>
      <SubHead>Tracking</SubHead>
      <div className="mt-1.5 space-y-1.5">
        <input className={inp} placeholder="Courier (TCS, Leopards, PostEx…)" value={courierName} onChange={(e) => setCourier(e.target.value)} />
        <input className={inp} placeholder="Tracking number" value={trackingNumber} onChange={(e) => setNum(e.target.value)} />
        <input className={inp} placeholder="Tracking URL (https://…)" value={trackingUrl} onChange={(e) => setUrl(e.target.value)} />
        <textarea className={`${inp} min-h-[52px] resize-y`} placeholder="Private note (only you see this)" value={sellerNote} onChange={(e) => setNote(e.target.value)} />
        <button
          onClick={() => {
            onSave({ courierName, trackingNumber, trackingUrl, sellerNote });
            setSaved(true);
          }}
          disabled={!dirty || busy}
          className="inline-flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1.5 text-[11.5px] font-medium transition-colors hover:border-accent-strong/40 disabled:opacity-40"
        >
          {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : saved && !dirty ? <Check className="h-3 w-3 text-good" /> : null}
          {busy ? "Saving…" : saved && !dirty ? "Saved" : "Save tracking"}
        </button>
      </div>
    </div>
  );
}
