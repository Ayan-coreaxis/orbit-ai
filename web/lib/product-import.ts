import { inflateRawSync } from "zlib";
import { cartesian, comboKey, type OptionType } from "@/lib/variants";
import type { ProductCreate } from "@/lib/product-ops";

/**
 * Bulk product import — the PURE half: turning what a source really says (a Shopify products.json,
 * a WooCommerce Store API reply, a page's JSON-LD / OpenGraph tags, a CSV / XLSX sheet) into
 * products the store can create. Nothing here touches the network, the database or the model, so
 * it is all unit-tested (product-import.test.ts). The fetching + saving half is
 * product-import-server.ts.
 *
 * One rule runs through all of it: only what the source has. No price → the item is dropped. No
 * stock number → stock stays `null` ("unknown", saved as 0 unless the seller gives a number).
 */

export const MAX_IMPORT_PRODUCTS = 300;
const MAX_GALLERY = 8;
const MAX_URL = 500;
const MAX_AXIS_VALUES = 24;
const MAX_COMBOS = 100;

export type ImportedVariant = {
  options: Record<string, string>;
  price: number | null; // null = the product's price
  stock: number | null; // null = the source doesn't say
  sku: string | null;
  imageUrl: string | null;
  sourceId?: string; // the source's own id for this variant (WooCommerce variation id)
};

export type ImportedProduct = {
  name: string;
  price: number;
  costPrice: number | null;
  stock: number | null; // null = the source doesn't say
  description: string | null;
  imageUrl: string | null;
  galleryUrls: string[];
  category: string | null;
  optionTypes: OptionType[];
  variants: ImportedVariant[];
  warnings: string[];
  sourceUrl: string | null;
};

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => !!v && typeof v === "object" && !Array.isArray(v);
const str = (v: unknown): string => (typeof v === "string" ? v.trim() : typeof v === "number" && Number.isFinite(v) ? String(v) : "");
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : v == null ? [] : [v]);

// ---------------------------------------------------------------------------------------------
// Small parsers
// ---------------------------------------------------------------------------------------------

/** "Rs. 2,450" → 2450, "PKR 2450.00" → 2450, "1.234,50" → 1234.5. Null when there is no positive number. */
export function parsePrice(raw: unknown): number | null {
  if (typeof raw === "number") return Number.isFinite(raw) && raw > 0 ? raw : null;
  if (typeof raw !== "string") return null;
  const m = raw.match(/\d[\d.,]*/);
  if (!m) return null;
  let s = m[0].replace(/[.,]+$/, "");
  const hasComma = s.includes(",");
  const hasDot = s.includes(".");
  if (hasComma && hasDot) {
    const dec = s.lastIndexOf(",") > s.lastIndexOf(".") ? "," : ".";
    s = s.split(dec === "," ? "." : ",").join("");
    if (dec === ",") s = s.replace(",", ".");
  } else if (hasComma) {
    s = /^\d+,\d{1,2}$/.test(s) ? s.replace(",", ".") : s.split(",").join("");
  } else if (hasDot && s.split(".").length > 2) {
    s = s.split(".").join("");
  }
  const n = Number(s);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** A whole, non-negative unit count — or null when the cell isn't a number ("in stock", ""). */
export function parseStock(raw: unknown): number | null {
  if (typeof raw === "number") return Number.isFinite(raw) ? Math.max(0, Math.floor(raw)) : null;
  if (typeof raw !== "string") return null;
  const s = raw.trim().replace(/,/g, "");
  if (!/^-?\d+(\.\d+)?$/.test(s)) return null;
  return Math.max(0, Math.floor(Number(s)));
}

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", ndash: "–", mdash: "—", rsquo: "’", lsquo: "‘", hellip: "…" };
export function decodeEntities(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (all, e: string) => {
    if (e[0] === "#") {
      const code = e[1].toLowerCase() === "x" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(code) && code > 0 && code < 0x10ffff ? String.fromCodePoint(code) : all;
    }
    return ENTITIES[e.toLowerCase()] ?? all;
  });
}

function htmlToText(html: string): string {
  return decodeEntities(
    html
      .replace(/<(script|style|noscript|svg|iframe)\b[\s\S]*?<\/\1>/gi, " ")
      .replace(/<!--[\s\S]*?-->/g, " ")
      .replace(/<\/(p|div|li|h[1-6]|tr)>|<br\s*\/?>/gi, "\n")
      .replace(/<[^>]+>/g, " "),
  )
    .replace(/[ \t\r\f\v]+/g, " ")
    .replace(/ *\n\s*/g, "\n")
    .trim();
}

/** Product description as the store keeps it: the source's own HTML (the storefront sanitises it on
 * render) when it fits, otherwise its plain text. */
function cleanDescription(raw: unknown): string | null {
  const s = str(raw);
  if (!s) return null;
  if (!/<[a-z][^>]*>/i.test(s)) return decodeEntities(s).slice(0, 4000) || null;
  const html = s.replace(/<(script|style|iframe|noscript)\b[\s\S]*?<\/\1>/gi, "").replace(/<!--[\s\S]*?-->/g, "").trim();
  if (!htmlToText(html)) return null;
  return html.length <= 4000 ? html : htmlToText(html).slice(0, 4000);
}

/** Absolute http(s) URL, or null. Relative and protocol-relative links resolve against the page. */
export function absUrl(raw: unknown, base?: string | null): string | null {
  const s = decodeEntities(str(raw));
  if (!s || /^(data|javascript|blob):/i.test(s)) return null;
  try {
    const u = base ? new URL(s, base) : new URL(s.startsWith("//") ? `https:${s}` : s);
    if (u.protocol !== "http:" && u.protocol !== "https:") return null;
    const out = u.toString();
    return out.length <= MAX_URL ? out : null;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------------------------
// One shape for every source
// ---------------------------------------------------------------------------------------------

type Draft = {
  name: unknown;
  price?: number | null;
  costPrice?: number | null;
  stock?: number | null;
  description?: unknown;
  images?: unknown[];
  category?: unknown;
  axes?: { name: string; values?: string[] }[];
  variants?: ImportedVariant[];
  sourceUrl?: string | null;
  base?: string | null; // page / site the image links are relative to
  warnings?: string[];
};

const isDefaultAxis = (a: { name: string; values?: string[] }, variants: ImportedVariant[]) => {
  const vals = new Set([...(a.values ?? []), ...variants.map((v) => v.options[a.name]).filter(Boolean)]);
  return a.name.toLowerCase() === "title" && vals.size <= 1 && [...vals].every((v) => v.toLowerCase() === "default title");
};

/** Normalise a draft into a product the store can hold (2 option axes, 24 values each, 100
 * combinations) — or null when it has no name or no price. */
export function finalizeProduct(d: Draft): ImportedProduct | null {
  const name = decodeEntities(str(d.name).replace(/<[^>]+>/g, "")).replace(/\s+/g, " ").trim().slice(0, 140);
  if (!name) return null;
  const warnings = [...(d.warnings ?? [])];

  // ---- options ----
  let variants = (d.variants ?? []).map((v) => ({
    ...v,
    options: Object.fromEntries(Object.entries(v.options).map(([k, x]) => [k.trim().slice(0, 40), String(x).trim()]).filter(([k, x]) => k && x)),
  }));
  let axes = (d.axes ?? []).map((a) => ({ name: a.name.trim().slice(0, 40), values: (a.values ?? []).map((x) => x.trim()).filter(Boolean) })).filter((a) => a.name);
  axes = axes.filter((a) => !isDefaultAxis(a, variants));
  variants = variants.map((v) => ({ ...v, options: Object.fromEntries(Object.entries(v.options).filter(([k]) => axes.some((a) => a.name === k))) }));

  if (axes.length > 2) {
    // The store holds two option axes — the 2nd and later ones are joined so every real variant survives.
    const rest = axes.slice(1);
    const joined = rest.map((a) => a.name).join(" / ").slice(0, 40);
    variants = variants.map((v) => {
      const tail = rest.map((a) => v.options[a.name]).filter(Boolean).join(" / ");
      const options: Record<string, string> = {};
      if (v.options[axes[0].name]) options[axes[0].name] = v.options[axes[0].name];
      if (tail) options[joined] = tail;
      return { ...v, options };
    });
    axes = [axes[0], { name: joined, values: variants.length ? [] : rest.reduce<string[]>((acc, a) => (acc.length ? acc.flatMap((x) => a.values.map((y) => `${x} / ${y}`)) : a.values), []) }];
  }

  let optionTypes: OptionType[] = axes
    .map((a) => {
      // Values in the order the source's real variants use them; the declared list only fills in when there are none.
      const fromVariants = variants.map((v) => v.options[a.name]).filter(Boolean);
      return { name: a.name, values: [...new Set(fromVariants.length ? fromVariants : a.values)] };
    })
    .filter((a) => a.values.length);
  if (optionTypes.some((a) => a.values.length > MAX_AXIS_VALUES)) {
    warnings.push(`More than ${MAX_AXIS_VALUES} values for one option — only the first ${MAX_AXIS_VALUES} are imported`);
    optionTypes = optionTypes.map((a) => ({ ...a, values: a.values.slice(0, MAX_AXIS_VALUES) }));
  }
  if (optionTypes.reduce((n, a) => n * a.values.length, 1) > MAX_COMBOS) warnings.push(`More than ${MAX_COMBOS} option combinations — only the first ${MAX_COMBOS} are imported`);

  const seen = new Set<string>();
  const allowed = new Set(cartesian(optionTypes).map(comboKey));
  variants = optionTypes.length
    ? variants.filter((v) => {
        const k = comboKey(v.options);
        if (Object.keys(v.options).length !== optionTypes.length || !allowed.has(k) || seen.has(k)) return false;
        seen.add(k);
        return true;
      })
    : [];
  if (optionTypes.length && !variants.length) {
    // Options listed without per-option rows: every combination sells at the product's price.
    variants = cartesian(optionTypes).map((options) => ({ options, price: null, stock: d.stock === 0 ? 0 : null, sku: null, imageUrl: null }));
  }

  // ---- price ----
  const variantPrices = variants.map((v) => v.price).filter((p): p is number => p != null && p > 0);
  const price = variantPrices.length ? Math.min(...variantPrices, ...(variants.some((v) => v.price == null) && d.price ? [d.price] : [])) : (d.price ?? null);
  if (price == null || !Number.isFinite(price) || price <= 0) return null;
  variants = variants.map((v) => ({ ...v, price: v.price != null && v.price > 0 && v.price !== price ? v.price : null }));

  // ---- photos ----
  const urls = [...new Set((d.images ?? []).map((u) => absUrl(u, d.base)).filter((u): u is string => !!u))];
  const imageUrl = urls[0] ?? null;
  variants = variants.map((v) => ({ ...v, imageUrl: absUrl(v.imageUrl, d.base), sku: v.sku ? v.sku.slice(0, 60) : null }));

  const stock = optionTypes.length ? null : (d.stock ?? null);
  const unknownStock = optionTypes.length ? variants.some((v) => v.stock == null) : stock == null;
  if (unknownStock) warnings.push("No stock number in the source");
  if (!imageUrl) warnings.push("No photo");

  return {
    name,
    price,
    costPrice: d.costPrice != null && d.costPrice > 0 ? d.costPrice : null,
    stock,
    description: cleanDescription(d.description),
    imageUrl,
    galleryUrls: urls.slice(1, 1 + MAX_GALLERY),
    category: decodeEntities(str(d.category)).slice(0, 60) || null,
    optionTypes,
    variants,
    warnings: [...new Set(warnings)],
    sourceUrl: d.sourceUrl ?? null,
  };
}

/** First product wins when two share a name (the store skips same-name products anyway). */
export function dedupeByName(products: ImportedProduct[]): ImportedProduct[] {
  const seen = new Set<string>();
  return products.filter((p) => {
    const k = nameKey(p.name);
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

export const nameKey = (name: string) => name.trim().toLowerCase().replace(/\s+/g, " ");

const compact = (list: (ImportedProduct | null)[]) => dedupeByName(list.filter((p): p is ImportedProduct => !!p));

// ---------------------------------------------------------------------------------------------
// Shopify — /products.json
// ---------------------------------------------------------------------------------------------

export function parseShopifyProducts(json: unknown, origin?: string | null): ImportedProduct[] {
  const list = isObj(json) && Array.isArray(json.products) ? json.products : Array.isArray(json) ? json : [];
  return compact(
    list.filter(isObj).map((p) => {
      const options = arr(p.options).filter(isObj);
      const axes = options.map((o, i) => ({ name: str(o.name) || `Option ${i + 1}`, values: arr(o.values).map(str).filter(Boolean) }));
      const rawVariants = arr(p.variants).filter(isObj);
      const stockOf = (v: Obj): number | null => {
        const q = v.inventory_quantity;
        if (typeof q === "number" && Number.isFinite(q) && (v.inventory_management != null || q > 0)) return Math.max(0, Math.floor(q));
        return v.available === false ? 0 : null;
      };
      const variants: ImportedVariant[] = rawVariants.map((v) => ({
        options: Object.fromEntries(axes.map((a, i) => [a.name, str(v[`option${i + 1}`])]).filter(([, x]) => x)),
        price: parsePrice(typeof v.price === "number" ? v.price : str(v.price)),
        stock: stockOf(v),
        sku: str(v.sku) || null,
        imageUrl: isObj(v.featured_image) ? str(v.featured_image.src) : null,
      }));
      const first = rawVariants[0];
      const handle = str(p.handle);
      return finalizeProduct({
        name: p.title,
        price: variants.map((v) => v.price).find((x) => x != null) ?? null,
        stock: first ? stockOf(first) : null,
        description: p.body_html,
        images: [isObj(p.image) ? p.image.src : null, ...arr(p.images).map((i) => (isObj(i) ? i.src : i))],
        category: p.product_type,
        axes,
        variants,
        base: origin,
        sourceUrl: origin && handle ? `${origin}/products/${handle}` : null,
      });
    }),
  );
}

// ---------------------------------------------------------------------------------------------
// WooCommerce — /wp-json/wc/store/v1/products
// ---------------------------------------------------------------------------------------------

function wooMoney(prices: Obj, key: string): number | null {
  const raw = prices[key];
  if (raw == null || raw === "") return null;
  const minor = Number(prices.currency_minor_unit ?? 2);
  const n = Number(raw) / 10 ** (Number.isFinite(minor) ? minor : 2);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** Price of one WooCommerce Store API product / variation reply, in major units. */
export function wooPrice(json: unknown): number | null {
  return isObj(json) && isObj(json.prices) ? wooMoney(json.prices, "price") : null;
}

/** ISO currency code the WooCommerce store quotes in, when it says. */
export function wooCurrency(json: unknown): string | null {
  const first = Array.isArray(json) ? json.find(isObj) : null;
  return first && isObj(first.prices) && typeof first.prices.currency_code === "string" ? first.prices.currency_code : null;
}

export const WOO_PRICE_VARIES = "Options have different prices on the source";

export function parseWooProducts(json: unknown): ImportedProduct[] {
  const list = Array.isArray(json) ? json : [];
  return compact(
    list.filter(isObj).map((p) => {
      const prices = isObj(p.prices) ? p.prices : {};
      const price = wooMoney(prices, "price");
      const inStock = typeof p.is_in_stock === "boolean" ? p.is_in_stock : null;
      const attrs = arr(p.attributes).filter(isObj).filter((a) => a.has_variations === true);
      const termName = new Map<string, string>(); // "attribute|slug" → display name
      const axes = attrs.map((a) => {
        const terms = arr(a.terms).filter(isObj);
        for (const t of terms) termName.set(`${str(a.name).toLowerCase()}|${str(t.slug).toLowerCase()}`, decodeEntities(str(t.name)));
        return { name: decodeEntities(str(a.name)), values: terms.map((t) => decodeEntities(str(t.name))).filter(Boolean) };
      });
      const variants: ImportedVariant[] = arr(p.variations)
        .filter(isObj)
        .map((v) => ({
          options: Object.fromEntries(
            arr(v.attributes)
              .filter(isObj)
              .map((a) => {
                const axis = axes.find((x) => x.name.toLowerCase() === decodeEntities(str(a.name)).toLowerCase());
                const value = str(a.value);
                return [axis?.name ?? "", termName.get(`${str(a.name).toLowerCase()}|${value.toLowerCase()}`) ?? decodeEntities(value)];
              })
              .filter(([k, x]) => k && x),
          ),
          price: null,
          stock: inStock === false ? 0 : null,
          sku: null,
          imageUrl: null,
          sourceId: str(v.id) || undefined,
        }));
      const range = isObj(prices.price_range) ? prices.price_range : null;
      const min = range ? wooMoney({ ...prices, v: range.min_amount }, "v") : null;
      const max = range ? wooMoney({ ...prices, v: range.max_amount }, "v") : null;
      const stockLeft = typeof p.low_stock_remaining === "number" ? Math.max(0, Math.floor(p.low_stock_remaining)) : null;
      return finalizeProduct({
        name: p.name,
        price: price ?? min,
        stock: inStock === false ? 0 : stockLeft,
        description: str(p.description) || str(p.short_description),
        images: arr(p.images).map((i) => (isObj(i) ? i.src : i)),
        category: arr(p.categories).filter(isObj).map((c) => c.name)[0],
        axes,
        variants,
        sourceUrl: absUrl(p.permalink),
        warnings: axes.length && min != null && max != null && min !== max ? [`${WOO_PRICE_VARIES} (${min}–${max}) — imported at ${price ?? min}, check each option`] : [],
      });
    }),
  );
}

// ---------------------------------------------------------------------------------------------
// Any shop page — JSON-LD Product / ProductGroup / ItemList, then OpenGraph product tags
// ---------------------------------------------------------------------------------------------

const typesOf = (o: Obj): string[] => arr(o["@type"]).map((t) => str(t).replace(/^https?:\/\/schema\.org\//, ""));

function ldImages(image: unknown): unknown[] {
  return arr(image).map((i) => (isObj(i) ? (i.url ?? i.contentUrl) : i));
}

function ldOffer(offers: unknown): { price: number | null; soldOut: boolean } {
  const list = arr(offers).filter(isObj);
  const prices: number[] = [];
  let anyAvailable = false;
  let anyAvailability = false;
  for (const o of list) {
    const spec = arr(o.priceSpecification).filter(isObj)[0];
    const p = parsePrice(typeof o.price === "number" ? o.price : str(o.price)) ?? parsePrice(str(o.lowPrice) || (o.lowPrice as number)) ?? (spec ? parsePrice(str(spec.price) || (spec.price as number)) : null);
    if (p != null) prices.push(p);
    const av = str(o.availability);
    if (av) {
      anyAvailability = true;
      if (!/OutOfStock|SoldOut|Discontinued/i.test(av)) anyAvailable = true;
    }
  }
  return { price: prices.length ? Math.min(...prices) : null, soldOut: anyAvailability && !anyAvailable };
}

const LD_AXES: [string, string][] = [["size", "Size"], ["color", "Color"], ["material", "Material"], ["pattern", "Pattern"]];

function ldProduct(o: Obj, pageUrl: string): ImportedProduct | null {
  const kids = arr(o.hasVariant).filter(isObj);
  const own = ldOffer(o.offers);
  const base = {
    name: o.name,
    description: o.description,
    category: typeof o.category === "string" ? o.category : null,
    base: pageUrl,
    sourceUrl: absUrl(o.url, pageUrl) ?? pageUrl,
  };
  if (kids.length) {
    const used = LD_AXES.filter(([k]) => kids.every((v) => str(v[k])));
    const variants: ImportedVariant[] = kids.map((v) => {
      const offer = ldOffer(v.offers);
      return {
        options: Object.fromEntries(used.map(([k, label]) => [label, str(v[k])])),
        price: offer.price,
        stock: offer.soldOut ? 0 : null,
        sku: str(v.sku) || null,
        imageUrl: str(ldImages(v.image)[0]) || null,
      };
    });
    const prices = variants.map((v) => v.price).filter((p): p is number => p != null);
    return finalizeProduct({
      ...base,
      price: own.price ?? (prices.length ? Math.min(...prices) : null),
      images: [...ldImages(o.image), ...kids.flatMap((v) => ldImages(v.image))],
      axes: used.map(([, label]) => ({ name: label })),
      variants: used.length ? variants.filter((v) => v.price != null) : [],
    });
  }
  return finalizeProduct({ ...base, price: own.price, stock: own.soldOut ? 0 : null, images: ldImages(o.image) });
}

function walkLd(node: unknown, pageUrl: string, out: { products: (ImportedProduct | null)[]; links: Set<string> }, depth = 0): void {
  if (depth > 6) return;
  if (Array.isArray(node)) return node.forEach((n) => walkLd(n, pageUrl, out, depth + 1));
  if (!isObj(node)) return;
  if (node["@graph"]) walkLd(node["@graph"], pageUrl, out, depth + 1);
  const types = typesOf(node);
  if (types.includes("Product") || types.includes("ProductGroup")) {
    const p = ldProduct(node, pageUrl);
    if (p) out.products.push(p);
    else {
      const link = absUrl(node.url, pageUrl);
      if (link) out.links.add(link);
    }
    return;
  }
  if (types.includes("ItemList") || types.includes("OfferCatalog")) {
    for (const el of arr(node.itemListElement)) {
      if (typeof el === "string") {
        const link = absUrl(el, pageUrl);
        if (link) out.links.add(link);
        continue;
      }
      if (!isObj(el)) continue;
      const item = el.item ?? el;
      if (isObj(item) && typesOf(item).some((t) => t === "Product" || t === "ProductGroup")) walkLd(item, pageUrl, out, depth + 1);
      else {
        const link = absUrl(typeof item === "string" ? item : isObj(item) ? (item.url ?? item["@id"]) : el.url, pageUrl) ?? absUrl(el.url, pageUrl);
        if (link) out.links.add(link);
      }
    }
    return;
  }
  // WebPage / CollectionPage wrappers
  for (const key of ["mainEntity", "mainEntityOfPage", "about"]) if (node[key]) walkLd(node[key], pageUrl, out, depth + 1);
}

/** Products stated in the page's JSON-LD, plus links to product pages a listing only points at. */
export function extractJsonLdProducts(html: string, pageUrl: string): { products: ImportedProduct[]; links: string[] } {
  const out = { products: [] as (ImportedProduct | null)[], links: new Set<string>() };
  for (const m of html.matchAll(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    try {
      walkLd(JSON.parse(m[1].trim()), pageUrl, out);
    } catch {
      // malformed JSON-LD — skip it, never guess
    }
  }
  return { products: compact(out.products), links: [...out.links] };
}

function metaTags(html: string): Map<string, string[]> {
  const out = new Map<string, string[]>();
  for (const m of html.matchAll(/<meta\b[^>]*>/gi)) {
    const key = m[0].match(/\b(?:property|name)\s*=\s*["']([^"']+)["']/i)?.[1]?.toLowerCase();
    const content = m[0].match(/\bcontent\s*=\s*"([^"]*)"/i)?.[1] ?? m[0].match(/\bcontent\s*=\s*'([^']*)'/i)?.[1];
    if (key && content != null) out.set(key, [...(out.get(key) ?? []), decodeEntities(content)]);
  }
  return out;
}

/** A single product page described by OpenGraph product tags (og:title + product:price:amount). */
export function extractOpenGraphProduct(html: string, pageUrl: string): ImportedProduct | null {
  const meta = metaTags(html);
  const one = (k: string) => meta.get(k)?.[0] ?? "";
  const price = parsePrice(one("product:price:amount") || one("og:price:amount") || one("product:sale_price:amount"));
  if (price == null) return null;
  const availability = one("product:availability") || one("og:availability");
  return finalizeProduct({
    name: one("og:title"),
    price,
    stock: /out\s*of\s*stock|oos|sold\s*out/i.test(availability) ? 0 : null,
    description: one("og:description"),
    images: meta.get("og:image") ?? [],
    base: pageUrl,
    sourceUrl: absUrl(one("og:url"), pageUrl) ?? pageUrl,
  });
}

/** Structured data first: JSON-LD, then OpenGraph. Empty when the page states no product with a price. */
export function extractProductsFromPage(html: string, pageUrl: string): { products: ImportedProduct[]; links: string[] } {
  const ld = extractJsonLdProducts(html, pageUrl);
  if (ld.products.length) return ld;
  const og = extractOpenGraphProduct(html, pageUrl);
  return { products: og ? [og] : [], links: ld.links };
}

/** Same-site links that look like product pages (…/product/… or …/products/…), absolute, in page order. */
export function extractProductLinks(html: string, pageUrl: string, max = 40): string[] {
  let origin: string;
  try {
    origin = new URL(pageUrl).origin;
  } catch {
    return [];
  }
  const out = new Set<string>();
  for (const m of html.matchAll(/href=["']([^"'#]*\/products?\/[^"'#?]+)[^"']*["']/gi)) {
    try {
      const u = new URL(decodeEntities(m[1]), pageUrl);
      if (u.origin === origin && !/\.(json|js|xml|css|png|jpe?g|webp|svg)$/i.test(u.pathname)) out.add(`${u.origin}${u.pathname}`);
    } catch {
      /* not a link */
    }
    if (out.size >= max) break;
  }
  return [...out];
}

// ---------------------------------------------------------------------------------------------
// Last resort for a page with no structured data: the model reads the cleaned page. These two
// functions prepare what it sees and check what it returns against that same text.
// ---------------------------------------------------------------------------------------------

/** Page body as text, with every image kept as "[img <absolute url>]" so photos can be matched to products. */
export function cleanHtmlForModel(html: string, pageUrl: string, maxChars = 60000): string {
  const body = html.match(/<body\b[\s\S]*$/i)?.[0] ?? html;
  const withImgs = body
    .replace(/<(script|style|noscript|svg|iframe|template)\b[\s\S]*?<\/\1>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<img\b[^>]*>/gi, (tag) => {
      const src =
        tag.match(/\b(?:data-src|data-original|data-lazy-src)\s*=\s*["']([^"']+)["']/i)?.[1] ??
        tag.match(/\bsrc\s*=\s*["']([^"']+)["']/i)?.[1] ??
        tag.match(/\b(?:data-)?srcset\s*=\s*["']([^"',\s]+)/i)?.[1];
      const url = absUrl(src, pageUrl);
      return url ? ` [img ${url}] ` : " ";
    });
  return htmlToText(withImgs).replace(/\n{2,}/g, "\n").slice(0, maxChars);
}

/** Keep only model-extracted products whose price and photos really are in the text it was shown. */
export function sanitizeModelProducts(raw: unknown, cleaned: string, pageUrl: string): ImportedProduct[] {
  const digits = cleaned.replace(/[,\s]/g, "");
  const lower = cleaned.toLowerCase();
  return compact(
    arr(raw)
      .filter(isObj)
      .map((r) => {
        const price = parsePrice(str(r.price_text)) ?? parsePrice(typeof r.price === "number" ? r.price : str(r.price));
        if (price == null) return null;
        const whole = String(Math.trunc(price));
        if (!new RegExp(`(^|\\D)${whole}(\\D|$)`).test(digits)) return null; // a price that isn't on the page
        const name = str(r.name);
        if (!name) return null;
        const axes = arr(r.options)
          .filter(isObj)
          .map((o) => ({ name: str(o.name), values: arr(o.values).map(str).filter((v) => v && lower.includes(v.toLowerCase())) }))
          .filter((a) => a.name && a.values.length);
        return finalizeProduct({
          name,
          price,
          description: typeof r.description === "string" ? htmlToText(r.description) : null,
          images: arr(r.image_urls).map(str).filter((u) => u && cleaned.includes(`[img ${u}]`)),
          axes,
          base: pageUrl,
          sourceUrl: pageUrl,
        });
      }),
  );
}

// ---------------------------------------------------------------------------------------------
// CSV
// ---------------------------------------------------------------------------------------------

/** RFC-4180 CSV (quotes, embedded newlines, BOM) with the delimiter sniffed from the first line: , ; tab or |. */
export function parseCsv(input: string): string[][] {
  const text = input.replace(/^﻿/, "");
  const firstLine = text.slice(0, text.search(/\r?\n/) === -1 ? text.length : text.search(/\r?\n/));
  let delim = ",";
  let best = 0;
  for (const d of [",", ";", "\t", "|"]) {
    let n = 0;
    let quoted = false;
    for (const ch of firstLine) {
      if (ch === '"') quoted = !quoted;
      else if (ch === d && !quoted) n++;
    }
    if (n > best) {
      best = n;
      delim = d;
    }
  }
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          cell += '"';
          i++;
        } else quoted = false;
      } else cell += ch;
    } else if (ch === '"' && cell === "") quoted = true;
    else if (ch === delim) {
      row.push(cell);
      cell = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else cell += ch;
  }
  if (cell !== "" || row.length) {
    row.push(cell);
    rows.push(row);
  }
  return rows.filter((r) => r.some((c) => c.trim() !== ""));
}

// ---------------------------------------------------------------------------------------------
// XLSX — a zip of XML; read with zlib only (no spreadsheet dependency). First sheet, cell text.
// ---------------------------------------------------------------------------------------------

const MAX_XML_BYTES = 60 * 1024 * 1024;

function unzip(buf: Buffer, wanted: (name: string) => boolean): Map<string, string> {
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 22 - 65535); i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error("Not an .xlsx file.");
  const count = buf.readUInt16LE(eocd + 10);
  let p = buf.readUInt32LE(eocd + 16);
  const out = new Map<string, string>();
  let total = 0;
  for (let n = 0; n < count && p + 46 <= buf.length; n++) {
    if (buf.readUInt32LE(p) !== 0x02014b50) break;
    const method = buf.readUInt16LE(p + 10);
    const compSize = buf.readUInt32LE(p + 20);
    const nameLen = buf.readUInt16LE(p + 28);
    const extraLen = buf.readUInt16LE(p + 30);
    const commentLen = buf.readUInt16LE(p + 32);
    const local = buf.readUInt32LE(p + 42);
    const name = buf.toString("utf8", p + 46, p + 46 + nameLen);
    p += 46 + nameLen + extraLen + commentLen;
    if (!wanted(name) || local + 30 > buf.length) continue;
    const start = local + 30 + buf.readUInt16LE(local + 26) + buf.readUInt16LE(local + 28);
    const data = buf.subarray(start, start + compSize);
    const raw = method === 0 ? data : method === 8 ? inflateRawSync(data, { maxOutputLength: MAX_XML_BYTES }) : null;
    if (!raw) continue;
    total += raw.length;
    if (total > MAX_XML_BYTES) throw new Error("That spreadsheet is too large.");
    out.set(name, raw.toString("utf8"));
  }
  return out;
}

const xmlText = (s: string) => decodeEntities(s.replace(/_x000D_/g, ""));

function colIndex(ref: string): number {
  let n = 0;
  for (const ch of ref.toUpperCase()) {
    if (ch < "A" || ch > "Z") break;
    n = n * 26 + (ch.charCodeAt(0) - 64);
  }
  return n - 1;
}

/** Rows of the first worksheet of an .xlsx workbook, every cell as text. */
export function parseXlsx(buf: Buffer): string[][] {
  const files = unzip(buf, (n) => /^xl\/(workbook\.xml|_rels\/workbook\.xml\.rels|sharedStrings\.xml|worksheets\/[^/]+\.xml)$/i.test(n));
  const sheets = [...files.keys()].filter((n) => /^xl\/worksheets\//i.test(n)).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  if (!sheets.length) throw new Error("Not an .xlsx file (old .xls isn't supported — save it as .xlsx or .csv).");
  // The first sheet in the workbook's own order (not always sheet1.xml).
  let sheetName = sheets[0];
  const rid = files.get("xl/workbook.xml")?.match(/<sheet\b[^>]*\br:id="([^"]+)"/)?.[1];
  const rels = files.get("xl/_rels/workbook.xml.rels");
  if (rid && rels) {
    for (const m of rels.matchAll(/<Relationship\b[^>]*>/g)) {
      if (m[0].match(/\bId="([^"]+)"/)?.[1] !== rid) continue;
      const target = m[0].match(/\bTarget="([^"]+)"/)?.[1];
      const full = target ? (target.startsWith("/") ? target.slice(1) : `xl/${target}`) : "";
      if (files.has(full)) sheetName = full;
    }
  }
  const shared: string[] = [];
  for (const m of (files.get("xl/sharedStrings.xml") ?? "").matchAll(/<si\b[^>]*>([\s\S]*?)<\/si>|<si\b[^>]*\/>/g)) {
    const inner = (m[1] ?? "").replace(/<rPh\b[\s\S]*?<\/rPh>/g, "");
    shared.push(xmlText([...inner.matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/g)].map((t) => t[1]).join("")));
  }
  const rows: string[][] = [];
  for (const r of (files.get(sheetName) ?? "").matchAll(/<row\b[^>]*>([\s\S]*?)<\/row>/g)) {
    const row: string[] = [];
    let next = 0;
    for (const c of r[1].matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const ref = c[1].match(/\br="([A-Za-z]+)\d+"/)?.[1];
      const col = ref ? colIndex(ref) : next;
      next = col + 1;
      if (col < 0 || col > 500) continue;
      const type = c[1].match(/\bt="([^"]+)"/)?.[1];
      const body = c[2] ?? "";
      const v = body.match(/<v\b[^>]*>([\s\S]*?)<\/v>/)?.[1] ?? "";
      let value: string;
      if (type === "s") value = shared[Number(v)] ?? "";
      else if (type === "inlineStr") value = xmlText([...body.matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/g)].map((t) => t[1]).join(""));
      else if (type === "b") value = v === "1" ? "TRUE" : "FALSE";
      else value = xmlText(v);
      while (row.length < col) row.push("");
      row[col] = value;
    }
    if (row.some((x) => x.trim() !== "")) rows.push(row);
  }
  return rows;
}

// ---------------------------------------------------------------------------------------------
// Sheet → products: map the columns, then group rows into products with variants
// ---------------------------------------------------------------------------------------------

export type ColumnMapping = {
  handle?: number;
  name?: number;
  price?: number;
  salePrice?: number;
  compareAt?: number;
  costPrice?: number;
  sku?: number;
  stock?: number;
  description?: number;
  image?: number;
  variantImage?: number;
  category?: number;
  wooType?: number; // WooCommerce export: simple / variable / variation
  wooParent?: number;
  wooId?: number;
  options: { name?: number; value: number; label?: string }[];
};

const norm = (h: string) => h.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

/** Header heuristics for Shopify exports, WooCommerce exports and hand-made sheets. */
export function mapColumns(headers: string[]): ColumnMapping {
  const h = headers.map((x) => norm(String(x ?? "")));
  const taken = new Set<number>();
  const find = (exact: string[], fuzzy?: RegExp, not?: RegExp): number | undefined => {
    for (const e of exact) {
      const i = h.findIndex((x, idx) => x === e && !taken.has(idx));
      if (i >= 0) {
        taken.add(i);
        return i;
      }
    }
    if (fuzzy) {
      const i = h.findIndex((x, idx) => !taken.has(idx) && fuzzy.test(x) && !(not && not.test(x)));
      if (i >= 0) {
        taken.add(i);
        return i;
      }
    }
    return undefined;
  };
  const woo = (h.includes("type") && h.includes("parent")) || h.some((x) => /^attribute \d+ name$/.test(x));
  const m: ColumnMapping = { options: [] };

  for (let n = 1; n <= 3; n++) {
    const value = h.findIndex((x) => new RegExp(`^(option|attribute) ?${n} values?( s)?$`).test(x));
    if (value < 0) continue;
    const name = h.findIndex((x) => new RegExp(`^(option|attribute) ?${n} name$`).test(x));
    taken.add(value);
    if (name >= 0) taken.add(name);
    m.options.push({ value, ...(name >= 0 ? { name } : { label: `Option ${n}` }) });
  }
  if (woo) {
    m.wooType = find(["type"]);
    m.wooParent = find(["parent"]);
    m.wooId = find(["id"]);
  }
  m.handle = find(["handle", "product handle", "slug"]);
  m.compareAt = find(["variant compare at price", "compare at price", "compare at", "compare price", "original price", "old price", "was price"]);
  m.salePrice = find(["sale price", "discounted price", "discount price", "offer price"]);
  m.costPrice = find(["cost per item", "cost price", "variant cost", "cost", "purchase price", "buying price"]);
  m.price = find(
    ["variant price", "price", "regular price", "selling price", "retail price", "unit price", "rate", "mrp", "amount"],
    /\b(price|rate)\b/,
    /compare|cost|sale|was|old|original|wholesale|purchase|tax|shipping|range|currency/,
  );
  m.sku = find(["variant sku", "sku", "product code", "item code", "code"]);
  m.stock = find(
    ["variant inventory qty", "stock", "inventory", "qty", "quantity", "stock qty", "stock quantity", "inventory quantity", "available quantity", "available stock", "units"],
    /\b(stock|qty|quantity|inventory)\b/,
    /tracker|policy|status|low|backorder|in stock|min|max|sold|allow|item id|location/,
  );
  m.variantImage = find(["variant image"]);
  m.image = find(
    ["image src", "images", "image", "image url", "image link", "image urls", "photo", "photo url", "picture", "main image", "featured image", "product image", "thumbnail"],
    /\b(image|images|photo|picture|img)\b/,
    /alt|position|variant/,
  );
  m.description = find(["body html", "body", "description", "product description", "long description", "details", "short description"], /\bdescription\b/, /seo|meta|image|alt/);
  m.category = find(["product category", "category", "categories", ...(woo ? [] : ["type"]), "product type", "collection"]);
  m.name = find(
    ["title", "name", "product name", "product title", "item name", "product", "item", "products", "items"],
    /\b(name|title)\b/,
    /option|attribute|seo|meta|variant|image|category|file|customer|vendor|brand|tax|shipping|collection|google/,
  );
  if (m.price === undefined && m.salePrice !== undefined) {
    m.price = m.salePrice;
    m.salePrice = undefined;
  }
  if (!m.options.length) {
    // A hand-made sheet: a "Size" / "Colour" column is the option itself.
    const direct = ["size", "sizes", "color", "colour", "colors", "colours", "flavor", "flavour", "flavors", "flavours", "material", "style", "variant", "variants", "pack size", "pack"];
    h.forEach((x, i) => {
      if (m.options.length < 3 && !taken.has(i) && direct.includes(x)) m.options.push({ value: i, label: String(headers[i]).trim() });
    });
  }
  for (const k of Object.keys(m) as (keyof ColumnMapping)[]) if (m[k] === undefined) delete m[k];
  return m;
}

/** A sheet needs at least a product name and a price column to be read without help. */
export const mappingIsClear = (m: ColumnMapping) => m.name !== undefined && m.price !== undefined;

/** Validate a column mapping the model returned (0-based column numbers) against the real sheet width. */
export function mappingFromModel(raw: unknown, columnCount: number): ColumnMapping {
  const r = isObj(raw) ? raw : {};
  const col = (v: unknown): number | undefined => (typeof v === "number" && Number.isInteger(v) && v >= 0 && v < columnCount ? v : undefined);
  const m: ColumnMapping = { options: [] };
  const set = (k: Exclude<keyof ColumnMapping, "options">, v: unknown) => {
    const c = col(v);
    if (c !== undefined) m[k] = c;
  };
  set("handle", r.handle);
  set("name", r.name);
  set("price", r.price);
  set("salePrice", r.sale_price);
  set("costPrice", r.cost_price);
  set("sku", r.sku);
  set("stock", r.stock);
  set("description", r.description);
  set("image", r.image);
  set("category", r.category);
  for (const o of arr(r.options).filter(isObj).slice(0, 3)) {
    const value = col(o.value);
    if (value === undefined) continue;
    const name = col(o.name_column);
    m.options.push({ value, ...(name !== undefined ? { name } : { label: str(o.label) || "Option" }) });
  }
  return m;
}

const splitUrls = (cell: string) => (/https?:\/\/|^\/\//i.test(cell) ? cell.split(/[\s,|]+/).filter((u) => /^(https?:)?\/\//i.test(u)) : []);

/** Data rows (no header row) + a column mapping → products. `dropped` counts rows/products left out for having no name or price. */
export function rowsToProducts(rows: string[][], m: ColumnMapping): { products: ImportedProduct[]; dropped: number } {
  const cell = (row: string[], i: number | undefined) => (i === undefined ? "" : String(row[i] ?? "").trim());
  const priceOf = (row: string[]) => parsePrice(cell(row, m.salePrice)) ?? parsePrice(cell(row, m.price));
  const isWoo = m.wooType !== undefined;

  // ---- group rows into products ----
  const groups = new Map<string, string[][]>();
  let last: string | null = null;
  rows.forEach((row, i) => {
    let key: string;
    const type = cell(row, m.wooType).toLowerCase();
    if (isWoo && type === "variation") {
      const parent = cell(row, m.wooParent);
      const byId = parent.match(/^id:(\d+)$/i)?.[1];
      key = byId ? `id:${byId}` : parent ? `sku:${parent.toLowerCase()}` : (last ?? `row:${i}`);
      // a variation whose parent was keyed the other way (by id vs sku)
      if (!groups.has(key) && last) key = last;
    } else if (isWoo) {
      const id = cell(row, m.wooId);
      const sku = cell(row, m.sku);
      key = id ? `id:${id}` : sku ? `sku:${sku.toLowerCase()}` : `row:${i}`;
    } else {
      const handle = cell(row, m.handle);
      const name = cell(row, m.name);
      if (handle) key = `h:${handle.toLowerCase()}`;
      else if (!name && last) key = last;
      else if (name && m.options.length) key = `n:${nameKey(name)}`;
      else key = `row:${i}`;
    }
    const list = groups.get(key) ?? [];
    list.push(row);
    groups.set(key, list);
    if (isWoo && type !== "variation") {
      const sku = cell(row, m.sku);
      if (sku) groups.set(`sku:${sku.toLowerCase()}`, list);
    }
    last = key;
  });

  const done = new Set<string[][]>();
  const out: (ImportedProduct | null)[] = [];
  let dropped = 0;
  for (const list of groups.values()) {
    if (done.has(list) || !list.length) continue;
    done.add(list);
    const first = (i: number | undefined) => list.map((r) => cell(r, i)).find(Boolean) ?? "";
    const head = list[0];
    const variationRows = isWoo ? list.filter((r) => cell(r, m.wooType).toLowerCase() === "variation") : list;
    const axisName = (o: ColumnMapping["options"][number], n: number, row?: string[]) =>
      (row && o.name !== undefined ? cell(row, o.name) : "") || (o.name !== undefined ? list.map((r) => cell(r, o.name)).find(Boolean) : o.label) || o.label || `Option ${n + 1}`;

    const axes: { name: string; values?: string[] }[] = [];
    let variants: ImportedVariant[] = [];
    const optionRows = variationRows.filter((r) => m.options.some((o) => cell(r, o.value)));
    const listed = (v: string) => v.split(",").map((x) => x.trim()).filter(Boolean);

    if (isWoo && cell(head, m.wooType).toLowerCase() !== "variable") {
      // simple product: its attribute columns are facts about it, not options
    } else if (isWoo) {
      m.options.forEach((o, n) => {
        const values = listed(cell(head, o.value));
        if (values.length || optionRows.some((r) => cell(r, o.value))) axes.push({ name: axisName(o, n, head), values });
      });
      variants = optionRows.map((r) => ({
        options: Object.fromEntries(m.options.map((o, n) => [axisName(o, n, head), cell(r, o.value)]).filter(([k, v]) => v && axes.some((a) => a.name === k))),
        price: priceOf(r),
        stock: parseStock(cell(r, m.stock)),
        sku: cell(r, m.sku) || null,
        imageUrl: splitUrls(cell(r, m.image))[0] ?? null,
      }));
    } else if (optionRows.length === 1 && list.length === 1 && m.handle === undefined && m.options.some((o) => cell(head, o.value).includes(","))) {
      // one row listing its sizes "S, M, L" — all at the row's price
      m.options.forEach((o, n) => {
        const values = listed(cell(head, o.value));
        if (values.length) axes.push({ name: axisName(o, n), values });
      });
    } else if (optionRows.length) {
      m.options.forEach((o, n) => {
        if (optionRows.some((r) => cell(r, o.value))) axes.push({ name: axisName(o, n) });
      });
      variants = optionRows
        .filter((r) => priceOf(r) != null)
        .map((r) => ({
          options: Object.fromEntries(m.options.map((o, n) => [axisName(o, n), cell(r, o.value)]).filter(([, v]) => v)),
          price: priceOf(r),
          stock: parseStock(cell(r, m.stock)),
          sku: cell(r, m.sku) || null,
          imageUrl: splitUrls(cell(r, m.variantImage))[0] ?? null,
        }));
    }

    const priced = list.find((r) => priceOf(r) != null);
    const stockRow = isWoo ? head : (priced ?? head);
    const category = first(m.category).split(",")[0].split(">").pop()?.trim() ?? "";
    const product = finalizeProduct({
      name: first(m.name),
      price: (isWoo ? priceOf(head) : null) ?? (priced ? priceOf(priced) : null),
      costPrice: parsePrice(first(m.costPrice)),
      stock: parseStock(cell(stockRow, m.stock)),
      description: first(m.description),
      images: list.flatMap((r) => splitUrls(cell(r, m.image))),
      category,
      axes,
      variants,
    });
    if (product) out.push(product);
    else dropped++;
  }
  const products = compact(out);
  return { products, dropped: dropped + (out.length - products.length) };
}

/** A whole sheet (header row first) → products, using header heuristics only. */
export function sheetToProducts(sheet: string[][], mapping?: ColumnMapping): { products: ImportedProduct[]; dropped: number; mapping: ColumnMapping } {
  const m = mapping ?? mapColumns(sheet[0] ?? []);
  return { ...rowsToProducts(sheet.slice(1), m), mapping: m };
}

// ---------------------------------------------------------------------------------------------
// Back from the browser / into the store
// ---------------------------------------------------------------------------------------------

/** Re-validate products the preview sent back (the seller's ticked rows) before anything is saved. */
export function sanitizeImportedProducts(raw: unknown): ImportedProduct[] {
  return compact(
    arr(raw)
      .slice(0, MAX_IMPORT_PRODUCTS)
      .filter(isObj)
      .map((r) => {
        const variants: ImportedVariant[] = arr(r.variants)
          .filter(isObj)
          .slice(0, MAX_COMBOS)
          .map((v) => ({
            options: isObj(v.options) ? Object.fromEntries(Object.entries(v.options).map(([k, x]) => [k, str(x)])) : {},
            price: parsePrice(v.price),
            stock: v.stock == null ? null : parseStock(v.stock),
            sku: str(v.sku) || null,
            imageUrl: str(v.imageUrl) || null,
          }));
        const p = finalizeProduct({
          name: r.name,
          price: parsePrice(r.price),
          costPrice: parsePrice(r.costPrice),
          stock: r.stock == null ? null : parseStock(r.stock),
          description: r.description,
          images: [r.imageUrl, ...arr(r.galleryUrls)],
          category: r.category,
          axes: arr(r.optionTypes)
            .filter(isObj)
            .map((a) => ({ name: str(a.name), values: arr(a.values).map(str) })),
          variants,
          sourceUrl: absUrl(r.sourceUrl),
        });
        return p ? { ...p, warnings: [] } : null;
      }),
  );
}

/** The Orchestrator's `product_create` proposal for one imported product (applied only on Apply). */
export function toProductCreate(p: ImportedProduct): ProductCreate {
  return {
    op: "product_create",
    name: p.name,
    price: p.price,
    costPrice: p.costPrice,
    stock: p.stock ?? 0,
    description: p.description,
    imageUrl: p.imageUrl,
    galleryUrls: p.galleryUrls,
    optionTypes: p.optionTypes,
    variants: p.variants.map((v) => ({ options: v.options, price: v.price, stock: v.stock ?? 0 })),
  };
}
