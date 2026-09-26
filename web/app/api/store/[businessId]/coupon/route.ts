import { throttle } from "@/lib/guard";
import { NextRequest, NextResponse } from "next/server";
import { quoteCheckout } from "@/lib/checkout";
import { getStoreCustomer } from "@/lib/store-auth";

/** Live coupon + totals preview for the cart — same authoritative math the checkout uses. */
export async function POST(req: NextRequest, { params }: { params: Promise<{ businessId: string }> }) {
  const limited = await throttle(req, "shop-coupon", 120, 600000);
  if (limited) return limited;
  const { businessId } = await params;
  const b = (await req.json().catch(() => ({}))) as {
    items?: { productId?: string; variantId?: string | null; qty: number; bundleId?: string }[];
    code?: string;
    phone?: string;
    giftCardCode?: string;
    loyaltyPointsRedeem?: number;
    city?: string;
  };

  const customer = await getStoreCustomer(businessId);
  const quote = await quoteCheckout(businessId, b.items, b.code, b.phone, b.giftCardCode, customer?.id ?? null, b.loyaltyPointsRedeem, b.city);
  if (!quote.ok) return NextResponse.json({ ok: false, error: quote.error }, { status: 200 });

  return NextResponse.json({
    ok: true,
    subtotal: quote.subtotal,
    discount: quote.discount,
    couponCode: quote.couponCode,
    couponLabel: quote.couponLabel,
    shipping: quote.shipping,
    freeShipping: quote.freeShipping,
    tax: quote.tax,
    taxLabel: quote.taxLabel,
    giftCardCode: quote.giftCardCode,
    giftCardDiscount: quote.giftCardDiscount,
    loyaltyPointsRedeemed: quote.loyaltyPointsRedeemed,
    loyaltyDiscount: quote.loyaltyDiscount,
    bundleDiscount: quote.bundleDiscount,
    shippingZoneName: quote.shippingZoneName,
    total: quote.total,
    currency: quote.currency,
  });
}
