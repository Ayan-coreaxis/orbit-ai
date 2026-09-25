import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

/** Public storefront newsletter signup. */
export async function POST(req: NextRequest, { params }: { params: Promise<{ businessId: string }> }) {
  const { businessId } = await params;
  const business = await prisma.business.findUnique({ where: { id: businessId }, select: { id: true } });
  if (!business) return NextResponse.json({ ok: false, error: "Store not found." }, { status: 404 });

  const { email } = (await req.json()) as { email?: string };
  const clean = (email ?? "").trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(clean)) {
    return NextResponse.json({ ok: false, error: "Enter a valid email address." }, { status: 400 });
  }

  await prisma.newsletterSubscriber.upsert({
    where: { businessId_email: { businessId, email: clean } },
    create: { businessId, email: clean },
    update: {},
  });
  return NextResponse.json({ ok: true });
}
