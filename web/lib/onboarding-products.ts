import { prisma } from "@/lib/prisma";
import { scrapePage, scrapePageForProducts, REALISTIC_HEADERS } from "@/lib/scrape";
import { safeFetch } from "@/lib/safe-fetch";
import { saveProductVariants } from "@/lib/product-variants-save";

/**
 * Best-effort product import during onboarding. Reads real product markup (schema.org / JSON-LD)
 * off the seller's own website and creates matching Product rows so their Orbit Design storefront
 * has a real catalogue from minute one.
 *
 * Most modern storefronts render zero product markup on the homepage — it lives on each product's
 * own page — so when the homepage yields nothing we follow the product links it exposes and read
 * a bounded number of those pages directly. Never invents data; a failure here never blocks onboarding.
 */

type Raw = { name?: string; price?: string; image?: string; availability?: string };

function parsePrice(raw: string | undefined): number | null {
  if (!raw) return null;
  const n = Number(String(raw).replace(/[^0-9.]/g, ""));
  return Number.isFinite(n) && n > 0 ? Math.round(n * 100) / 100 : null;
}

async function collectRawProducts(website: string): Promise<Raw[]> {
  const scrape = await scrapePageForProducts(website).catch(() => null);
  if (scrape?.rawProducts?.length) return scrape.rawProducts;

  const links = (scrape?.productLinks ?? []).slice(0, 12);
  if (!links.length) return [];

  // read the individual product pages (bounded, in parallel) — each carries its own JSON-LD
  const pages = await Promise.all(links.map((l) => scrapePage(l, 2000).catch(() => null)));
  return pages.flatMap((p) => p?.rawProducts ?? []);
}

// Stock the seller's site doesn't publish: an available item starts at this placeholder (the
// seller confirms real numbers later), a sold-out one at 0.
const PLACEHOLDER_STOCK = 25;

type FeedVariant = { options: Record<string, string>; price: number; available: boolean; imageUrl: string | null };
type FeedProduct = {
  name: string;
  description: string | null;
  price: number;
  imageUrl: string | null;
  gallery: string[];
  available: boolean;
  optionTypes: { name: string; values: string[] }[];
  variants: FeedVariant[];
};

async function getJson(url: string): Promise<unknown | null> {
  try {
    const res = await safeFetch(url, { signal: AbortSignal.timeout(10000), headers: { ...REALISTIC_HEADERS, Accept: "application/json" } });
    if (!res.ok || !(res.headers.get("content-type") ?? "").includes("json")) return null;
    return await res.json();
  } catch {
    return null;
  }
}

const stripHtml = (h: unknown) =>
  String(h ?? "")
    .replace(/<\/(p|div|li|h\d)>|<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&").replace(/&nbsp;/g, " ").replace(/&#39;|&rsquo;/g, "'").replace(/&quot;/g, '"')
    .replace(/\n{3,}/g, "\n\n")
    .trim()
    .slice(0, 4000) || null;

const httpUrl = (u: unknown) => (typeof u === "string" && /^https?:\/\//.test(u) ? u.slice(0, 500) : null);

/**
 * The seller's full catalogue when their platform publishes it — Shopify's public /products.json or
 * WooCommerce's Store API: real prices, descriptions, every photo and real variants (size / pack).
 * Far better than reading page markup, which usually has no price. Null when neither exists.
 */
async function readOwnCatalog(website: string): Promise<FeedProduct[] | null> {
  let base: string;
  try {
    base = new URL(/^https?:\/\//.test(website) ? website : `https://${website}`).origin;
  } catch {
    return null;
  }

  const shop = (await getJson(`${base}/products.json?limit=100`)) as { products?: Record<string, unknown>[] } | null;
  if (shop && Array.isArray(shop.products) && shop.products.length) {
    return shop.products.map((p) => {
      const images = (Array.isArray(p.images) ? (p.images as Record<string, unknown>[]) : []).map((i) => httpUrl(i.src)).filter((u): u is string => !!u);
      const imageById = new Map((Array.isArray(p.images) ? (p.images as Record<string, unknown>[]) : []).map((i) => [i.id, httpUrl(i.src)]));
      const rawOpts = (Array.isArray(p.options) ? (p.options as Record<string, unknown>[]) : []).map((o) => ({
        name: String(o.name ?? "").trim(),
        values: Array.isArray(o.values) ? (o.values as unknown[]).map((v) => String(v).trim()) : [],
      }));
      const vs = Array.isArray(p.variants) ? (p.variants as Record<string, unknown>[]) : [];
      // only axes with a real choice become variant options ("Size = 35 Grams" alone isn't a choice)
      const axes = rawOpts.map((o, i) => ({ ...o, i })).filter((o) => o.name && o.values.length > 1 && o.name !== "Title");
      const variants: FeedVariant[] = axes.length
        ? vs.map((v) => ({
            options: Object.fromEntries(axes.map((a) => [a.name, String(v[`option${a.i + 1}`] ?? "").trim()])),
            price: Number(v.price) || 0,
            available: v.available !== false,
            imageUrl: imageById.get(v.image_id) ?? null,
          }))
        : [];
      const prices = vs.map((v) => Number(v.price)).filter((n) => Number.isFinite(n) && n > 0);
      const buyable = vs.filter((v) => v.available !== false);
      const buyablePrices = buyable.map((v) => Number(v.price)).filter((n) => Number.isFinite(n) && n > 0);
      return {
        name: String(p.title ?? "").replace(/\s+/g, " ").trim(),
        description: stripHtml(p.body_html),
        // the price a shopper can actually buy at (cheapest available option), else the cheapest listed
        price: buyablePrices.length ? Math.min(...buyablePrices) : prices.length ? Math.min(...prices) : 0,
        imageUrl: images[0] ?? null,
        gallery: images.slice(1, 9),
        available: vs.length ? buyable.length > 0 : true,
        optionTypes: axes.map((a) => ({ name: a.name, values: a.values })),
        variants,
      };
    });
  }

  const woo = (await getJson(`${base}/wp-json/wc/store/v1/products?per_page=100`)) as Record<string, unknown>[] | null;
  if (Array.isArray(woo) && woo.length) {
    return woo.map((p) => {
      const pr = (p.prices ?? {}) as Record<string, unknown>;
      const minor = Number(pr.currency_minor_unit ?? 2);
      const images = (Array.isArray(p.images) ? (p.images as Record<string, unknown>[]) : []).map((i) => httpUrl(i.src)).filter((u): u is string => !!u);
      return {
        name: stripHtml(p.name) ?? "",
        description: stripHtml(p.description || p.short_description),
        price: Number.isFinite(Number(pr.price)) ? Number(pr.price) / 10 ** minor : 0,
        imageUrl: images[0] ?? null,
        gallery: images.slice(1, 9),
        available: p.is_in_stock !== false,
        optionTypes: [],
        variants: [],
      };
    });
  }
  return null;
}

async function importFromCatalog(businessId: string, items: FeedProduct[]): Promise<number> {
  const seen = new Set<string>();
  let count = 0;
  for (const it of items.slice(0, 60)) {
    const name = it.name.slice(0, 140);
    if (!name || seen.has(name.toLowerCase())) continue;
    seen.add(name.toLowerCase());
    try {
      const product = await prisma.product.create({
        data: {
          businessId,
          name,
          description: it.description,
          price: Math.round(it.price * 100) / 100,
          imageUrl: it.imageUrl,
          galleryUrls: it.gallery.length ? JSON.stringify(it.gallery) : null,
          stock: it.available ? PLACEHOLDER_STOCK : 0,
        },
      });
      if (it.optionTypes.length && it.variants.length) {
        const optionTypes = await saveProductVariants(product.id, {
          optionTypes: it.optionTypes,
          variants: it.variants.map((v) => ({ options: v.options, price: v.price, stock: v.available ? PLACEHOLDER_STOCK : 0, imageUrl: v.imageUrl })),
        });
        await prisma.product.update({ where: { id: product.id }, data: { optionTypes } });
      }
      count++;
    } catch {
      /* skip this one */
    }
  }
  return count;
}

export async function importWebsiteProducts(businessId: string, website: string | null | undefined): Promise<number> {
  if (!website || !website.trim()) return 0;

  // 1) the platform's own catalogue feed (Shopify / WooCommerce) — complete and exact
  const catalog = await readOwnCatalog(website.trim()).catch(() => null);
  if (catalog?.length) {
    const n = await importFromCatalog(businessId, catalog);
    if (n) return n;
  }

  let rawProducts: Raw[] = [];
  try {
    rawProducts = await collectRawProducts(website.trim());
  } catch {
    return 0;
  }
  if (!rawProducts.length) return 0;

  const seen = new Set<string>();
  const rows = rawProducts
    .filter((p) => {
      const name = (p.name ?? "").trim();
      if (!name || name.length > 140) return false;
      const key = name.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, 40)
    .map((p) => {
      const price = parsePrice(p.price);
      const inStock = !p.availability || /instock|in stock|available/i.test(p.availability);
      return {
        businessId,
        name: (p.name ?? "").trim(),
        price: price ?? 0,
        imageUrl: p.image && /^https?:\/\//.test(p.image) ? p.image.slice(0, 500) : null,
        stock: inStock ? PLACEHOLDER_STOCK : 0,
      };
    });

  if (!rows.length) return 0;
  try {
    const result = await prisma.product.createMany({ data: rows });
    return result.count;
  } catch {
    return 0;
  }
}
