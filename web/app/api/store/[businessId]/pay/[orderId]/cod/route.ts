import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { throttle } from "@/lib/guard";
import { originFromRequest } from "@/lib/order-notify";
import { getStoreStripe, paymentOptions } from "@/lib/store-stripe";
import { switchOrderToCod } from "@/lib/checkout-finalize";

/**
 * "Pay cash on delivery instead" on the order page of an unpaid JazzCash / Easypaisa order.
 * Only when the store offers cash on delivery at all.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ businessId: string; orderId: string }> }) {
  const limited = await throttle(req, "shop-pay-cod", 20, 600000);
  if (limited) return limited;
  const { businessId, orderId } = await params;
  const origin = originFromRequest(req);
  const orderPage = `${origin}/store/${businessId}/order/${orderId}`;

  const business = await prisma.business.findUnique({ where: { id: businessId }, select: { paymentProvider: true } });
  if (!business) return NextResponse.json({ error: "Store not found." }, { status: 404 });
  const codOffered = paymentOptions(business.paymentProvider, !!(await getStoreStripe(businessId))).includes("cod");
  if (!codOffered) return NextResponse.redirect(`${orderPage}?pay=nocod`, 303);

  const res = await switchOrderToCod(orderId, businessId, origin);
  return NextResponse.redirect(res.ok ? orderPage : `${orderPage}?pay=codfailed`, 303);
}
