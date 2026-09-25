import { prisma } from "@/lib/prisma";
import {
  parseOptionTypes,
  hasVariants,
  reconcileVariants,
  comboKey,
  type OptionType,
  type VariantRow,
} from "@/lib/variants";

interface Incoming {
  optionTypes?: unknown;
  variants?: unknown;
}

/**
 * Persists a product's option axes + variant grid. Server-authoritative: the option types are
 * normalized, the variant grid is regenerated from them (`reconcileVariants`), reserved / bad
 * data is dropped, and rows for combinations that no longer exist are deleted.
 * Returns the `optionTypes` JSON string (or null) to write onto the Product row.
 */
export async function saveProductVariants(productId: string, body: Incoming): Promise<string | null> {
  const rawTypes: OptionType[] = parseOptionTypes(
    typeof body.optionTypes === "string" ? body.optionTypes : JSON.stringify(body.optionTypes ?? []),
  );

  if (!hasVariants(rawTypes)) {
    await prisma.productVariant.deleteMany({ where: { productId } });
    return null;
  }

  const incoming: VariantRow[] = Array.isArray(body.variants)
    ? body.variants.map((v: Record<string, unknown>) => ({
        id: typeof v.id === "string" ? v.id : undefined,
        label: "",
        options: (v.options && typeof v.options === "object" ? v.options : {}) as Record<string, string>,
        sku: typeof v.sku === "string" ? v.sku.slice(0, 60) : null,
        price: v.price === null || v.price === undefined || v.price === "" ? null : Number(v.price),
        stock: Math.max(0, Math.floor(Number(v.stock) || 0)),
        imageUrl: typeof v.imageUrl === "string" ? v.imageUrl.trim().slice(0, 500) : null,
      }))
    : [];

  const grid = reconcileVariants(rawTypes, incoming);
  const wantKeys = new Set(grid.map((g) => comboKey(g.options)));

  const existing = await prisma.productVariant.findMany({ where: { productId }, select: { id: true, options: true } });
  const existingByKey = new Map<string, string>();
  for (const e of existing) {
    try {
      existingByKey.set(comboKey(JSON.parse(e.options)), e.id);
    } catch {
      /* ignore */
    }
  }

  // delete combinations that no longer exist
  const staleIds = existing
    .filter((e) => {
      try {
        return !wantKeys.has(comboKey(JSON.parse(e.options)));
      } catch {
        return true;
      }
    })
    .map((e) => e.id);
  if (staleIds.length) await prisma.productVariant.deleteMany({ where: { id: { in: staleIds } } });

  // upsert the rest
  await prisma.$transaction(
    grid.map((g) => {
      const id = existingByKey.get(comboKey(g.options));
      const data = {
        label: g.label,
        options: JSON.stringify(g.options),
        sku: g.sku ?? null,
        price: g.price != null && Number.isFinite(g.price) && g.price >= 0 ? g.price : null,
        stock: g.stock,
        imageUrl: g.imageUrl ?? null,
      };
      return id
        ? prisma.productVariant.update({ where: { id }, data })
        : prisma.productVariant.create({ data: { ...data, productId } });
    }),
  );

  return JSON.stringify(rawTypes);
}
