import { prisma } from "@/lib/prisma";

/**
 * A lightweight, honest risk screen run at checkout — it only ever *flags* an order for the
 * seller's attention, it never blocks a sale or fabricates a reason. Every rule is a real signal
 * from real data (past cancellations, order history, cart shape, an explicit blocklist).
 */

export interface FraudResult {
  flagged: boolean;
  reason: string | null;
}

interface ScreenInput {
  customerPhone: string;
  customerId?: string | null;
  subtotal: number;
  items: { qty: number }[];
}

export async function screenOrder(businessId: string, input: ScreenInput): Promise<FraudResult> {
  const phone = (input.customerPhone || "").replace(/\s/g, "");
  const reasons: string[] = [];

  const business = await prisma.business.findUnique({
    where: { id: businessId },
    select: { fraudBlocklist: true },
  });

  // 1. explicit seller blocklist
  if (business?.fraudBlocklist) {
    try {
      const list = (JSON.parse(business.fraudBlocklist) as string[]).map((p) => p.replace(/\s/g, ""));
      if (phone && list.some((p) => p && (phone.endsWith(p.slice(-10)) || p.endsWith(phone.slice(-10)))))
        reasons.push("Phone is on your blocklist");
    } catch {
      /* ignore */
    }
  }

  // 2. history for this phone
  if (phone) {
    const [cancelled, delivered, total] = await Promise.all([
      prisma.order.count({ where: { businessId, customerPhone: phone, status: "cancelled" } }),
      prisma.order.count({ where: { businessId, customerPhone: phone, status: "fulfilled" } }),
      prisma.order.count({ where: { businessId, customerPhone: phone } }),
    ]);
    if (cancelled >= 2 && cancelled > delivered) reasons.push(`${cancelled} past orders from this phone were cancelled`);

    // 3. large first order — no delivered history and this order is well above the store's average
    if (total === 0 && delivered === 0) {
      const recent = await prisma.order.findMany({
        where: { businessId, status: { not: "cancelled" } },
        select: { total: true },
        orderBy: { createdAt: "desc" },
        take: 20,
      });
      if (recent.length >= 3) {
        const avg = recent.reduce((s, o) => s + o.total, 0) / recent.length;
        if (input.subtotal > avg * 3 && input.subtotal > 0) reasons.push("First order, and much larger than your typical order");
      }
    }
  }

  // 4. bulk quantity on a single line
  if (input.items.some((i) => (Number(i.qty) || 0) >= 10)) reasons.push("10+ units of a single item");

  return { flagged: reasons.length > 0, reason: reasons.length ? reasons.join(" · ") : null };
}
