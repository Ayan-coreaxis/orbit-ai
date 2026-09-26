import { NextResponse, type NextRequest } from "next/server";
import { appHost, businessForHost } from "@/lib/domains";

/**
 * Sellers' own domains. A request whose Host is a verified custom domain is served that seller's
 * store: "/" → /store/<id>, "/product/x" → /store/<id>/product/x, and so on. Orbit's own host,
 * localhost and preview hosts pass straight through. The dashboard is never served on a seller's
 * domain (those paths land inside /store/<id>/… and 404), so a store domain can't expose it.
 */
export async function proxy(req: NextRequest) {
  const host = (req.headers.get("x-forwarded-host") || req.headers.get("host") || "").toLowerCase().split(":")[0];
  if (!host || host === appHost() || host === "localhost" || /^(127\.|10\.|192\.168\.)/.test(host) || host.endsWith(".vercel.app")) {
    return NextResponse.next();
  }
  const businessId = await businessForHost(host);
  if (!businessId) {
    return new NextResponse("This store isn't connected yet.", { status: 404, headers: { "Content-Type": "text/plain; charset=utf-8" } });
  }
  const { pathname } = req.nextUrl;
  // Store pages already addressed by id (older links) work as they are.
  if (pathname.startsWith(`/store/${businessId}`)) return NextResponse.next();
  if (pathname.startsWith("/store/")) return new NextResponse("Not found", { status: 404 });
  const url = req.nextUrl.clone();
  url.pathname = `/store/${businessId}${pathname === "/" ? "" : pathname}`;
  return NextResponse.rewrite(url);
}

export const config = {
  // Everything except Next's own assets, APIs and uploaded files (those work on any host as-is).
  // /sitemap.xml is included on purpose: on a store domain it becomes that store's sitemap.
  matcher: ["/((?!_next/|api/|uploads/|favicon.ico).*)"],
};
