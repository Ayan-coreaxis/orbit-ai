import { prisma } from "@/lib/prisma";
import { getStoreStripe } from "@/lib/store-stripe";
import { recordEvent } from "@/lib/store-analytics";
import { notifyOrder } from "@/lib/order-notify";
import { applyStockDelta, OutOfStockError } from "@/lib/checkout";
import { earnPointsForOrder, redeemPoints, LoyaltyError } from "@/lib/loyalty";
import { qualifyReferralForOrder } from "@/lib/referral";
import { redeemGiftCard, GiftCardError } from "@/lib/gift-cards";

interface Item {
  productId?: string;
  variantId?: string | null;
  qty?: number;
}

/**
 * Turns a paid Stripe Checkout Session into a real, stock-decremented order. Idempotent — safe to
 * call from the return-url page AND a webhook; the first call that sees `payment_status:"paid"`
 * flips the pending order to paid, everything after is a no-op.
 */
export async function finalizeStripeOrder(
  businessId: string,
  sessionId: string,
  origin: string,
): Promise<{ ok: boolean; orderId?: string; error?: string }> {
  if (!sessionId) return { ok: false, error: "Missing session id." };

  const order = await prisma.order.findFirst({ where: { businessId, stripeSessionId: sessionId } });
  if (!order) return { ok: false, error: "No order for that payment." };
  if (order.paymentStatus === "paid") return { ok: true, orderId: order.id }; // already finalized

  const conn = await getStoreStripe(businessId);
  if (!conn) return { ok: false, error: "Stripe isn't connected." };

  let paid = false;
  try {
    const session = await conn.stripe.checkout.sessions.retrieve(sessionId);
    paid = session.payment_status === "paid";
  } catch (e) {
    return { ok: false, error: String(e).slice(0, 160) };
  }
  if (!paid) return { ok: false, orderId: order.id, error: "Payment not completed." };

  // decrement stock + mark paid, once
  let items: Item[] = [];
  try {
    items = JSON.parse(order.items) as Item[];
  } catch {
    items = [];
  }
  const lines = items.filter((it): it is Item & { productId: string; qty: number } => !!it.productId && !!it.qty);
  try {
    await prisma.$transaction(async (tx) => {
      const fresh = await tx.order.findUnique({ where: { id: order.id }, select: { paymentStatus: true } });
      if (fresh?.paymentStatus === "paid") return;
      await applyStockDelta(tx, businessId, lines, -1);
      await tx.order.update({
        where: { id: order.id },
        data: { paymentStatus: "paid", status: "confirmed", confirmedAt: new Date() },
      });
      if (order.couponCode)
        await tx.coupon.updateMany({ where: { businessId, code: order.couponCode }, data: { usedCount: { increment: 1 } } }).catch(() => {});
      if (order.customerId && order.loyaltyPointsRedeemed > 0)
        await redeemPoints(tx, businessId, order.customerId, order.id, order.loyaltyPointsRedeemed);
      if (order.giftCardCode && order.giftCardDiscount > 0)
        await redeemGiftCard(tx, businessId, order.giftCardCode, order.giftCardDiscount, order.id);
    });
  } catch (e) {
    if (e instanceof OutOfStockError) {
      // customer already paid — take the money, mark it paid, and flag it loudly for the seller
      await prisma.order.update({
        where: { id: order.id },
        data: {
          paymentStatus: "paid",
          status: "confirmed",
          confirmedAt: new Date(),
          flagged: true,
          flagReason: (order.flagReason ? `${order.flagReason} · ` : "") + "Paid but stock ran out — restock or refund",
        },
      });
    } else if (e instanceof GiftCardError) {
      // customer already paid the (discounted) amount — take it, mark paid, flag for a manual look
      await prisma.order.update({
        where: { id: order.id },
        data: {
          paymentStatus: "paid",
          status: "confirmed",
          confirmedAt: new Date(),
          flagged: true,
          flagReason: (order.flagReason ? `${order.flagReason} · ` : "") + "Paid but the gift card couldn't be redeemed — check its balance",
        },
      });
    } else if (e instanceof LoyaltyError) {
      // customer already paid the (discounted) amount — take it, mark paid, flag for a manual look
      await prisma.order.update({
        where: { id: order.id },
        data: {
          paymentStatus: "paid",
          status: "confirmed",
          confirmedAt: new Date(),
          flagged: true,
          flagReason: (order.flagReason ? `${order.flagReason} · ` : "") + "Paid but the points redemption couldn't be applied — check their balance",
        },
      });
    } else {
      throw e;
    }
  }

  // anonymous session for the funnel isn't available here (server-to-server), so key the event to
  // the order id — still one distinct "order_complete" per purchase.
  await recordEvent(businessId, `order:${order.id}`, "order_complete");
  await notifyOrder(order.id, "order_placed", origin).catch(() => {});
  await earnPointsForOrder(order.id).catch(() => {});
  await qualifyReferralForOrder(order.id).catch(() => {});

  return { ok: true, orderId: order.id };
}
