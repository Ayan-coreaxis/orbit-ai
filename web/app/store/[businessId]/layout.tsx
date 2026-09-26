import { prisma } from "@/lib/prisma";
import { StorePixels } from "@/components/store/StorePixels";

/** Every storefront page (home, product, cart, order, account) gets the seller's Pixel / GA4 tags. */
export default async function StoreBusinessLayout({ children, params }: { children: React.ReactNode; params: Promise<{ businessId: string }> }) {
  const { businessId } = await params;
  const b = await prisma.business.findUnique({ where: { id: businessId }, select: { ga4MeasurementId: true, metaPixelId: true } }).catch(() => null);
  return (
    <>
      {b && <StorePixels ga4={b.ga4MeasurementId} metaPixel={b.metaPixelId} />}
      {children}
    </>
  );
}
