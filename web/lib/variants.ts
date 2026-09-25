/**
 * Product variants — up to 2 option axes (e.g. Size, Color). Every purchasable combination is a
 * `ProductVariant` row with its own price + stock; the parent `Product.stock` is ignored when
 * `optionTypes` is set. Shared by the seller editor, the storefront, and checkout so the math is
 * identical everywhere.
 */

export interface OptionType {
  name: string; // "Size"
  values: string[]; // ["S", "M", "L"]
}

export interface VariantRow {
  id?: string;
  label: string; // "M / Black"
  options: Record<string, string>; // { Size: "M", Color: "Black" }
  sku?: string | null;
  price?: number | null; // null → parent product price
  stock: number;
  imageUrl?: string | null;
}

const MAX_AXES = 2;
const MAX_VALUES_PER_AXIS = 24;
const MAX_COMBOS = 100;

export function parseOptionTypes(json: string | null | undefined): OptionType[] {
  if (!json) return [];
  try {
    const raw = JSON.parse(json);
    if (!Array.isArray(raw)) return [];
    return raw
      .map((t): OptionType | null => {
        const name = String(t?.name ?? "").trim().slice(0, 40);
        const values: string[] = Array.isArray(t?.values)
          ? [...new Set((t.values as unknown[]).map((v) => String(v).trim()).filter(Boolean))].slice(0, MAX_VALUES_PER_AXIS)
          : [];
        return name && values.length ? { name, values } : null;
      })
      .filter((x): x is OptionType => x !== null)
      .slice(0, MAX_AXES);
  } catch {
    return [];
  }
}

export function hasVariants(optionTypes: OptionType[]): boolean {
  return optionTypes.length > 0 && optionTypes.every((t) => t.values.length > 0);
}

/** Build the human label for a combination, in option-type order. */
export function comboLabel(options: Record<string, string>, optionTypes: OptionType[]): string {
  return optionTypes.map((t) => options[t.name]).filter(Boolean).join(" / ");
}

/** Every combination of the given option types (capped). */
export function cartesian(optionTypes: OptionType[]): Record<string, string>[] {
  if (!hasVariants(optionTypes)) return [];
  let combos: Record<string, string>[] = [{}];
  for (const t of optionTypes) {
    const next: Record<string, string>[] = [];
    for (const c of combos) {
      for (const v of t.values) {
        next.push({ ...c, [t.name]: v });
        if (next.length >= MAX_COMBOS) break;
      }
    }
    combos = next;
  }
  return combos.slice(0, MAX_COMBOS);
}

/**
 * Reconcile an incoming variant list with the current option types: keep rows whose combination
 * still exists (carrying over id/price/stock/sku), add rows for new combinations at stock 0.
 */
export function reconcileVariants(optionTypes: OptionType[], incoming: VariantRow[]): VariantRow[] {
  if (!hasVariants(optionTypes)) return [];
  const byKey = new Map(incoming.map((v) => [comboKey(v.options), v]));
  return cartesian(optionTypes).map((options) => {
    const prev = byKey.get(comboKey(options));
    return {
      id: prev?.id,
      label: comboLabel(options, optionTypes),
      options,
      sku: prev?.sku ?? null,
      price: prev?.price ?? null,
      stock: Math.max(0, Math.floor(Number(prev?.stock) || 0)),
      imageUrl: prev?.imageUrl ?? null,
    };
  });
}

export function comboKey(options: Record<string, string>): string {
  return Object.keys(options)
    .sort()
    .map((k) => `${k}=${options[k]}`)
    .join("|");
}

export interface ResolvedPurchasable {
  price: number;
  stock: number;
  label: string | null;
  variantId: string | null;
}

/**
 * What a line item actually costs / how much stock it has. Works for both a plain product and a
 * specific variant. `variants` is the parent's variant rows (may be empty).
 */
export function resolvePurchasable(
  product: { price: number; stock?: number; optionTypes?: string | null },
  variants: { id: string; label: string; price: number | null; stock: number }[],
  variantId?: string | null,
): ResolvedPurchasable | { error: string } {
  const types = parseOptionTypes(product.optionTypes);
  if (hasVariants(types)) {
    if (!variantId) return { error: "Choose an option first." };
    const v = variants.find((x) => x.id === variantId);
    if (!v) return { error: "That option isn't available." };
    return { price: v.price ?? product.price, stock: v.stock, label: v.label, variantId: v.id };
  }
  return { price: product.price, stock: product.stock ?? 0, label: null, variantId: null };
}

/** Total sellable units for a product (sum of variant stock, or the plain product stock). */
export function totalStock(
  product: { stock: number; optionTypes?: string | null },
  variants: { stock: number }[],
): number {
  return hasVariants(parseOptionTypes(product.optionTypes))
    ? variants.reduce((s, v) => s + Math.max(0, v.stock), 0)
    : product.stock;
}
