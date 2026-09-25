import { prisma } from "@/lib/prisma";
import { money } from "@/lib/money";
import { notifyCustomer, type NotifyTemplate } from "@/lib/notify";

/**
 * Sends one order-lifecycle message to the shopper and records the outcome honestly on the
 * `Order` row. Used by checkout (`order_placed`), the seller Orders tab (`order_confirmed` /
 * `order_shipped`) and the review cron (`review_request`).
 */
export async function notifyOrder(
  orderId: string,
  template: NotifyTemplate,
  origin: string,
): Promise<{ anySent: boolean; error?: string }> {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    select: {
      id: true,
      businessId: true,
      customerName: true,
      customerPhone: true,
      customerEmail: true,
      total: true,
      courierName: true,
      trackingNumber: true,
      trackingUrl: true,
      business: { select: { name: true, storeCurrency: true } },
    },
  });
  if (!order) return { anySent: false, error: "Order not found." };

  const base = origin.replace(/\/$/, "");
  const statusUrl = `${base}/store/${order.businessId}/order/${order.id}`;

  const res = await notifyCustomer(
    { phone: order.customerPhone, email: order.customerEmail },
    template,
    {
      storeName: order.business.name,
      firstName: order.customerName.split(" ")[0] || undefined,
      orderNumber: order.id.slice(-6).toUpperCase(),
      total: money(order.total, order.business.storeCurrency),
      courierName: order.courierName ?? undefined,
      trackingNumber: order.trackingNumber ?? undefined,
      trackingUrl: order.trackingUrl ?? undefined,
      statusUrl,
      reviewUrl: template === "review_request" ? statusUrl : undefined,
    },
  );

  // record the outcome on the columns that match this template
  const now = new Date();
  const data: Record<string, unknown> = {};
  if (template === "order_placed" || template === "order_confirmed") {
    data.confirmationNotifiedAt = res.anySent ? now : null;
    data.confirmationNotifyError = res.anySent ? null : res.error ?? null;
  } else if (template === "order_shipped") {
    data.trackingNotifiedAt = res.anySent ? now : null;
    data.trackingNotifyError = res.anySent ? null : res.error ?? null;
  } else if (template === "review_request") {
    data.reviewRequestedAt = now;
  }
  if (Object.keys(data).length) {
    await prisma.order.update({ where: { id: order.id }, data }).catch(() => {});
  }

  return { anySent: res.anySent, error: res.error };
}

/** Best-effort origin for building absolute links inside API routes. */
export function originFromRequest(req: Request): string {
  try {
    const u = new URL(req.url);
    const host = req.headers.get("x-forwarded-host") || u.host;
    const proto = req.headers.get("x-forwarded-proto") || u.protocol.replace(":", "");
    return `${proto}://${host}`;
  } catch {
    return process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  }
}
