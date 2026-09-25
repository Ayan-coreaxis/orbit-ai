import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getActiveBusinessId } from "@/lib/get-active-business-id";
import { getPlatformStripe, PLAN_PRICE_IDS } from "@/lib/platform-stripe";

/** Seller subscribing to (or changing) their real Starter/Growth/Scale plan via the platform's own Stripe account. */
export async function POST(req: NextRequest) {
  const businessId = await getActiveBusinessId();
  if (!businessId) return NextResponse.json({ error: "No active business." }, { status: 401 });

  const { plan, returnUrl } = (await req.json()) as { plan?: string; returnUrl?: string };
  if (!plan || !["starter", "growth", "scale"].includes(plan)) {
    return NextResponse.json({ error: "Invalid plan." }, { status: 400 });
  }
  if (!returnUrl) return NextResponse.json({ error: "Missing return URL." }, { status: 400 });

  const priceId = PLAN_PRICE_IDS[plan];
  if (!priceId) {
    return NextResponse.json(
      { error: `Billing for the ${plan} plan isn't set up yet — the platform owner needs to add a real Stripe Price id for it.` },
      { status: 501 },
    );
  }

  const stripe = getPlatformStripe();
  if (!stripe) {
    return NextResponse.json({ error: "Billing isn't connected yet — the platform owner needs to add a real Stripe secret key." }, { status: 501 });
  }

  const business = await prisma.business.findUnique({ where: { id: businessId }, include: { owner: true } });
  if (!business) return NextResponse.json({ error: "Business not found." }, { status: 404 });

  let customerId = business.stripeCustomerId;
  if (!customerId) {
    const customer = await stripe.customers.create({
      email: business.owner?.email,
      name: business.name,
      metadata: { businessId },
    });
    customerId = customer.id;
    await prisma.business.update({ where: { id: businessId }, data: { stripeCustomerId: customerId } });
  }

  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    customer: customerId,
    line_items: [{ price: priceId, quantity: 1 }],
    metadata: { businessId, plan },
    subscription_data: { metadata: { businessId, plan } },
    success_url: `${returnUrl}?billing=success`,
    cancel_url: `${returnUrl}?billing=cancelled`,
  });

  return NextResponse.json({ url: session.url });
}
