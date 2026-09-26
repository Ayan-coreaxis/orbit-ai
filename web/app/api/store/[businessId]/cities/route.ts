import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { listShippingZones } from "@/lib/shipping-zones";
import { PK_CITIES } from "@/lib/pk-cities";

/** Suggestions for the checkout city field: the store's delivery-zone cities, plus Pakistan's main cities for PKR stores. */
export async function GET(_req: Request, { params }: { params: Promise<{ businessId: string }> }) {
  const { businessId } = await params;
  const b = await prisma.business.findUnique({ where: { id: businessId }, select: { storeCurrency: true } });
  if (!b) return NextResponse.json({ cities: [] }, { status: 404 });
  const zoneCities = (await listShippingZones(businessId)).flatMap((z) => z.cities);
  const all = [...zoneCities, ...(b.storeCurrency?.toLowerCase() === "pkr" ? PK_CITIES : [])];
  const seen = new Set<string>();
  const cities = all.filter((c) => {
    const k = c.trim().toLowerCase();
    if (!k || seen.has(k)) return false;
    seen.add(k);
    return true;
  });
  return NextResponse.json({ cities }, { headers: { "Cache-Control": "public, max-age=300" } });
}
