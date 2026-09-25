import { prisma } from "@/lib/prisma";

export interface FraudCheckInput {
  businessId: string;
  customerPhone: string;
  total: number;
  items: { qty: number }[];
}

export interface FraudCheckResult {
  flagged: boolean;
  reason: string | null;
}

const HIGH_QTY_THRESHOLD = 15;
const RAPID_ORDER_WINDOW_MINUTES = 15;
const RAPID_ORDER_COUNT = 2;
const OUTLIER_MULTIPLE = 4;
const OUTLIER_MIN_TOTAL = 3000; // don't flag small stores' normal variance on tiny order values

/**
 * Real-time order screening — every check here is a deterministic rule against real order
 * history, never an AI guess. Only flags when a rule actually matched; never invents a reason.
 */
export async function checkOrderForFraud(input: FraudCheckInput): Promise<FraudCheckResult> {
  const reasons: string[] = [];

  const maxQty = Math.max(0, ...input.items.map((i) => i.qty));
  if (maxQty > HIGH_QTY_THRESHOLD) {
    reasons.push(`unusually high quantity on one item (${maxQty} units)`);
  }

  const windowStart = new Date(Date.now() - RAPID_ORDER_WINDOW_MINUTES * 60 * 1000);
  const recentFromSamePhone = await prisma.order.count({
    where: { businessId: input.businessId, customerPhone: input.customerPhone, createdAt: { gte: windowStart } },
  });
  if (recentFromSamePhone >= RAPID_ORDER_COUNT) {
    reasons.push(`${recentFromSamePhone + 1} orders from this phone number within ${RAPID_ORDER_WINDOW_MINUTES} minutes`);
  }

  const recentOrders = await prisma.order.findMany({
    where: { businessId: input.businessId, status: { not: "cancelled" } },
    orderBy: { createdAt: "desc" },
    take: 30,
    select: { total: true },
  });
  if (recentOrders.length >= 5) {
    const avg = recentOrders.reduce((s, o) => s + o.total, 0) / recentOrders.length;
    if (avg > 0 && input.total >= OUTLIER_MIN_TOTAL && input.total > avg * OUTLIER_MULTIPLE) {
      reasons.push(`order total is ${(input.total / avg).toFixed(1)}x this store's recent average order value`);
    }
  }

  return { flagged: reasons.length > 0, reason: reasons.length > 0 ? reasons.join("; ") : null };
}
