import { NextRequest, NextResponse } from "next/server";
import { listShippingZones, createShippingZone, updateShippingZone, deleteShippingZone } from "@/lib/shipping-zones";
import { getActiveBusinessId } from "@/lib/get-active-business-id";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ businessId: string }> }) {
  const { businessId } = await params;
  const active = await getActiveBusinessId();
  if (!active || active !== businessId) return NextResponse.json({ error: "Not authorized." }, { status: 403 });

  const zones = await listShippingZones(businessId);
  return NextResponse.json({ zones });
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ businessId: string }> }) {
  const { businessId } = await params;
  const active = await getActiveBusinessId();
  if (!active || active !== businessId) return NextResponse.json({ error: "Not authorized." }, { status: 403 });

  const body = (await req.json().catch(() => ({}))) as { name?: string; cities?: string[]; fee?: number; freeOver?: number | null; priority?: number };
  try {
    const zone = await createShippingZone(businessId, {
      name: body.name ?? "",
      cities: Array.isArray(body.cities) ? body.cities : [],
      fee: Number(body.fee),
      freeOver: body.freeOver ?? null,
      priority: body.priority,
    });
    return NextResponse.json({ ok: true, zone });
  } catch (e) {
    return NextResponse.json({ error: String(e instanceof Error ? e.message : e).slice(0, 200) }, { status: 400 });
  }
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ businessId: string }> }) {
  const { businessId } = await params;
  const active = await getActiveBusinessId();
  if (!active || active !== businessId) return NextResponse.json({ error: "Not authorized." }, { status: 403 });

  const body = (await req.json().catch(() => ({}))) as {
    zoneId?: string;
    name?: string;
    cities?: string[];
    fee?: number;
    freeOver?: number | null;
    priority?: number;
  };
  if (!body.zoneId) return NextResponse.json({ error: "Missing zone." }, { status: 400 });
  await updateShippingZone(businessId, body.zoneId, {
    name: body.name,
    cities: body.cities,
    fee: body.fee,
    freeOver: body.freeOver,
    priority: body.priority,
  });
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ businessId: string }> }) {
  const { businessId } = await params;
  const active = await getActiveBusinessId();
  if (!active || active !== businessId) return NextResponse.json({ error: "Not authorized." }, { status: 403 });

  const zoneId = req.nextUrl.searchParams.get("zoneId") || "";
  if (!zoneId) return NextResponse.json({ error: "Missing zone." }, { status: 400 });
  await deleteShippingZone(businessId, zoneId);
  return NextResponse.json({ ok: true });
}
