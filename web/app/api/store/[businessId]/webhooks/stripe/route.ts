import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getStoreStripe } from "@/lib/store-stripe";
import { finalizeStripeOrder } from "@/lib/checkout-finalize";
import { originFromRequest } from "@/lib/order-notify";

/**
 * Optional backup confirmation path for a seller's storefront Stripe. The primary path is the
 * return-url check on the order page; this webhook just covers the "customer closed the tab
 * before redirect" case. No-op unless the seller set their own `stripeWebhookSecret`.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ businessId: string }> }) {
  const { businessId } = await params;

  const biz = await prisma.business.findUnique({
    where: { id: businessId },
    select: { stripeWebhookSecret: true },
  });
  const secret = biz?.stripeWebhookSecret;
  if (!secret) return NextResponse.json({ ok: false, skipped: "no webhook secret" });

  const conn = await getStoreStripe(businessId);
  if (!conn) return NextResponse.json({ ok: false, skipped: "stripe not connected" });

  const sig = req.headers.get("stripe-signature") || "";
  const raw = await req.text();

  let event;
  try {
    event = conn.stripe.webhooks.constructEvent(raw, sig, secret);
  } catch (e) {
    return NextResponse.json({ error: `bad signature: ${String(e).slice(0, 120)}` }, { status: 400 });
  }

  if (event.type === "checkout.session.completed" || event.type === "checkout.session.async_payment_succeeded") {
    const session = event.data.object as { id: string };
    await finalizeStripeOrder(businessId, session.id, originFromRequest(req)).catch(() => {});
  }

  return NextResponse.json({ received: true });
}
