import { prisma } from "@/lib/prisma";

export interface ProductInventorySignal {
  productId: string;
  name: string;
  stock: number;
  unitsSoldLast30d: number;
  daysOfStockLeft: number | null; // null = no real sales velocity yet to estimate from
}

/**
 * Real stock + real sales-velocity per product, computed from actual Order rows — never
 * estimated or invented. `daysOfStockLeft` is only set when there's real recent sales history
 * to divide by; otherwise it's honestly null rather than a guessed number.
 */
export async function getInventorySignals(businessId: string): Promise<ProductInventorySignal[]> {
  const [products, recentOrders] = await Promise.all([
    prisma.product.findMany({ where: { businessId }, select: { id: true, name: true, stock: true } }),
    prisma.order.findMany({
      where: { businessId, status: { not: "cancelled" }, createdAt: { gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) } },
      select: { items: true },
    }),
  ]);

  const soldByProduct = new Map<string, number>();
  for (const order of recentOrders) {
    try {
      const items = JSON.parse(order.items) as { productId: string; qty: number }[];
      for (const item of items) {
        soldByProduct.set(item.productId, (soldByProduct.get(item.productId) ?? 0) + item.qty);
      }
    } catch {
      // skip malformed rows rather than fabricate a count
    }
  }

  return products.map((p) => {
    const unitsSoldLast30d = soldByProduct.get(p.id) ?? 0;
    const dailyRate = unitsSoldLast30d / 30;
    return {
      productId: p.id,
      name: p.name,
      stock: p.stock,
      unitsSoldLast30d,
      daysOfStockLeft: dailyRate > 0 ? Math.round(p.stock / dailyRate) : null,
    };
  });
}
