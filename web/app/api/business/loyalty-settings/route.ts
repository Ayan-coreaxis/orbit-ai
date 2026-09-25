import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getActiveBusinessId } from "@/lib/get-active-business-id";

export async function GET() {
  const businessId = await getActiveBusinessId();
  if (!businessId) return NextResponse.json({ error: "No active business." }, { status: 400 });

  const b = await prisma.business.findUnique({
    where: { id: businessId },
    select: { loyaltyEnabled: true, loyaltyEarnRate: true, loyaltyRedeemRate: true, loyaltyMinRedeem: true },
  });
  return NextResponse.json({ settings: b });
}

export async function PATCH(req: NextRequest) {
  const businessId = await getActiveBusinessId();
  if (!businessId) return NextResponse.json({ error: "No active business." }, { status: 400 });

  const body = (await req.json().catch(() => ({}))) as {
    loyaltyEnabled?: boolean;
    loyaltyEarnRate?: number;
    loyaltyRedeemRate?: number;
    loyaltyMinRedeem?: number;
  };
  const data: Record<string, unknown> = {};
  if (typeof body.loyaltyEnabled === "boolean") data.loyaltyEnabled = body.loyaltyEnabled;
  if (body.loyaltyEarnRate !== undefined) {
    const v = Number(body.loyaltyEarnRate);
    if (!Number.isFinite(v) || v < 0) return NextResponse.json({ error: "Earn rate must be 0 or more." }, { status: 400 });
    data.loyaltyEarnRate = v;
  }
  if (body.loyaltyRedeemRate !== undefined) {
    const v = Number(body.loyaltyRedeemRate);
    if (!Number.isFinite(v) || v < 0) return NextResponse.json({ error: "Redeem rate must be 0 or more." }, { status: 400 });
    data.loyaltyRedeemRate = v;
  }
  if (body.loyaltyMinRedeem !== undefined) {
    const v = Math.floor(Number(body.loyaltyMinRedeem));
    if (!Number.isFinite(v) || v < 0) return NextResponse.json({ error: "Minimum redeem must be 0 or more." }, { status: 400 });
    data.loyaltyMinRedeem = v;
  }

  const b = await prisma.business.update({
    where: { id: businessId },
    data,
    select: { loyaltyEnabled: true, loyaltyEarnRate: true, loyaltyRedeemRate: true, loyaltyMinRedeem: true },
  });
  return NextResponse.json({ settings: b });
}
