import { throttle } from "@/lib/guard";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getStoreCustomer } from "@/lib/store-auth";

/** A signed-in customer requests a return on their own delivered order. Seller sees it in Returns. */
export async function POST(req: NextRequest, { params }: { params: Promise<{ businessId: string }> }) {
  const limited = await throttle(req, "shop-returns", 10, 600000);
  if (limited) return limited;
  const { businessId } = await params;
  const customer = await getStoreCustomer(businessId);
  if (!customer) return NextResponse.json({ error: "Sign in first." }, { status: 401 });

  const { orderId, reason } = (await req.json().catch(() => ({}))) as { orderId?: string; reason?: string };
  if (!orderId || !reason?.trim()) return NextResponse.json({ error: "Order and a reason are required." }, { status: 400 });

  const order = await prisma.order.findFirst({ where: { id: orderId, businessId, customerId: customer.id } });
  if (!order) return NextResponse.json({ error: "Order not found." }, { status: 404 });
  if (order.status !== "fulfilled")
    return NextResponse.json({ error: "Returns can only be requested once an order is delivered." }, { status: 400 });

  const existing = await prisma.returnRequest.findFirst({ where: { orderId } });
  if (existing) return NextResponse.json({ error: "A return has already been requested for this order." }, { status: 400 });

  const rr = await prisma.returnRequest.create({
    data: { businessId, orderId, reason: reason.trim().slice(0, 1000) },
  });
  return NextResponse.json({ ok: true, id: rr.id, status: rr.status });
}
