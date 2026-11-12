import type { StorefrontProduct } from "@/lib/orbit-design";
import { parseOptionTypes, hasVariants } from "@/lib/variants";

type ProductWithVariants = {
  id: string;
  name: string;
  price: number;
  imageUrl: string | null;
  description: string | null;
  stock: number;
  optionTypes: string | null;
  category?: { name: string } | null;
  variants: { price: number | null; stock: number }[];
};

/** Map DB products (with variants + category included) to the shape the storefront renderer expects. */
export function toStorefrontProducts(products: ProductWithVariants[]): StorefrontProduct[] {
  return products.map((p) => {
    const category = p.category?.name ?? null;
    const optionTypes = parseOptionTypes(p.optionTypes);
    // option axes drive the shop's attribute filters even before per-combination variant rows exist
    const options = hasVariants(optionTypes) ? Object.fromEntries(optionTypes.map((t) => [t.name, t.values])) : undefined;
    const withVariantRows = hasVariants(optionTypes) && p.variants.length > 0;
    if (!withVariantRows) {
      return { id: p.id, name: p.name, category, price: p.price, imageUrl: p.imageUrl, description: p.description, stock: p.stock, options };
    }
    const prices = p.variants.map((v) => v.price ?? p.price);
    return {
      id: p.id,
      name: p.name,
      category,
      price: p.price,
      imageUrl: p.imageUrl,
      description: p.description,
      stock: p.variants.reduce((s, v) => s + Math.max(0, v.stock), 0),
      hasVariants: true,
      fromPrice: prices.length ? Math.min(...prices) : p.price,
      maxPrice: prices.length ? Math.max(...prices) : p.price,
      options,
    };
  });
}

/**
 * Attach real 90-day unit sales to storefront products, so "bestsellers" rails rank by what really
 * sold. One query per page render, cancelled orders excluded.
 */
export async function withSales<T extends { id: string; sold?: number }>(businessId: string, products: T[]): Promise<T[]> {
  if (!products.length) return products;
  const { prisma } = await import("@/lib/prisma");
  const orders = await prisma.order.findMany({
    where: { businessId, status: { not: "cancelled" }, createdAt: { gte: new Date(Date.now() - 90 * 86_400_000) } },
    select: { items: true },
    take: 3000,
  });
  const sold = new Map<string, number>();
  for (const o of orders) {
    try {
      for (const it of JSON.parse(o.items) as { productId?: string; qty?: number }[]) {
        if (it?.productId) sold.set(it.productId, (sold.get(it.productId) ?? 0) + (Number(it.qty) || 0));
      }
    } catch {
      /* skip a malformed row */
    }
  }
  return products.map((p) => ({ ...p, sold: sold.get(p.id) ?? 0 }));
}
