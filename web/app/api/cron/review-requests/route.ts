import { cronAllowed } from "@/lib/guard";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { notifyCustomer } from "@/lib/notify";
import { originFromRequest } from "@/lib/order-notify";

/**
 * Asks for a review a few days after an order is marked delivered — once per order, only for
 * real fulfilled orders, and only if no review was ever requested for it. Meant to run on a
 * schedule (see vercel.json). Honest: records `notifyError` if the message didn't send.
 */
const REVIEW_DELAY_MS = 3 * 24 * 60 * 60 * 1000;

interface Item {
  name?: string;
  qty?: number;
  productId?: string;
}

export async function GET(req: NextRequest) {
  if (!cronAllowed(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const cutoff = new Date(Date.now() - REVIEW_DELAY_MS);
  const due = await prisma.order.findMany({
    where: {
      status: "fulfilled",
      reviewRequestedAt: null,
      fulfilledAt: { lte: cutoff },
    },
    take: 100,
    select: {
      id: true,
      businessId: true,
      customerName: true,
      customerPhone: true,
      customerEmail: true,
      items: true,
      business: { select: { name: true, whatsappInboundNumber: true } },
    },
  });

  const origin = originFromRequest(req);
  const results: { orderId: string; sent: boolean; error?: string }[] = [];

  for (const order of due) {
    const already = await prisma.review.findFirst({ where: { orderId: order.id } });
    if (already) {
      await prisma.order.update({ where: { id: order.id }, data: { reviewRequestedAt: new Date() } });
      continue;
    }

    let items: Item[] = [];
    try {
      items = JSON.parse(order.items) as Item[];
    } catch {
      items = [];
    }
    const productNames = items.map((i) => i.name).filter(Boolean).join(", ").slice(0, 300) || "your order";
    const distinctProducts = [...new Set(items.map((i) => i.productId).filter(Boolean))] as string[];

    const review = await prisma.review.create({
      data: {
        businessId: order.businessId,
        orderId: order.id,
        productId: distinctProducts.length === 1 ? distinctProducts[0] : null,
        customerName: order.customerName.split(" ")[0] || null,
        customerPhone: order.customerPhone,
        productNames,
        status: "requested",
      },
    });

    const res = await notifyCustomer(
      { phone: order.customerPhone, email: order.customerEmail, whatsappFrom: order.business.whatsappInboundNumber },
      "review_request",
      {
        storeName: order.business.name,
        firstName: order.customerName.split(" ")[0] || undefined,
        orderNumber: order.id.slice(-6).toUpperCase(),
        reviewUrl: `${origin.replace(/\/$/, "")}/review/${review.id}`,
      },
    );

    await prisma.review.update({ where: { id: review.id }, data: { notifyError: res.anySent ? null : res.error ?? null } });
    await prisma.order.update({ where: { id: order.id }, data: { reviewRequestedAt: new Date() } });
    results.push({ orderId: order.id, sent: res.anySent, error: res.error });
  }

  return NextResponse.json({ checked: due.length, results });
}
