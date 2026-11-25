import { prisma } from "@/lib/prisma";
import { money } from "@/lib/money";
import { totalStock } from "@/lib/variants";

/**
 * The problems a growth plan has to see, from the store's own records: parcels coming back, what
 * each product really sells and earns, best sellers running out, ads that spend without selling,
 * unhappy reviews, risky orders. Real numbers only; anything not on file is said to be missing.
 */
export interface BusinessHealth {
  orders30: number;
  delivered30: number;
  returned30: number;
  returnRatePct: number | null;
  cancelled30: number;
  flagged30: number;
  unconfirmedCod: number;
  grossProfit30: number | null;
  costCoveragePct: number;
  discounts30: number;
  products: { name: string; price: number; marginPct: number | null; sold30: number; revenue30: number; stock: number; daysOfStock: number | null }[];
  stockouts: string[];
  ads: { name: string; status: string; spend: number; purchases: number; value: number; currency: string }[];
  reviews: { count: number; average: number | null; low: { rating: number; comment: string }[] };
}

const DAY = 86_400_000;
const RETURNED = ["returned", "returning"];

export async function businessHealth(businessId: string): Promise<BusinessHealth> {
  const since = new Date(Date.now() - 30 * DAY);
  const [orders, products, ads, reviews, returnsAsked] = await Promise.all([
    prisma.order.findMany({ where: { businessId, createdAt: { gte: since } }, select: { status: true, courierStatus: true, items: true, flagged: true, verified: true, paymentProvider: true, discountAmount: true, total: true } }),
    prisma.product.findMany({ where: { businessId }, select: { id: true, name: true, price: true, costPrice: true, stock: true, optionTypes: true, variants: { select: { stock: true } } }, take: 200 }),
    prisma.adCampaign.findMany({ where: { businessId, status: { not: "deleted" } }, select: { name: true, status: true, spend: true, purchases: true, purchaseValue: true, currency: true }, take: 20 }),
    prisma.review.findMany({ where: { businessId, rating: { not: null }, respondedAt: { gte: since } }, select: { rating: true, comment: true }, orderBy: { respondedAt: "desc" }, take: 200 }),
    prisma.returnRequest.count({ where: { businessId, createdAt: { gte: since } } }),
  ]);

  const sold = new Map<string, { qty: number; revenue: number }>();
  let revenueKnown = 0;
  let revenueAll = 0;
  let cogs = 0;
  const cost = new Map(products.map((p) => [p.id, p.costPrice]));
  for (const o of orders) {
    if (o.status === "cancelled" || RETURNED.includes(o.courierStatus ?? "")) continue;
    let items: { productId?: string; price?: number; qty?: number }[] = [];
    try {
      items = JSON.parse(o.items);
    } catch {
      items = [];
    }
    for (const it of items) {
      if (!it.productId) continue;
      const q = Number(it.qty) || 0;
      const line = (Number(it.price) || 0) * q;
      const s = sold.get(it.productId) ?? { qty: 0, revenue: 0 };
      sold.set(it.productId, { qty: s.qty + q, revenue: s.revenue + line });
      revenueAll += line;
      const c = cost.get(it.productId);
      if (c != null) {
        revenueKnown += line;
        cogs += c * q;
      }
    }
  }

  const delivered30 = orders.filter((o) => o.status === "fulfilled" || o.courierStatus === "delivered").length;
  const returned30 = Math.max(orders.filter((o) => RETURNED.includes(o.courierStatus ?? "")).length, 0) + returnsAsked;
  const shipped = delivered30 + returned30;
  const rows = products
    .map((p) => {
      const s = sold.get(p.id) ?? { qty: 0, revenue: 0 };
      const stock = totalStock(p, p.variants);
      return {
        name: p.name,
        price: p.price,
        marginPct: p.costPrice != null && p.price > 0 ? Math.round(((p.price - p.costPrice) / p.price) * 100) : null,
        sold30: s.qty,
        revenue30: Math.round(s.revenue),
        stock,
        daysOfStock: s.qty > 0 ? Math.round((stock / s.qty) * 30) : null,
      };
    })
    .sort((a, b) => b.revenue30 - a.revenue30);
  const topSellers = rows.filter((r) => r.sold30 > 0).slice(0, 5);
  const rated = reviews.filter((r) => r.rating != null);

  return {
    orders30: orders.length,
    delivered30,
    returned30,
    returnRatePct: shipped >= 5 ? Math.round((returned30 / shipped) * 100) : null,
    cancelled30: orders.filter((o) => o.status === "cancelled").length,
    flagged30: orders.filter((o) => o.flagged).length,
    unconfirmedCod: orders.filter((o) => o.paymentProvider === "cod" && !o.verified && o.status !== "cancelled").length,
    grossProfit30: revenueKnown > 0 ? Math.round(revenueKnown - cogs) : null,
    costCoveragePct: revenueAll > 0 ? Math.round((revenueKnown / revenueAll) * 100) : 0,
    discounts30: Math.round(orders.reduce((s, o) => s + (o.status === "cancelled" ? 0 : o.discountAmount), 0)),
    products: rows.slice(0, 25),
    stockouts: topSellers.filter((r) => r.stock <= 0 || (r.daysOfStock != null && r.daysOfStock < 7)).map((r) => `${r.name} (${r.stock <= 0 ? "sold out" : `${r.stock} left, about ${r.daysOfStock} days`})`),
    ads: ads.map((a) => ({ name: a.name, status: a.status, spend: Math.round(a.spend ?? 0), purchases: a.purchases ?? 0, value: Math.round(a.purchaseValue ?? 0), currency: a.currency ?? "" })),
    reviews: {
      count: rated.length,
      average: rated.length ? Math.round((rated.reduce((s, r) => s + (r.rating ?? 0), 0) / rated.length) * 10) / 10 : null,
      low: rated.filter((r) => (r.rating ?? 5) <= 2).slice(0, 5).map((r) => ({ rating: r.rating!, comment: (r.comment ?? "").slice(0, 160) })),
    },
  };
}

/** The same, as plain lines for a model. */
export function businessHealthText(h: BusinessHealth, currency: string): string {
  const m = (n: number) => money(n, currency);
  const lines = [
    `DELIVERY (30d): ${h.delivered30} delivered, ${h.returned30} returned or refused${h.returnRatePct != null ? ` — return rate ${h.returnRatePct}%` : ""}; ${h.cancelled30} cancelled; ${h.unconfirmedCod} cash-on-delivery orders not confirmed by the shopper; ${h.flagged30} flagged as risky.`,
    h.grossProfit30 != null
      ? `GROSS PROFIT (30d, products with a cost price, ${h.costCoveragePct}% of sales): ${m(h.grossProfit30)} before delivery, ads and returns. Discounts given: ${m(h.discounts30)}.`
      : `GROSS PROFIT: unknown — no cost prices on file. Discounts given (30d): ${m(h.discounts30)}.`,
    `PRODUCTS BY SALES (30d): ${h.products.length ? h.products.slice(0, 12).map((p) => `${p.name}: ${p.sold30} sold, ${m(p.revenue30)}, margin ${p.marginPct ?? "?"}%, stock ${p.stock}${p.daysOfStock != null ? ` (~${p.daysOfStock} days)` : ""}`).join("; ") : "none"}.`,
  ];
  if (h.stockouts.length) lines.push(`BEST SELLERS RUNNING OUT: ${h.stockouts.join(", ")}.`);
  const unsold = h.products.filter((p) => p.sold30 === 0 && p.stock > 20);
  if (unsold.length) lines.push(`STOCK NOT MOVING (0 sold in 30 days): ${unsold.slice(0, 8).map((p) => `${p.name} (${p.stock})`).join(", ")}.`);
  lines.push(
    h.ads.length
      ? `ADS: ${h.ads.map((a) => `${a.name} [${a.status}] spent ${a.spend} ${a.currency}, ${a.purchases} purchases${a.value ? ` worth ${a.value}` : ""}${a.spend > 0 && a.purchases === 0 ? " — SPENDING WITHOUT SALES" : ""}`).join("; ")}.`
      : "ADS: none running through Orbit.",
  );
  lines.push(
    h.reviews.count
      ? `REVIEWS (30d): ${h.reviews.count}, average ${h.reviews.average}/5${h.reviews.low.length ? `; low ones: ${h.reviews.low.map((r) => `${r.rating}★ "${r.comment}"`).join(" | ")}` : ""}.`
      : "REVIEWS (30d): none.",
  );
  return lines.join("\n");
}
