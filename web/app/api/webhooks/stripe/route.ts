import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { prisma } from "@/lib/prisma";
import { applySubscription, businessForStripe, getPlatformStripe } from "@/lib/platform-stripe";
import { PLAN_DEFAULT_CAP_USD } from "@/lib/usage-limit";

/**
 * Real Stripe webhook for SaaS platform billing (a seller paying US for their plan) — auto-
 * provisions plan + usage cap the moment a real subscription is created or changes, and pauses the
 * AI agents when it ends, so nobody has to flip a switch in /admin/sellers.
 */
export async function POST(req: NextRequest) {
  const stripe = getPlatformStripe();
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!stripe || !webhookSecret) {
    return NextResponse.json({ error: "Billing webhook isn't configured." }, { status: 501 });
  }

  const signature = req.headers.get("stripe-signature");
  const rawBody = await req.text();
  if (!signature) return NextResponse.json({ error: "Missing signature." }, { status: 400 });

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);
  } catch (e) {
    const detail = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: `Invalid signature: ${detail}` }, { status: 400 });
  }

  switch (event.type) {
    case "checkout.session.completed": {
      const session = event.data.object as Stripe.Checkout.Session;
      if (session.mode !== "subscription") break;
      const businessId = await businessForStripe(session.metadata?.businessId, session.customer);
      const plan = session.metadata?.plan;
      if (!businessId || !plan) break;
      await prisma.business.update({
        where: { id: businessId },
        data: {
          plan,
          monthlyUsageCapUsd: PLAN_DEFAULT_CAP_USD[plan] ?? 15,
          stripeCustomerId: typeof session.customer === "string" ? session.customer : session.customer?.id,
          stripeSubscriptionId: typeof session.subscription === "string" ? session.subscription : session.subscription?.id,
          subscriptionStatus: "active",
        },
      });
      break;
    }

    case "customer.subscription.created":
    case "customer.subscription.updated":
    case "customer.subscription.deleted": {
      const sub = event.data.object as Stripe.Subscription;
      const businessId = await businessForStripe(sub.metadata?.businessId, sub.customer);
      if (!businessId) break;
      await applySubscription(businessId, sub);
      break;
    }

    default:
      break;
  }

  return NextResponse.json({ received: true });
}
