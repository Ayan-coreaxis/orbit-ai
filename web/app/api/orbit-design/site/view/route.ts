import { NextResponse } from "next/server";
import { getActiveBusinessId } from "@/lib/get-active-business-id";
import { loadSite } from "@/lib/store-site-data";
import { serveSite } from "@/lib/store-site-serve";

/** A page of the owner's DRAFT store. */
export async function GET(req: Request) {
  const businessId = await getActiveBusinessId();
  if (!businessId) return new NextResponse("Not found", { status: 404 });
  return serveSite(req, businessId, (await loadSite(businessId)).draft, true);
}
