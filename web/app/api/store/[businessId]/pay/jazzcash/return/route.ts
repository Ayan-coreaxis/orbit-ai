import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { throttle } from "@/lib/guard";
import { originFromRequest } from "@/lib/order-notify";
import { getStoreWallets } from "@/lib/store-wallets";
import { verifyJazzcashReturn } from "@/lib/pk-wallets";
import { completePaidOrder } from "@/lib/checkout-finalize";
import { isWalletProvider } from "@/lib/payment-methods";

/**
 * JazzCash sends the shopper's browser back here (a form POST) after its hosted page. The order
 * is marked paid ONLY when the response's secure hash checks out against the seller's Integrity
 * Salt, the code is "000", and the amount and references are this order's. Anything else leaves
 * the order unpaid and sends the shopper to its page to retry or switch to cash on delivery.
 */
async function handle(req: NextRequest, businessId: string, fields: Record<string, string>) {
  const origin = originFromRequest(req);
  const orderId = (fields.ppmpf_1 ?? "").trim();
  const order = orderId && orderId.length <= 40 ? await prisma.order.findUnique({ where: { id: orderId } }) : null;
  if (!order || order.businessId !== businessId) return NextResponse.redirect(`${origin}/store/${businessId}/cart`, 303);
  const orderPage = `${origin}/store/${businessId}/order/${order.id}`;
  if (order.paymentStatus === "paid") return NextResponse.redirect(orderPage, 303);
  // only an order that was sent to JazzCash (or was, before the shopper switched it to cash) can be paid by JazzCash
  if (!isWalletProvider(order.paymentProvider) && order.paymentProvider !== "cod") return NextResponse.redirect(orderPage, 303);

  const wallets = await getStoreWallets(businessId);
  const creds = wallets?.jazzcash;
  if (!creds) return NextResponse.redirect(`${orderPage}?pay=failed&why=unverified`, 303);

  const verdict = verifyJazzcashReturn(fields, {
    integritySalt: creds.integritySalt,
    merchantId: creds.merchantId,
    orderId: order.id,
    amount: order.total,
  });
  if (!verdict.ok) {
    // no secrets and no shopper details in the log — just what went wrong
    console.warn(`[jazzcash] order ${order.id} not paid: ${verdict.reason} (${verdict.detail})`);
    return NextResponse.redirect(`${orderPage}?pay=failed&why=${verdict.reason}`, 303);
  }

  await completePaidOrder(order, origin, { paymentProvider: "jazzcash", paymentRef: verdict.ref });
  return NextResponse.redirect(orderPage, 303);
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ businessId: string }> }) {
  const limited = await throttle(req, "shop-pay-return", 60, 600000);
  if (limited) return limited;
  const { businessId } = await params;
  const fields: Record<string, string> = {};
  try {
    const form = await req.formData();
    for (const [k, v] of form.entries()) if (typeof v === "string") fields[k] = v;
  } catch {
    // not a form — handled below as an empty (unverifiable) response
  }
  return handle(req, businessId, fields);
}

/** Some JazzCash setups come back with the fields in the address instead of a form. Same checks. */
export async function GET(req: NextRequest, { params }: { params: Promise<{ businessId: string }> }) {
  const limited = await throttle(req, "shop-pay-return", 60, 600000);
  if (limited) return limited;
  const { businessId } = await params;
  const fields: Record<string, string> = {};
  for (const [k, v] of new URL(req.url).searchParams.entries()) fields[k] = v;
  return handle(req, businessId, fields);
}
