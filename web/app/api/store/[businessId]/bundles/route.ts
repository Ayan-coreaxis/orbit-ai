import { NextResponse } from "next/server";
import { listActiveBundles } from "@/lib/bundles";

/** Public — every real, active bundle for this store, for the storefront to display. */
export async function GET(_req: Request, { params }: { params: Promise<{ businessId: string }> }) {
  const { businessId } = await params;
  const bundles = await listActiveBundles(businessId);
  return NextResponse.json({ bundles });
}
