import { prisma } from "@/lib/prisma";

/** Thrown inside a checkout transaction when a points redemption can't actually be honored
 *  (balance moved since the quote) — caught by the checkout route to return a clean 409. */
export class LoyaltyError extends Error {}

export interface LoyaltySettings {
  enabled: boolean;
  earnRate: number; // points per 1 currency unit spent
  redeemRate: number; // currency discount per point
  minRedeem: number; // minimum points balance required to redeem any
}

export async function getLoyaltySettings(businessId: string): Promise<LoyaltySettings> {
  const b = await prisma.business.findUnique({
    where: { id: businessId },
    select: { loyaltyEnabled: true, loyaltyEarnRate: true, loyaltyRedeemRate: true, loyaltyMinRedeem: true },
  });
  return {
    enabled: b?.loyaltyEnabled ?? false,
    earnRate: b?.loyaltyEarnRate ?? 1,
    redeemRate: b?.loyaltyRedeemRate ?? 0.01,
    minRedeem: b?.loyaltyMinRedeem ?? 100,
  };
}

/** A signed-in shopper's current balance (0 if they've never earned anything — no row needed yet). */
export async function getBalance(businessId: string, customerId: string): Promise<number> {
  const acc = await prisma.loyaltyAccount.findUnique({ where: { customerId } });
  return acc && acc.businessId === businessId ? acc.points : 0;
}

/** The most a customer could redeem right now: capped by their balance AND by what the order
 *  actually costs (never a negative total). Returns 0 points/0 discount when the program is off,
 *  the shopper isn't signed in, or their balance is under the configured minimum. */
export async function maxRedeemable(
  businessId: string,
  customerId: string | null | undefined,
  orderSubtotal: number,
): Promise<{ points: number; discount: number }> {
  if (!customerId) return { points: 0, discount: 0 };
  const settings = await getLoyaltySettings(businessId);
  if (!settings.enabled || settings.redeemRate <= 0) return { points: 0, discount: 0 };
  const balance = await getBalance(businessId, customerId);
  if (balance < settings.minRedeem) return { points: 0, discount: 0 };
  const capByOrder = Math.floor(orderSubtotal / settings.redeemRate);
  const points = Math.max(0, Math.min(balance, capByOrder));
  return { points, discount: Math.round(points * settings.redeemRate * 100) / 100 };
}

/** Spend points on an order's discount — call this INSIDE the same transaction that creates the
 *  order, after you know the final `loyaltyPointsRedeemed` you're about to persist on it. Throws if
 *  the balance has moved (e.g. redeemed twice in a race) rather than letting a balance go negative. */
export async function redeemPoints(
  tx: Parameters<Parameters<typeof prisma.$transaction>[0]>[0],
  businessId: string,
  customerId: string,
  orderId: string,
  points: number,
): Promise<void> {
  if (points <= 0) return;
  const acc = await tx.loyaltyAccount.findUnique({ where: { customerId } });
  if (!acc || acc.businessId !== businessId || acc.points < points) throw new LoyaltyError("Your points balance changed — please recheck before placing the order.");
  await tx.loyaltyAccount.update({ where: { customerId }, data: { points: { decrement: points } } });
  await tx.loyaltyTransaction.create({
    data: { businessId, customerId, orderId, points: -points, reason: "redeem" },
  });
}

/**
 * Award points for a confirmed order. Idempotent (safe to call more than once for the same order —
 * a COD order can pass through verify + an admin status edit) and a no-op for guest checkouts or a
 * business with the program off. The single call site every "this order is now real" path should
 * use: checkout.ts (order created already verified), order-verify.ts (COD verified after the fact),
 * checkout-finalize.ts (Stripe payment confirmed).
 */
export async function earnPointsForOrder(orderId: string): Promise<void> {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    select: { id: true, businessId: true, customerId: true, total: true, verified: true, loyaltyPointsEarned: true },
  });
  if (!order || !order.customerId || !order.verified || order.loyaltyPointsEarned > 0) return;
  const settings = await getLoyaltySettings(order.businessId);
  if (!settings.enabled || settings.earnRate <= 0) return;
  const points = Math.floor(order.total * settings.earnRate);
  if (points <= 0) return;

  await prisma.$transaction(async (tx) => {
    const fresh = await tx.order.findUnique({ where: { id: order.id }, select: { loyaltyPointsEarned: true } });
    if (!fresh || fresh.loyaltyPointsEarned > 0) return; // already awarded (race guard)
    await tx.order.update({ where: { id: order.id }, data: { loyaltyPointsEarned: points } });
    await tx.loyaltyAccount.upsert({
      where: { customerId: order.customerId! },
      create: { businessId: order.businessId, customerId: order.customerId!, points },
      update: { points: { increment: points } },
    });
    await tx.loyaltyTransaction.create({
      data: { businessId: order.businessId, customerId: order.customerId!, orderId: order.id, points, reason: "earn" },
    });
  });
}

/** A seller manually crediting/debiting a customer's balance (goodwill, correcting a support issue). */
export async function adjustPoints(businessId: string, customerId: string, points: number, note: string): Promise<void> {
  if (points === 0) return;
  await prisma.$transaction(async (tx) => {
    await tx.loyaltyAccount.upsert({
      where: { customerId },
      create: { businessId, customerId, points: Math.max(0, points) },
      update: { points: { increment: points } },
    });
    const acc = await tx.loyaltyAccount.findUnique({ where: { customerId } });
    if (acc && acc.points < 0) await tx.loyaltyAccount.update({ where: { customerId }, data: { points: 0 } });
    await tx.loyaltyTransaction.create({ data: { businessId, customerId, points, reason: "adjust", note: note.slice(0, 300) } });
  });
}
