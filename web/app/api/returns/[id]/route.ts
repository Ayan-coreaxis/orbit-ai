import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getActiveBusinessId } from "@/lib/get-active-business-id";
import { applyStockDelta } from "@/lib/checkout";
import { getStoreStripe } from "@/lib/store-stripe";

const FLOW: Record<string, string[]> = {
  requested: ["approved", "rejected"],
  approved: ["received", "rejected"],
  received: ["refunded"],
  rejected: [],
  refunded: [],
};

interface Item {
  productId?: string;
  variantId?: string | null;
  qty?: number;
}

/**
 * Return lifecycle: requested → approved → received (restocks the goods) → refunded (issues the
 * money back — a real Stripe refund for card orders, or a recorded manual refund for COD).
 */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const businessId = await getActiveBusinessId();
  if (!businessId) return NextResponse.json({ error: "No active business." }, { status: 400 });

  const rr = await prisma.returnRequest.findUnique({ where: { id } });
  if (!rr || rr.businessId !== businessId) return NextResponse.json({ error: "Return request not found." }, { status: 404 });

  const body = (await req.json().catch(() => ({}))) as { status?: string; sellerNote?: string; refundAmount?: number };
  const order = await prisma.order.findUnique({ where: { id: rr.orderId } });

  const data: Record<string, unknown> = {};
  if (body.sellerNote !== undefined) data.sellerNote = String(body.sellerNote).trim().slice(0, 1000) || null;

  if (body.status !== undefined) {
    const next = body.status;
    if (!FLOW[rr.status]?.includes(next))
      return NextResponse.json({ error: `Can't move a "${rr.status}" return to "${next}".` }, { status: 400 });
    data.status = next;

    // received → put the goods back into inventory (once)
    if (next === "received" && order && !rr.receivedAt) {
      let items: Item[] = [];
      try {
        items = JSON.parse(order.items) as Item[];
      } catch {
        items = [];
      }
      await prisma.$transaction((tx) =>
        applyStockDelta(
          tx,
          businessId,
          items.filter((it): it is Item & { productId: string; qty: number } => !!it.productId && !!it.qty),
          1,
        ),
      );
      data.receivedAt = new Date();
    }

    // refunded → actually move the money
    if (next === "refunded" && order && !rr.refundedAt) {
      const amount = body.refundAmount != null ? Math.max(0, Number(body.refundAmount)) : order.total;
      data.refundAmount = amount;
      data.refundedAt = new Date();

      if (order.paymentProvider === "stripe" && order.stripeSessionId && amount > 0) {
        const conn = await getStoreStripe(businessId);
        if (conn) {
          try {
            const session = await conn.stripe.checkout.sessions.retrieve(order.stripeSessionId);
            const pi = typeof session.payment_intent === "string" ? session.payment_intent : session.payment_intent?.id;
            if (pi) {
              const refund = await conn.stripe.refunds.create({ payment_intent: pi, amount: Math.round(amount * 100) });
              data.refundMethod = "stripe";
              data.stripeRefundId = refund.id;
            }
          } catch (e) {
            return NextResponse.json({ error: `Stripe refund failed: ${String(e).slice(0, 160)}` }, { status: 502 });
          }
        }
      } else {
        data.refundMethod = "cod_manual";
      }

      await prisma.order.update({ where: { id: order.id }, data: { paymentStatus: "refunded" } }).catch(() => {});
    }
  }

  const updated = await prisma.returnRequest.update({ where: { id }, data });
  return NextResponse.json({ returnRequest: updated });
}
