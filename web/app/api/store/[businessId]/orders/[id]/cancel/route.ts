import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getStoreCustomer } from "@/lib/store-auth";
import { applyStockDelta } from "@/lib/checkout";

interface Item {
  productId?: string;
  variantId?: string | null;
  qty?: number;
}

/** A signed-in customer cancels their own order — only while it's still `pending`. Restocks. */
export async function POST(_req: Request, { params }: { params: Promise<{ businessId: string; id: string }> }) {
  const { businessId, id } = await params;
  const customer = await getStoreCustomer(businessId);
  if (!customer) return NextResponse.json({ error: "Sign in first." }, { status: 401 });

  const order = await prisma.order.findFirst({ where: { id, businessId, customerId: customer.id } });
  if (!order) return NextResponse.json({ error: "Order not found." }, { status: 404 });
  if (order.status !== "pending")
    return NextResponse.json({ error: "This order is already being processed — contact the store to cancel." }, { status: 400 });

  let items: Item[] = [];
  try {
    items = JSON.parse(order.items) as Item[];
  } catch {
    items = [];
  }

  await prisma.$transaction(async (tx) => {
    await applyStockDelta(
      tx,
      businessId,
      items.filter((it): it is Item & { productId: string; qty: number } => !!it.productId && !!it.qty),
      1,
    );
    await tx.order.update({ where: { id }, data: { status: "cancelled", cancelledAt: new Date() } });
  });

  return NextResponse.json({ ok: true });
}
