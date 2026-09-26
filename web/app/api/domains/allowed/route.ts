import { NextRequest, NextResponse } from "next/server";
import { businessForHost } from "@/lib/domains";

/**
 * For self-hosting behind Caddy: `on_demand_tls { ask https://<orbit>/api/domains/allowed }`.
 * Caddy calls this with ?domain=<host> before issuing a certificate; only verified store domains get one.
 */
export async function GET(req: NextRequest) {
  const domain = req.nextUrl.searchParams.get("domain") ?? "";
  return (await businessForHost(domain)) ? new NextResponse("ok") : new NextResponse("no", { status: 404 });
}
