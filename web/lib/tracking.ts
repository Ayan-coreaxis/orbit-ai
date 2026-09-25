import { prisma } from "@/lib/prisma";
import { sendWhatsAppMessage } from "@/lib/whatsapp";

/**
 * Real dispatch notification — sent once, right after a seller marks a real order shipped with
 * real courier/tracking info they actually typed in. Honest either way: records whether the real
 * WhatsApp send actually succeeded, never claims it sent if it didn't.
 */
export async function sendTrackingNotification(orderId: string): Promise<void> {
  const order = await prisma.order.findUnique({ where: { id: orderId }, include: { business: true } });
  if (!order || !order.trackingNumber) return;

  const trackLink = `${process.env.NEXT_PUBLIC_APP_URL ?? ""}/order/${order.id}`;
  const courierLine = order.trackingUrl
    ? `Track it directly with ${order.courierName ?? "the courier"}: ${order.trackingUrl}`
    : `Courier: ${order.courierName ?? "your courier"}, tracking number: ${order.trackingNumber}`;

  const message = `Hi ${order.customerName}! Your order from ${order.business.name} is on its way. ${courierLine}. Order details: ${trackLink}`;

  const result = await sendWhatsAppMessage(order.customerPhone, message);
  await prisma.order.update({
    where: { id: order.id },
    data: result.sent
      ? { trackingNotifiedAt: new Date(), trackingNotifyError: null }
      : { trackingNotifyError: result.error ?? "Unknown error" },
  });
}
