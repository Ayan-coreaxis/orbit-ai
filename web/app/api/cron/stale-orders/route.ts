import { cronAllowed } from "@/lib/guard";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { applyStockDelta } from "@/lib/checkout";
import { sweepRateLimits } from "@/lib/rate-limit";

/**
 * Housekeeping: cancel (and restock) cash-on-delivery orders the shopper never confirmed within
 * 48h, and sweep stale rate-limit rows. Meant to run hourly (see vercel.json).
 */
const VERIFY_TTL_MS = 48 * 60 * 60 * 1000;

interface Item {
  productId?: string;
  variantId?: string | null;
  qty?: number;
}

export async function GET(req: NextRequest) {
  if (!cronAllowed(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const cutoff = new Date(Date.now() - VERIFY_TTL_MS);
  const stale = await prisma.order.findMany({
    where: { verified: false, status: "pending", paymentProvider: "cod", createdAt: { lt: cutoff } },
    take: 200,
  });

  let cancelled = 0;
  for (const order of stale) {
    let items: Item[] = [];
    try {
      items = JSON.parse(order.items) as Item[];
    } catch {
      items = [];
    }
    await prisma.$transaction(async (tx) => {
      await applyStockDelta(
        tx,
        order.businessId,
        items.filter((it): it is Item & { productId: string; qty: number } => !!it.productId && !!it.qty),
        1,
      );
      await tx.order.update({
        where: { id: order.id },
        data: { status: "cancelled", cancelledAt: new Date(), verifyToken: null, sellerNote: "Auto-cancelled — not confirmed within 48h." },
      });
    });
    cancelled += 1;
  }

  const sweptLimits = await sweepRateLimits().catch(() => 0);
  return NextResponse.json({ cancelled, sweptLimits });
}
