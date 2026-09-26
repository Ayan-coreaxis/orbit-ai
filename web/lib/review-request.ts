import { prisma } from "@/lib/prisma";
import { sendWhatsAppMessage } from "@/lib/whatsapp";

/**
 * Real review request — sent once, when a seller marks a real order fulfilled. Honest either
 * way: records whether the real WhatsApp send actually succeeded, never claims it sent if it didn't.
 */
export async function requestReviewForOrder(orderId: string): Promise<void> {
  const order = await prisma.order.findUnique({ where: { id: orderId }, include: { business: true } });
  if (!order) return;

  const existing = await prisma.review.findFirst({ where: { orderId } });
  if (existing) return; // already requested for this real order — never send twice

  let productNames = "your order";
  try {
    const items = JSON.parse(order.items) as { name: string }[];
    productNames = items.map((i) => i.name).join(", ") || productNames;
  } catch {
    // keep the fallback rather than guess
  }

  const review = await prisma.review.create({
    data: {
      businessId: order.businessId,
      orderId: order.id,
      customerPhone: order.customerPhone,
      productNames,
    },
  });

  const link = `${process.env.NEXT_PUBLIC_APP_URL ?? ""}/review/${review.id}`;
  const message = `Hi ${order.customerName}! Your order from ${order.business.name} (${productNames}) has been delivered. We'd really appreciate a quick review: ${link}`;

  const result = await sendWhatsAppMessage(order.customerPhone, message, { from: order.business.whatsappInboundNumber ?? undefined });
  if (!result.sent) {
    await prisma.review.update({ where: { id: review.id }, data: { notifyError: result.error ?? "Unknown error" } });
  }
}
