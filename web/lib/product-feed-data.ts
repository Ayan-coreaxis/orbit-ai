import { prisma } from "@/lib/prisma";
import { appBaseUrl, storeUrl } from "@/lib/public-url";
import { hasVariants, parseOptionTypes } from "@/lib/variants";
import { buildFeedItems, type FeedItem, type FeedStore } from "@/lib/product-feed";

function parseJson<T>(json: string | null | undefined, fallback: T): T {
  if (!json) return fallback;
  try {
    return JSON.parse(json) as T;
  } catch {
    return fallback;
  }
}

/** A published store's real products as catalog items, or null when the store isn't live. */
export async function loadStoreFeed(businessId: string): Promise<{ store: FeedStore; items: FeedItem[] } | null> {
  const b = await prisma.business.findUnique({
    where: { id: businessId },
    select: {
      name: true,
      storeCurrency: true,
      storeDesign: { select: { published: true, doc: true } },
      products: {
        orderBy: { createdAt: "asc" },
        select: {
          id: true,
          name: true,
          description: true,
          price: true,
          stock: true,
          imageUrl: true,
          galleryUrls: true,
          optionTypes: true,
          category: { select: { name: true } },
          variants: { orderBy: { createdAt: "asc" }, select: { id: true, label: true, options: true, price: true, stock: true, imageUrl: true } },
        },
      },
    },
  });
  if (!b?.storeDesign?.published || !b.storeDesign.doc) return null;

  const store: FeedStore = { name: b.name, currency: b.storeCurrency, baseUrl: await storeUrl(businessId), assetBase: appBaseUrl() };
  const items = buildFeedItems(
    store,
    b.products.map((p) => {
      const gallery = parseJson<unknown>(p.galleryUrls, []);
      const withVariants = hasVariants(parseOptionTypes(p.optionTypes)) && p.variants.length > 0;
      return {
        id: p.id,
        name: p.name,
        description: p.description,
        price: p.price,
        stock: p.stock,
        imageUrl: p.imageUrl,
        galleryUrls: Array.isArray(gallery) ? gallery.filter((g): g is string => typeof g === "string") : [],
        category: p.category?.name ?? null,
        variants: withVariants
          ? p.variants.map((v) => {
              const options = parseJson<unknown>(v.options, {});
              return { ...v, options: options && typeof options === "object" && !Array.isArray(options) ? (options as Record<string, string>) : {} };
            })
          : [],
      };
    }),
  );
  return { store, items };
}

export const FEED_CACHE = "public, max-age=600, s-maxage=3600, stale-while-revalidate=86400";
