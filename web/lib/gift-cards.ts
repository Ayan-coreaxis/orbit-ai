import crypto from "crypto";
import { prisma } from "@/lib/prisma";

type TxClient = Parameters<Parameters<typeof prisma.$transaction>[0]>[0];

const round2 = (n: number) => Math.round(n * 100) / 100;

/** Thrown inside a checkout transaction when a gift card can't actually cover the redemption
 *  (balance changed since the quote, or the card was disabled) — caught by the checkout route to
 *  return a clean 409 instead of a raw 500. */
export class GiftCardError extends Error {}

export interface GiftCardSettings {
  enabled: boolean;
}

export async function getGiftCardSettings(businessId: string): Promise<GiftCardSettings> {
  const b = await prisma.business.findUnique({ where: { id: businessId }, select: { giftCardsEnabled: true } });
  return { enabled: b?.giftCardsEnabled ?? false };
}

function newCode(): string {
  // groups of 4 for a code a shopper can read back over WhatsApp without mixing up characters
  const raw = crypto.randomBytes(6).toString("hex").toUpperCase(); // 12 chars
  return `${raw.slice(0, 4)}-${raw.slice(4, 8)}-${raw.slice(8, 12)}`;
}

/** Seller (or an automated flow, e.g. a refund-as-credit) issues a new real gift card. */
export async function issueGiftCard(
  businessId: string,
  input: {
    value: number;
    purchaserCustomerId?: string | null;
    recipientEmail?: string | null;
    recipientName?: string | null;
    message?: string | null;
    expiresAt?: Date | null;
  },
): Promise<{ id: string; code: string; balance: number }> {
  const value = round2(Math.max(0, Number(input.value) || 0));
  if (value <= 0) throw new Error("Gift card value must be greater than 0.");

  for (let i = 0; i < 5; i++) {
    try {
      const card = await prisma.giftCard.create({
        data: {
          businessId,
          code: newCode(),
          initialValue: value,
          balance: value,
          purchaserCustomerId: input.purchaserCustomerId ?? null,
          recipientEmail: input.recipientEmail ?? null,
          recipientName: input.recipientName ?? null,
          message: input.message ?? null,
          expiresAt: input.expiresAt ?? null,
        },
      });
      await prisma.giftCardTransaction.create({
        data: { businessId, giftCardId: card.id, amount: value, reason: "issue" },
      });
      return { id: card.id, code: card.code, balance: card.balance };
    } catch {
      // unique collision on `code` — vanishingly rare, just retry with a fresh code
    }
  }
  throw new Error("Couldn't generate a gift card code.");
}

function normalizeCode(raw: string): string {
  return raw.trim().toUpperCase().replace(/\s+/g, "");
}

export interface GiftCardLookup {
  ok: boolean;
  error?: string;
  id?: string;
  code?: string;
  balance?: number;
}

/** Looks up a gift card by code for THIS business — used both for a balance check and to preview
 *  redemption at checkout before the order is actually placed. */
export async function lookupGiftCard(businessId: string, rawCode: string): Promise<GiftCardLookup> {
  const code = normalizeCode(rawCode);
  if (!code) return { ok: false, error: "Enter a gift card code." };

  const card = await prisma.giftCard.findUnique({ where: { code } });
  if (!card || card.businessId !== businessId) return { ok: false, error: "That gift card code isn't valid." };
  if (card.status !== "active") return { ok: false, error: "That gift card has been disabled." };
  if (card.expiresAt && card.expiresAt < new Date()) return { ok: false, error: "That gift card has expired." };
  if (card.balance <= 0) return { ok: false, error: "That gift card has no balance left." };

  return { ok: true, id: card.id, code: card.code, balance: card.balance };
}

/** How much of `orderTotal` a gift card can actually cover — never more than either side has. */
export function giftCardRedeemAmount(balance: number, orderTotal: number): number {
  return round2(Math.max(0, Math.min(balance, orderTotal)));
}

/**
 * Spends `amount` off a gift card inside the checkout transaction — guarded so two concurrent
 * checkouts against the same card can't both succeed past its real balance (mirrors
 * `applyStockDelta`'s race-safe pattern).
 */
export async function redeemGiftCard(tx: TxClient, businessId: string, code: string, amount: number, orderId: string): Promise<void> {
  const spend = round2(Math.max(0, Number(amount) || 0));
  if (spend <= 0) return;

  const card = await tx.giftCard.findUnique({ where: { code: normalizeCode(code) } });
  if (!card || card.businessId !== businessId || card.status !== "active") throw new GiftCardError("Gift card is no longer valid.");

  const res = await tx.giftCard.updateMany({
    where: { id: card.id, balance: { gte: spend } },
    data: { balance: { decrement: spend } },
  });
  if (res.count === 0) throw new GiftCardError("Gift card balance changed — please recheck the amount.");

  await tx.giftCardTransaction.create({
    data: { businessId, giftCardId: card.id, orderId, amount: -spend, reason: "redeem" },
  });
}

/** Seller manually tops up (or debits, for a correction) a card's balance. */
export async function adjustGiftCard(businessId: string, giftCardId: string, amount: number, note: string): Promise<void> {
  const delta = round2(Number(amount) || 0);
  if (!delta) return;

  await prisma.$transaction(async (tx) => {
    const card = await tx.giftCard.findFirst({ where: { id: giftCardId, businessId } });
    if (!card) throw new Error("Gift card not found.");
    const nextBalance = round2(Math.max(0, card.balance + delta));
    await tx.giftCard.update({ where: { id: card.id }, data: { balance: nextBalance } });
    await tx.giftCardTransaction.create({
      data: { businessId, giftCardId: card.id, amount: nextBalance - card.balance, reason: "adjust", note: note.slice(0, 300) },
    });
  });
}
