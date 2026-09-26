import { throttle } from "@/lib/guard";
import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { after } from "next/server";
import { prisma } from "@/lib/prisma";
import { getStoreCustomer } from "@/lib/store-auth";
import { recordEvent } from "@/lib/store-analytics";
import { notifyOrder, originFromRequest } from "@/lib/order-notify";
import { adContextFrom, sendPurchaseEvent } from "@/lib/meta-capi";
import { notifyCustomer, notifySeller } from "@/lib/notify";
import { quoteCheckout, applyStockDelta, OutOfStockError } from "@/lib/checkout";
import { getStoreStripe, paymentOptions } from "@/lib/store-stripe";
import { screenOrder } from "@/lib/fraud";
import { bestEffort } from "@/lib/log";
import { newVerifyToken } from "@/lib/order-verify";
import { getAgentSettings } from "@/lib/agent-settings";
import { earnPointsForOrder, redeemPoints, LoyaltyError } from "@/lib/loyalty";
import { qualifyReferralForOrder } from "@/lib/referral";
import { redeemGiftCard, GiftCardError } from "@/lib/gift-cards";
import { money } from "@/lib/money";
import { parseCheckoutCustomFields, validateCustomFieldAnswers } from "@/lib/checkout-fields";

interface AddressInput {
  line1?: string;
  city?: string;
  area?: string;
  postalCode?: string;
  province?: string;
}

function formatAddress(a: AddressInput, fallback: string): string {
  const parts = [a.line1, a.area, a.city, a.province, a.postalCode].map((s) => (s ?? "").trim()).filter(Boolean);
  return parts.length ? parts.join(", ") : fallback;
}

/**
 * The one checkout endpoint. Server-authoritative pricing (`quoteCheckout` — items, coupon rules,
 * shipping, tax), a real fraud screen, optional COD confirmation, idempotency, then a
 * cash-on-delivery order or a Stripe Checkout Session on the SELLER's own account. Notifications
 * run after the response so a slow Twilio never slows checkout.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ businessId: string }> }) {
  const limited = await throttle(req, "shop-checkout", 20, 600000);
  if (limited) return limited;
  const { businessId } = await params;

  const business = await prisma.business.findUnique({
    where: { id: businessId },
    select: {
      id: true,
      name: true,
      whatsappInboundNumber: true,
      paymentProvider: true,
      codVerification: true,
      notifyNewOrders: true,
      whatsapp: true,
      storeCurrency: true,
      checkoutCustomFields: true,
      owner: { select: { email: true } },
    },
  });
  if (!business) return NextResponse.json({ error: "Store not found." }, { status: 404 });

  const b = (await req.json().catch(() => ({}))) as {
    items?: { productId?: string; variantId?: string | null; qty: number; bundleId?: string }[];
    customerName?: string;
    customerPhone?: string;
    customerEmail?: string;
    address?: string;
    shipping?: AddressInput;
    couponCode?: string;
    giftCardCode?: string;
    loyaltyPointsRedeem?: number;
    payment?: "cod" | "stripe";
    clientToken?: string;
    customFields?: Record<string, unknown>;
  };

  const name = (b.customerName ?? "").trim();
  const phone = (b.customerPhone ?? "").trim();
  const email = (b.customerEmail ?? "").trim();
  const clientToken = (b.clientToken ?? "").trim().slice(0, 80) || null;

  // ---- idempotency: a retried submit returns the first order ----
  if (clientToken) {
    const existing = await prisma.order.findUnique({ where: { clientToken } });
    if (existing) return NextResponse.json({ orderId: existing.id, total: existing.total, duplicate: true });
  }

  const structured = b.shipping && typeof b.shipping === "object" ? b.shipping : null;
  const address = structured ? formatAddress(structured, (b.address ?? "").trim()) : (b.address ?? "").trim();
  if (!name || !phone || !address)
    return NextResponse.json({ error: "Name, phone and address are all required." }, { status: 400 });

  const customFieldConfig = parseCheckoutCustomFields(business.checkoutCustomFields);
  const customFieldsResult = validateCustomFieldAnswers(customFieldConfig, b.customFields);
  if (!customFieldsResult.ok) return NextResponse.json({ error: customFieldsResult.error }, { status: 400 });

  const customer = await getStoreCustomer(businessId);

  const quote = await quoteCheckout(
    businessId,
    b.items,
    b.couponCode,
    phone,
    b.giftCardCode,
    customer?.id ?? null,
    b.loyaltyPointsRedeem,
    structured?.city ?? null,
  );
  if (!quote.ok) return NextResponse.json({ error: quote.error ?? "Couldn't price this order." }, { status: 400 });

  const conn = await getStoreStripe(businessId);
  const allowed = paymentOptions(business.paymentProvider, !!conn);
  const payment: "cod" | "stripe" = b.payment && allowed.includes(b.payment) ? b.payment : allowed[0];

  const origin = originFromRequest(req);

  const fraud = await screenOrder(businessId, {
    customerPhone: phone,
    customerId: customer?.id ?? null,
    subtotal: quote.subtotal,
    items: quote.lineItems,
  });

  const jar = await cookies();
  const baseData = {
    businessId,
    adContext: JSON.stringify(adContextFrom(req, (n) => jar.get(n)?.value)),
    customerId: customer?.id ?? null,
    customerName: name.slice(0, 120),
    customerPhone: phone.slice(0, 40),
    customerEmail: email ? email.slice(0, 160) : null,
    address: address.slice(0, 500),
    shippingAddress: structured
      ? JSON.stringify({
          name,
          phone,
          line1: (structured.line1 ?? "").slice(0, 200),
          city: (structured.city ?? "").slice(0, 80),
          area: (structured.area ?? "").slice(0, 80) || null,
          postalCode: (structured.postalCode ?? "").slice(0, 20) || null,
          province: (structured.province ?? "").slice(0, 60) || null,
        })
      : null,
    customFieldsData: Object.keys(customFieldsResult.clean).length ? JSON.stringify(customFieldsResult.clean) : null,
    items: JSON.stringify(quote.lineItems),
    subtotal: quote.subtotal,
    shippingFee: quote.shipping,
    taxAmount: quote.tax,
    total: quote.total,
    couponCode: quote.couponCode,
    discountAmount: quote.discount,
    giftCardCode: quote.giftCardCode,
    giftCardDiscount: quote.giftCardDiscount,
    loyaltyPointsRedeemed: quote.loyaltyPointsRedeemed,
    loyaltyDiscount: quote.loyaltyDiscount,
    clientToken,
    flagged: fraud.flagged,
    flagReason: fraud.reason,
  };

  // ---------------- Stripe ----------------
  if (payment === "stripe") {
    if (!conn) return NextResponse.json({ error: "Card payment isn't available right now." }, { status: 400 });

    const order = await prisma.order.create({
      data: { ...baseData, status: "pending", paymentProvider: "stripe", paymentStatus: "pending", verified: true },
    });

    const cents = (n: number) => Math.round(n * 100);
    const line_items: { price_data: { currency: string; unit_amount: number; product_data: { name: string } }; quantity: number }[] =
      quote.lineItems.map((l) => ({
        price_data: {
          currency: quote.currency,
          unit_amount: cents(l.price),
          product_data: {
            name: `${l.variantLabel ? `${l.name} — ${l.variantLabel}` : l.name}${l.bundleName ? ` (${l.bundleName})` : ""}`,
          },
        },
        quantity: l.qty,
      }));
    if (quote.shipping > 0)
      line_items.push({ price_data: { currency: quote.currency, unit_amount: cents(quote.shipping), product_data: { name: "Delivery" } }, quantity: 1 });
    if (quote.tax > 0)
      line_items.push({ price_data: { currency: quote.currency, unit_amount: cents(quote.tax), product_data: { name: quote.taxLabel } }, quantity: 1 });

    try {
      const session = await conn.stripe.checkout.sessions.create({
        mode: "payment",
        line_items,
        customer_email: email || undefined,
        client_reference_id: order.id,
        ...(quote.discount + quote.giftCardDiscount + quote.loyaltyDiscount + quote.bundleDiscount > 0
          ? {
              discounts: [
                {
                  coupon: (
                    await conn.stripe.coupons.create({
                      amount_off: cents(quote.discount + quote.giftCardDiscount + quote.loyaltyDiscount + quote.bundleDiscount),
                      currency: quote.currency,
                      name: quote.giftCardDiscount > 0 || quote.loyaltyDiscount > 0 ? "Discount + rewards" : quote.couponLabel ?? "Discount",
                      duration: "once",
                    })
                  ).id,
                },
              ],
            }
          : {}),
        success_url: `${origin}/store/${businessId}/order/${order.id}?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${origin}/store/${businessId}/cart`,
        metadata: { orderId: order.id, businessId },
      });
      await prisma.order.update({ where: { id: order.id }, data: { stripeSessionId: session.id } });
      return NextResponse.json({ redirect: session.url, orderId: order.id });
    } catch (e) {
      await prisma.order.delete({ where: { id: order.id } }).catch(() => {});
      return NextResponse.json({ error: `Payment setup failed: ${String(e).slice(0, 160)}` }, { status: 502 });
    }
  }

  // ---------------- Cash on delivery ----------------
  const needsVerify = business.codVerification;
  const settings = await getAgentSettings(businessId).catch(() => null);
  const autoConfirm = !needsVerify && !fraud.flagged && settings?.autoConfirmCod;

  let order;
  try {
    order = await prisma.$transaction(async (tx) => {
      await applyStockDelta(tx, businessId, quote.lineItems, -1);
      if (quote.couponCode)
        await tx.coupon.updateMany({ where: { businessId, code: quote.couponCode }, data: { usedCount: { increment: 1 } } });
      const created = await tx.order.create({
        data: {
          ...baseData,
          status: autoConfirm ? "confirmed" : "pending",
          confirmedAt: autoConfirm ? new Date() : null,
          paymentProvider: "cod",
          paymentStatus: "paid",
          verified: !needsVerify,
          verifyToken: needsVerify ? newVerifyToken() : null,
        },
      });
      if (customer && quote.loyaltyPointsRedeemed > 0) await redeemPoints(tx, businessId, customer.id, created.id, quote.loyaltyPointsRedeemed);
      if (quote.giftCardCode && quote.giftCardDiscount > 0) await redeemGiftCard(tx, businessId, quote.giftCardCode, quote.giftCardDiscount, created.id);
      return created;
    });
  } catch (e) {
    if (e instanceof OutOfStockError)
      return NextResponse.json({ error: "Sorry — one of your items just sold out. Please review your cart." }, { status: 409 });
    if (e instanceof GiftCardError) return NextResponse.json({ error: e.message }, { status: 409 });
    if (e instanceof LoyaltyError) return NextResponse.json({ error: e.message }, { status: 409 });
    throw e;
  }

  const sess = (await cookies()).get("sc_sess")?.value;
  if (sess) {
    await recordEvent(businessId, sess, "order_complete");
    await prisma.abandonedCart
      .updateMany({ where: { businessId, sessionId: sess, recovered: false }, data: { recovered: true } })
      .catch(() => {});
  }

  // empty the server-side cart so the next visit doesn't re-hydrate a paid-for basket
  const cartKey = customer ? `customer:${customer.id}` : sess;
  if (cartKey) {
    await prisma.cart.deleteMany({ where: { businessId, visitorId: cartKey } }).catch(() => {});
  }

  // save the delivery address to the shopper's account for next time
  if (customer && structured?.line1 && structured.city) {
    await prisma.customerAddress
      .create({
        data: {
          businessId,
          customerId: customer.id,
          name,
          phone,
          line1: structured.line1.slice(0, 200),
          city: structured.city.slice(0, 80),
          area: (structured.area ?? "").slice(0, 80) || null,
          postalCode: (structured.postalCode ?? "").slice(0, 20) || null,
          province: (structured.province ?? "").slice(0, 60) || null,
        },
      })
      .catch(() => {});
  }

  const orderNumber = order.id.slice(-6).toUpperCase();
  after(async () => {
    await bestEffort("checkout.notifyCustomer", async () => {
      if (needsVerify) {
        const res = await notifyCustomer({ phone: order.customerPhone, email: order.customerEmail, whatsappFrom: business.whatsappInboundNumber }, "verify_order", {
          storeName: business.name,
          firstName: order.customerName.split(" ")[0] || undefined,
          orderNumber,
          total: money(order.total, business.storeCurrency),
          verifyUrl: `${origin}/store/${businessId}/verify/${order.verifyToken}`,
        });
        await prisma.order.update({
          where: { id: order.id },
          data: { confirmationNotifyError: res.anySent ? null : res.error ?? null },
        });
      } else {
        await notifyOrder(order.id, "order_placed", origin);
      }
    }, { orderId: order.id });

    await bestEffort("checkout.metaPurchase", () => sendPurchaseEvent(order.id), { orderId: order.id });

    if (order.verified) {
      await bestEffort("checkout.earnLoyalty", () => earnPointsForOrder(order.id), { orderId: order.id });
      await bestEffort("checkout.qualifyReferral", () => qualifyReferralForOrder(order.id), { orderId: order.id });
    }

    if (business.notifyNewOrders) {
      await bestEffort("checkout.notifySeller", () =>
        notifySeller(
          { phone: business.whatsapp, email: business.owner?.email },
          `New order #${orderNumber} · ${money(order.total, business.storeCurrency)}`,
          `${order.customerName} · ${order.customerPhone}\n${quote.lineItems.map((l) => `${l.name}${l.variantLabel ? ` (${l.variantLabel})` : ""} ×${l.qty}`).join(", ")}` +
            (fraud.flagged ? `\n⚠️ Flagged: ${fraud.reason}` : "") +
            (needsVerify ? `\nAwaiting customer confirmation.` : ""),
        ),
      { orderId: order.id });
    }
  });

  return NextResponse.json({ orderId: order.id, total: order.total, needsVerify });
}
