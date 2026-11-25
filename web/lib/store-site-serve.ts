import { NextResponse } from "next/server";
import { composePage, siteHeaders, type StoreSite } from "@/lib/store-site";
import { mediaOrigin, siteData, siteOrder } from "@/lib/store-site-data";

/** The address the shopper's browser is really using (a seller's own domain sits behind a proxy). */
export function requestOrigin(req: Request): string {
  const host = (req.headers.get("x-forwarded-host") || req.headers.get("host") || new URL(req.url).host).split(",")[0].trim();
  const proto = (req.headers.get("x-forwarded-proto") || new URL(req.url).protocol.replace(":", "")).split(",")[0].trim();
  return /^[a-z0-9.:-]+$/i.test(host) ? `${proto === "https" ? "https" : "http"}://${host}` : new URL(req.url).origin;
}

/** One page of an agent-built store, sandboxed. */
export async function serveSite(req: Request, businessId: string, site: StoreSite | null, preview: boolean) {
  const q = new URL(req.url).searchParams;
  const data = site ? await siteData(businessId, q.get("product")) : null;
  const slug = q.get("page") || "home";
  if (!site || !data) return new NextResponse("Not found", { status: 404 });
  const productId = q.get("product") ?? (preview && slug === "product" ? (data.products[0]?.id ?? null) : null);
  const orderId = slug === "thanks" && !preview ? q.get("order") : null;
  const order = orderId ? await siteOrder(businessId, orderId) : null;
  const origin = requestOrigin(req);
  const html = composePage(site, { slug, productId, order, data, origin, mediaOrigin: mediaOrigin(), preview, firstVisit: q.get("seen") !== "1" });
  if (!html) return new NextResponse("Not found", { status: 404 });
  return new NextResponse(html, { headers: siteHeaders(origin, mediaOrigin()) });
}
