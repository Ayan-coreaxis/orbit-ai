import crypto from "crypto";
import { prisma } from "@/lib/prisma";
import { notifyOrder } from "@/lib/order-notify";
import { earnPointsForOrder } from "@/lib/loyalty";
import { qualifyReferralForOrder } from "@/lib/referral";

/**
 * COD order verification. When a seller turns on `codVerification`, a cash-on-delivery order is
 * created `verified: false` and the shopper is asked to confirm it (a one-time link, or replying
 * YES to the WhatsApp). Unconfirmed orders auto-cancel after a couple of days (a cron) and never
 * count toward revenue until confirmed.
 */

export function newVerifyToken(): string {
  return crypto.randomBytes(24).toString("base64url");
}

/** Mark an order verified. Idempotent. Returns the order (or null if the token/order is wrong). */
export async function verifyOrderByToken(businessId: string, token: string, origin: string) {
  if (!token) return null;
  const order = await prisma.order.findFirst({ where: { businessId, verifyToken: token } });
  if (!order) return null;
  if (!order.verified) {
    await prisma.order.update({
      where: { id: order.id },
      data: { verified: true, verifiedAt: new Date(), verifyToken: null },
    });
    // now that it's real, send the normal "order received" confirmation
    await notifyOrder(order.id, "order_placed", origin).catch(() => {});
    await earnPointsForOrder(order.id).catch(() => {});
    await qualifyReferralForOrder(order.id).catch(() => {});
  }
  return order;
}

/** Verify by phone + a "YES"-style reply (from the inbound WhatsApp webhook). */
export async function verifyLatestOrderForPhone(businessId: string, phone: string, origin: string): Promise<boolean> {
  const digits = phone.replace(/\D/g, "").slice(-10);
  if (!digits) return false;
  const order = await prisma.order.findFirst({
    where: {
      businessId,
      verified: false,
      status: "pending",
      paymentProvider: "cod",
      customerPhone: { endsWith: digits },
      createdAt: { gte: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000) },
    },
    orderBy: { createdAt: "desc" },
  });
  if (!order) return false;
  await prisma.order.update({
    where: { id: order.id },
    data: { verified: true, verifiedAt: new Date(), verifyToken: null },
  });
  await notifyOrder(order.id, "order_placed", origin).catch(() => {});
  await earnPointsForOrder(order.id).catch(() => {});
  await qualifyReferralForOrder(order.id).catch(() => {});
  return true;
}

const YES = /^\s*(y|yes|yep|yeah|haan|haanji|ha|confirm|confirmed|ok|okay|done|theek|sahi)\s*$/i;
export function looksLikeYes(text: string): boolean {
  return YES.test(text || "");
}
