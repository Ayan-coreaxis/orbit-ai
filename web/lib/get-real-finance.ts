import { prisma } from "@/lib/prisma";

export interface DailyRevenue {
  day: string;
  revenue: number;
}

export interface RealFinanceSummary {
  revenueLast7Days: number;
  ordersLast7Days: number;
  dailyRevenue: DailyRevenue[];
  /** Real gross profit — revenue minus real per-unit cost, only for order lines where a cost price is on file. */
  realGrossProfitLast7Days: number | null;
  /** Share of last-7-day revenue that came from order lines with a real cost price on file — tells you how trustworthy the margin number is. */
  costCoverageRatio: number;
}

const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export async function getRealFinance(businessId: string): Promise<RealFinanceSummary> {
  const since = new Date();
  since.setDate(since.getDate() - 6);
  since.setHours(0, 0, 0, 0);

  const [orders, products] = await Promise.all([
    prisma.order.findMany({
      where: { businessId, status: { not: "cancelled" }, createdAt: { gte: since } },
      select: { total: true, createdAt: true, items: true },
    }),
    prisma.product.findMany({ where: { businessId }, select: { id: true, costPrice: true } }),
  ]);
  const costByProductId = new Map(products.map((p) => [p.id, p.costPrice]));

  const buckets = new Map<string, number>();
  for (let i = 0; i < 7; i++) {
    const d = new Date(since);
    d.setDate(since.getDate() + i);
    buckets.set(d.toDateString(), 0);
  }

  let revenueWithKnownCost = 0;
  let realCogs = 0;
  let hasAnyKnownCost = false;

  for (const o of orders) {
    const key = o.createdAt.toDateString();
    if (buckets.has(key)) buckets.set(key, (buckets.get(key) ?? 0) + o.total);

    try {
      const items = JSON.parse(o.items) as { productId: string; price: number; qty: number }[];
      for (const item of items) {
        const costPrice = costByProductId.get(item.productId);
        if (costPrice !== undefined && costPrice !== null) {
          hasAnyKnownCost = true;
          revenueWithKnownCost += item.price * item.qty;
          realCogs += costPrice * item.qty;
        }
      }
    } catch {
      // malformed row — skip rather than guess
    }
  }

  const dailyRevenue: DailyRevenue[] = Array.from(buckets.entries()).map(([key, revenue]) => {
    const d = new Date(key);
    return { day: DAY_LABELS[d.getDay()], revenue };
  });

  const revenueLast7Days = orders.reduce((s, o) => s + o.total, 0);

  return {
    revenueLast7Days,
    ordersLast7Days: orders.length,
    dailyRevenue,
    realGrossProfitLast7Days: hasAnyKnownCost ? revenueWithKnownCost - realCogs : null,
    costCoverageRatio: revenueLast7Days > 0 ? revenueWithKnownCost / revenueLast7Days : 0,
  };
}
