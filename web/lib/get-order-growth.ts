import { prisma } from "@/lib/prisma";

export interface OrderGrowth {
  thisWeekOrders: number;
  lastWeekOrders: number;
  thisWeekRevenue: number;
  lastWeekRevenue: number;
  /** null when there's no real last-week baseline to compare against — never fabricated as 0% or "flat". */
  orderGrowthPct: number | null;
}

/** Real week-over-week order count and revenue — straight from actual `Order` rows, no estimation. */
export async function getOrderGrowth(businessId: string): Promise<OrderGrowth> {
  const now = new Date();
  const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const twoWeeksAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);

  const [thisWeek, lastWeek] = await Promise.all([
    prisma.order.findMany({
      where: { businessId, createdAt: { gte: weekAgo }, status: { not: "cancelled" }, verified: true },
      select: { total: true },
    }),
    prisma.order.findMany({
      where: { businessId, createdAt: { gte: twoWeeksAgo, lt: weekAgo }, status: { not: "cancelled" }, verified: true },
      select: { total: true },
    }),
  ]);

  const thisWeekOrders = thisWeek.length;
  const lastWeekOrders = lastWeek.length;
  const thisWeekRevenue = thisWeek.reduce((s, o) => s + o.total, 0);
  const lastWeekRevenue = lastWeek.reduce((s, o) => s + o.total, 0);

  return {
    thisWeekOrders,
    lastWeekOrders,
    thisWeekRevenue,
    lastWeekRevenue,
    orderGrowthPct: lastWeekOrders > 0 ? ((thisWeekOrders - lastWeekOrders) / lastWeekOrders) * 100 : null,
  };
}
