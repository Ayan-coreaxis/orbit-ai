import { prisma } from "@/lib/prisma";
import { notifyCustomer } from "@/lib/notify";

/**
 * "Notify me when back in stock." Shoppers leave an email on a sold-out product/variant; when
 * the seller restocks it (product edit / variant grid save), everyone waiting gets one email.
 */
export async function fireBackInStock(
  businessId: string,
  productId: string,
  origin: string,
  variantId?: string | null,
): Promise<number> {
  const pending = await prisma.stockNotification.findMany({
    where: { businessId, productId, notifiedAt: null, ...(variantId ? { variantId } : {}) },
    take: 500,
  });
  if (!pending.length) return 0;

  const product = await prisma.product.findUnique({
    where: { id: productId },
    select: { name: true, business: { select: { name: true } } },
  });
  if (!product) return 0;

  const url = `${origin.replace(/\/$/, "")}/store/${businessId}/product/${productId}`;
  for (const n of pending) {
    await notifyCustomer({ email: n.email }, "back_in_stock", {
      storeName: product.business.name,
      orderNumber: "",
      productName: product.name,
      productUrl: url,
    }).catch(() => {});
  }
  await prisma.stockNotification.updateMany({
    where: { id: { in: pending.map((n) => n.id) } },
    data: { notifiedAt: new Date() },
  });
  return pending.length;
}
