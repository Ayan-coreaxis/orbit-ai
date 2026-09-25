import { prisma } from "@/lib/prisma";

export interface RelatedProduct {
  id: string;
  name: string;
  price: number;
  imageUrl: string | null;
  coViewCount: number;
}

/**
 * Real "customers who viewed this also viewed" — computed from actual StoreEvent co-occurrence
 * (same real visitor session viewed both products), never a guessed or hardcoded pairing.
 */
export async function getRelatedProducts(businessId: string, productId: string, limit = 4): Promise<RelatedProduct[]> {
  const sessionsForProduct = await prisma.storeEvent.findMany({
    where: { businessId, type: "view_product", productId },
    select: { sessionId: true },
    distinct: ["sessionId"],
  });
  const sessionIds = sessionsForProduct.map((s) => s.sessionId);
  if (sessionIds.length === 0) return [];

  const coEvents = await prisma.storeEvent.findMany({
    where: {
      businessId,
      type: "view_product",
      sessionId: { in: sessionIds },
      productId: { not: productId },
    },
    select: { productId: true, sessionId: true },
  });

  const countByProduct = new Map<string, Set<string>>();
  for (const e of coEvents) {
    if (!e.productId) continue;
    const set = countByProduct.get(e.productId) ?? new Set<string>();
    set.add(e.sessionId);
    countByProduct.set(e.productId, set);
  }
  if (countByProduct.size === 0) return [];

  const ranked = Array.from(countByProduct.entries())
    .sort((a, b) => b[1].size - a[1].size)
    .slice(0, limit);

  const products = await prisma.product.findMany({
    where: { id: { in: ranked.map(([id]) => id) }, businessId },
    select: { id: true, name: true, price: true, imageUrl: true },
  });

  return ranked
    .map(([id, sessions]) => {
      const p = products.find((pr) => pr.id === id);
      return p ? { id: p.id, name: p.name, price: p.price, imageUrl: p.imageUrl, coViewCount: sessions.size } : null;
    })
    .filter((x): x is RelatedProduct => x !== null);
}
