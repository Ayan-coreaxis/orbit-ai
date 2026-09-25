import Stripe from "stripe";

/**
 * The PLATFORM's own Stripe account — used only for charging sellers for their Starter/Growth/
 * Scale subscription (SaaS billing). Never used for a seller's own storefront checkout — that's
 * lib/store-stripe.ts, using each seller's own Stripe keys instead.
 */
export function getPlatformStripe(): Stripe | null {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) return null;
  return new Stripe(key);
}

export function isPlatformStripeConfigured(): boolean {
  return !!process.env.STRIPE_SECRET_KEY;
}

/** Real Stripe Price ids — created by the platform owner in their own Stripe Dashboard, not auto-created here. */
export const PLAN_PRICE_IDS: Record<string, string | undefined> = {
  starter: process.env.STRIPE_PRICE_STARTER,
  growth: process.env.STRIPE_PRICE_GROWTH,
  scale: process.env.STRIPE_PRICE_SCALE,
};

export function priceIdToPlan(priceId: string): string | null {
  for (const [plan, id] of Object.entries(PLAN_PRICE_IDS)) {
    if (id === priceId) return plan;
  }
  return null;
}
