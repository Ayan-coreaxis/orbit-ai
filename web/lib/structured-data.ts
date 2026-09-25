export interface ProductSummary {
  name?: string;
  price?: string;
  currency?: string;
  rating?: string;
  reviewCount?: string;
  availability?: string;
  image?: string;
}

function firstImageUrl(image: unknown): string | undefined {
  if (typeof image === "string") return image;
  if (Array.isArray(image)) return firstImageUrl(image[0]);
  if (image && typeof image === "object") {
    const obj = image as Record<string, unknown>;
    if (typeof obj.url === "string") return obj.url;
  }
  return undefined;
}

function flattenJsonLd(node: unknown, out: Record<string, unknown>[]): void {
  if (Array.isArray(node)) {
    node.forEach((n) => flattenJsonLd(n, out));
    return;
  }
  if (node && typeof node === "object") {
    const obj = node as Record<string, unknown>;
    if (obj["@graph"]) flattenJsonLd(obj["@graph"], out);
    const type = obj["@type"];
    const types = Array.isArray(type) ? type : [type];
    // "ProductGroup" is a real, equally-valid schema.org type for a variant-bearing product (used
    // by many modern storefronts, e.g. Shopify's newer themes) — same offers/price shape as a plain
    // "Product", just under a different @type. Recognizing it isn't a guess, it's the real spec.
    if (types.includes("Product") || types.includes("ProductGroup")) out.push(obj);
  }
}

function summarizeProduct(obj: Record<string, unknown>): ProductSummary {
  const offers = Array.isArray(obj.offers) ? obj.offers[0] : obj.offers;
  const offersObj = (offers ?? {}) as Record<string, unknown>;
  const rating = obj.aggregateRating as Record<string, unknown> | undefined;
  return {
    name: typeof obj.name === "string" ? obj.name : undefined,
    price: offersObj.price != null ? String(offersObj.price) : undefined,
    currency: typeof offersObj.priceCurrency === "string" ? offersObj.priceCurrency : undefined,
    availability:
      typeof offersObj.availability === "string" ? offersObj.availability.replace("https://schema.org/", "") : undefined,
    rating: rating?.ratingValue != null ? String(rating.ratingValue) : undefined,
    reviewCount: rating?.reviewCount != null ? String(rating.reviewCount) : undefined,
    image: firstImageUrl(obj.image),
  };
}

/** Extracts schema.org Product data (real price/rating/stock, not guessed from prose) from a page's JSON-LD blocks. */
export function extractProductsFromHtml(html: string): ProductSummary[] {
  const blocks = [...html.matchAll(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)];
  const products: Record<string, unknown>[] = [];
  for (const block of blocks) {
    try {
      const parsed = JSON.parse(block[1].trim());
      flattenJsonLd(parsed, products);
    } catch {
      // malformed JSON-LD — skip it, never guess
    }
  }
  return products.slice(0, 8).map(summarizeProduct);
}

/** Same extraction, from an already-rendered DOM (for the headless-browser fallback path). */
export function extractProductsFromJsonLdStrings(jsonStrings: string[]): ProductSummary[] {
  const products: Record<string, unknown>[] = [];
  for (const str of jsonStrings) {
    try {
      flattenJsonLd(JSON.parse(str), products);
    } catch {
      // skip malformed blocks
    }
  }
  return products.slice(0, 8).map(summarizeProduct);
}

export function formatProductSummaries(products: ProductSummary[]): string {
  if (products.length === 0) return "(no structured product data found on this page)";
  return products
    .map((p) => {
      const parts = [p.name ?? "unnamed product"];
      if (p.price) parts.push(`${p.currency ?? ""}${p.price}`.trim());
      if (p.rating) parts.push(`rating ${p.rating}${p.reviewCount ? ` (${p.reviewCount} reviews)` : ""}`);
      if (p.availability) parts.push(p.availability);
      return `- ${parts.join(", ")}`;
    })
    .join("\n");
}
