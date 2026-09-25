import Stripe from "stripe";
import { prisma } from "@/lib/prisma";

/**
 * The SELLER's own Stripe account — real storefront payments settle straight to them, never
 * through the platform (that's `lib/platform-stripe.ts`). Returns null when the seller hasn't
 * connected Stripe, so callers can fall back to cash on delivery.
 */
export async function getStoreStripe(businessId: string): Promise<{ stripe: Stripe; publishableKey: string | null } | null> {
  const b = await prisma.business.findUnique({
    where: { id: businessId },
    select: { stripeSecretKey: true, stripePublishableKey: true, paymentProvider: true },
  });
  if (!b?.stripeSecretKey || !b.stripeSecretKey.startsWith("sk_")) return null;
  return { stripe: new Stripe(b.stripeSecretKey), publishableKey: b.stripePublishableKey ?? null };
}

/** What payment options the storefront should offer, from the seller's config. */
export function paymentOptions(provider: string | null | undefined, stripeReady: boolean): ("cod" | "stripe")[] {
  const p = provider || "cod";
  if (p === "stripe") return stripeReady ? ["stripe"] : ["cod"];
  if (p === "both") return stripeReady ? ["cod", "stripe"] : ["cod"];
  return ["cod"];
}
