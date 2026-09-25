import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function POST(req: NextRequest) {
  const { orderId, reason } = (await req.json()) as { orderId?: string; reason?: string };
  if (!orderId || !reason?.trim()) {
    return NextResponse.json({ error: "Order and reason are required." }, { status: 400 });
  }

  const order = await prisma.order.findUnique({ where: { id: orderId } });
  if (!order) return NextResponse.json({ error: "Order not found." }, { status: 404 });

  const existing = await prisma.returnRequest.findFirst({ where: { orderId } });
  if (existing) return NextResponse.json({ error: "A return has already been requested for this order." }, { status: 400 });

  const returnRequest = await prisma.returnRequest.create({
    data: { businessId: order.businessId, orderId, reason: reason.trim().slice(0, 1000) },
  });

  return NextResponse.json({ id: returnRequest.id, status: returnRequest.status });
}
