import { prisma } from "@/lib/prisma";
import { getStoreStripe } from "@/lib/store-stripe";
import { recordEvent } from "@/lib/store-analytics";
import { notifyOrder } from "@/lib/order-notify";
import { sendPurchaseEvent } from "@/lib/meta-capi";
import { applyStockDelta, OutOfStockError } from "@/lib/checkout";
import { earnPointsForOrder, redeemPoints, LoyaltyError } from "@/lib/loyalty";
import { qualifyReferralForOrder } from "@/lib/referral";
import { redeemGiftCard, GiftCardError } from "@/lib/gift-cards";
import { pauseAdsForSoldOut } from "@/lib/inventory-ads";
import { isWalletProvider } from "@/lib/payment-methods";

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

  await completePaidOrder(order, origin);
  return { ok: true, orderId: order.id };
}

type PaidOrder = NonNullable<Awaited<ReturnType<typeof prisma.order.findUnique>>>;

/**
 * The payment for this order is VERIFIED (Stripe session retrieved as paid, JazzCash response
 * with a valid secure hash, Easypaisa record fetched from Easypaisa) — take the stock, mark it
 * paid and send the usual messages. Idempotent. Callers must never reach this on an unverified
 * response. `via` records which wallet and reference paid a wallet order.
 */
export async function completePaidOrder(order: PaidOrder, origin: string, via?: { paymentProvider: string; paymentRef: string }): Promise<void> {
  const businessId = order.businessId;
  if (order.paymentStatus === "paid") return; // already finalized
  const extra = via ? { paymentProvider: via.paymentProvider, paymentRef: via.paymentRef.slice(0, 60) } : {};

  // The shopper switched this order to cash on delivery (stock already taken, messages already
  // sent) and the wallet payment landed afterwards — just record that it's paid.
  if (via && order.paymentProvider === "cod") {
    await prisma.order.update({ where: { id: order.id }, data: { paymentStatus: "paid", ...extra } });
    return;
  }
  // Paid after the order was cancelled — keep it cancelled, but make sure the seller sees the money.
  if (order.status === "cancelled") {
    await prisma.order.update({
      where: { id: order.id },
      data: {
        paymentStatus: "paid",
        ...extra,
        flagged: true,
        flagReason: (order.flagReason ? `${order.flagReason} · ` : "") + "Paid after the order was cancelled — refund or reinstate",
      },
    });
    return;
  }

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
      const fresh = await tx.order.findUnique({ where: { id: order.id }, select: { paymentStatus: true, paymentProvider: true } });
      if (fresh?.paymentStatus === "paid") return;
      if (via && fresh?.paymentProvider === "cod") {
        // switched to cash on delivery a moment ago — its stock is already taken
        await tx.order.update({ where: { id: order.id }, data: { paymentStatus: "paid", ...extra } });
        return;
      }
      await applyStockDelta(tx, businessId, lines, -1);
      await tx.order.update({
        where: { id: order.id },
        data: { paymentStatus: "paid", status: "confirmed", confirmedAt: new Date(), ...extra },
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
          ...extra,
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
          ...extra,
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
          ...extra,
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
  await sendPurchaseEvent(order.id).catch(() => {});
  await earnPointsForOrder(order.id).catch(() => {});
  await qualifyReferralForOrder(order.id).catch(() => {});
  await pauseAdsForSoldOut(businessId).catch(() => {});
}

/**
 * A shopper whose wallet payment didn't go through chooses cash on delivery instead: the unpaid
 * wallet order becomes a normal COD order (stock taken now, waiting for the seller to confirm).
 */
export async function switchOrderToCod(orderId: string, businessId: string, origin: string): Promise<{ ok: boolean; error?: string }> {
  const order = await prisma.order.findUnique({ where: { id: orderId } });
  if (!order || order.businessId !== businessId) return { ok: false, error: "Order not found." };
  if (order.paymentProvider === "cod") return { ok: true };
  if (!isWalletProvider(order.paymentProvider) || order.paymentStatus === "paid" || order.status !== "pending")
    return { ok: false, error: "This order can't be changed to cash on delivery." };

  let items: Item[] = [];
  try {
    items = JSON.parse(order.items) as Item[];
  } catch {
    items = [];
  }
  const lines = items.filter((it): it is Item & { productId: string; qty: number } => !!it.productId && !!it.qty);
  let switched = false;
  try {
    await prisma.$transaction(async (tx) => {
      // claim the order first so two clicks (or a click racing a payment) can't both take stock
      const claim = await tx.order.updateMany({
        where: { id: order.id, paymentProvider: order.paymentProvider, paymentStatus: "pending", status: "pending" },
        data: { paymentProvider: "cod", verified: true },
      });
      if (claim.count !== 1) return;
      await applyStockDelta(tx, businessId, lines, -1);
      if (order.couponCode)
        await tx.coupon.updateMany({ where: { businessId, code: order.couponCode }, data: { usedCount: { increment: 1 } } });
      if (order.customerId && order.loyaltyPointsRedeemed > 0)
        await redeemPoints(tx, businessId, order.customerId, order.id, order.loyaltyPointsRedeemed);
      if (order.giftCardCode && order.giftCardDiscount > 0)
        await redeemGiftCard(tx, businessId, order.giftCardCode, order.giftCardDiscount, order.id);
      switched = true;
    });
  } catch (e) {
    if (e instanceof OutOfStockError) return { ok: false, error: "Sorry — one of the items just sold out." };
    if (e instanceof GiftCardError || e instanceof LoyaltyError) return { ok: false, error: e.message };
    throw e;
  }
  if (!switched) return { ok: true }; // someone else (or the payment) got there first

  await recordEvent(businessId, `order:${order.id}`, "order_complete");
  await notifyOrder(order.id, "order_placed", origin).catch(() => {});
  await sendPurchaseEvent(order.id).catch(() => {});
  await earnPointsForOrder(order.id).catch(() => {});
  await qualifyReferralForOrder(order.id).catch(() => {});
  await pauseAdsForSoldOut(businessId).catch(() => {});
  return { ok: true };
}
