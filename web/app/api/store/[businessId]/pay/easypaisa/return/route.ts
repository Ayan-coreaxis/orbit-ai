import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { throttle } from "@/lib/guard";
import { originFromRequest } from "@/lib/order-notify";
import { getStoreWallets } from "@/lib/store-wallets";
import { autoSubmitPage, easypaisaRefTail, easypaisaUrls } from "@/lib/pk-wallets";

/**
 * Easypaisa's postBackURL, used twice in its two-step flow:
 *  1. back from Index.jsf with `auth_token` → we post the token straight on to Confirm.jsf;
 *  2. back from Confirm.jsf with `status`, `desc`, `orderRefNumber` → we show the order page.
 * Step 2 arrives through the shopper's browser with no signature, so it NEVER marks an order
 * paid — only the IPN (which fetches the payment from Easypaisa itself) does. Until then the
 * order page says the payment is being confirmed.
 */
async function handle(req: NextRequest, businessId: string, q: Record<string, string>) {
  const origin = originFromRequest(req);
  const wallets = await getStoreWallets(businessId);
  const creds = wallets?.easypaisa;
  if (!creds) return NextResponse.redirect(`${origin}/store/${businessId}/cart`, 303);

  const authToken = (q.auth_token ?? "").trim();
  if (authToken) {
    if (authToken.length > 2000) return NextResponse.json({ error: "Bad token." }, { status: 400 });
    const page = autoSubmitPage(
      easypaisaUrls(creds.sandbox).confirm,
      { auth_token: authToken, postBackURL: `${origin}/api/store/${businessId}/pay/easypaisa/return` },
      "Easypaisa",
    );
    return new NextResponse(page, {
      headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store", "X-Robots-Tag": "noindex" },
    });
  }

  const tail = easypaisaRefTail(q.orderRefNumber ?? q.orderRefNum ?? "");
  const orders = tail
    ? await prisma.order.findMany({ where: { businessId, id: { endsWith: tail } }, select: { id: true, paymentStatus: true }, take: 2 })
    : [];
  if (orders.length !== 1) return NextResponse.redirect(`${origin}/store/${businessId}/cart`, 303);
  const orderPage = `${origin}/store/${businessId}/order/${orders[0].id}`;
  if (orders[0].paymentStatus === "paid") return NextResponse.redirect(orderPage, 303);
  // what Easypaisa's page said — shown to the shopper as a hint only, never trusted as proof
  const saidOk = (q.status ?? "") === "0000" || (q.success ?? "").toLowerCase() === "true";
  return NextResponse.redirect(`${orderPage}?pay=${saidOk ? "confirming" : "failed"}`, 303);
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ businessId: string }> }) {
  const limited = await throttle(req, "shop-pay-return", 60, 600000);
  if (limited) return limited;
  const { businessId } = await params;
  const q: Record<string, string> = {};
  for (const [k, v] of new URL(req.url).searchParams.entries()) q[k] = v;
  return handle(req, businessId, q);
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ businessId: string }> }) {
  const limited = await throttle(req, "shop-pay-return", 60, 600000);
  if (limited) return limited;
  const { businessId } = await params;
  const q: Record<string, string> = {};
  for (const [k, v] of new URL(req.url).searchParams.entries()) q[k] = v;
  try {
    const form = await req.formData();
    for (const [k, v] of form.entries()) if (typeof v === "string") q[k] = v;
  } catch {
    // no form body — the address parameters are all there is
  }
  return handle(req, businessId, q);
}
