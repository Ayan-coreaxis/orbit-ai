import { NextRequest, NextResponse } from "next/server";
import { getActiveBusinessId } from "@/lib/get-active-business-id";
import { prisma } from "@/lib/prisma";
import { notifyOrder, originFromRequest } from "@/lib/order-notify";
import { applyStockDelta, stockWasTaken } from "@/lib/checkout";
import { bookShipment, syncOrderCourier } from "@/lib/courier";
import { sendPurchaseEvent } from "@/lib/meta-capi";

const STATUSES = ["pending", "confirmed", "shipped", "fulfilled", "cancelled"] as const;
type Status = (typeof STATUSES)[number];

interface Item {
  productId?: string;
  variantId?: string | null;
  qty?: number;
}

/** Seller updates one order — status, tracking, private note. */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ businessId: string; id: string }> },
) {
  const { businessId, id } = await params;
  const active = await getActiveBusinessId();
  if (!active || active !== businessId) return NextResponse.json({ error: "Not authorized." }, { status: 403 });

  const order = await prisma.order.findUnique({ where: { id } });
  if (!order || order.businessId !== businessId) return NextResponse.json({ error: "Order not found." }, { status: 404 });

  const body = (await req.json().catch(() => ({}))) as {
    status?: string;
    courierName?: string | null;
    trackingNumber?: string | null;
    trackingUrl?: string | null;
    sellerNote?: string | null;
    verified?: boolean;
    book?: boolean;
    track?: boolean;
    notify?: boolean;
  };

  // ---- read the latest status from the courier ----
  if (body.track) {
    const r = await syncOrderCourier(id);
    const updated = await prisma.order.findUnique({ where: { id } });
    if (!r.ok) return NextResponse.json({ error: r.error ?? "Couldn't read the courier status.", order: updated }, { status: 502 });
    return NextResponse.json({ ok: true, order: updated });
  }

  // ---- auto-book a courier shipment ----
  if (body.book) {
    if (order.trackingNumber) return NextResponse.json({ error: "This order already has a tracking number." }, { status: 400 });
    const r = await bookShipment(businessId, id);
    if (!r.ok) return NextResponse.json({ error: r.error ?? "Booking failed." }, { status: 502 });
    await prisma.order.update({
      where: { id },
      data: {
        courierName: r.courierName,
        trackingNumber: r.trackingNumber ?? null,
        trackingUrl: r.trackingUrl ?? null,
        status: order.status === "pending" || order.status === "confirmed" ? "shipped" : order.status,
        shippedAt: order.shippedAt ?? new Date(),
        confirmedAt: order.confirmedAt ?? new Date(),
        verified: true,
        courierStatus: "booked",
        courierStatusText: "Booked",
        courierCheckedAt: new Date(),
      },
    });
    await notifyOrder(id, "order_shipped", originFromRequest(req)).catch(() => {});
    const updated = await prisma.order.findUnique({ where: { id } });
    return NextResponse.json({ ok: true, order: updated, booked: r });
  }

  const data: Record<string, unknown> = {};
  const now = new Date();

  if (body.verified === true && !order.verified) {
    data.verified = true;
    data.verifiedAt = now;
    data.verifyToken = null;
  }
  let notifyTemplate: "order_confirmed" | "order_shipped" | null = null;

  // ---- tracking / note (free-form, any time) ----
  if (body.courierName !== undefined) data.courierName = body.courierName ? String(body.courierName).slice(0, 120) : null;
  if (body.trackingNumber !== undefined) data.trackingNumber = body.trackingNumber ? String(body.trackingNumber).slice(0, 120) : null;
  if (body.trackingUrl !== undefined) {
    const u = body.trackingUrl ? String(body.trackingUrl).slice(0, 400) : null;
    if (u && !/^https?:\/\//i.test(u)) return NextResponse.json({ error: "Tracking URL must start with http(s)://" }, { status: 400 });
    data.trackingUrl = u;
  }
  if (body.sellerNote !== undefined) data.sellerNote = body.sellerNote ? String(body.sellerNote).slice(0, 2000) : null;

  // ---- status transition ----
  let restock = false;
  if (body.status !== undefined) {
    const next = body.status as Status;
    if (!STATUSES.includes(next)) return NextResponse.json({ error: "Unknown status." }, { status: 400 });
    if (order.status === "cancelled" && next !== "cancelled")
      return NextResponse.json({ error: "A cancelled order can't be reopened." }, { status: 400 });

    if (next !== order.status) {
      data.status = next;
      if (next === "confirmed") {
        data.confirmedAt = order.confirmedAt ?? now;
        notifyTemplate = "order_confirmed";
      } else if (next === "shipped") {
        data.shippedAt = order.shippedAt ?? now;
        if (!order.confirmedAt) data.confirmedAt = now;
        notifyTemplate = "order_shipped";
      } else if (next === "fulfilled") {
        data.fulfilledAt = order.fulfilledAt ?? now;
        if (order.paymentProvider === "cod") data.paymentStatus = "paid"; // delivered = cash collected
      } else if (next === "cancelled") {
        data.cancelledAt = now;
        restock = order.status !== "cancelled" && stockWasTaken(order);
      }
    }
  }

  if (Object.keys(data).length === 0) return NextResponse.json({ error: "Nothing to update." }, { status: 400 });

  await prisma.$transaction(async (tx) => {
    if (restock) {
      let items: Item[] = [];
      try {
        items = JSON.parse(order.items) as Item[];
      } catch {
        items = [];
      }
      await applyStockDelta(
        tx,
        businessId,
        items.filter((it): it is Item & { productId: string; qty: number } => !!it.productId && !!it.qty),
        1,
      );
    }
    await tx.order.update({ where: { id }, data });
  });

  // notify the shopper about a confirm/ship (best-effort; honest failure recorded on the row)
  let notified: { anySent: boolean; error?: string } | null = null;
  if (notifyTemplate && (body.notify ?? true)) {
    notified = await notifyOrder(id, notifyTemplate, originFromRequest(req)).catch(() => null);
  }

  // A confirmed / verified order becomes a real sale for Meta (no-op if already sent or not eligible).
  if (data.status === "confirmed" || data.status === "shipped" || data.verified === true) await sendPurchaseEvent(id).catch(() => {});

  const updated = await prisma.order.findUnique({ where: { id } });
  return NextResponse.json({ ok: true, order: updated, notified });
}
