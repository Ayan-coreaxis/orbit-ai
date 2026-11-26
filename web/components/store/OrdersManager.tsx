"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Card } from "@/components/ui";
import { useDashToast, DashToastHost } from "@/components/dash-toast";
import type { CheckoutCustomField } from "@/lib/checkout-fields";
import { money } from "@/lib/money";
import { cn } from "@/lib/utils";
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
  Phone,
  MessageCircle,
  Copy,
  AlertTriangle,
  ArrowRight,
} from "lucide-react";

interface OrderItem {
  productId?: string;
  name?: string;
  variantLabel?: string | null;
  price?: number;
  qty?: number;
}
interface History {
  orders: number;
  delivered: number;
  cancelled: number;
  returned: number;
}
interface Order {
  id: string;
  number: string;
  createdAt: string;
  customerName: string;
  customerPhone: string;
  customerEmail: string | null;
  address: string;
  city: string | null;
  history: History;
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
  riskScore: number | null;
  riskLevel: string | null;
  riskSignals: { label: string; weight: number }[];
  paymentProvider: string;
  paymentStatus: string;
  courierName: string | null;
  trackingNumber: string | null;
  trackingUrl: string | null;
  courierStatus: string | null;
  courierStatusText: string | null;
  courierCheckedAt: string | null;
  sellerNote: string | null;
  confirmationNotifiedAt: string | null;
  confirmationNotifyError: string | null;
  trackingNotifiedAt: string | null;
  trackingNotifyError: string | null;
  confirmedAt: string | null;
  verifiedAt: string | null;
  shippedAt: string | null;
  fulfilledAt: string | null;
  cancelledAt: string | null;
}

const FLOW = ["pending", "confirmed", "shipped", "fulfilled"];
/** The one thing to do next with an order, in the seller's words. */
const NEXT: Record<string, { label: string }> = {
  pending: { label: "Confirm order" },
  confirmed: { label: "Mark shipped" },
  shipped: { label: "Mark delivered" },
};
const STATUS: Record<string, { cls: string; icon: typeof Clock; label: string }> = {
  pending: { cls: "bg-warn-soft text-warn", icon: Clock, label: "New" },
  confirmed: { cls: "bg-accent-soft text-accent-strong", icon: Check, label: "Confirmed" },
  shipped: { cls: "bg-accent-soft text-accent-strong", icon: Truck, label: "Shipped" },
  fulfilled: { cls: "bg-good-soft text-good", icon: PackageCheck, label: "Delivered" },
  cancelled: { cls: "bg-panel-2 text-text-faint", icon: XCircle, label: "Cancelled" },
};
const RETURNED = { cls: "bg-bad-soft text-bad", icon: RotateCcw, label: "Returned" };
/** A cancelled order whose parcel came back reads as "Returned" — that's a lost delivery, not a cancel. */
function statusOf(o: { status: string; courierStatus: string | null }) {
  if (o.status === "cancelled" && o.courierStatus === "returned") return RETURNED;
  return STATUS[o.status] ?? STATUS.pending;
}
const RISK: Record<string, { cls: string; label: string }> = {
  low: { cls: "bg-good-soft text-good", label: "Low risk" },
  medium: { cls: "bg-warn-soft text-warn", label: "Medium risk" },
  high: { cls: "bg-bad-soft text-bad", label: "High risk" },
};
const RANGES = [
  { key: "", label: "Any time" },
  { key: "today", label: "Today" },
  { key: "7", label: "Last 7 days" },
  { key: "30", label: "Last 30 days" },
];

function day(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function ago(iso: string) {
  const m = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.round(h / 24);
  if (d < 7) return `${d}d ago`;
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}
function when(iso: string) {
  return new Date(iso).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}
/** wa.me wants the international number without + or leading zero. */
function waNumber(phone: string) {
  const d = phone.replace(/\D/g, "");
  if (/^03\d{9}$/.test(d)) return `92${d.slice(1)}`;
  return d;
}
function itemsLine(items: OrderItem[]) {
  return items.map((it) => `${it.name ?? "Item"}${it.variantLabel ? ` (${it.variantLabel})` : ""}${(it.qty ?? 1) > 1 ? ` ×${it.qty}` : ""}`).join(", ");
}

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
  const [range, setRange] = useState("");
  const [skip, setSkip] = useState(0);
  const [loading, setLoading] = useState(true);
  const [firstLoad, setFirstLoad] = useState(true);
  const [open, setOpen] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [toasts, toast] = useDashToast();
  const router = useRouter();
  const courier = courierProvider && courierProvider !== "manual" ? courierProvider : null;

  const params = useCallback(() => {
    const p = new URLSearchParams();
    if (filter) p.set("status", filter);
    if (q.trim()) p.set("q", q.trim());
    if (range) {
      const from = new Date();
      if (range !== "today") from.setDate(from.getDate() - (Number(range) - 1));
      p.set("from", day(from));
    }
    return p;
  }, [filter, q, range]);

  const load = useCallback(() => {
    setLoading(true);
    setSel(new Set());
    const p = params();
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
      .catch(() => toast("Couldn't load orders. Check your connection.", "err"))
      .finally(() => {
        setLoading(false);
        setFirstLoad(false);
      });
  }, [businessId, params, skip, toast]);

  useEffect(() => {
    const t = setTimeout(load, q ? 300 : 0);
    return () => clearTimeout(t);
  }, [load, q]);

  function pick(key: string) {
    setFilter(key);
    setSkip(0);
  }

  async function bulk(status: string) {
    const ids = [...sel];
    if (!ids.length) return;
    if (status === "cancelled" && !confirm(`Cancel ${ids.length} order(s) and put the stock back?`)) return;
    setBusy("bulk");
    try {
      const r = await fetch(`/api/store/${businessId}/admin/orders/bulk`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids, status }),
      });
      const d = await r.json();
      if (!r.ok) toast(d.error || "Couldn't update those orders.", "err");
      else toast(`${ids.length} order${ids.length > 1 ? "s" : ""} updated.`);
      load();
      router.refresh();
    } finally {
      setBusy(null);
    }
  }

  async function patch(id: string, body: Record<string, unknown>, tag: string, done?: string) {
    setBusy(id + tag);
    try {
      const r = await fetch(`/api/store/${businessId}/admin/orders/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const d = await r.json();
      if (r.ok && d.order) {
        if (done) toast(done);
        load();
        router.refresh(); // the "Orders" tab count is rendered on the server
        return true;
      }
      toast(d.error || "Couldn't update the order.", "err");
    } catch {
      toast("Network error — nothing was changed.", "err");
    } finally {
      setBusy(null);
    }
    return false;
  }

  const advance = (o: Order) => {
    const next = FLOW[FLOW.indexOf(o.status) + 1];
    return patch(o.id, { status: next }, "next", `#${o.number} → ${STATUS[next].label}`);
  };

  const totalAll = FLOW.reduce((s, k) => s + (byStatus[k] || 0), 0) + (byStatus.cancelled || 0);
  const chips = [
    { key: "", label: "All", n: totalAll },
    ...(byStatus.unconfirmed ? [{ key: "unconfirmed", label: "Not confirmed by customer", n: byStatus.unconfirmed }] : []),
    ...(byStatus.flagged ? [{ key: "flagged", label: "Flagged", n: byStatus.flagged }] : []),
    ...FLOW.map((s) => ({ key: s, label: STATUS[s].label, n: byStatus[s] || 0 })),
    { key: "cancelled", label: "Cancelled", n: byStatus.cancelled || 0 },
  ];
  const todo = [
    { key: "pending", label: "To confirm", hint: "Call or WhatsApp, then confirm", n: byStatus.pending || 0, icon: Clock },
    { key: "confirmed", label: "To pack & ship", hint: courier ? `Book with ${courier}` : "Hand to your courier", n: byStatus.confirmed || 0, icon: Truck },
    { key: "shipped", label: "With the courier", hint: "Cash comes when delivered", n: byStatus.shipped || 0, icon: PackageCheck },
  ];

  return (
    <div className="grid gap-4">
      <DashToastHost items={toasts} />

      {/* What needs doing today — the seller's queue, not a report */}
      {totalAll > 0 && (
        <div className="grid grid-cols-3 gap-2 sm:gap-3">
          {todo.map((t) => (
            <button
              key={t.key}
              onClick={() => pick(filter === t.key ? "" : t.key)}
              aria-pressed={filter === t.key}
              className={cn(
                "app-card flex flex-col items-start gap-0.5 p-3 text-left transition-colors sm:p-4",
                filter === t.key ? "ring-2 ring-accent" : "hover:border-accent/40",
              )}
            >
              <span className="flex items-center gap-1.5 text-[12.5px] font-medium text-text-dim sm:text-[13.5px]">
                <t.icon className="hidden h-4 w-4 sm:block" />
                {t.label}
              </span>
              <span className={cn("text-[24px] font-semibold tabular-nums leading-tight sm:text-[28px]", t.n > 0 && t.key === "pending" ? "text-warn" : "text-text")}>{t.n}</span>
              <span className="hidden text-[12.5px] text-text-faint sm:block">{t.hint}</span>
            </button>
          ))}
        </div>
      )}

      <Card className="overflow-hidden p-0">
        {/* filters */}
        <div className="grid gap-3 border-b border-border px-4 py-3">
          <div className="-mx-1 flex gap-1 overflow-x-auto px-1 pb-0.5">
            {chips.map((c) => (
              <button
                key={c.key}
                onClick={() => pick(c.key)}
                aria-pressed={filter === c.key}
                className={cn(
                  "flex-none whitespace-nowrap rounded-full px-3 py-1.5 text-[13px] font-medium transition-colors",
                  filter === c.key ? "bg-accent text-white" : "text-text-dim hover:bg-panel-2 hover:text-text",
                )}
              >
                {c.label}
                <span className="ml-1.5 tabular-nums opacity-70">{c.n}</span>
              </button>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative min-w-0 basis-full sm:max-w-xs sm:flex-1 sm:basis-auto">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-faint" />
              <input
                value={q}
                onChange={(e) => {
                  setQ(e.target.value);
                  setSkip(0);
                }}
                placeholder="Search name, phone or #number"
                aria-label="Search orders"
                className="w-full rounded-lg border border-border bg-panel-2 py-2 pl-9 pr-3 text-[13.5px] outline-none transition-colors focus:border-accent/60"
              />
            </div>
            <select
              value={range}
              onChange={(e) => {
                setRange(e.target.value);
                setSkip(0);
              }}
              aria-label="Date range"
              className="rounded-lg border border-border bg-panel-2 px-3 py-2 text-[13.5px] text-text-dim outline-none focus:border-accent/60"
            >
              {RANGES.map((r) => (
                <option key={r.key} value={r.key}>
                  {r.label}
                </option>
              ))}
            </select>
            <a
              href={`/api/store/${businessId}/admin/orders/export?${params()}`}
              className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-[13.5px] font-medium text-text-dim transition-colors hover:border-accent/40 hover:text-text"
            >
              <Download className="h-4 w-4" />
              <span className="hidden sm:inline">Export</span> CSV
            </a>
          </div>
        </div>

        {/* bulk bar */}
        {sel.size > 0 && (
          <div className="flex flex-wrap items-center gap-2 border-b border-border bg-accent-soft/60 px-4 py-2.5 text-[13px]">
            <span className="font-semibold text-accent-strong">{sel.size} selected</span>
            {[
              ["confirmed", "Confirm"],
              ["shipped", "Mark shipped"],
              ["fulfilled", "Mark delivered"],
            ].map(([st, label]) => (
              <button key={st} onClick={() => bulk(st)} disabled={busy === "bulk"} className="rounded-lg border border-border bg-panel px-3 py-1.5 font-medium hover:border-accent/50 disabled:opacity-50">
                {label}
              </button>
            ))}
            <button onClick={() => bulk("cancelled")} disabled={busy === "bulk"} className="rounded-lg border border-border bg-panel px-3 py-1.5 font-medium text-bad hover:border-bad/40 disabled:opacity-50">
              Cancel
            </button>
            {busy === "bulk" && <Loader2 className="h-4 w-4 animate-spin text-accent" />}
            <button onClick={() => setSel(new Set())} className="ml-auto text-text-faint hover:text-text">
              Clear
            </button>
          </div>
        )}

        {/* list */}
        {firstLoad && loading ? (
          <SkeletonRows />
        ) : orders.length === 0 ? (
          <div className="px-4 py-14 text-center text-[14px] text-text-faint">
            {filter || q || range ? (
              <>
                No orders match this.{" "}
                <button
                  className="font-medium text-accent hover:underline"
                  onClick={() => {
                    setFilter("");
                    setQ("");
                    setRange("");
                  }}
                >
                  Show all
                </button>
              </>
            ) : (
              "No orders yet — they show up here the moment someone checks out."
            )}
          </div>
        ) : (
          <div aria-busy={loading} className={cn("divide-y divide-border transition-opacity", loading && "opacity-60")}>
            {orders.map((o) => {
              const expanded = open === o.id;
              const s = statusOf(o);
              const SIcon = s.icon;
              const risky = o.riskLevel === "medium" || o.riskLevel === "high";
              const next = o.verified && NEXT[o.status];
              return (
                <div key={o.id} className={cn(expanded && "bg-panel-2/60")}>
                  <div className="flex items-start gap-2 px-3 py-3 sm:items-center sm:px-4">
                    <input
                      type="checkbox"
                      aria-label={`Select order ${o.number}`}
                      className="mt-1 h-4 w-4 flex-none accent-[var(--accent)] sm:mt-0"
                      checked={sel.has(o.id)}
                      onChange={(e) =>
                        setSel((cur) => {
                          const n = new Set(cur);
                          if (e.target.checked) n.add(o.id);
                          else n.delete(o.id);
                          return n;
                        })
                      }
                    />
                    <button
                      onClick={() => setOpen(expanded ? null : o.id)}
                      aria-expanded={expanded}
                      className="grid min-w-0 flex-1 gap-1 rounded-md text-left outline-none focus-visible:ring-2 focus-visible:ring-accent sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center sm:gap-4"
                    >
                      <span className="min-w-0">
                        <span className="flex min-w-0 items-baseline gap-2">
                          <span className="truncate text-[14.5px] font-semibold">{o.customerName}</span>
                          {o.city && <span className="flex-none text-[13px] text-text-faint">{o.city}</span>}
                        </span>
                        <span className="mt-0.5 block truncate text-[13px] text-text-dim">{itemsLine(o.items)}</span>
                        <span className="mt-1.5 flex flex-wrap items-center gap-1.5 text-[12px]">
                          <span className={cn("inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 font-semibold", s.cls)}>
                            <SIcon className="h-3 w-3" />
                            {s.label}
                          </span>
                          {!o.verified && o.status !== "cancelled" && <span className="rounded-md bg-warn-soft px-1.5 py-0.5 font-semibold text-warn">Customer hasn&apos;t confirmed</span>}
                          {o.flagged && <span className="rounded-md bg-bad-soft px-1.5 py-0.5 font-semibold text-bad">Flagged</span>}
                          {risky && !o.flagged && <span className={cn("rounded-md px-1.5 py-0.5 font-semibold", RISK[o.riskLevel!].cls)}>{RISK[o.riskLevel!].label}</span>}
                          <HistoryBadge h={prior(o)} />
                          <span className="text-text-faint">
                            #{o.number} · {ago(o.createdAt)}
                          </span>
                        </span>
                      </span>
                      <span className="flex items-baseline gap-1.5 sm:block sm:text-right">
                        <span className="text-[15px] font-semibold tabular-nums">{money(o.total, currency)}</span>
                        <span className="block text-[12px] text-text-faint">{o.paymentProvider === "cod" ? "Cash on delivery" : o.paymentStatus === "paid" ? "Paid online" : "Payment pending"}</span>
                      </span>
                    </button>
                    {next && (
                      <button
                        onClick={() => advance(o)}
                        disabled={busy === o.id + "next"}
                        className="hidden flex-none items-center gap-1.5 rounded-full bg-accent px-3.5 py-2 text-[13px] font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-60 md:inline-flex"
                      >
                        {busy === o.id + "next" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                        {next.label}
                      </button>
                    )}
                    <button
                      onClick={() => setOpen(expanded ? null : o.id)}
                      aria-label={expanded ? "Close order" : "Open order"}
                      className="flex-none rounded-full p-1.5 text-text-faint hover:bg-panel-2 hover:text-text"
                    >
                      <ChevronDown className={cn("h-5 w-5 transition-transform", expanded && "rotate-180")} />
                    </button>
                  </div>

                  {expanded && (
                    <OrderDetail
                      o={o}
                      currency={currency}
                      courier={courier}
                      busy={busy}
                      fieldLabel={fieldLabel}
                      onAdvance={() => advance(o)}
                      onPatch={(body, tag, done) => patch(o.id, body, tag, done)}
                      onCopied={(what) => toast(`${what} copied`)}
                    />
                  )}
                </div>
              );
            })}
          </div>
        )}

        {total > orders.length + skip && (
          <button onClick={() => setSkip(skip + 30)} className="w-full border-t border-border py-3 text-[13.5px] font-medium text-accent transition-colors hover:bg-panel-2">
            Load more ({total - orders.length - skip} left)
          </button>
        )}
      </Card>
    </div>
  );
}

/** The customer's record before this order (the server counts every order from the number, this one included). */
function prior(o: Order): History {
  const h = o.history;
  return {
    orders: Math.max(0, h.orders - 1),
    delivered: Math.max(0, h.delivered - (o.status === "fulfilled" ? 1 : 0)),
    cancelled: Math.max(0, h.cancelled - (o.status === "cancelled" && o.courierStatus !== "returned" ? 1 : 0)),
    returned: Math.max(0, h.returned - (o.courierStatus === "returned" || o.courierStatus === "returning" ? 1 : 0)),
  };
}

function HistoryBadge({ h }: { h: History }) {
  const before = h.orders;
  if (h.returned > 0) return <span className="rounded-md bg-bad-soft px-1.5 py-0.5 font-semibold text-bad">Returned {h.returned} before</span>;
  if (h.delivered > 0) return <span className="rounded-md bg-good-soft px-1.5 py-0.5 font-semibold text-good">Repeat · {h.delivered} delivered</span>;
  if (before > 0 && h.cancelled > 0) return <span className="rounded-md bg-warn-soft px-1.5 py-0.5 font-semibold text-warn">{h.cancelled} cancelled before</span>;
  return null;
}

function OrderDetail({
  o,
  currency,
  courier,
  busy,
  fieldLabel,
  onAdvance,
  onPatch,
  onCopied,
}: {
  o: Order;
  currency?: string;
  courier: string | null;
  busy: string | null;
  fieldLabel: (k: string) => string;
  onAdvance: () => void;
  onPatch: (body: Record<string, unknown>, tag: string, done?: string) => Promise<boolean>;
  onCopied: (what: string) => void;
}) {
  const risk = o.riskLevel ? RISK[o.riskLevel] : undefined;
  const next = o.verified && NEXT[o.status];
  const copy = (text: string, what: string) => void navigator.clipboard?.writeText(text).then(() => onCopied(what), () => {});
  const steps = [
    { label: "Order placed", at: o.createdAt },
    ...(o.verifiedAt ? [{ label: "Customer confirmed", at: o.verifiedAt }] : []),
    { label: "Confirmed", at: o.confirmedAt },
    { label: "Shipped", at: o.shippedAt },
    { label: "Delivered", at: o.fulfilledAt },
  ];
  const btn = "inline-flex items-center gap-1.5 rounded-lg border border-border bg-panel px-3 py-1.5 text-[13px] font-medium transition-colors hover:border-accent/50";

  return (
    <div className="grid gap-6 border-t border-border px-4 pb-5 pt-4 text-[13.5px] sm:px-6 lg:grid-cols-2">
      {/* left: who and what */}
      <div className="grid content-start gap-5">
        <section>
          <SubHead>Customer</SubHead>
          <p className="mt-1.5 text-[15px] font-semibold">{o.customerName}</p>
          <p className="text-text-dim">
            {o.customerPhone}
            {o.customerEmail ? ` · ${o.customerEmail}` : ""}
          </p>
          <p className="mt-1 leading-relaxed text-text-dim">{o.address}</p>
          <div className="mt-2.5 flex flex-wrap gap-2">
            <a href={`tel:${o.customerPhone}`} className={btn}>
              <Phone className="h-3.5 w-3.5" /> Call
            </a>
            <a href={`https://wa.me/${waNumber(o.customerPhone)}`} target="_blank" rel="noreferrer" className={btn}>
              <MessageCircle className="h-3.5 w-3.5" /> WhatsApp
            </a>
            <button onClick={() => copy(`${o.customerName}\n${o.customerPhone}\n${o.address}`, "Address")} className={btn}>
              <Copy className="h-3.5 w-3.5" /> Copy address
            </button>
          </div>
          <p className="mt-2 text-[13px] text-text-faint">
            {(() => {
              const h = prior(o);
              return h.orders === 0
                ? "First order from this number."
                : `Ordered ${h.orders} time${h.orders > 1 ? "s" : ""} before · ${h.delivered} delivered${h.returned ? ` · ${h.returned} returned` : ""}${h.cancelled ? ` · ${h.cancelled} cancelled` : ""}.`;
            })()}
          </p>
        </section>

        <section>
          <SubHead>Items</SubHead>
          <div className="mt-1.5 grid gap-1">
            {o.items.map((it, i) => (
              <div key={i} className="flex justify-between gap-3">
                <span className="text-text-dim">
                  {it.name}
                  {it.variantLabel && <span className="font-medium text-text"> · {it.variantLabel}</span>} <span className="text-text-faint">× {it.qty}</span>
                </span>
                <span className="tabular-nums">{money((it.price || 0) * (it.qty || 0), currency)}</span>
              </div>
            ))}
            {o.discountAmount > 0 && (
              <Line label={`Discount${o.couponCode ? ` (${o.couponCode})` : ""}`} value={`−${money(o.discountAmount, currency)}`} cls="text-good" />
            )}
            {o.shippingFee > 0 && <Line label="Delivery" value={money(o.shippingFee, currency)} cls="text-text-faint" />}
            {o.taxAmount > 0 && <Line label="Tax" value={money(o.taxAmount, currency)} cls="text-text-faint" />}
            <div className="mt-1 flex justify-between border-t border-border pt-1.5 font-semibold">
              <span>{o.paymentProvider === "cod" ? "To collect on delivery" : `Total · ${o.paymentProvider}`}</span>
              <span className="tabular-nums">{money(o.total, currency)}</span>
            </div>
          </div>
        </section>

        {(o.flagged || (risk && o.riskLevel !== "low") || o.riskSignals.some((s) => s.weight > 0)) && (
          <section>
            <SubHead>Order risk</SubHead>
            <div className="mt-1.5 flex items-center gap-2">
              {risk && <span className={cn("rounded-md px-1.5 py-0.5 text-[12px] font-semibold", risk.cls)}>{risk.label}</span>}
              {o.riskScore != null && <span className="tabular-nums text-text-faint">{o.riskScore} / 100</span>}
            </div>
            {(o.riskLevel === "high" || o.flagged) && <p className="mt-1.5 font-medium text-bad">Call or WhatsApp to confirm before you ship this.</p>}
            {o.flagged && o.flagReason && !o.riskSignals.length && <p className="mt-1.5 text-text-dim">{o.flagReason}</p>}
            <ul className="mt-1.5 grid gap-1">
              {o.riskSignals.map((sig, i) => (
                <li key={i} className="flex gap-1.5 text-text-dim">
                  <span className={cn("flex-none font-semibold", sig.weight > 0 ? "text-bad" : "text-good")}>{sig.weight > 0 ? "+" : "−"}</span>
                  <span>{sig.label}</span>
                </li>
              ))}
            </ul>
          </section>
        )}

        {o.customFields && Object.keys(o.customFields).length > 0 && (
          <section>
            <SubHead>Extra details</SubHead>
            <div className="mt-1.5 grid gap-1 text-text-dim">
              {Object.entries(o.customFields).map(([k, v]) => (
                <p key={k} className="whitespace-pre-wrap">
                  <span className="text-text-faint">{fieldLabel(k)}:</span> {v}
                </p>
              ))}
            </div>
          </section>
        )}
      </div>

      {/* right: what to do */}
      <div className="grid content-start gap-5">
        <section>
          <SubHead>Next step</SubHead>
          {o.status === "cancelled" ? (
            <p className="mt-1.5 text-text-dim">
              {o.courierStatus === "returned" ? "The parcel came back" : "Cancelled"}
              {o.cancelledAt ? ` on ${when(o.cancelledAt)}` : ""}. The stock went back into your store.
            </p>
          ) : o.status === "fulfilled" ? (
            <p className="mt-1.5 text-text-dim">Delivered{o.fulfilledAt ? ` on ${when(o.fulfilledAt)}` : ""}. {o.paymentProvider === "cod" ? "The cash counts as received." : ""}</p>
          ) : !o.verified ? (
            <div className="mt-1.5 grid gap-2">
              <p className="text-text-dim">The customer hasn&apos;t replied YES yet. Call them, or confirm it yourself if you already spoke.</p>
              <button
                onClick={() => onPatch({ verified: true }, "verify", "Marked as confirmed by the customer")}
                disabled={busy === o.id + "verify"}
                className="btn-primary w-full justify-center sm:w-auto"
              >
                {busy === o.id + "verify" && <Loader2 className="h-4 w-4 animate-spin" />}
                Customer confirmed on call
              </button>
            </div>
          ) : (
            next && (
              <button onClick={onAdvance} disabled={busy === o.id + "next"} className="btn-primary mt-1.5 w-full justify-center sm:w-auto">
                {busy === o.id + "next" ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowRight className="h-4 w-4" />}
                {next.label}
              </button>
            )
          )}
          {o.status === "shipped" && (
            <button
              onClick={() => {
                if (confirm("Did the parcel come back (refused or not reachable)? The order closes as Returned and the stock goes back into your store."))
                  onPatch({ returned: true }, "returned", `#${o.number} marked as returned`);
              }}
              disabled={busy === o.id + "returned"}
              className="mt-2 inline-flex items-center gap-1.5 rounded-lg px-1 py-1 text-[13px] font-medium text-text-faint transition-colors hover:text-bad disabled:opacity-50 sm:ml-3"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              Parcel came back
            </button>
          )}
          {(o.status === "pending" || o.status === "confirmed") && (
            <button
              onClick={() => {
                if (confirm("Cancel this order? The stock goes back into your store.")) onPatch({ status: "cancelled" }, "cancel", `#${o.number} cancelled`);
              }}
              disabled={busy === o.id + "cancel"}
              className="mt-2 inline-flex items-center gap-1.5 rounded-lg px-1 py-1 text-[13px] font-medium text-text-faint transition-colors hover:text-bad disabled:opacity-50 sm:ml-3"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              Cancel &amp; restock
            </button>
          )}
          {(o.confirmationNotifiedAt || o.trackingNotifiedAt) && (
            <p className="mt-2 text-[13px] text-text-faint">
              {o.confirmationNotifiedAt && "Order message sent to the customer on WhatsApp. "}
              {o.trackingNotifiedAt && "Customer was told it's on the way."}
            </p>
          )}
          {(o.confirmationNotifyError || o.trackingNotifyError) && (
            <p className="mt-2 flex gap-1.5 rounded-lg bg-warn-soft px-2.5 py-1.5 text-[13px] text-warn">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 flex-none" />
              Message to the customer didn&apos;t send: {o.confirmationNotifyError || o.trackingNotifyError}
            </p>
          )}
        </section>

        {o.status !== "cancelled" && (
          <section>
            <SubHead>Delivery</SubHead>
            <div className="mt-1.5 grid gap-2.5">
              {o.trackingNumber ? (
                <div className="flex flex-wrap items-center gap-2">
                  <span
                    className={cn(
                      "rounded-full px-2.5 py-1 text-[13px] font-medium",
                      o.courierStatus === "delivered"
                        ? "bg-good-soft text-good"
                        : o.courierStatus === "returned" || o.courierStatus === "returning" || o.courierStatus === "attempted"
                          ? "bg-bad-soft text-bad"
                          : "bg-panel-2 text-text-dim",
                    )}
                  >
                    {o.courierName ?? "Courier"} · {o.trackingNumber}
                    {o.courierStatusText ? ` · ${o.courierStatusText}` : ""}
                  </span>
                  {o.trackingUrl && (
                    <a href={o.trackingUrl} target="_blank" rel="noreferrer" className="text-[13px] font-medium text-accent hover:underline">
                      Track
                    </a>
                  )}
                  {/postex|leopard|tcs/i.test(o.courierName ?? "") && (
                    <button onClick={() => onPatch({ track: true }, "courier")} disabled={busy === o.id + "courier"} className="text-[13px] font-medium text-accent hover:underline disabled:opacity-50">
                      {busy === o.id + "courier" ? "Checking…" : "Check status"}
                    </button>
                  )}
                  {o.courierCheckedAt && <span className="text-[12.5px] text-text-faint">checked {ago(o.courierCheckedAt)}</span>}
                </div>
              ) : courier ? (
                <button onClick={() => onPatch({ book: true }, "book", `Booked with ${courier}`)} disabled={busy === o.id + "book"} className={cn(btn, "w-fit")}>
                  {busy === o.id + "book" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Truck className="h-3.5 w-3.5" />}
                  Book with {courier}
                </button>
              ) : (
                <p className="text-[13px] text-text-faint">
                  Connect PostEx, Leopards or TCS to book parcels in one click.{" "}
                  <Link href="/dashboard/settings/delivery" className="font-medium text-accent hover:underline">
                    Delivery settings
                  </Link>
                </p>
              )}
              <TrackingForm key={o.id + (o.trackingNumber ?? "")} order={o} startOpen={!courier && !o.trackingNumber} busy={busy === o.id + "track"} onSave={(v) => onPatch(v, "track", "Tracking saved")} />
            </div>
          </section>
        )}

        <section>
          <SubHead>History</SubHead>
          <ol className="mt-2 grid gap-1.5">
            {o.status === "cancelled"
              ? [steps[0], ...(o.shippedAt ? [{ label: "Shipped", at: o.shippedAt }] : []), { label: o.courierStatus === "returned" ? "Came back" : "Cancelled", at: o.cancelledAt }].map((st) => <Step key={st.label} label={st.label} at={st.at} />)
              : steps.map((st) => <Step key={st.label} label={st.label} at={st.at} />)}
          </ol>
        </section>

        <NoteBox key={o.id + "note"} initial={o.sellerNote ?? ""} busy={busy === o.id + "note"} onSave={(sellerNote) => onPatch({ sellerNote }, "note", "Note saved")} />

        <a href={`/dashboard/store/invoice/${o.id}`} target="_blank" rel="noreferrer" className="inline-flex w-fit items-center gap-1.5 text-[13px] font-medium text-text-dim hover:text-text">
          <FileText className="h-4 w-4" />
          Invoice / packing slip
        </a>
      </div>
    </div>
  );
}

function Step({ label, at }: { label: string; at: string | null }) {
  return (
    <li className="flex items-center gap-2.5">
      <span className={cn("h-2.5 w-2.5 flex-none rounded-full", at ? "bg-accent" : "border-2 border-text-faint/40 bg-panel")} />
      <span className={cn("text-[13px]", at ? "text-text" : "text-text-faint")}>{label}</span>
      {at && <span className="ml-auto text-[12.5px] tabular-nums text-text-faint">{when(at)}</span>}
    </li>
  );
}

function Line({ label, value, cls }: { label: string; value: string; cls?: string }) {
  return (
    <div className={cn("flex justify-between", cls)}>
      <span>{label}</span>
      <span className="tabular-nums">{value}</span>
    </div>
  );
}

function SkeletonRows() {
  return (
    <div className="divide-y divide-border">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="flex items-center gap-3 px-4 py-4">
          <div className="h-4 w-4 rounded bg-panel-2" />
          <div className="grid flex-1 gap-2">
            <div className="h-3.5 rounded bg-panel-2" style={{ maxWidth: `${140 + ((i * 37) % 90)}px` }} />
            <div className="h-3 w-48 rounded bg-panel-2" />
          </div>
          <div className="h-4 w-16 rounded bg-panel-2" />
        </div>
      ))}
    </div>
  );
}

function SubHead({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <div className={cn("text-[12px] font-semibold uppercase tracking-[0.04em] text-text-faint", className)}>{children}</div>;
}

const inp = "w-full rounded-lg border border-border bg-panel px-3 py-2 text-[13.5px] outline-none transition-colors focus:border-accent/60";

function TrackingForm({
  order,
  startOpen,
  busy,
  onSave,
}: {
  order: Order;
  startOpen: boolean;
  busy: boolean;
  onSave: (v: Record<string, unknown>) => Promise<boolean>;
}) {
  const [courierName, setCourier] = useState(order.courierName || "");
  const [trackingNumber, setNum] = useState(order.trackingNumber || "");
  const [trackingUrl, setUrl] = useState(order.trackingUrl || "");
  const dirty = courierName !== (order.courierName || "") || trackingNumber !== (order.trackingNumber || "") || trackingUrl !== (order.trackingUrl || "");
  return (
    <details open={startOpen} className="group">
      <summary className="cursor-pointer list-none text-[13px] font-medium text-text-dim hover:text-text [&::-webkit-details-marker]:hidden">
        <span className="inline-flex items-center gap-1">
          <ChevronDown className="h-3.5 w-3.5 transition-transform group-open:rotate-180" />
          {order.trackingNumber ? "Edit tracking" : "Enter tracking yourself"}
        </span>
      </summary>
      <div className="mt-2 grid gap-2">
        <div className="grid gap-2 sm:grid-cols-2">
          <input className={inp} aria-label="Courier" placeholder="Courier (TCS, Leopards, PostEx…)" value={courierName} onChange={(e) => setCourier(e.target.value)} />
          <input className={inp} aria-label="Tracking number" placeholder="Tracking number" value={trackingNumber} onChange={(e) => setNum(e.target.value)} />
        </div>
        <input className={inp} aria-label="Tracking link" placeholder="Tracking link (optional)" value={trackingUrl} onChange={(e) => setUrl(e.target.value)} />
        <button onClick={() => void onSave({ courierName, trackingNumber, trackingUrl })} disabled={!dirty || busy} className="btn-soft w-fit !py-1.5 text-[13px] disabled:opacity-40">
          {busy && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
          Save tracking
        </button>
      </div>
    </details>
  );
}

function NoteBox({ initial, busy, onSave }: { initial: string; busy: boolean; onSave: (v: string) => Promise<boolean> }) {
  const [note, setNote] = useState(initial);
  return (
    <section>
      <label htmlFor="order-note">
        <SubHead>Private note</SubHead>
      </label>
      <textarea id="order-note" className={cn(inp, "mt-1.5 min-h-[64px] resize-y")} placeholder="Only you see this — e.g. “asked for gift wrap”" value={note} onChange={(e) => setNote(e.target.value)} />
      {note !== initial && (
        <button onClick={() => void onSave(note)} disabled={busy} className="btn-soft mt-1.5 !py-1.5 text-[13px]">
          {busy && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
          Save note
        </button>
      )}
    </section>
  );
}
