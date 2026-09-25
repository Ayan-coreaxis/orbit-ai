import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import { getStoreCustomer } from "@/lib/store-auth";
import { recordEvent } from "@/lib/store-analytics";
import { notifyOrder, originFromRequest } from "@/lib/order-notify";
import { quoteCheckout, applyStockDelta, OutOfStockError } from "@/lib/checkout";

/**
 * Legacy public cash-on-delivery endpoint (the storefront now posts to /checkout, which also
 * does Stripe + coupons + shipping). Kept working and variant-safe by delegating pricing to
 * `quoteCheckout`. Server-authoritative — never trusts a client-sent total.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ businessId: string }> }) {
  const { businessId } = await params;

  const b = (await req.json()) as {
    items?: { productId: string; variantId?: string | null; qty: number }[];
    customerName?: string;
    customerPhone?: string;
    customerEmail?: string;
    address?: string;
  };

  const name = (b.customerName ?? "").trim();
  const phone = (b.customerPhone ?? "").trim();
  const email = (b.customerEmail ?? "").trim();
  const address = (b.address ?? "").trim();
  if (!name || !phone || !address)
    return NextResponse.json({ error: "Name, phone and address are all required." }, { status: 400 });

  const quote = await quoteCheckout(businessId, b.items);
  if (!quote.ok) return NextResponse.json({ error: quote.error ?? "Couldn't price this order." }, { status: 400 });

  const customer = await getStoreCustomer(businessId);

  let order;
  try {
   order = await prisma.$transaction(async (tx) => {
    await applyStockDelta(tx, businessId, quote.lineItems, -1);
    return tx.order.create({
      data: {
        businessId,
        customerId: customer?.id ?? null,
        customerName: name.slice(0, 120),
        customerPhone: phone.slice(0, 40),
        customerEmail: email ? email.slice(0, 160) : null,
        address: address.slice(0, 500),
        items: JSON.stringify(quote.lineItems),
        total: quote.total,
        status: "pending",
        paymentProvider: "cod",
        paymentStatus: "paid",
      },
    });
   });
  } catch (e) {
    if (e instanceof OutOfStockError)
      return NextResponse.json({ error: "Sorry — one of your items just sold out." }, { status: 409 });
    throw e;
  }

  const sess = (await cookies()).get("sc_sess")?.value;
  if (sess) await recordEvent(businessId, sess, "order_complete");
  await notifyOrder(order.id, "order_placed", originFromRequest(req)).catch(() => {});

  return NextResponse.json({ orderId: order.id, total: order.total });
}
