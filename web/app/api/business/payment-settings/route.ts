import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getActiveBusinessId } from "@/lib/get-active-business-id";
import { walletStatus } from "@/lib/payment-methods";
import { easypaisaHashKeyValid } from "@/lib/pk-wallets";

const WALLET_SELECT = {
  jazzcashMerchantId: true,
  jazzcashPassword: true,
  jazzcashIntegritySalt: true,
  jazzcashSandbox: true,
  easypaisaStoreId: true,
  easypaisaHashKey: true,
  easypaisaSandbox: true,
} as const;

const clean = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");

export async function GET() {
  const businessId = await getActiveBusinessId();
  if (!businessId) return NextResponse.json({ error: "No active business." }, { status: 401 });

  const business = await prisma.business.findUnique({
    where: { id: businessId },
    select: { paymentProvider: true, stripeSecretKey: true, stripePublishableKey: true, storeCurrency: true, ...WALLET_SELECT },
  });

  return NextResponse.json({
    ...walletStatus(business),
    paymentProvider: business?.paymentProvider ?? "cod",
    stripeConfigured: !!business?.stripeSecretKey && !!business?.stripePublishableKey,
    stripePublishableKey: business?.stripePublishableKey ?? null,
    storeCurrency: business?.storeCurrency ?? "usd",
  });
}

/** Seller sets their OWN Stripe keys here — never the platform's. Used only for their storefront checkout. */
export async function PATCH(req: NextRequest) {
  const businessId = await getActiveBusinessId();
  if (!businessId) return NextResponse.json({ error: "No active business." }, { status: 401 });

  const body = (await req.json()) as {
    paymentProvider?: string;
    stripeSecretKey?: string | null;
    stripePublishableKey?: string | null;
    storeCurrency?: string;
    /** JazzCash on the seller's own merchant account — `null` removes it; blank fields keep what's saved */
    jazzcash?: { merchantId?: string; password?: string; integritySalt?: string; sandbox?: boolean } | null;
    /** Easypaisa on the seller's own merchant account — `null` removes it; blank fields keep what's saved */
    easypaisa?: { storeId?: string; hashKey?: string; sandbox?: boolean } | null;
  };

  const walletData: Record<string, string | boolean | null> = {};
  if (body.jazzcash !== undefined || body.easypaisa !== undefined) {
    const saved = await prisma.business.findUnique({ where: { id: businessId }, select: WALLET_SELECT });
    if (body.jazzcash === null) {
      Object.assign(walletData, { jazzcashMerchantId: null, jazzcashPassword: null, jazzcashIntegritySalt: null });
    } else if (body.jazzcash) {
      const merchantId = clean(body.jazzcash.merchantId, 60) || saved?.jazzcashMerchantId || "";
      const password = clean(body.jazzcash.password, 120) || saved?.jazzcashPassword || "";
      const integritySalt = clean(body.jazzcash.integritySalt, 120) || saved?.jazzcashIntegritySalt || "";
      if (!merchantId || !password || !integritySalt)
        return NextResponse.json({ error: "JazzCash needs your Merchant ID, Password and Integrity Salt." }, { status: 400 });
      if (!/^[\x21-\x7e]+$/.test(merchantId + password + integritySalt))
        return NextResponse.json({ error: "JazzCash details can't contain spaces or non-English characters — copy them exactly from the JazzCash portal." }, { status: 400 });
      Object.assign(walletData, {
        jazzcashMerchantId: merchantId,
        jazzcashPassword: password,
        jazzcashIntegritySalt: integritySalt,
        jazzcashSandbox: body.jazzcash.sandbox ?? saved?.jazzcashSandbox ?? true,
      });
    }
    if (body.easypaisa === null) {
      Object.assign(walletData, { easypaisaStoreId: null, easypaisaHashKey: null });
    } else if (body.easypaisa) {
      const storeId = clean(body.easypaisa.storeId, 40) || saved?.easypaisaStoreId || "";
      const hashKey = clean(body.easypaisa.hashKey, 64) || saved?.easypaisaHashKey || "";
      if (!storeId || !hashKey) return NextResponse.json({ error: "Easypaisa needs your Store ID and Hash Key." }, { status: 400 });
      if (!/^[A-Za-z0-9]+$/.test(storeId)) return NextResponse.json({ error: "The Easypaisa Store ID is letters and digits only." }, { status: 400 });
      if (!easypaisaHashKeyValid(hashKey))
        return NextResponse.json({ error: "That Hash Key isn't the right length (16, 24 or 32 characters) — copy it exactly from the Easypaisa portal." }, { status: 400 });
      Object.assign(walletData, {
        easypaisaStoreId: storeId,
        easypaisaHashKey: hashKey,
        easypaisaSandbox: body.easypaisa.sandbox ?? saved?.easypaisaSandbox ?? true,
      });
    }
  }

  if (body.paymentProvider && !["cod", "stripe"].includes(body.paymentProvider)) {
    return NextResponse.json({ error: "Invalid payment provider." }, { status: 400 });
  }
  if (body.storeCurrency && !/^[a-z]{3}$/.test(body.storeCurrency)) {
    return NextResponse.json({ error: "Currency must be a real 3-letter code (e.g. usd, gbp, eur)." }, { status: 400 });
  }
  if (body.paymentProvider === "stripe") {
    const secret = body.stripeSecretKey;
    const pub = body.stripePublishableKey;
    const hasNewKeys = secret || pub;
    const existing = await prisma.business.findUnique({ where: { id: businessId }, select: { stripeSecretKey: true, stripePublishableKey: true } });
    const willHaveSecret = secret ?? existing?.stripeSecretKey;
    const willHavePublishable = pub ?? existing?.stripePublishableKey;
    if (hasNewKeys && secret != null && !secret.startsWith("sk_")) {
      return NextResponse.json({ error: "That doesn't look like a real Stripe secret key (should start with sk_)." }, { status: 400 });
    }
    if (!willHaveSecret || !willHavePublishable) {
      return NextResponse.json({ error: "Both your Stripe secret key and publishable key are required to enable online payments." }, { status: 400 });
    }
  }

  const business = await prisma.business.update({
    where: { id: businessId },
    data: {
      ...(body.paymentProvider !== undefined && { paymentProvider: body.paymentProvider }),
      ...(body.stripeSecretKey !== undefined && { stripeSecretKey: body.stripeSecretKey || null }),
      ...(body.stripePublishableKey !== undefined && { stripePublishableKey: body.stripePublishableKey || null }),
      ...(body.storeCurrency !== undefined && { storeCurrency: body.storeCurrency }),
      ...walletData,
    },
    select: { paymentProvider: true, stripeSecretKey: true, stripePublishableKey: true, storeCurrency: true, ...WALLET_SELECT },
  });

  return NextResponse.json({
    ...walletStatus(business),
    paymentProvider: business.paymentProvider,
    stripeConfigured: !!business.stripeSecretKey && !!business.stripePublishableKey,
    stripePublishableKey: business.stripePublishableKey,
    storeCurrency: business.storeCurrency,
  });
}
