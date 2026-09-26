import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getActiveBusinessId } from "@/lib/get-active-business-id";
import { applySubscription, getPlatformStripe, PAID_PLANS, planPriceId, subscriptionIsLive } from "@/lib/platform-stripe";

/**
 * Seller subscribing to (or changing) their Starter/Growth/Scale plan via the platform's own Stripe.
 * No subscription yet → Stripe Checkout. Already subscribed → the existing subscription is switched
 * to the new price (prorated, charged or credited now), so a seller is never billed twice.
 */
export async function POST(req: NextRequest) {
  const businessId = await getActiveBusinessId();
  if (!businessId) return NextResponse.json({ error: "No active business." }, { status: 401 });

  const { plan, returnUrl } = (await req.json().catch(() => ({}))) as { plan?: string; returnUrl?: string };
  if (!plan || !(PAID_PLANS as readonly string[]).includes(plan)) {
    return NextResponse.json({ error: "Invalid plan." }, { status: 400 });
  }
  let back: URL;
  try {
    back = new URL(returnUrl ?? "");
    if (!/^https?:$/.test(back.protocol)) throw new Error();
  } catch {
    return NextResponse.json({ error: "Missing return URL." }, { status: 400 });
  }
  const returnTo = `${back.origin}${back.pathname}`;

  const priceId = planPriceId(plan);
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

  try {
    // Already paying → change the plan on the same subscription.
    if (business.stripeSubscriptionId && subscriptionIsLive(business.subscriptionStatus)) {
      const sub = await stripe.subscriptions.retrieve(business.stripeSubscriptionId);
      if (subscriptionIsLive(sub.status)) {
        const item = sub.items.data[0];
        if (item?.price?.id === priceId) return NextResponse.json({ url: `${returnTo}?billing=success` });
        const updated = await stripe.subscriptions.update(sub.id, {
          items: [{ id: item.id, price: priceId }],
          proration_behavior: "always_invoice",
          // The new price only takes effect once its invoice is paid.
          payment_behavior: "pending_if_incomplete",
          cancel_at_period_end: false,
          metadata: { businessId, plan },
        });
        await applySubscription(businessId, updated);
        return NextResponse.json({ url: `${returnTo}?billing=${updated.pending_update ? "pending" : "changed"}` });
      }
    }

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
      success_url: `${returnTo}?billing=success`,
      cancel_url: `${returnTo}?billing=cancelled`,
    });
    return NextResponse.json({ url: session.url });
  } catch (e) {
    return NextResponse.json({ error: `Stripe: ${e instanceof Error ? e.message : "couldn't start billing"}`.slice(0, 300) }, { status: 502 });
  }
}
