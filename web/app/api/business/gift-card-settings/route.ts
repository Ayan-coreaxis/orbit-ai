import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getActiveBusinessId } from "@/lib/get-active-business-id";

export async function GET() {
  const businessId = await getActiveBusinessId();
  if (!businessId) return NextResponse.json({ error: "No active business." }, { status: 400 });

  const b = await prisma.business.findUnique({ where: { id: businessId }, select: { giftCardsEnabled: true } });
  return NextResponse.json({ settings: b });
}

export async function PATCH(req: NextRequest) {
  const businessId = await getActiveBusinessId();
  if (!businessId) return NextResponse.json({ error: "No active business." }, { status: 400 });

  const body = (await req.json().catch(() => ({}))) as { giftCardsEnabled?: boolean };
  const data: Record<string, unknown> = {};
  if (typeof body.giftCardsEnabled === "boolean") data.giftCardsEnabled = body.giftCardsEnabled;

  const b = await prisma.business.update({ where: { id: businessId }, data, select: { giftCardsEnabled: true } });
  return NextResponse.json({ settings: b });
}
