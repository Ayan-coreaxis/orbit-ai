/**
 * Product catalog feeds — Google Merchant Center (RSS 2.0, g: namespace) and Meta Commerce
 * Manager (CSV). Pure builders: the routes load the store's real products and hand them in.
 * Nothing here is made up: no GTIN / MPN (identifier_exists = no), no category guesses, and a
 * product without a photo or a price is left out because both catalogs would reject it.
 */

export interface FeedVariant {
  id: string;
  label: string;
  /** { "Size": "M", "Color": "Black" } */
  options: Record<string, string>;
  price: number | null;
  stock: number;
  imageUrl: string | null;
}

export interface FeedProduct {
  id: string;
  name: string;
  /** Rich text (HTML) as the seller wrote it. */
  description: string | null;
  price: number;
  stock: number;
  imageUrl: string | null;
  galleryUrls: string[];
  category: string | null;
  /** Purchasable combinations; empty = a simple product. */
  variants: FeedVariant[];
}

export interface FeedStore {
  name: string;
  /** 3-letter code, any case. */
  currency: string;
  /** The store's public address, no trailing slash. */
  baseUrl: string;
  /** Where site-relative files (/uploads/…) are served from, no trailing slash. */
  assetBase: string;
}

export interface FeedItem {
  id: string;
  title: string;
  description: string;
  link: string;
  imageLink: string;
  additionalImageLinks: string[];
  inStock: boolean;
  /** "2450.00 PKR" */
  price: string;
  brand: string;
  itemGroupId: string | null;
  size: string | null;
  color: string | null;
  productType: string | null;
}

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", "#39": "'" };

/** Rich text → plain text, trimmed to what the catalogs accept. */
export function plainText(html: string | null | undefined, max = 5000): string {
  if (!html) return "";
  const text = html
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<\/(p|div|li|h[1-6]|tr)>|<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e: string) => {
      const k = e.toLowerCase();
      if (k in ENTITIES) return ENTITIES[k];
      if (k.startsWith("#x")) return safeChar(parseInt(k.slice(2), 16));
      if (k.startsWith("#")) return safeChar(parseInt(k.slice(1), 10));
      return m;
    })
    .replace(/[ \t\r\f\v]+/g, " ")
    .replace(/ ?\n ?/g, "\n")
    .replace(/\n{2,}/g, "\n")
    .trim();
  return text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text;
}

function safeChar(code: number): string {
  try {
    return Number.isFinite(code) && code > 0 ? String.fromCodePoint(code) : "";
  } catch {
    return "";
  }
}

/** "2450.00 PKR" — the form both catalogs expect. */
export function feedPrice(amount: number, currency: string): string {
  return `${amount.toFixed(2)} ${(currency || "pkr").toUpperCase()}`;
}

/** Characters XML 1.0 doesn't allow are dropped; the five special ones are escaped. */
export function escapeXml(s: string): string {
  return s
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F￾￿]/g, "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/** One CSV cell (RFC 4180): quoted when it holds a comma, quote or line break. */
export function csvCell(s: string): string {
  return /[",\r\n]/.test(s) || /^\s|\s$/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function absolute(url: string | null | undefined, assetBase: string): string | null {
  const u = (url ?? "").trim();
  if (!u) return null;
  if (/^https?:\/\//i.test(u)) return u;
  if (u.startsWith("//")) return `https:${u}`;
  if (u.startsWith("/")) return `${assetBase}${u}`;
  return null;
}

function option(options: Record<string, string>, names: string[]): string | null {
  for (const [k, v] of Object.entries(options)) {
    if (names.includes(k.trim().toLowerCase()) && String(v ?? "").trim()) return String(v).trim();
  }
  return null;
}

const clip = (s: string, max: number) => (s.length > max ? s.slice(0, max).trimEnd() : s);

/** Products → catalog items: one per simple product, one per variant (grouped) otherwise. */
export function buildFeedItems(store: FeedStore, products: FeedProduct[]): FeedItem[] {
  const items: FeedItem[] = [];
  for (const p of products) {
    const name = p.name.trim();
    if (!name) continue;
    const link = `${store.baseUrl}/product/${p.id}`;
    const description = plainText(p.description) || name;
    const mainImage = absolute(p.imageUrl, store.assetBase);
    const gallery = p.galleryUrls.map((g) => absolute(g, store.assetBase)).filter((g): g is string => !!g);
    const base = { description, link, brand: store.name, productType: p.category?.trim() || null };

    if (p.variants.length === 0) {
      const image = mainImage ?? gallery[0];
      if (!image || !(p.price > 0)) continue;
      items.push({
        ...base,
        id: p.id,
        title: clip(name, 150),
        imageLink: image,
        additionalImageLinks: unique(gallery, image),
        inStock: p.stock > 0,
        price: feedPrice(p.price, store.currency),
        itemGroupId: null,
        size: null,
        color: null,
      });
      continue;
    }

    for (const v of p.variants) {
      const price = v.price ?? p.price;
      const image = absolute(v.imageUrl, store.assetBase) ?? mainImage ?? gallery[0];
      if (!image || !(price > 0)) continue;
      const label = v.label.trim();
      items.push({
        ...base,
        id: v.id,
        title: clip(label ? `${name} - ${label}` : name, 150),
        imageLink: image,
        additionalImageLinks: unique([...(mainImage ? [mainImage] : []), ...gallery], image),
        inStock: v.stock > 0,
        price: feedPrice(price, store.currency),
        itemGroupId: p.id,
        size: option(v.options, ["size"]),
        color: option(v.options, ["color", "colour"]),
      });
    }
  }
  return items;
}

function unique(urls: string[], not: string): string[] {
  return [...new Set(urls)].filter((u) => u !== not).slice(0, 10);
}

/** Google Merchant Center feed (RSS 2.0). */
export function buildGoogleFeedXml(store: FeedStore, items: FeedItem[]): string {
  const tag = (name: string, value: string | null) => (value ? `      <g:${name}>${escapeXml(value)}</g:${name}>\n` : "");
  const body = items
    .map(
      (i) =>
        "    <item>\n" +
        tag("id", i.id) +
        tag("title", i.title) +
        tag("description", i.description) +
        tag("link", i.link) +
        tag("image_link", i.imageLink) +
        i.additionalImageLinks.map((u) => tag("additional_image_link", u)).join("") +
        tag("availability", i.inStock ? "in_stock" : "out_of_stock") +
        tag("price", i.price) +
        tag("brand", i.brand) +
        tag("condition", "new") +
        tag("identifier_exists", "no") +
        tag("item_group_id", i.itemGroupId) +
        tag("size", i.size) +
        tag("color", i.color) +
        tag("product_type", i.productType) +
        "    </item>\n",
    )
    .join("");
  return (
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<rss version="2.0" xmlns:g="http://base.google.com/ns/1.0">\n` +
    `  <channel>\n` +
    `    <title>${escapeXml(store.name)}</title>\n` +
    `    <link>${escapeXml(store.baseUrl)}</link>\n` +
    `    <description>${escapeXml(`Products from ${store.name}`)}</description>\n` +
    body +
    `  </channel>\n` +
    `</rss>\n`
  );
}

export const META_CSV_COLUMNS = [
  "id",
  "title",
  "description",
  "availability",
  "condition",
  "price",
  "link",
  "image_link",
  "brand",
  "item_group_id",
  "additional_image_link",
  "size",
  "color",
  "product_type",
] as const;

/** Meta Commerce Manager catalog feed (CSV). */
export function buildMetaFeedCsv(items: FeedItem[]): string {
  const rows = items.map((i) =>
    [
      i.id,
      i.title,
      i.description,
      i.inStock ? "in stock" : "out of stock",
      "new",
      i.price,
      i.link,
      i.imageLink,
      i.brand,
      i.itemGroupId ?? "",
      i.additionalImageLinks.join(","),
      i.size ?? "",
      i.color ?? "",
      i.productType ?? "",
    ]
      .map(csvCell)
      .join(","),
  );
  return [META_CSV_COLUMNS.join(","), ...rows].join("\r\n") + "\r\n";
}
