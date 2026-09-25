import { prisma } from "@/lib/prisma";
import { totalStock } from "@/lib/variants";

/**
 * Storefront analytics — every number here is computed straight from real rows (`StoreEvent`
 * for the visit funnel, `Order` for money), never estimated or fabricated. Mirrors the honest
 * style of `lib/get-order-growth.ts`.
 */

export const EVENT_TYPES = [
  "view_store",
  "view_product",
  "add_to_cart",
  "checkout_start",
  "order_complete",
] as const;
export type StoreEventType = (typeof EVENT_TYPES)[number];

export function isEventType(v: unknown): v is StoreEventType {
  return typeof v === "string" && (EVENT_TYPES as readonly string[]).includes(v);
}

interface OrderItem {
  productId?: string;
  name?: string;
  price?: number;
  qty?: number;
}

export interface FunnelStep {
  type: StoreEventType;
  label: string;
  sessions: number;
  /** % of the previous step that reached this one — null for the first step. */
  fromPrev: number | null;
}

export interface TopProduct {
  productId: string;
  name: string;
  units: number;
  revenue: number;
}

export interface DayPoint {
  day: string; // YYYY-MM-DD
  orders: number;
  revenue: number;
}

export interface StoreAnalytics {
  rangeDays: number;
  visitors: number; // distinct sessions with any event
  orders: number;
  revenue: number;
  aov: number;
  conversionRate: number; // order_complete sessions / view_store sessions
  funnel: FunnelStep[];
  series: DayPoint[];
  topProducts: TopProduct[];
  lowStock: { id: string; name: string; stock: number }[];
  newCustomers: number;
  repeatCustomers: number;
  referrers: { source: string; sessions: number }[];
}

/** Best-effort event write — never throws into the caller's request path. */
export async function recordEvent(
  businessId: string,
  sessionId: string,
  type: StoreEventType,
  opts: { productId?: string | null; referrer?: string | null } = {},
): Promise<void> {
  if (!businessId || !sessionId || !isEventType(type)) return;
  try {
    await prisma.storeEvent.create({
      data: {
        businessId,
        sessionId: sessionId.slice(0, 64),
        type,
        productId: opts.productId ? String(opts.productId).slice(0, 64) : null,
        referrer: opts.referrer ? String(opts.referrer).slice(0, 120) : null,
      },
    });
  } catch {
    /* analytics must never break a page render or a checkout */
  }
}

const STEP_LABEL: Record<StoreEventType, string> = {
  view_store: "Visited store",
  view_product: "Viewed a product",
  add_to_cart: "Added to cart",
  checkout_start: "Started checkout",
  order_complete: "Placed order",
};

function dayKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}

// --------------------------------------------------------------------------
// Fast KPI header — scalar aggregates only, cheap enough to run on every
// dashboard load. The full getStoreAnalytics() is lazy-loaded by the tab.
// --------------------------------------------------------------------------

export interface StoreKpis {
  spark: { day: string; revenue: number; orders: number }[]; // last 14 days
  visitors30: number;
  conversion30: number;
  pendingOrders: number;
}

export async function getStoreKpis(businessId: string): Promise<StoreKpis> {
  const since14 = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000);
  const since30 = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  const [orders14, distinct, pendingOrders] = await Promise.all([
    prisma.order.findMany({
      where: { businessId, createdAt: { gte: since14 }, status: { not: "cancelled" }, verified: true },
      select: { total: true, createdAt: true },
    }),
    prisma.$queryRaw<{ type: string; c: bigint }[]>`
      SELECT type, COUNT(DISTINCT sessionId) AS c
      FROM "StoreEvent"
      WHERE "businessId" = ${businessId} AND "createdAt" >= ${since30}
      GROUP BY type`,
    prisma.order.count({ where: { businessId, status: "pending" } }),
  ]);

  const byType = new Map(distinct.map((r) => [r.type, Number(r.c)]));
  const visitors30 = byType.get("view_store") ?? 0;
  const buyers30 = byType.get("order_complete") ?? 0;

  const byDay = new Map<string, { day: string; revenue: number; orders: number }>();
  for (let i = 13; i >= 0; i--) {
    const k = dayKey(new Date(Date.now() - i * 24 * 60 * 60 * 1000));
    byDay.set(k, { day: k, revenue: 0, orders: 0 });
  }
  for (const o of orders14) {
    const p = byDay.get(dayKey(o.createdAt));
    if (p) {
      p.revenue += o.total;
      p.orders += 1;
    }
  }

  return {
    spark: [...byDay.values()],
    visitors30,
    conversion30: visitors30 > 0 ? (buyers30 / visitors30) * 100 : 0,
    pendingOrders,
  };
}

export async function getStoreAnalytics(businessId: string, rangeDays = 30): Promise<StoreAnalytics> {
  const days = Math.min(365, Math.max(1, Math.floor(rangeDays)));
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

  const [events, orders, lowStock] = await Promise.all([
    prisma.storeEvent.findMany({
      where: { businessId, createdAt: { gte: since } },
      select: { sessionId: true, type: true, productId: true, referrer: true },
    }),
    prisma.order.findMany({
      where: { businessId, createdAt: { gte: since }, status: { not: "cancelled" }, verified: true },
      select: { total: true, createdAt: true, items: true, customerPhone: true, customerId: true },
    }),
    prisma.product.findMany({
      where: { businessId },
      select: { id: true, name: true, stock: true, optionTypes: true, variants: { select: { stock: true } } },
    }),
  ]);

  const lowStockList = lowStock
    .map((p) => ({ id: p.id, name: p.name, stock: totalStock(p, p.variants) }))
    .filter((p) => p.stock <= 5)
    .sort((a, b) => a.stock - b.stock)
    .slice(0, 20);

  // ---- visit funnel (distinct sessions per step) ----
  const sessionsByType = new Map<StoreEventType, Set<string>>();
  for (const t of EVENT_TYPES) sessionsByType.set(t, new Set());
  const allSessions = new Set<string>();
  const referrerByHit = new Map<string, string>(); // session -> first non-empty referrer host
  for (const e of events) {
    allSessions.add(e.sessionId);
    if (isEventType(e.type)) sessionsByType.get(e.type)!.add(e.sessionId);
    if (e.referrer && !referrerByHit.has(e.sessionId)) referrerByHit.set(e.sessionId, e.referrer);
  }

  const funnel: FunnelStep[] = EVENT_TYPES.map((type, i) => {
    const sessions = sessionsByType.get(type)!.size;
    const prev = i === 0 ? null : sessionsByType.get(EVENT_TYPES[i - 1])!.size;
    return {
      type,
      label: STEP_LABEL[type],
      sessions,
      fromPrev: prev && prev > 0 ? (sessions / prev) * 100 : null,
    };
  });

  // ---- money ----
  const revenue = orders.reduce((s, o) => s + o.total, 0);
  const orderCount = orders.length;
  const aov = orderCount > 0 ? revenue / orderCount : 0;

  const visitorSessions = sessionsByType.get("view_store")!.size || allSessions.size;
  const buyerSessions = sessionsByType.get("order_complete")!.size;
  const conversionRate = visitorSessions > 0 ? (buyerSessions / visitorSessions) * 100 : 0;

  // ---- daily series ----
  const byDay = new Map<string, DayPoint>();
  for (let i = days - 1; i >= 0; i--) {
    const k = dayKey(new Date(Date.now() - i * 24 * 60 * 60 * 1000));
    byDay.set(k, { day: k, orders: 0, revenue: 0 });
  }
  for (const o of orders) {
    const k = dayKey(o.createdAt);
    const p = byDay.get(k);
    if (p) {
      p.orders += 1;
      p.revenue += o.total;
    }
  }
  const series = [...byDay.values()];

  // ---- top products (from real order line items) ----
  const prodAgg = new Map<string, TopProduct>();
  for (const o of orders) {
    let items: OrderItem[] = [];
    try {
      items = JSON.parse(o.items) as OrderItem[];
    } catch {
      items = [];
    }
    for (const it of items) {
      const id = it.productId || it.name || "unknown";
      const cur = prodAgg.get(id) ?? { productId: it.productId || "", name: it.name || "Item", units: 0, revenue: 0 };
      cur.units += Number(it.qty) || 0;
      cur.revenue += (Number(it.price) || 0) * (Number(it.qty) || 0);
      prodAgg.set(id, cur);
    }
  }
  const topProducts = [...prodAgg.values()].sort((a, b) => b.revenue - a.revenue).slice(0, 8);

  // ---- new vs repeat buyers in range ----
  const phones = [...new Set(orders.map((o) => o.customerPhone).filter(Boolean))];
  let repeatCustomers = 0;
  if (phones.length) {
    const priorCounts = await prisma.order.groupBy({
      by: ["customerPhone"],
      where: { businessId, customerPhone: { in: phones }, createdAt: { lt: since } },
      _count: { _all: true },
    });
    const hadBefore = new Set(priorCounts.map((r) => r.customerPhone));
    repeatCustomers = phones.filter((p) => hadBefore.has(p)).length;
  }
  const newCustomers = phones.length - repeatCustomers;

  // ---- referrers ----
  const refAgg = new Map<string, number>();
  for (const [, host] of referrerByHit) {
    const source = host || "direct";
    refAgg.set(source, (refAgg.get(source) ?? 0) + 1);
  }
  const referrers = [...refAgg.entries()]
    .map(([source, sessions]) => ({ source, sessions }))
    .sort((a, b) => b.sessions - a.sessions)
    .slice(0, 6);

  return {
    rangeDays: days,
    visitors: visitorSessions,
    orders: orderCount,
    revenue,
    aov,
    conversionRate,
    funnel,
    series,
    topProducts,
    lowStock: lowStockList,
    newCustomers,
    repeatCustomers,
    referrers,
  };
}
