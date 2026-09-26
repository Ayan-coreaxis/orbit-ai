import { throttle } from "@/lib/guard";
import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import { quoteCheckout } from "@/lib/checkout";

/**
 * Seeds / refreshes an `AbandonedCart` row the moment a shopper hands over a phone number at
 * checkout but hasn't completed. The existing hourly recovery cron
 * (`app/api/cron/abandoned-cart-recovery`) then nudges them.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ businessId: string }> }) {
  const limited = await throttle(req, "shop-abandoned", 30, 600000);
  if (limited) return limited;
  const { businessId } = await params;
  const sess = (await cookies()).get("sc_sess")?.value;
  if (!sess) return NextResponse.json({ ok: false });

  const b = (await req.json().catch(() => ({}))) as {
    items?: { productId: string; qty: number }[];
    phone?: string;
  };
  const phone = (b.phone || "").trim();
  if (!phone || !Array.isArray(b.items) || b.items.length === 0) return NextResponse.json({ ok: false });

  const quote = await quoteCheckout(businessId, b.items);
  if (!quote.ok) return NextResponse.json({ ok: false });

  const snapshot = JSON.stringify(quote.lineItems.map((l) => ({ name: l.name, qty: l.qty })));

  await prisma.abandonedCart.upsert({
    where: { businessId_sessionId: { businessId, sessionId: sess } },
    create: { businessId, sessionId: sess, customerPhone: phone.slice(0, 40), items: snapshot, total: quote.subtotal },
    update: { customerPhone: phone.slice(0, 40), items: snapshot, total: quote.subtotal, recovered: false, notifiedAt: null, notifyError: null },
  });

  return NextResponse.json({ ok: true });
}
