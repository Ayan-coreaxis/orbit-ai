import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { rateLimit } from "@/lib/rate-limit";

/** Shopper leaves an email to be told when a sold-out product / variant is restocked. */
export async function POST(req: NextRequest, { params }: { params: Promise<{ businessId: string }> }) {
  const { businessId } = await params;
  const b = (await req.json().catch(() => ({}))) as { productId?: string; variantId?: string | null; email?: string };

  const email = (b.email ?? "").trim().toLowerCase();
  if (!b.productId || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email))
    return NextResponse.json({ error: "A valid email and product are required." }, { status: 400 });

  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
  if (await rateLimit(`stocknotify:${businessId}:${ip}`, 10, 60_000))
    return NextResponse.json({ error: "Too many requests — try again shortly." }, { status: 429 });

  const product = await prisma.product.findFirst({ where: { id: b.productId, businessId }, select: { id: true } });
  if (!product) return NextResponse.json({ error: "Product not found." }, { status: 404 });

  const existing = await prisma.stockNotification.findFirst({
    where: { businessId, productId: b.productId, variantId: b.variantId ?? null, email, notifiedAt: null },
  });
  if (!existing) {
    await prisma.stockNotification.create({
      data: { businessId, productId: b.productId, variantId: b.variantId ?? null, email },
    });
  }
  return NextResponse.json({ ok: true });
}
