import Stripe from "stripe";
import { prisma } from "@/lib/prisma";
import { PLAN_DEFAULT_CAP_USD } from "@/lib/usage-limit";

/**
 * The PLATFORM's own Stripe account — used only for charging sellers for their Starter/Growth/
 * Scale subscription (SaaS billing). Never used for a seller's own storefront checkout — that's
 * lib/store-stripe.ts, using each seller's own Stripe keys instead.
 */
export function getPlatformStripe(): Stripe | null {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) return null;
  // STRIPE_API_BASE only exists so tests can point Orbit at a fake Stripe.
  const base = process.env.STRIPE_API_BASE ? new URL(process.env.STRIPE_API_BASE) : null;
  return new Stripe(
    key,
    base ? { host: base.hostname, port: Number(base.port) || (base.protocol === "http:" ? 80 : 443), protocol: base.protocol.replace(":", "") as "http" | "https" } : undefined,
  );
}

export function isPlatformStripeConfigured(): boolean {
  return !!process.env.STRIPE_SECRET_KEY;
}

export const PAID_PLANS = ["starter", "growth", "scale"] as const;

/** Real Stripe Price ids — created by the platform owner in Stripe. Read at call time so a key saved in Super Admin works without a restart. */
export function planPriceId(plan: string): string | undefined {
  const env: Record<string, string | undefined> = {
    starter: process.env.STRIPE_PRICE_STARTER,
    growth: process.env.STRIPE_PRICE_GROWTH,
    scale: process.env.STRIPE_PRICE_SCALE,
  };
  return env[plan]?.trim() || undefined;
}

export function priceIdToPlan(priceId: string): string | null {
  return PAID_PLANS.find((p) => planPriceId(p) === priceId) ?? null;
}

/** Subscription states where the seller still has their plan (Stripe retries failed cards during past_due). */
const LIVE = new Set(["active", "trialing", "past_due"]);
/** States where the subscription is over — AI features pause until they pick a plan again. */
const ENDED = new Set(["canceled", "unpaid", "incomplete_expired"]);

export function subscriptionIsLive(status: string | null | undefined): boolean {
  return !!status && LIVE.has(status);
}

/** Find the business a Stripe object belongs to: our metadata first, then the Stripe customer. */
export async function businessForStripe(metadataBusinessId: string | undefined, customer: string | { id: string } | null | undefined) {
  if (metadataBusinessId) {
    const b = await prisma.business.findUnique({ where: { id: metadataBusinessId }, select: { id: true } });
    if (b) return b.id;
  }
  const customerId = typeof customer === "string" ? customer : customer?.id;
  if (!customerId) return null;
  const b = await prisma.business.findFirst({ where: { stripeCustomerId: customerId }, select: { id: true } });
  return b?.id ?? null;
}

/** Apply a subscription's current state to the business (plan, status, AI allowance). */
export async function applySubscription(businessId: string, sub: Pick<Stripe.Subscription, "id" | "status" | "items">) {
  const priceId = sub.items.data[0]?.price?.id;
  const plan = priceId ? priceIdToPlan(priceId) : null;
  const ended = ENDED.has(sub.status);
  const current = await prisma.business.findUnique({ where: { id: businessId }, select: { stripeSubscriptionId: true } });
  // An old subscription ending must not undo a newer one the seller already moved to.
  if (ended && current?.stripeSubscriptionId && current.stripeSubscriptionId !== sub.id) return;
  await prisma.business.update({
    where: { id: businessId },
    data: {
      subscriptionStatus: sub.status,
      stripeSubscriptionId: sub.id,
      ...(ended
        ? { plan: "starter", monthlyUsageCapUsd: 0 } // store stays online; AI agents pause until a plan is chosen again
        : plan
          ? { plan, monthlyUsageCapUsd: PLAN_DEFAULT_CAP_USD[plan] ?? 15 }
          : {}),
    },
  });
}
