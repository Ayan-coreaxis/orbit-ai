import { NextRequest, NextResponse } from "next/server";
import { getActiveBusinessId } from "@/lib/get-active-business-id";
import { getStoreAnalytics } from "@/lib/store-analytics";

/** Seller-only storefront analytics for the active business. */
export async function GET(req: NextRequest, { params }: { params: Promise<{ businessId: string }> }) {
  const { businessId } = await params;
  const active = await getActiveBusinessId();
  if (!active || active !== businessId) return NextResponse.json({ error: "Not authorized." }, { status: 403 });

  const range = Number(new URL(req.url).searchParams.get("range")) || 30;
  const data = await getStoreAnalytics(businessId, range);
  return NextResponse.json(data);
}
