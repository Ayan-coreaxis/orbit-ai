import { prisma } from "@/lib/prisma";
import { resolvePurchasable } from "@/lib/variants";
import { lookupGiftCard, giftCardRedeemAmount } from "@/lib/gift-cards";
import { resolveBundleForCheckout } from "@/lib/bundles";
import { getLoyaltySettings, getBalance } from "@/lib/loyalty";
import { matchShippingZone } from "@/lib/shipping-zones";

/**
 * The single source of truth for what an order costs. Never trusts a client-sent total — line
 * prices come from real `Product` rows, the coupon + its rules from a real `Coupon` row, shipping
 * and tax from the seller's real config. Used by the checkout route and the coupon-preview route.
 */

export interface CheckoutLine {
  productId: string;
  variantId?: string | null;
  variantLabel?: string | null;
  name: string;
  price: number;
  qty: number;
  bundleId?: string | null; // set when this real product line is part of a bundle purchase
  bundleName?: string | null;
}

export interface CheckoutQuote {
  ok: boolean;
  error?: string;
  lineItems: CheckoutLine[];
  subtotal: number;
  couponCode: string | null;
  couponLabel: string | null;
  discount: number;
  shipping: number;
  freeShipping: boolean;
  tax: number;
  taxLabel: string;
  giftCardCode: string | null;
  giftCardDiscount: number;
  loyaltyPointsRedeemed: number;
  loyaltyDiscount: number;
  bundleDiscount: number; // informational — sum of "worth vs charged" savings across bundles in the cart
  shippingZoneName: string | null; // which zone (if any) priced the delivery fee
  total: number;
  currency: string;
}

export const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * The pure order arithmetic — discount off subtotal, shipping (waived by a free-shipping coupon
 * or the free-over threshold), then tax on the discounted subtotal. Kept separate so it can be
 * unit-tested without a database.
 */
export function computeTotals(input: {
  subtotal: number;
  discount: number;
  shippingFee: number;
  freeShippingOver: number | null;
  couponFreeShipping: boolean;
  taxRatePercent: number; // 0 when tax-inclusive / not tracked
}): { discount: number; shipping: number; freeShipping: boolean; tax: number; total: number } {
  const discount = round2(Math.min(input.discount, input.subtotal));
  const afterDiscount = round2(input.subtotal - discount);
  const freeShipping =
    input.couponFreeShipping || (input.freeShippingOver != null && afterDiscount >= input.freeShippingOver);
  const shipping = freeShipping ? 0 : round2(Math.max(0, input.shippingFee));
  const rate = Math.max(0, input.taxRatePercent);
  const tax = rate > 0 ? round2((afterDiscount * rate) / 100) : 0;
  const total = round2(Math.max(0, afterDiscount + shipping + tax));
  return { discount, shipping, freeShipping, tax, total };
}

type TxClient = Parameters<Parameters<typeof prisma.$transaction>[0]>[0];

/** Thrown inside a checkout transaction when a decrement would take stock negative (a race with another buyer). */
export class OutOfStockError extends Error {
  constructor(public productId: string) {
    super("Out of stock");
    this.name = "OutOfStockError";
  }
}

/**
 * Move stock for a set of line items — variant stock when a line has `variantId`, otherwise the
 * product's own stock. `dir` is -1 to sell, +1 to restock (cancel/refund). Selling is guarded
 * (`where: stock >= qty`) so two shoppers can't both buy the last unit — the loser's transaction
 * throws `OutOfStockError` and rolls back.
 */
export async function applyStockDelta(
  tx: TxClient,
  businessId: string,
  lines: { productId: string; variantId?: string | null; qty: number }[],
  dir: -1 | 1,
): Promise<void> {
  for (const l of lines) {
    const amount = Math.max(0, Math.floor(Number(l.qty) || 0));
    if (!amount) continue;

    if (dir === 1) {
      // restock — no guard
      if (l.variantId)
        await tx.productVariant.updateMany({ where: { id: l.variantId, product: { businessId } }, data: { stock: { increment: amount } } });
      else await tx.product.updateMany({ where: { id: l.productId, businessId }, data: { stock: { increment: amount } } });
      continue;
    }

    // sell — only decrement if there's enough; a 0-row result means someone else took it
    const res = l.variantId
      ? await tx.productVariant.updateMany({
          where: { id: l.variantId, product: { businessId }, stock: { gte: amount } },
          data: { stock: { decrement: amount } },
        })
      : await tx.product.updateMany({
          where: { id: l.productId, businessId, stock: { gte: amount } },
          data: { stock: { decrement: amount } },
        });
    if (res.count === 0) throw new OutOfStockError(l.productId);
  }
}

export async function quoteCheckout(
  businessId: string,
  rawItems: { productId?: string; variantId?: string | null; qty?: number; bundleId?: string }[] | undefined,
  couponCodeRaw?: string | null,
  customerPhone?: string | null,
  giftCardCodeRaw?: string | null,
  loyaltyCustomerId?: string | null,
  loyaltyPointsRequested?: number | null,
  shippingCity?: string | null,
): Promise<CheckoutQuote> {
  const empty: CheckoutQuote = {
    ok: false,
    lineItems: [],
    subtotal: 0,
    couponCode: null,
    couponLabel: null,
    discount: 0,
    shipping: 0,
    freeShipping: false,
    tax: 0,
    taxLabel: "Tax",
    giftCardCode: null,
    giftCardDiscount: 0,
    loyaltyPointsRedeemed: 0,
    loyaltyDiscount: 0,
    bundleDiscount: 0,
    shippingZoneName: null,
    total: 0,
    currency: "usd",
  };

  const business = await prisma.business.findUnique({
    where: { id: businessId },
    select: {
      storeCurrency: true,
      shippingFee: true,
      freeShippingOver: true,
      taxRatePercent: true,
      taxInclusive: true,
      taxLabel: true,
    },
  });
  if (!business) return { ...empty, error: "Store not found." };
  const currency = business.storeCurrency || "usd";
  const taxLabel = business.taxLabel || "Tax";

  if (!Array.isArray(rawItems) || rawItems.length === 0) return { ...empty, currency, taxLabel, error: "Your cart is empty." };

  const ids = [...new Set(rawItems.filter((i) => !i.bundleId).map((i) => i.productId).filter(Boolean) as string[])];
  const products = await prisma.product.findMany({
    where: { id: { in: ids }, businessId },
    include: { variants: true },
  });
  const byId = new Map(products.map((p) => [p.id, p]));

  const lineItems: CheckoutLine[] = [];
  let goodsTotal = 0; // sum of standalone product lines + each bundle's flat price (the real subtotal)
  let bundleCatalogSum = 0; // sum of what the bundle contents would cost individually — for the savings figure
  let bundlePriceSum = 0; // sum of the bundles' own flat prices — the other half of the savings figure

  for (const i of rawItems) {
    if (i.bundleId) {
      const bundleSets = Math.max(1, Math.floor(Number(i.qty) || 1));
      const resolved = await resolveBundleForCheckout(businessId, i.bundleId);
      if (!resolved.ok || !resolved.lines || resolved.price == null) return { ...empty, currency, taxLabel, error: resolved.error ?? "That bundle isn't available." };

      for (const bl of resolved.lines) {
        const needed = bl.qty * bundleSets;
        if (bl.stock < needed) {
          const which = bl.variantLabel ? `"${bl.name}" (${bl.variantLabel})` : `"${bl.name}"`;
          return { ...empty, currency, taxLabel, error: `Only ${bl.stock} of ${which} left in stock for the "${resolved.name}" bundle.` };
        }
        lineItems.push({
          productId: bl.productId,
          variantId: bl.variantId,
          variantLabel: bl.variantLabel,
          name: bl.name,
          price: bl.catalogPrice,
          qty: needed,
          bundleId: resolved.bundleId,
          bundleName: resolved.name,
        });
        bundleCatalogSum += bl.catalogPrice * needed;
      }
      goodsTotal += resolved.price * bundleSets;
      bundlePriceSum += resolved.price * bundleSets;
      continue;
    }

    const p = i.productId ? byId.get(i.productId) : undefined;
    const qty = Math.max(1, Math.floor(Number(i.qty) || 1));
    if (!p) return { ...empty, currency, taxLabel, error: "One of the items is no longer available." };

    const r = resolvePurchasable(p, p.variants, i.variantId);
    if ("error" in r) return { ...empty, currency, taxLabel, error: `"${p.name}": ${r.error}` };
    if (r.stock < qty) {
      const which = r.label ? `"${p.name}" (${r.label})` : `"${p.name}"`;
      return { ...empty, currency, taxLabel, error: `Only ${r.stock} of ${which} left in stock.` };
    }
    lineItems.push({ productId: p.id, variantId: r.variantId, variantLabel: r.label, name: p.name, price: r.price, qty });
    goodsTotal += r.price * qty;
  }
  if (lineItems.length === 0) return { ...empty, currency, taxLabel, error: "Your cart is empty." };

  const subtotal = round2(goodsTotal);
  const bundleDiscount = round2(Math.max(0, bundleCatalogSum - bundlePriceSum));
  const base = { ...empty, ok: false as const, currency, taxLabel, subtotal, lineItems, bundleDiscount };

  // ---- coupon (with targeting rules) ----
  let discount = 0;
  let couponCode: string | null = null;
  let couponLabel: string | null = null;
  let couponFreeShipping = false;
  const phone = (customerPhone || "").trim();

  const explicit = (couponCodeRaw || "").trim().toUpperCase();
  const candidate = explicit
    ? await prisma.coupon.findUnique({ where: { businessId_code: { businessId, code: explicit } } })
    : (await prisma.coupon.findFirst({ where: { businessId, active: true, autoApply: true } })) ?? null;

  if (candidate) {
    const c = candidate;
    const fail = (msg: string) => (explicit ? { ...base, error: msg } : null); // silent for auto-apply
    let stop: CheckoutQuote | null = null;

    if (!c.active) stop = fail("That code isn't valid.");
    else if (c.expiresAt && c.expiresAt < new Date()) stop = fail("That code has expired.");
    else if (c.usageLimit != null && c.usedCount >= c.usageLimit) stop = fail("That code has been fully used.");
    else if (c.minSubtotal != null && subtotal < c.minSubtotal)
      stop = fail(`Add ${currency.toUpperCase()} ${round2(c.minSubtotal - subtotal)} more to use this code.`);
    else if ((c.firstOrderOnly || c.perCustomerLimit != null) && phone) {
      const prior = await prisma.order.count({ where: { businessId, customerPhone: phone, status: { not: "cancelled" } } });
      if (c.firstOrderOnly && prior > 0) stop = fail("This code is for first orders only.");
      const used = await prisma.order.count({ where: { businessId, customerPhone: phone, couponCode: c.code } });
      if (!stop && c.perCustomerLimit != null && used >= c.perCustomerLimit) stop = fail("You've already used this code.");
    }
    if (stop) return stop;
    if (explicit || !stop) {
      // discount base — whole subtotal, or only the targeted products' line totals
      let discountBase = subtotal;
      if (c.productIds) {
        try {
          const only = new Set(JSON.parse(c.productIds) as string[]);
          discountBase = round2(lineItems.filter((l) => only.has(l.productId)).reduce((s, l) => s + l.price * l.qty, 0));
        } catch {
          /* ignore bad json */
        }
      }
      if (discountBase > 0) {
        discount =
          c.type === "percent"
            ? round2((discountBase * Math.min(100, Math.max(0, c.value))) / 100)
            : round2(Math.min(c.value, discountBase));
        couponCode = c.code;
        couponLabel = `${c.code} — ${c.type === "percent" ? `${c.value}% off` : `${c.value} off`}`;
        couponFreeShipping = c.freeShipping;
      } else if (explicit) {
        return { ...base, error: "This code doesn't apply to anything in your cart." };
      }
    }
  }

  const zone = await matchShippingZone(businessId, shippingCity);
  const shippingZoneName = zone?.name ?? null;
  const t = computeTotals({
    subtotal,
    discount,
    shippingFee: zone ? zone.fee : business.shippingFee || 0,
    freeShippingOver: zone ? zone.freeOver : business.freeShippingOver,
    couponFreeShipping,
    taxRatePercent: business.taxInclusive ? 0 : Number(business.taxRatePercent) || 0,
  });

  // Zero-decimal currencies (PKR, INR…) are priced in whole units — round tax so an order total
  // never carries a stray ".5", and re-derive total from the rounded parts so it always adds up.
  const zeroDecimal = ["pkr", "inr", "lkr", "bdt", "jpy", "krw", "vnd", "idr"].includes(currency.toLowerCase());
  const tax = zeroDecimal ? Math.round(t.tax) : t.tax;
  const preGiftCardTotal = zeroDecimal
    ? Math.round(subtotal) - Math.round(t.discount) + Math.round(t.shipping) + tax
    : t.total;

  // ---- loyalty points (applied off the taxed/shipped total, before a gift card mops up the rest) ----
  let loyaltyPointsRedeemed = 0;
  let loyaltyDiscount = 0;
  const requestedPoints = Math.max(0, Math.floor(Number(loyaltyPointsRequested) || 0));
  if (loyaltyCustomerId && requestedPoints > 0) {
    const loyaltySettings = await getLoyaltySettings(businessId);
    if (loyaltySettings.enabled && loyaltySettings.redeemRate > 0) {
      const balance = await getBalance(businessId, loyaltyCustomerId);
      if (balance >= loyaltySettings.minRedeem) {
        const capByOrder = Math.floor(preGiftCardTotal / loyaltySettings.redeemRate);
        const capPoints = Math.max(0, Math.min(balance, capByOrder));
        loyaltyPointsRedeemed = Math.min(requestedPoints, capPoints);
        loyaltyDiscount = round2(loyaltyPointsRedeemed * loyaltySettings.redeemRate);
      }
    }
  }
  const preGiftCardAfterLoyalty = round2(Math.max(0, preGiftCardTotal - loyaltyDiscount));

  // ---- gift card (applied last, off whatever's left — never off the taxed/shipped subtotal) ----
  let giftCardCode: string | null = null;
  let giftCardDiscount = 0;
  const rawGiftCard = (giftCardCodeRaw || "").trim();
  if (rawGiftCard) {
    const gc = await lookupGiftCard(businessId, rawGiftCard);
    if (!gc.ok || gc.balance == null)
      return { ...base, tax, loyaltyPointsRedeemed, loyaltyDiscount, total: preGiftCardAfterLoyalty, error: gc.error ?? "That gift card code isn't valid." };
    giftCardCode = gc.code ?? null;
    giftCardDiscount = giftCardRedeemAmount(gc.balance, preGiftCardAfterLoyalty);
  }
  const total = round2(Math.max(0, preGiftCardAfterLoyalty - giftCardDiscount));

  return {
    ok: true,
    lineItems,
    subtotal,
    couponCode,
    couponLabel,
    discount: t.discount,
    shipping: t.shipping,
    freeShipping: t.freeShipping,
    tax,
    taxLabel,
    giftCardCode,
    giftCardDiscount,
    loyaltyPointsRedeemed,
    loyaltyDiscount,
    bundleDiscount,
    shippingZoneName,
    total,
    currency,
  };
}
