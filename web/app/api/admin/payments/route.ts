import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { isAdminAuthenticated } from "@/lib/auth";

const METHODS = ["bank_transfer", "jazzcash", "easypaisa", "cash", "card", "other"];

/** Record a payment a seller made outside Stripe (bank transfer, JazzCash…). A negative amount is a refund. */
export async function POST(req: NextRequest) {
  if (!(await isAdminAuthenticated())) return NextResponse.json({ error: "Not authorized." }, { status: 401 });
  const body = (await req.json().catch(() => ({}))) as { businessId?: string; amountUsd?: number; method?: string; note?: string; paidAt?: string };

  const amount = Number(body.amountUsd);
  if (!Number.isFinite(amount) || amount === 0 || Math.abs(amount) > 100_000) {
    return NextResponse.json({ error: "Enter an amount in USD (negative for a refund)." }, { status: 400 });
  }
  const method = METHODS.includes(body.method ?? "") ? body.method! : "other";
  const paidAt = body.paidAt ? new Date(body.paidAt) : new Date();
  if (Number.isNaN(paidAt.getTime()) || paidAt.getTime() > Date.now() + 86400_000) {
    return NextResponse.json({ error: "Pick a valid date, not in the future." }, { status: 400 });
  }
  const business = body.businessId ? await prisma.business.findUnique({ where: { id: body.businessId }, select: { id: true, plan: true } }) : null;
  if (!business) return NextResponse.json({ error: "Pick a seller." }, { status: 400 });

  const payment = await prisma.platformPayment.create({
    data: {
      businessId: business.id,
      amountUsd: Math.round(amount * 100) / 100,
      source: "manual",
      method,
      plan: business.plan,
      note: body.note?.trim().slice(0, 300) || null,
      paidAt,
    },
  });
  return NextResponse.json({ ok: true, id: payment.id });
}

/** Remove a hand-recorded payment (a typo). Stripe rows can't be removed here — refund in Stripe instead. */
export async function DELETE(req: NextRequest) {
  if (!(await isAdminAuthenticated())) return NextResponse.json({ error: "Not authorized." }, { status: 401 });
  const id = req.nextUrl.searchParams.get("id") ?? "";
  const row = await prisma.platformPayment.findUnique({ where: { id }, select: { source: true } });
  if (!row) return NextResponse.json({ error: "Not found." }, { status: 404 });
  if (row.source !== "manual") return NextResponse.json({ error: "Stripe payments come from Stripe — refund there instead." }, { status: 400 });
  await prisma.platformPayment.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
