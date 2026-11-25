import { prisma } from "@/lib/prisma";
import { sanitizeHtml } from "@/lib/sanitize-html";
import { parseOptionTypes, hasVariants } from "@/lib/variants";
import { withSales } from "@/lib/storefront-products";
import { getProductReviews } from "@/lib/product-reviews";
import { loadDoc } from "@/lib/orbit-design-generate";
import { r2Config } from "@/lib/storage";
import { parseBuild, parseSite, type SiteData, type SiteProduct } from "@/lib/store-site";

const json = <T,>(raw: string | null | undefined, or: T): T => {
  try {
    return raw ? (JSON.parse(raw) as T) : or;
  } catch {
    return or;
  }
};

/** The real catalogue and contact details an agent-built store runs on. Only details the seller has
 *  put on their store — never Business.whatsapp, which is the owner's own number. */
export async function siteData(businessId: string, productId?: string | null): Promise<SiteData | null> {
  const b = await prisma.business.findUnique({ where: { id: businessId }, select: { id: true, name: true, storeCurrency: true } });
  if (!b) return null;
  const [rows, doc] = await Promise.all([
    prisma.product.findMany({ where: { businessId }, orderBy: { createdAt: "desc" }, include: { variants: { orderBy: { createdAt: "asc" } }, category: { select: { name: true } } }, take: 500 }),
    loadDoc(businessId).catch(() => null),
  ]);
  const products: SiteProduct[] = rows.map((p) => {
    const types = parseOptionTypes(p.optionTypes);
    const variants = hasVariants(types)
      ? p.variants.map((v) => ({ id: v.id, label: v.label, options: json<Record<string, string>>(v.options, {}), price: v.price ?? p.price, stock: v.stock, image: v.imageUrl }))
      : [];
    const gallery = json<string[]>(p.galleryUrls, []);
    return {
      id: p.id,
      name: p.name,
      price: p.price,
      fromPrice: variants.length ? Math.min(...variants.map((v) => v.price)) : undefined,
      image: p.imageUrl,
      images: [p.imageUrl, ...(Array.isArray(gallery) ? gallery : [])].filter((x): x is string => !!x),
      description: p.description ? sanitizeHtml(p.description) : "",
      category: p.category?.name ?? null,
      stock: variants.length ? variants.reduce((s, v) => s + Math.max(0, v.stock), 0) : p.stock,
      options: hasVariants(types) ? types.map((t) => ({ name: t.name, values: t.values })) : [],
      variants,
    };
  });
  const sold = await withSales(businessId, products);
  if (productId) {
    const p = sold.find((x) => x.id === productId);
    const r = p ? await getProductReviews(businessId, productId).catch(() => null) : null;
    if (p && r?.count) {
      p.rating = { average: r.average, count: r.count };
      p.reviews = r.items.slice(0, 30);
    }
  }
  const c = doc?.content;
  return {
    store: {
      id: b.id,
      name: doc?.storeName || b.name,
      currency: b.storeCurrency,
      email: c?.contactEmail ?? "",
      phone: c?.contactPhone ?? "",
      address: c?.contactAddress ?? "",
      socials: Object.fromEntries(Object.entries(c?.socials ?? {}).filter(([, v]) => !!v)),
      announcement: c?.announcement?.enabled ? c.announcement.text : "",
    },
    products: sold,
  };
}

export async function loadSite(businessId: string) {
  const d = await prisma.storeDesign.findUnique({ where: { businessId }, select: { site: true, siteLive: true, siteBuild: true, published: true } });
  return { draft: parseSite(d?.site), live: parseSite(d?.siteLive), build: parseBuild(d?.siteBuild), published: d?.published ?? false, dirty: !!d?.site && d.site !== d.siteLive };
}

/** Where uploaded media is served from, when it isn't this server. */
export function mediaOrigin(): string {
  try {
    const u = r2Config()?.publicUrl;
    return u ? new URL(u).origin : "";
  } catch {
    return "";
  }
}
