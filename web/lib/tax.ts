import { prisma } from "@/lib/prisma";

export interface TaxSummary {
  taxRatePercent: number | null;
  revenueThisMonth: number;
  revenueLastMonth: number;
  taxOwedThisMonth: number | null;
  taxOwedLastMonth: number | null;
}

function startOfMonth(offset = 0): Date {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth() + offset, 1);
}

/** Real tax owed = real order revenue × the real rate the seller entered. Never a fabricated jurisdiction rule. */
export async function getTaxSummary(businessId: string): Promise<TaxSummary> {
  const business = await prisma.business.findUnique({ where: { id: businessId }, select: { taxRatePercent: true } });
  const rate = business?.taxRatePercent ?? null;

  const [thisMonthOrders, lastMonthOrders] = await Promise.all([
    prisma.order.findMany({
      where: { businessId, status: { not: "cancelled" }, createdAt: { gte: startOfMonth(0) } },
      select: { total: true },
    }),
    prisma.order.findMany({
      where: { businessId, status: { not: "cancelled" }, createdAt: { gte: startOfMonth(-1), lt: startOfMonth(0) } },
      select: { total: true },
    }),
  ]);

  const revenueThisMonth = thisMonthOrders.reduce((s, o) => s + o.total, 0);
  const revenueLastMonth = lastMonthOrders.reduce((s, o) => s + o.total, 0);

  return {
    taxRatePercent: rate,
    revenueThisMonth,
    revenueLastMonth,
    taxOwedThisMonth: rate !== null ? revenueThisMonth * (rate / 100) : null,
    taxOwedLastMonth: rate !== null ? revenueLastMonth * (rate / 100) : null,
  };
}
