import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getStoreStripe } from "@/lib/store-stripe";
import { getStoreWallets, allPaymentOptions } from "@/lib/store-wallets";

/** Public: what the storefront cart should show — payment methods + shipping rule. */
export async function GET(_req: Request, { params }: { params: Promise<{ businessId: string }> }) {
  const { businessId } = await params;
  const b = await prisma.business.findUnique({
    where: { id: businessId },
    select: { paymentProvider: true, storeCurrency: true, shippingFee: true, freeShippingOver: true },
  });
  if (!b) return NextResponse.json({ error: "Store not found." }, { status: 404 });

  const conn = await getStoreStripe(businessId);
  return NextResponse.json({
    options: allPaymentOptions(b.paymentProvider, !!conn, await getStoreWallets(businessId)),
    currency: b.storeCurrency || "usd",
    shippingFee: b.shippingFee || 0,
    freeShippingOver: b.freeShippingOver,
  });
}
