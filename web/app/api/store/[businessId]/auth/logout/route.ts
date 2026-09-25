import { NextResponse } from "next/server";
import { clearCustomerCookie } from "@/lib/store-auth";

export async function POST(_req: Request, { params }: { params: Promise<{ businessId: string }> }) {
  const { businessId } = await params;
  await clearCustomerCookie(businessId);
  return NextResponse.json({ ok: true });
}
