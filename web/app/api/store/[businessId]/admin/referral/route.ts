import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getActiveBusinessId } from "@/lib/get-active-business-id";

/** Seller view: every referral (pending + rewarded), newest first, with names on both sides. */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ businessId: string }> }) {
  const { businessId } = await params;
  const active = await getActiveBusinessId();
  if (!active || active !== businessId) return NextResponse.json({ error: "Not authorized." }, { status: 403 });

  const referrals = await prisma.referral.findMany({
    where: { businessId },
    orderBy: { createdAt: "desc" },
    take: 50,
    include: {
      referrer: { select: { name: true, email: true, phone: true } },
      referee: { select: { name: true, email: true, phone: true } },
    },
  });

  return NextResponse.json({
    referrals: referrals.map((r) => ({
      id: r.id,
      referrerName: r.referrer.name,
      refereeName: r.referee.name,
      status: r.status,
      createdAt: r.createdAt.toISOString(),
      rewardedAt: r.rewardedAt?.toISOString() ?? null,
    })),
  });
}
