import { NextResponse } from "next/server";
import { getActiveBusinessId } from "@/lib/get-active-business-id";
import { notificationsFor } from "@/lib/notifications";

export async function GET() {
  const businessId = await getActiveBusinessId();
  if (!businessId) return NextResponse.json({ items: [] });
  return NextResponse.json({ items: await notificationsFor(businessId) }, { headers: { "Cache-Control": "no-store" } });
}
