import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { throttle } from "@/lib/guard";
import { originFromRequest } from "@/lib/order-notify";
import { getStoreWallets, walletOptions } from "@/lib/store-wallets";
import { isWalletProvider } from "@/lib/payment-methods";
import { JAZZCASH_FORM_URL, autoSubmitPage, buildEasypaisaFields, buildJazzcashFields, easypaisaUrls } from "@/lib/pk-wallets";

/**
 * The hand-off page for a JazzCash / Easypaisa order: builds a freshly signed form (a new
 * reference on every visit, so "try again" just means opening this address again) and posts the
 * shopper's browser to the wallet's hosted page. Marks nothing paid.
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ businessId: string; orderId: string }> }) {
  const limited = await throttle(req, "shop-pay", 40, 600000);
  if (limited) return limited;
  const { businessId, orderId } = await params;
  const origin = originFromRequest(req);
  const orderPage = `${origin}/store/${businessId}/order/${orderId}`;

  const order = await prisma.order.findUnique({
    where: { id: orderId },
    select: { id: true, businessId: true, total: true, status: true, paymentProvider: true, paymentStatus: true, customerEmail: true, customerPhone: true },
  });
  if (!order || order.businessId !== businessId) return NextResponse.json({ error: "Order not found." }, { status: 404 });
  // nothing to pay: already paid, cancelled, or not a wallet order
  if (!isWalletProvider(order.paymentProvider) || order.paymentStatus === "paid" || order.status !== "pending")
    return NextResponse.redirect(orderPage, 303);

  const wallets = await getStoreWallets(businessId);
  if (!walletOptions(wallets).includes(order.paymentProvider) || !wallets) return NextResponse.redirect(`${orderPage}?pay=unavailable`, 303);

  const now = new Date();
  let action: string;
  let fields: Record<string, string>;
  let ref: string;
  let name: string;
  if (order.paymentProvider === "jazzcash" && wallets.jazzcash) {
    fields = buildJazzcashFields({
      creds: wallets.jazzcash,
      orderId: order.id,
      amount: order.total,
      returnUrl: `${origin}/api/store/${businessId}/pay/jazzcash/return`,
      now,
    });
    action = wallets.jazzcash.sandbox ? JAZZCASH_FORM_URL.sandbox : JAZZCASH_FORM_URL.live;
    ref = fields.pp_TxnRefNo;
    name = "JazzCash";
  } else if (order.paymentProvider === "easypaisa" && wallets.easypaisa) {
    fields = buildEasypaisaFields({
      creds: wallets.easypaisa,
      orderId: order.id,
      amount: order.total,
      postBackUrl: `${origin}/api/store/${businessId}/pay/easypaisa/return`,
      email: order.customerEmail,
      phone: order.customerPhone,
      now,
    });
    action = easypaisaUrls(wallets.easypaisa.sandbox).index;
    ref = fields.orderRefNum;
    name = "Easypaisa";
  } else {
    return NextResponse.redirect(`${orderPage}?pay=unavailable`, 303);
  }

  await prisma.order.update({ where: { id: order.id }, data: { paymentRef: ref } });

  return new NextResponse(autoSubmitPage(action, fields, name), {
    headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store", "X-Robots-Tag": "noindex" },
  });
}
