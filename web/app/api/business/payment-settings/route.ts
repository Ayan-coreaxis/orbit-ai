import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getActiveBusinessId } from "@/lib/get-active-business-id";

export async function GET() {
  const businessId = await getActiveBusinessId();
  if (!businessId) return NextResponse.json({ error: "No active business." }, { status: 401 });

  const business = await prisma.business.findUnique({
    where: { id: businessId },
    select: { paymentProvider: true, stripeSecretKey: true, stripePublishableKey: true, storeCurrency: true },
  });

  return NextResponse.json({
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
  };

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
    },
    select: { paymentProvider: true, stripeSecretKey: true, stripePublishableKey: true, storeCurrency: true },
  });

  return NextResponse.json({
    paymentProvider: business.paymentProvider,
    stripeConfigured: !!business.stripeSecretKey && !!business.stripePublishableKey,
    stripePublishableKey: business.stripePublishableKey,
    storeCurrency: business.storeCurrency,
  });
}
