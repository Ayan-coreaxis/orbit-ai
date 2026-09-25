import { prisma } from "@/lib/prisma";
import { loadSpec } from "@/lib/store-backend";

export interface ProductReview {
  rating: number;
  title?: string;
  body?: string;
  name: string;
  date: string;
}

export interface ProductReviewSummary {
  average: number;
  count: number;
  items: ProductReview[];
}

/**
 * Storefront rating + reviews for one product, from BOTH real sources: post-delivery `Review`
 * rows (order-linked) and any Orbit-Code `reviews` collection (`StoreRecord`) the seller enabled.
 */
export async function getProductReviews(businessId: string, productId: string): Promise<ProductReviewSummary> {
  const [fromReviews, spec] = await Promise.all([
    prisma.review.findMany({
      where: { businessId, productId, status: "submitted", published: true, rating: { not: null } },
      orderBy: { respondedAt: "desc" },
      take: 50,
      select: { rating: true, comment: true, customerName: true, customerPhone: true, respondedAt: true, requestedAt: true },
    }),
    loadSpec(businessId).catch(() => null),
  ]);

  const items: ProductReview[] = fromReviews.map((r) => ({
    rating: r.rating ?? 5,
    body: r.comment ?? undefined,
    name: r.customerName || maskPhone(r.customerPhone),
    date: (r.respondedAt ?? r.requestedAt).toISOString(),
  }));

  // Orbit-Code review collection (a StoreRecord collection with onProduct + a stars field)
  const reviewCol = spec?.collections.find((c) => c.onProduct && c.fields.some((f) => f.t === "stars"));
  if (reviewCol) {
    const starKey = reviewCol.fields.find((f) => f.t === "stars")?.k;
    const rows = await prisma.storeRecord.findMany({
      where: { businessId, collection: reviewCol.name, productId, status: "published" },
      orderBy: { createdAt: "desc" },
      take: 50,
      select: { data: true, createdAt: true },
    });
    for (const row of rows) {
      let d: Record<string, unknown> = {};
      try {
        d = JSON.parse(row.data);
      } catch {
        continue;
      }
      const rating = starKey ? Number(d[starKey]) : NaN;
      if (!Number.isFinite(rating)) continue;
      const textField = reviewCol.fields.find((f) => f.t === "textarea")?.k;
      const titleField = reviewCol.fields.find((f) => f.t === "text" && f.k !== "_name")?.k;
      items.push({
        rating: Math.min(5, Math.max(1, Math.round(rating))),
        title: titleField ? String(d[titleField] ?? "") || undefined : undefined,
        body: textField ? String(d[textField] ?? "") || undefined : undefined,
        name: String(d._name ?? "Verified buyer"),
        date: row.createdAt.toISOString(),
      });
    }
  }

  items.sort((a, b) => +new Date(b.date) - +new Date(a.date));
  const count = items.length;
  const average = count ? Math.round((items.reduce((s, i) => s + i.rating, 0) / count) * 10) / 10 : 0;
  return { average, count, items: items.slice(0, 30) };
}

function maskPhone(p: string): string {
  const d = p.replace(/\D/g, "");
  return d.length >= 4 ? `Buyer ••${d.slice(-4)}` : "Verified buyer";
}
