import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { issueGiftCard, adjustGiftCard } from "@/lib/gift-cards";
import { getActiveBusinessId } from "@/lib/get-active-business-id";

/** Seller view: every gift card, newest first. */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ businessId: string }> }) {
  const { businessId } = await params;
  const active = await getActiveBusinessId();
  if (!active || active !== businessId) return NextResponse.json({ error: "Not authorized." }, { status: 403 });

  const cards = await prisma.giftCard.findMany({
    where: { businessId },
    orderBy: { createdAt: "desc" },
    take: 100,
    include: { purchaser: { select: { name: true } } },
  });

  return NextResponse.json({
    cards: cards.map((c) => ({
      id: c.id,
      code: c.code,
      initialValue: c.initialValue,
      balance: c.balance,
      status: c.status,
      recipientName: c.recipientName,
      recipientEmail: c.recipientEmail,
      purchaserName: c.purchaser?.name ?? null,
      expiresAt: c.expiresAt?.toISOString() ?? null,
      createdAt: c.createdAt.toISOString(),
    })),
  });
}

/** Seller issues a new gift card (goodwill, a refund as store credit, or a manual sale). */
export async function POST(req: NextRequest, { params }: { params: Promise<{ businessId: string }> }) {
  const { businessId } = await params;
  const active = await getActiveBusinessId();
  if (!active || active !== businessId) return NextResponse.json({ error: "Not authorized." }, { status: 403 });

  const body = (await req.json().catch(() => ({}))) as {
    value?: number;
    recipientName?: string;
    recipientEmail?: string;
    message?: string;
  };
  const value = Number(body.value);
  if (!Number.isFinite(value) || value <= 0) return NextResponse.json({ error: "Enter a value greater than 0." }, { status: 400 });

  try {
    const card = await issueGiftCard(businessId, {
      value,
      recipientName: body.recipientName?.trim().slice(0, 120) || null,
      recipientEmail: body.recipientEmail?.trim().slice(0, 160) || null,
      message: body.message?.trim().slice(0, 300) || null,
    });
    return NextResponse.json({ ok: true, card });
  } catch (e) {
    return NextResponse.json({ error: String(e instanceof Error ? e.message : e).slice(0, 200) }, { status: 400 });
  }
}

/** Seller tops up / debits an existing card, or disables it. */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ businessId: string }> }) {
  const { businessId } = await params;
  const active = await getActiveBusinessId();
  if (!active || active !== businessId) return NextResponse.json({ error: "Not authorized." }, { status: 403 });

  const body = (await req.json().catch(() => ({}))) as { giftCardId?: string; amount?: number; note?: string; status?: "active" | "disabled" };
  if (!body.giftCardId) return NextResponse.json({ error: "Missing gift card." }, { status: 400 });

  const card = await prisma.giftCard.findFirst({ where: { id: body.giftCardId, businessId } });
  if (!card) return NextResponse.json({ error: "Gift card not found." }, { status: 404 });

  if (body.status && (body.status === "active" || body.status === "disabled")) {
    await prisma.giftCard.update({ where: { id: card.id }, data: { status: body.status } });
  }
  if (body.amount !== undefined) {
    const amount = Number(body.amount);
    if (!Number.isFinite(amount) || amount === 0) return NextResponse.json({ error: "Enter a non-zero amount." }, { status: 400 });
    await adjustGiftCard(businessId, card.id, amount, body.note || "Manual adjustment");
  }
  return NextResponse.json({ ok: true });
}
