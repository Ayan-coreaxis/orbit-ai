import { NextResponse } from "next/server";
import { loadSite } from "@/lib/store-site-data";
import { serveSite } from "@/lib/store-site-serve";

/** A live page of an agent-built store (shown inside components/store/SiteFrame). */
export async function GET(req: Request, { params }: { params: Promise<{ businessId: string }> }) {
  const { businessId } = await params;
  const { live, published } = await loadSite(businessId);
  if (!published) return new NextResponse("Not found", { status: 404 });
  return serveSite(req, businessId, live, false);
}
