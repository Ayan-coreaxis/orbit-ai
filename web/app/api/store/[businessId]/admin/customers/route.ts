import { NextRequest, NextResponse } from "next/server";
import { getActiveBusinessId } from "@/lib/get-active-business-id";
import { getStoreCustomers } from "@/lib/store-customers";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ businessId: string }> }) {
  const { businessId } = await params;
  const active = await getActiveBusinessId();
  if (!active || active !== businessId) return NextResponse.json({ error: "Not authorized." }, { status: 403 });
  return NextResponse.json(await getStoreCustomers(businessId));
}
