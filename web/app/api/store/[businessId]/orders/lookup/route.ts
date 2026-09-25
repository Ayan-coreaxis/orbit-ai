import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

/** Guest order tracking — no account. Match by order id + the phone on the order (both required). */
export async function POST(req: NextRequest, { params }: { params: Promise<{ businessId: string }> }) {
  const { businessId } = await params;
  const b = (await req.json()) as { orderId?: string; phone?: string };
  const orderId = (b.orderId ?? "").trim();
  const phone = (b.phone ?? "").replace(/[^\d]/g, "").slice(-10);
  if (!orderId || !phone) return NextResponse.json({ error: "Enter your order number and phone." }, { status: 400 });

  const order = await prisma.order.findFirst({
    where: { businessId, id: orderId },
    select: {
      id: true, customerPhone: true, total: true, status: true, items: true, createdAt: true,
      courierName: true, trackingNumber: true, trackingUrl: true, shippedAt: true, confirmedAt: true,
    },
  });
  if (!order || !order.customerPhone.replace(/[^\d]/g, "").endsWith(phone))
    return NextResponse.json({ error: "No order matches those details." }, { status: 404 });

  let items: { name: string; qty: number; price: number }[] = [];
  try {
    const arr = JSON.parse(order.items);
    if (Array.isArray(arr)) items = arr.map((i) => ({ name: String(i.name ?? ""), qty: Number(i.qty ?? 1), price: Number(i.price ?? 0) }));
  } catch {
    /* ignore */
  }

  const { customerPhone, items: _raw, ...safe } = order;
  void customerPhone;
  void _raw;
  return NextResponse.json({ order: { ...safe, items } });
}
