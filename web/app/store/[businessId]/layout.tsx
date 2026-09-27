import type { Metadata } from "next";
import { prisma } from "@/lib/prisma";

/** Shoppers see the store's own name in the tab ("Cart · Zaiqa Snacks"), never the platform's. */
export async function generateMetadata({ params }: { params: Promise<{ businessId: string }> }): Promise<Metadata> {
  const { businessId } = await params;
  const b = await prisma.business.findUnique({ where: { id: businessId }, select: { name: true } }).catch(() => null);
  const name = b?.name ?? "Store";
  return { title: { default: name, template: `%s · ${name}` } };
}
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
