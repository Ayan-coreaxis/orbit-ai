import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getStoreCustomer } from "@/lib/store-auth";
import { getBalance, getLoyaltySettings } from "@/lib/loyalty";

/** The signed-in shopper's own balance + recent history. */
export async function GET(_req: Request, { params }: { params: Promise<{ businessId: string }> }) {
  const { businessId } = await params;
  const customer = await getStoreCustomer(businessId);
  const settings = await getLoyaltySettings(businessId);
  if (!customer) return NextResponse.json({ enabled: settings.enabled, signedIn: false, points: 0, history: [] });

  const [points, history] = await Promise.all([
    getBalance(businessId, customer.id),
    prisma.loyaltyTransaction.findMany({
      where: { businessId, customerId: customer.id },
      orderBy: { createdAt: "desc" },
      take: 30,
      select: { id: true, points: true, reason: true, orderId: true, createdAt: true },
    }),
  ]);

  return NextResponse.json({
    enabled: settings.enabled,
    signedIn: true,
    points,
    redeemRate: settings.redeemRate,
    minRedeem: settings.minRedeem,
    history: history.map((h) => ({ ...h, createdAt: h.createdAt.toISOString() })),
  });
}
