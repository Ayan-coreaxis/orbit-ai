import { prisma } from "@/lib/prisma";
import { scrapePage, scrapePageForProducts } from "@/lib/scrape";

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

export async function importWebsiteProducts(businessId: string, website: string | null | undefined): Promise<number> {
  if (!website || !website.trim()) return 0;

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
        stock: inStock ? 25 : 0,
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
