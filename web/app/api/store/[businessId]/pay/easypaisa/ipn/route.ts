import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { throttle } from "@/lib/guard";
import { originFromRequest } from "@/lib/order-notify";
import { getStoreWallets } from "@/lib/store-wallets";
import { easypaisaIpnUrlAllowed, easypaisaRefTail, verifyEasypaisaIpn } from "@/lib/pk-wallets";
import { completePaidOrder } from "@/lib/checkout-finalize";
import { isWalletProvider } from "@/lib/payment-methods";

/**
 * Easypaisa's Instant Payment Notification — the seller pastes this address into their Easypaisa
 * merchant portal. Easypaisa calls it with `url=<address on its own host>`; nothing in the call
 * itself is trusted. We fetch that address ourselves (https, Easypaisa's exact host only, no
 * redirects) and mark the order paid only when the record says PAID for this store, this order
 * and this amount. This is the ONLY path that marks an Easypaisa order paid.
 */
async function handle(req: NextRequest, businessId: string, rawUrl: string) {
  const wallets = await getStoreWallets(businessId);
  const creds = wallets?.easypaisa;
  if (!creds) return NextResponse.json({ ok: false, error: "Easypaisa isn't set up for this store." }, { status: 404 });
  if (!rawUrl || !easypaisaIpnUrlAllowed(rawUrl, creds.sandbox))
    return NextResponse.json({ ok: false, error: "Not an Easypaisa address." }, { status: 400 });

  let record: unknown;
  try {
    const res = await fetch(rawUrl, { redirect: "error", cache: "no-store", signal: AbortSignal.timeout(20000), headers: { Accept: "application/json" } });
    if (!res.ok) return NextResponse.json({ ok: false, error: "Couldn't read the payment from Easypaisa." }, { status: 502 });
    record = JSON.parse((await res.text()).slice(0, 20000));
  } catch {
    return NextResponse.json({ ok: false, error: "Couldn't read the payment from Easypaisa." }, { status: 502 });
  }

  const tail = easypaisaRefTail((record as { order_id?: unknown } | null)?.order_id);
  const orders = tail ? await prisma.order.findMany({ where: { businessId, id: { endsWith: tail } }, take: 2 }) : [];
  if (orders.length !== 1) return NextResponse.json({ ok: false, error: "No such order." }, { status: 400 });
  const order = orders[0];
  if (order.paymentStatus === "paid") return NextResponse.json({ ok: true });
  if (!isWalletProvider(order.paymentProvider) && order.paymentProvider !== "cod")
    return NextResponse.json({ ok: false, error: "Not an Easypaisa order." }, { status: 400 });

  const verdict = verifyEasypaisaIpn(record, { storeId: creds.storeId, orderId: order.id, amount: order.total });
  if (!verdict.ok) {
    console.warn(`[easypaisa] order ${order.id} not paid: ${verdict.reason} (${verdict.detail})`);
    // "declined" (e.g. still unpaid) is a normal notification — acknowledge it; a mismatch is not
    return NextResponse.json({ ok: false, error: verdict.detail }, { status: verdict.reason === "declined" ? 200 : 400 });
  }

  await completePaidOrder(order, originFromRequest(req), { paymentProvider: "easypaisa", paymentRef: verdict.ref });
  return NextResponse.json({ ok: true });
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ businessId: string }> }) {
  const limited = await throttle(req, "shop-pay-ipn", 3000, 600000); // every store's notifications come from Easypaisa's few addresses
  if (limited) return limited;
  const { businessId } = await params;
  return handle(req, businessId, new URL(req.url).searchParams.get("url") ?? "");
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ businessId: string }> }) {
  const limited = await throttle(req, "shop-pay-ipn", 3000, 600000); // every store's notifications come from Easypaisa's few addresses
  if (limited) return limited;
  const { businessId } = await params;
  let url = new URL(req.url).searchParams.get("url") ?? "";
  if (!url) {
    try {
      const form = await req.formData();
      const v = form.get("url");
      if (typeof v === "string") url = v;
    } catch {
      // no form body
    }
  }
  return handle(req, businessId, url);
}
