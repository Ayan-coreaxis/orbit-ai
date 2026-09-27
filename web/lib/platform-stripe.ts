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
  const paid = sub.status === "active" || sub.status === "trialing";
  const current = await prisma.business.findUnique({ where: { id: businessId }, select: { stripeSubscriptionId: true } });
  // Events about an old subscription must not touch the one the seller has now — only a newly
  // paid (active) subscription replaces it.
  if (current?.stripeSubscriptionId && current.stripeSubscriptionId !== sub.id && !paid) return;
  await prisma.business.update({
    where: { id: businessId },
    data: {
      subscriptionStatus: sub.status,
      stripeSubscriptionId: sub.id,
      // The plan (and its AI allowance) only follows a PAID subscription. past_due keeps whatever
      // the seller had while Stripe retries; incomplete / unpaid upgrades never grant anything.
      ...(ended
        ? { plan: "starter", monthlyUsageCapUsd: 0 } // store stays online; AI agents pause until a plan is chosen again
        : paid && plan
          ? { plan, monthlyUsageCapUsd: PLAN_DEFAULT_CAP_USD[plan] ?? 15 }
          : {}),
    },
  });
}

/** Stripe's real processing fee for a paid invoice, in USD — null when it can't be read (then the caller estimates). */
async function invoiceFeeUsd(stripe: Stripe, invoiceId: string): Promise<number | null> {
  try {
    const payments = await stripe.invoicePayments.list({ invoice: invoiceId, limit: 5 });
    let fee = 0;
    let found = false;
    for (const p of payments.data) {
      if (p.status !== "paid") continue;
      let chargeId = typeof p.payment.charge === "string" ? p.payment.charge : p.payment.charge?.id;
      const pi = p.payment.payment_intent;
      if (!chargeId && pi) {
        const intent = await stripe.paymentIntents.retrieve(typeof pi === "string" ? pi : pi.id);
        chargeId = typeof intent.latest_charge === "string" ? intent.latest_charge : intent.latest_charge?.id;
      }
      if (!chargeId) continue;
      const charge = await stripe.charges.retrieve(chargeId, { expand: ["balance_transaction"] });
      const bt = charge.balance_transaction;
      if (!bt || typeof bt === "string" || bt.currency !== "usd") return null; // settled in another currency: estimate instead
      fee += bt.fee / 100;
      found = true;
    }
    return found ? fee : null;
  } catch {
    return null;
  }
}

/** Write a paid Stripe invoice into the revenue ledger (idempotent on the invoice id). */
export async function recordInvoicePayment(stripe: Stripe, businessId: string, invoice: Stripe.Invoice) {
  if (!invoice.id || invoice.amount_paid <= 0) return;
  const { estimatedStripeFee } = await import("@/lib/admin-finance");
  const usd = invoice.currency === "usd";
  const amountUsd = invoice.amount_paid / 100;
  const realFee = usd ? await invoiceFeeUsd(stripe, invoice.id) : null;
  const plan = (await prisma.business.findUnique({ where: { id: businessId }, select: { plan: true } }))?.plan ?? null;
  const paidAt = invoice.status_transitions?.paid_at ? new Date(invoice.status_transitions.paid_at * 1000) : new Date();
  const data = {
    businessId,
    amountUsd,
    feeUsd: realFee ?? estimatedStripeFee(amountUsd),
    feeEstimated: realFee === null,
    source: "stripe",
    method: "card",
    plan,
    note: usd ? null : `Charged in ${invoice.currency.toUpperCase()} — amount shown as-is`,
    paidAt,
  };
  await prisma.platformPayment.upsert({ where: { externalId: invoice.id }, create: { ...data, externalId: invoice.id }, update: data });
}

/** A refund on a platform charge becomes a negative ledger row (kept at the charge's total refunded). */
export async function recordChargeRefund(businessId: string, charge: Stripe.Charge) {
  if (charge.amount_refunded <= 0) return;
  const externalId = `refund:${charge.id}`;
  const data = {
    businessId,
    amountUsd: -charge.amount_refunded / 100,
    feeUsd: 0,
    source: "stripe",
    method: "card",
    note: charge.currency === "usd" ? "Refund" : `Refund in ${charge.currency.toUpperCase()}`,
    paidAt: new Date(),
  };
  await prisma.platformPayment.upsert({ where: { externalId }, create: { ...data, externalId }, update: { amountUsd: data.amountUsd } });
}
