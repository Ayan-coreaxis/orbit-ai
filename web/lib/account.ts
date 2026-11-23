import { prisma } from "@/lib/prisma";

/** Never put credentials in an export file. */
const SECRET = /(key|token|secret|password|salt|hash|sid)$/i;
function scrub<T extends Record<string, unknown>>(row: T): Record<string, unknown> {
  return Object.fromEntries(Object.entries(row).filter(([k]) => !SECRET.test(k)));
}

/** Everything the owner's stores hold, as plain JSON — their data, theirs to take. */
export async function exportAccount(userId: string) {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { id: true, email: true, createdAt: true } });
  if (!user) return null;
  const businesses = await prisma.business.findMany({ where: { ownerId: userId } });
  const stores = [];
  for (const b of businesses) {
    const id = b.id;
    const [products, categories, orders, customers, coupons, reviews, design, pages, subscribers, messages] = await Promise.all([
      prisma.product.findMany({ where: { businessId: id }, include: { variants: true } }),
      prisma.category.findMany({ where: { businessId: id } }),
      prisma.order.findMany({ where: { businessId: id } }),
      prisma.storeCustomer.findMany({ where: { businessId: id } }),
      prisma.coupon.findMany({ where: { businessId: id } }),
      prisma.review.findMany({ where: { businessId: id } }),
      prisma.storeDesign.findUnique({ where: { businessId: id }, select: { doc: true, published: true } }),
      prisma.page.findMany({ where: { businessId: id } }),
      prisma.newsletterSubscriber.findMany({ where: { businessId: id } }),
      prisma.chatMessage.findMany({ where: { businessId: id }, orderBy: { createdAt: "asc" }, take: 20000 }),
    ]);
    stores.push({
      business: scrub(b as unknown as Record<string, unknown>),
      products,
      categories,
      orders,
      customers: customers.map((c) => scrub(c as unknown as Record<string, unknown>)),
      coupons,
      reviews,
      storeDesign: design ? { published: design.published, doc: design.doc ? JSON.parse(design.doc) : null } : null,
      pages,
      newsletterSubscribers: subscribers,
      customerMessages: messages,
    });
  }
  return { exportedAt: new Date().toISOString(), account: user, stores };
}

/**
 * Permanently delete the owner's account: every store they own (and, through the database's
 * cascades, all of its products, orders, customers, messages and files' records), then the user.
 * Team memberships in other people's stores are removed with the user.
 */
export async function deleteAccount(userId: string): Promise<{ stores: number }> {
  const owned = await prisma.business.findMany({ where: { ownerId: userId }, select: { id: true } });
  await prisma.$transaction(async (tx) => {
    for (const b of owned) await tx.business.delete({ where: { id: b.id } });
    await tx.user.delete({ where: { id: userId } });
  });
  return { stores: owned.length };
}
