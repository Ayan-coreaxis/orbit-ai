import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getActiveBusinessId } from "@/lib/get-active-business-id";

export async function GET() {
  const businessId = await getActiveBusinessId();
  if (!businessId) return NextResponse.json({ error: "No active business." }, { status: 400 });

  const b = await prisma.business.findUnique({
    where: { id: businessId },
    select: { referralEnabled: true, referralReferrerPoints: true, referralRefereePoints: true },
  });
  return NextResponse.json({ settings: b });
}

export async function PATCH(req: NextRequest) {
  const businessId = await getActiveBusinessId();
  if (!businessId) return NextResponse.json({ error: "No active business." }, { status: 400 });

  const body = (await req.json().catch(() => ({}))) as {
    referralEnabled?: boolean;
    referralReferrerPoints?: number;
    referralRefereePoints?: number;
  };
  const data: Record<string, unknown> = {};
  if (typeof body.referralEnabled === "boolean") data.referralEnabled = body.referralEnabled;
  if (body.referralReferrerPoints !== undefined) {
    const v = Math.floor(Number(body.referralReferrerPoints));
    if (!Number.isFinite(v) || v < 0) return NextResponse.json({ error: "Referrer reward must be 0 or more." }, { status: 400 });
    data.referralReferrerPoints = v;
  }
  if (body.referralRefereePoints !== undefined) {
    const v = Math.floor(Number(body.referralRefereePoints));
    if (!Number.isFinite(v) || v < 0) return NextResponse.json({ error: "Referee bonus must be 0 or more." }, { status: 400 });
    data.referralRefereePoints = v;
  }

  const b = await prisma.business.update({
    where: { id: businessId },
    data,
    select: { referralEnabled: true, referralReferrerPoints: true, referralRefereePoints: true },
  });
  return NextResponse.json({ settings: b });
}
