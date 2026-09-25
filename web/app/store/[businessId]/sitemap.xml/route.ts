import { prisma } from "@/lib/prisma";

/** Per-store sitemap: home, designed pages, and every product. */
export async function GET(req: Request, { params }: { params: Promise<{ businessId: string }> }) {
  const { businessId } = await params;
  const origin = new URL(req.url).origin;
  const base = `${origin}/store/${businessId}`;

  const business = await prisma.business.findUnique({
    where: { id: businessId },
    select: {
      storeDesign: { select: { published: true, doc: true } },
      products: { select: { id: true, createdAt: true } },
    },
  });
  if (!business?.storeDesign?.published || !business.storeDesign.doc) return new Response("Not found", { status: 404 });

  const urls: { loc: string; lastmod?: string }[] = [{ loc: base }];

  try {
    const doc = JSON.parse(business.storeDesign.doc) as { pages?: { slug: string }[] };
    for (const p of doc.pages ?? []) if (p.slug && p.slug !== "home") urls.push({ loc: `${base}/p/${p.slug}` });
  } catch {
    /* ignore */
  }
  for (const p of business.products) urls.push({ loc: `${base}/product/${p.id}`, lastmod: p.createdAt.toISOString() });

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls
  .map((u) => `  <url><loc>${u.loc}</loc>${u.lastmod ? `<lastmod>${u.lastmod}</lastmod>` : ""}</url>`)
  .join("\n")}
</urlset>`;

  return new Response(xml, { headers: { "Content-Type": "application/xml" } });
}
