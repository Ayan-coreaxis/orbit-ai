import { prisma } from "@/lib/prisma";
import { money } from "@/lib/money";
import { resolveMediaRef } from "@/lib/media";
import { saveProductVariants } from "@/lib/product-variants-save";
import { comboKey, parseOptionTypes } from "@/lib/variants";

/**
 * Product work the Orchestrator may propose from the chat: edit existing products (price, cost,
 * stock, name, description, photos, size/colour variants), add new products, and delete products.
 * Every change is a proposal the owner must Apply — it changes what real customers see and pay.
 * Products are referred to as P1, P2… in the order listed in the prompt; proposals store real
 * product ids so a later reorder can't hit the wrong product. Deleting never touches past orders
 * (they keep their own snapshot of each item).
 */

type OptionAxis = { name: string; values: string[] };
type VariantIn = { options: Record<string, string>; price?: number | null; stock: number };

export type ProductUpdate = {
  op: "product_update";
  productId: string;
  price?: number;
  costPrice?: number | null;
  stock?: number;
  name?: string;
  description?: string;
  imageUrl?: string; // main photo, from the media library
  addGalleryUrl?: string; // extra photo appended to the product gallery
  optionTypes?: OptionAxis[]; // set/replace the size/colour options ([] removes variants)
  variants?: VariantIn[]; // per-combination price/stock
};
export type ProductCreate = {
  op: "product_create";
  name: string;
  price: number;
  costPrice: number | null;
  stock: number;
  description: string | null;
  imageUrl: string | null;
  galleryUrls: string[];
  optionTypes: OptionAxis[];
  variants: VariantIn[];
};
export type ProductDelete = { op: "product_delete"; productId: string; name: string };
export type ProductChange = ProductUpdate | ProductCreate | ProductDelete;

const OPTIONS_SCHEMA = {
  type: "array",
  description: "Variant axes, max 2, e.g. [{name:'Size', values:['S','M','L']}, {name:'Flavor', values:['BBQ','Cheese']}]. [] removes variants.",
  items: { type: "object", properties: { name: { type: "string" }, values: { type: "array", items: { type: "string" } } }, required: ["name", "values"] },
} as const;
const VARIANTS_SCHEMA = {
  type: "array",
  description: "Price/stock per combination, e.g. [{options:{Size:'M', Flavor:'BBQ'}, price: 300, stock: 20}]. Price omitted/null = product price. Combinations not listed get stock 0.",
  items: {
    type: "object",
    properties: { options: { type: "object" }, price: { type: ["number", "null"] }, stock: { type: "integer" } },
    required: ["options"],
  },
} as const;

export const PRODUCT_CHANGES_SCHEMA = {
  type: "array",
  description:
    "Edits to EXISTING products (see PRODUCTS below). Only when the owner asked for it or agreed. Each is shown as a proposal with an Apply button — say \"press Apply\", never that it's done. Never invent a price or cost the owner didn't give you or agree to.",
  items: {
    type: "object",
    properties: {
      ref: { type: "string", description: "Product ref from the PRODUCTS list, e.g. 'P3'. Use 'ALL' only when the owner asked for the same change on every product." },
      price: { type: "number", description: "New selling price, in the store currency." },
      cost_price: { type: ["number", "null"], description: "What one unit costs the owner, in the store currency." },
      stock: { type: "integer", description: "Units in stock (products without variants only)." },
      name: { type: "string" },
      description: { type: "string", description: "Plain text; replaces the current description." },
      image: { type: "string", description: "Media ref of an IMAGE from the MEDIA LIBRARY (e.g. 'M2') to use as the product's main photo." },
      add_to_gallery: { type: "string", description: "Media ref of an IMAGE to add as an extra product photo." },
      options: OPTIONS_SCHEMA,
      variants: VARIANTS_SCHEMA,
    },
    required: ["ref"],
  },
} as const;

export const NEW_PRODUCTS_SCHEMA = {
  type: "array",
  description:
    "NEW products to add to the store. Only when the owner asked. Name, price and anything factual (ingredients, sizes, weight, stock) must come from the owner, their photos/PDFs, or their website — never invented. You may write the description from those facts. When a catalog gives several pack prices (single / pack of 6), use variants. Shown as a proposal with Apply — keep your reply short, the proposal box lists every product.",
  items: {
    type: "object",
    properties: {
      name: { type: "string" },
      price: { type: "number", description: "Selling price in the store currency." },
      cost_price: { type: ["number", "null"] },
      stock: { type: "integer", description: "Units in stock — ONLY if the owner told you. Never guess; leave it out and the owner sets it (it starts at 0)." },
      description: { type: "string" },
      image: { type: "string", description: "Media ref of the main photo, e.g. 'M1'." },
      gallery: { type: "array", items: { type: "string" }, description: "More media refs of photos." },
      options: OPTIONS_SCHEMA,
      variants: VARIANTS_SCHEMA,
    },
    required: ["name", "price"],
  },
} as const;

export const DELETE_PRODUCTS_SCHEMA = {
  type: "array",
  items: { type: "string" },
  description:
    "Refs of products to DELETE from the store (e.g. ['P4']). Only when the owner clearly asked to delete/remove them — if they might just want it hidden or out of stock, ask first. Past orders are kept. Shown as a proposal with Apply.",
} as const;

const MAX_LISTED = 80;

export async function listProducts(businessId: string) {
  return prisma.product.findMany({
    where: { businessId },
    orderBy: { createdAt: "asc" },
    take: MAX_LISTED,
    select: {
      id: true,
      name: true,
      price: true,
      costPrice: true,
      stock: true,
      imageUrl: true,
      optionTypes: true,
      variants: { select: { label: true, price: true, stock: true }, orderBy: { createdAt: "asc" } },
      _count: { select: { bundleItems: true } },
    },
  });
}

/** The PRODUCTS section of the Orchestrator's prompt (refs P1, P2… map to this order). */
export async function productsContext(businessId: string, currency: string): Promise<string> {
  const products = await listProducts(businessId);
  const rows = products.map((p, i) => {
    const cost = p.costPrice != null ? `, cost ${money(p.costPrice, currency)}` : ", cost not set";
    const axes = parseOptionTypes(p.optionTypes);
    const stock = p.variants.length
      ? `, options ${axes.map((a) => `${a.name}: ${a.values.join("/")}`).join("; ")} — variants: ${p.variants
          .slice(0, 12)
          .map((v) => `${v.label} ${v.price != null ? money(v.price, currency) : "base price"} stock ${v.stock}`)
          .join(", ")}${p.variants.length > 12 ? ", …" : ""}`
      : `, stock ${p.stock}`;
    return `P${i + 1} ${p.name} — price ${money(p.price, currency)}${cost}${stock}${p.imageUrl ? "" : ", NO PHOTO"}${p._count.bundleItems ? ", part of a bundle" : ""}`;
  });
  return `
PRODUCTS (you CAN propose: edits with product_changes — price, cost_price, stock, name, description, photos from the MEDIA LIBRARY, size/colour/flavour variants; new products with new_products; deletions with delete_products. The owner presses Apply for each proposal.)
${rows.length ? rows.join("\n") : "none yet"}${products.length === MAX_LISTED ? `\n(only the first ${MAX_LISTED} are listed)` : ""}`;
}

const posNum = (v: unknown): number | undefined => (typeof v === "number" && Number.isFinite(v) && v >= 0 ? v : undefined);

function cleanAxes(raw: unknown): OptionAxis[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  return parseOptionTypes(JSON.stringify(raw));
}

function cleanVariants(raw: unknown): VariantIn[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  return raw.flatMap((v): VariantIn[] => {
    if (!v || typeof v !== "object") return [];
    const o = v as { options?: unknown; price?: unknown; stock?: unknown };
    if (!o.options || typeof o.options !== "object") return [];
    const options = Object.fromEntries(Object.entries(o.options as Record<string, unknown>).map(([k, x]) => [String(k).trim(), String(x).trim()]));
    return [{ options, price: o.price === null ? null : (posNum(o.price) ?? null), stock: Math.max(0, Math.floor(Number(o.stock) || 0)) }];
  }).slice(0, 100);
}

async function mediaUrl(businessId: string, ref: unknown): Promise<string | null> {
  if (typeof ref !== "string" || !ref.trim()) return null;
  const m = await resolveMediaRef(businessId, ref);
  return m?.kind === "image" ? m.url : null;
}

/** Model output → real, validated changes pinned to product ids. */
export async function sanitizeProductChanges(businessId: string, edits: unknown, adds?: unknown, deletes?: unknown): Promise<ProductChange[]> {
  const products = await listProducts(businessId);
  const byRef = (ref: string) => products[Number(ref.replace(/\D/g, "")) - 1];
  const out: ProductChange[] = [];
  const deleting = new Set<string>();

  for (const ref of Array.isArray(deletes) ? deletes : []) {
    if (typeof ref !== "string") continue;
    const p = byRef(ref);
    if (p && !deleting.has(p.id)) {
      deleting.add(p.id);
      out.push({ op: "product_delete", productId: p.id, name: p.name });
    }
  }

  for (const o of Array.isArray(edits) ? edits : []) {
    if (!o || typeof o !== "object") continue;
    const r = o as Record<string, unknown>;
    const ref = typeof r.ref === "string" ? r.ref.trim().toUpperCase() : "";
    const targets = ref === "ALL" ? products : [byRef(ref)].filter(Boolean);
    for (const p of targets) {
      if (deleting.has(p.id)) continue;
      const c: ProductUpdate = { op: "product_update", productId: p.id };
      const price = posNum(r.price);
      if (price != null && price > 0 && price !== p.price) c.price = price;
      if (r.cost_price === null) c.costPrice = null;
      else if (posNum(r.cost_price) != null) c.costPrice = posNum(r.cost_price);
      if (!p.variants.length && Number.isInteger(r.stock) && (r.stock as number) >= 0) c.stock = r.stock as number;
      if (typeof r.name === "string" && r.name.trim() && r.name.trim() !== p.name) c.name = r.name.trim().slice(0, 120);
      if (typeof r.description === "string" && r.description.trim()) c.description = r.description.trim().slice(0, 4000);
      if (c.costPrice !== undefined && c.costPrice === p.costPrice) delete c.costPrice;
      if (c.stock !== undefined && c.stock === p.stock) delete c.stock;
      const img = await mediaUrl(businessId, r.image);
      if (img) c.imageUrl = img;
      const gal = await mediaUrl(businessId, r.add_to_gallery);
      if (gal) c.addGalleryUrl = gal;
      const axes = cleanAxes(r.options);
      const variants = cleanVariants(r.variants);
      if (axes) c.optionTypes = axes;
      if (variants?.length) c.variants = variants;
      if (Object.keys(c).length > 2) out.push(c);
    }
  }

  for (const o of Array.isArray(adds) ? adds.slice(0, 50) : []) {
    if (!o || typeof o !== "object") continue;
    const r = o as Record<string, unknown>;
    const name = typeof r.name === "string" ? r.name.trim().slice(0, 140) : "";
    const price = posNum(r.price);
    if (!name || price == null) continue;
    const gallery: string[] = [];
    for (const g of Array.isArray(r.gallery) ? r.gallery.slice(0, 8) : []) {
      const u = await mediaUrl(businessId, g);
      if (u) gallery.push(u);
    }
    out.push({
      op: "product_create",
      name,
      price,
      costPrice: posNum(r.cost_price) ?? null,
      stock: Math.max(0, Math.floor(Number(r.stock) || 0)),
      description: typeof r.description === "string" && r.description.trim() ? r.description.trim().slice(0, 4000) : null,
      imageUrl: await mediaUrl(businessId, r.image),
      galleryUrls: gallery,
      optionTypes: cleanAxes(r.options) ?? [],
      variants: cleanVariants(r.variants) ?? [],
    });
  }
  return out;
}

export function sanitizeStoredProductChanges(raw: unknown[]): ProductChange[] {
  return raw.filter((o): o is ProductChange => {
    if (!o || typeof o !== "object") return false;
    const c = o as ProductChange;
    if (c.op === "product_create") return typeof c.name === "string" && typeof c.price === "number";
    return (c.op === "product_update" || c.op === "product_delete") && typeof c.productId === "string";
  });
}

const axesText = (axes: OptionAxis[]) => axes.map((a) => `${a.name} ${a.values.join("/")}`).join(", ");

export async function describeProductChanges(businessId: string, changes: ProductChange[], currency: string): Promise<string[]> {
  if (!changes.length) return [];
  const ids = changes.filter((c): c is ProductUpdate | ProductDelete => c.op !== "product_create").map((c) => c.productId);
  const products = await prisma.product.findMany({
    where: { businessId, id: { in: ids } },
    select: { id: true, name: true, price: true, costPrice: true, stock: true, _count: { select: { bundleItems: true, variants: true } } },
  });
  const byId = new Map(products.map((p) => [p.id, p]));
  const lossNote = (price: number, cost: number | null | undefined) => (cost != null && price > 0 && price < cost ? " ⚠ sells below cost" : "");

  return changes.flatMap((c) => {
    if (c.op === "product_create") {
      const bits = [
        money(c.price, currency),
        c.costPrice != null ? `cost ${money(c.costPrice, currency)}` : null,
        c.optionTypes.length ? `${c.optionTypes.reduce((n, a) => n * a.values.length, 1)} variants (${axesText(c.optionTypes)})` : `stock ${c.stock}`,
        ...c.variants
          .filter((v) => v.price != null && v.price !== c.price)
          .slice(0, 6)
          .map((v) => `${Object.values(v.options).join(" / ")} ${money(v.price!, currency)}`),
        c.imageUrl ? "with photo" : "no photo",
      ].filter(Boolean);
      return [`New product: ${c.name} — ${bits.join(", ")}${lossNote(c.price, c.costPrice)}`];
    }
    const p = byId.get(c.productId);
    if (!p) return [];
    if (c.op === "product_delete") {
      return [`Delete: ${p.name}${p._count.variants ? ` (and its ${p._count.variants} variants)` : ""}${p._count.bundleItems ? " ⚠ it's in a bundle — the bundle loses this item" : ""} — past orders are kept`];
    }
    const parts: string[] = [];
    if (c.price != null) parts.push(`price ${money(p.price, currency)} → ${money(c.price, currency)}`);
    if (c.costPrice !== undefined) parts.push(c.costPrice == null ? "clear cost" : `cost → ${money(c.costPrice, currency)}`);
    if (c.stock != null) parts.push(`stock ${p.stock} → ${c.stock}`);
    if (c.name) parts.push(`rename to "${c.name}"`);
    if (c.description) parts.push("new description");
    if (c.imageUrl) parts.push("new main photo");
    if (c.addGalleryUrl) parts.push("add a gallery photo");
    if (c.optionTypes) parts.push(c.optionTypes.length ? `options → ${axesText(c.optionTypes)}` : "remove variants");
    if (c.variants?.length) parts.push(`${c.variants.length} variant price/stock updates`);
    return [`${p.name}: ${parts.join(", ")}${lossNote(c.price ?? p.price, c.costPrice !== undefined ? c.costPrice : p.costPrice)}`];
  });
}

export async function applyProductChanges(businessId: string, changes: ProductChange[], currency: string): Promise<string[]> {
  if (!changes.length) return [];
  const summary = await describeProductChanges(businessId, changes, currency);
  for (const c of changes) {
    if (c.op === "product_delete") {
      await prisma.product.deleteMany({ where: { id: c.productId, businessId } });
      continue;
    }
    if (c.op === "product_create") {
      const product = await prisma.product.create({
        data: {
          businessId,
          name: c.name,
          price: c.price,
          costPrice: c.costPrice,
          stock: c.stock,
          description: c.description,
          imageUrl: c.imageUrl,
          galleryUrls: c.galleryUrls.length ? JSON.stringify(c.galleryUrls) : null,
        },
      });
      if (c.optionTypes.length) {
        const optionTypes = await saveProductVariants(product.id, { optionTypes: c.optionTypes, variants: c.variants });
        await prisma.product.update({ where: { id: product.id }, data: { optionTypes } });
      }
      continue;
    }

    const current = await prisma.product.findFirst({ where: { id: c.productId, businessId }, select: { galleryUrls: true, optionTypes: true } });
    if (!current) continue;
    let galleryUrls: string | undefined;
    if (c.addGalleryUrl) {
      let list: unknown = [];
      try {
        list = JSON.parse(current.galleryUrls ?? "[]");
      } catch {
        list = [];
      }
      galleryUrls = JSON.stringify([...new Set([...(Array.isArray(list) ? (list as string[]) : []), c.addGalleryUrl])]);
    }
    let optionTypes: string | null | undefined;
    if (c.optionTypes || c.variants) {
      // Start from the variants that exist today (price, stock, SKU, photo) and change only the
      // combinations the proposal names — the rest keep their values. Edits without new axes keep
      // the product's current axes.
      const existing = await prisma.productVariant.findMany({ where: { productId: c.productId }, select: { id: true, options: true, sku: true, price: true, stock: true, imageUrl: true } });
      const merged = new Map<string, Record<string, unknown>>();
      for (const v of existing) {
        try {
          const options = JSON.parse(v.options) as Record<string, string>;
          merged.set(comboKey(options), { id: v.id, options, sku: v.sku, price: v.price, stock: v.stock, imageUrl: v.imageUrl });
        } catch {
          /* skip unreadable row */
        }
      }
      for (const v of c.variants ?? []) {
        const k = comboKey(v.options);
        merged.set(k, { ...(merged.get(k) ?? {}), options: v.options, stock: v.stock, ...(v.price !== undefined && { price: v.price }) });
      }
      optionTypes = await saveProductVariants(c.productId, { optionTypes: c.optionTypes ?? parseOptionTypes(current.optionTypes), variants: [...merged.values()] });
    }
    await prisma.product.updateMany({
      where: { id: c.productId, businessId },
      data: {
        ...(c.price != null && { price: c.price }),
        ...(c.costPrice !== undefined && { costPrice: c.costPrice }),
        ...(c.stock != null && { stock: c.stock }),
        ...(c.name && { name: c.name }),
        ...(c.description && { description: c.description }),
        ...(c.imageUrl && { imageUrl: c.imageUrl }),
        ...(galleryUrls && { galleryUrls }),
        ...(optionTypes !== undefined && { optionTypes }),
      },
    });
  }
  return summary;
}
