import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { sendWhatsAppMessage } from "@/lib/whatsapp";
import { storeUrl } from "@/lib/public-url";
import { money } from "@/lib/money";

const RECOVERY_DELAY_MS = 60 * 60 * 1000; // wait 1 hour after the last cart edit before nudging

interface ItemSnapshot {
  name: string;
  qty: number;
}

/**
 * Sends a real, honest WhatsApp nudge for real abandoned checkouts — never simulated, never
 * sent for a cart that already turned into an order. Meant to run on a schedule (see
 * vercel.json); locally it only runs when called directly, same as the weekly-scan cron.
 */
export async function GET(req: NextRequest) {
  const auth = req.headers.get("authorization");
  if (process.env.CRON_SECRET && auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const cutoff = new Date(Date.now() - RECOVERY_DELAY_MS);
  const due = await prisma.abandonedCart.findMany({
    where: { recovered: false, notifiedAt: null, updatedAt: { lte: cutoff } },
    include: { business: { select: { name: true, id: true, whatsappInboundNumber: true, storeCurrency: true } } },
  });

  const results = [];
  for (const cart of due) {
    let items: ItemSnapshot[] = [];
    try {
      items = JSON.parse(cart.items);
    } catch {
      items = [];
    }
    const summary = items.map((i) => `${i.name} x${i.qty}`).join(", ") || "your cart";
    const cartLink = await storeUrl(cart.business.id, "/cart");
    const message = `Hi! You left ${summary} in your cart at ${cart.business.name} (${money(cart.total, cart.business.storeCurrency)}). Complete your order here: ${cartLink} — or just reply to this message.`;

    const result = await sendWhatsAppMessage(cart.customerPhone, message, {
      from: cart.business.whatsappInboundNumber ?? undefined,
      template: { kind: "cart_recovery", vars: [cart.business.name, summary, money(cart.total, cart.business.storeCurrency), cartLink] },
    });
    await prisma.abandonedCart.update({
      where: { id: cart.id },
      data: { notifiedAt: new Date(), notifyError: result.error },
    });
    results.push({ businessId: cart.business.id, cartId: cart.id, sent: result.sent, error: result.error });
  }

  return NextResponse.json({ checked: due.length, results });
}
