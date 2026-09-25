import crypto from "crypto";
import { prisma } from "@/lib/prisma";
import { adjustPoints } from "@/lib/loyalty";

export interface ReferralSettings {
  enabled: boolean;
  referrerPoints: number;
  refereePoints: number;
}

export async function getReferralSettings(businessId: string): Promise<ReferralSettings> {
  const b = await prisma.business.findUnique({
    where: { id: businessId },
    select: { referralEnabled: true, referralReferrerPoints: true, referralRefereePoints: true },
  });
  return {
    enabled: b?.referralEnabled ?? false,
    referrerPoints: b?.referralReferrerPoints ?? 200,
    refereePoints: b?.referralRefereePoints ?? 100,
  };
}

function newCode(): string {
  return crypto.randomBytes(4).toString("hex").toUpperCase(); // 8 chars, e.g. "A1B2C3D4"
}

/** Get (or create, first time) a signed-in shopper's own referral code. */
export async function getOrCreateReferralCode(businessId: string, customerId: string): Promise<string> {
  const existing = await prisma.referralCode.findUnique({ where: { customerId } });
  if (existing && existing.businessId === businessId) return existing.code;

  for (let i = 0; i < 5; i++) {
    try {
      const row = await prisma.referralCode.create({ data: { businessId, customerId, code: newCode() } });
      return row.code;
    } catch {
      // unique collision on `code` — vanishingly rare with 4 random bytes, just retry
    }
  }
  throw new Error("Couldn't generate a referral code.");
}

/**
 * Called right after a NEW customer signs up, if they arrived via a `?ref=CODE` link (the storefront
 * sets a short-lived `ref_<businessId>` cookie on landing — see CartSync). Creates the pending
 * Referral row and immediately credits the new shopper's welcome points (that part doesn't wait for
 * an order — it's the incentive to sign up at all). Silently no-ops on a bad/missing/self code.
 */
export async function recordReferralSignup(businessId: string, refCode: string, newCustomerId: string): Promise<void> {
  const settings = await getReferralSettings(businessId);
  if (!settings.enabled || !refCode) return;

  const code = await prisma.referralCode.findUnique({ where: { code: refCode.trim().toUpperCase() } });
  if (!code || code.businessId !== businessId || code.customerId === newCustomerId) return;

  // one referral credit per new shopper, ever (refereeCustomerId is @unique)
  const already = await prisma.referral.findUnique({ where: { refereeCustomerId: newCustomerId } });
  if (already) return;

  await prisma.referral.create({
    data: { businessId, referralCodeId: code.id, referrerCustomerId: code.customerId, refereeCustomerId: newCustomerId, status: "pending" },
  });
  if (settings.refereePoints > 0) {
    await adjustPoints(businessId, newCustomerId, settings.refereePoints, "Welcome bonus — signed up via a referral link");
  }
}

/**
 * Called when an order is confirmed (same call sites as loyalty earning). If the buyer was referred
 * and this is their qualifying moment, reward the referrer once. Idempotent via `status`.
 */
export async function qualifyReferralForOrder(orderId: string): Promise<void> {
  const order = await prisma.order.findUnique({ where: { id: orderId }, select: { id: true, businessId: true, customerId: true, verified: true } });
  if (!order || !order.customerId || !order.verified) return;

  const referral = await prisma.referral.findUnique({ where: { refereeCustomerId: order.customerId } });
  if (!referral || referral.businessId !== order.businessId || referral.status !== "pending") return;

  const settings = await getReferralSettings(order.businessId);
  await prisma.referral.update({
    where: { id: referral.id },
    data: { status: "rewarded", qualifyingOrderId: order.id, rewardedAt: new Date() },
  });
  if (settings.referrerPoints > 0) {
    await adjustPoints(order.businessId, referral.referrerCustomerId, settings.referrerPoints, "Referral reward — a friend's first order confirmed");
  }
}

export interface ReferralStats {
  code: string;
  totalReferred: number;
  rewarded: number;
  pointsEarned: number;
}

export async function getReferralStats(businessId: string, customerId: string): Promise<ReferralStats> {
  const code = await getOrCreateReferralCode(businessId, customerId);
  const referrals = await prisma.referral.findMany({ where: { businessId, referrerCustomerId: customerId } });
  const settings = await getReferralSettings(businessId);
  const rewarded = referrals.filter((r) => r.status === "rewarded").length;
  return { code, totalReferred: referrals.length, rewarded, pointsEarned: rewarded * settings.referrerPoints };
}
