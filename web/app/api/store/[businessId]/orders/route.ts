import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getStoreCustomer } from "@/lib/store-auth";

/** The signed-in customer's own order history for THIS store. */
export async function GET(_req: Request, { params }: { params: Promise<{ businessId: string }> }) {
  const { businessId } = await params;
  const customer = await getStoreCustomer(businessId);
  if (!customer) return NextResponse.json({ error: "Sign in to see your orders." }, { status: 401 });

  const orders = await prisma.order.findMany({
    where: { businessId, customerId: customer.id },
    orderBy: { createdAt: "desc" },
    take: 50,
    select: {
      id: true, total: true, status: true, items: true, createdAt: true,
      courierName: true, trackingNumber: true, trackingUrl: true, shippedAt: true, confirmedAt: true, fulfilledAt: true,
    },
  });

  const returns = await prisma.returnRequest.findMany({
    where: { businessId, orderId: { in: orders.map((o) => o.id) } },
    select: { orderId: true, status: true },
  });
  const returnByOrder = new Map(returns.map((r) => [r.orderId, r.status]));

  return NextResponse.json({
    orders: orders.map((o) => ({
      ...o,
      items: safeItems(o.items),
      returnStatus: returnByOrder.get(o.id) ?? null,
    })),
  });
}

function safeItems(json: string) {
  try {
    const arr = JSON.parse(json);
    return Array.isArray(arr)
      ? arr.map((i) => ({
          productId: i.productId ? String(i.productId) : null,
          variantId: i.variantId ? String(i.variantId) : null,
          variantLabel: i.variantLabel ? String(i.variantLabel) : null,
          name: String(i.name ?? ""),
          qty: Number(i.qty ?? 1),
          price: Number(i.price ?? 0),
        }))
      : [];
  } catch {
    return [];
  }
}
