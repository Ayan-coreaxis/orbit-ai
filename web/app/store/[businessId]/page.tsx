import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { migrateDoc, renderPageParts, storefrontRuntimeJs, type OrbitDesignDoc, type StorefrontProduct } from "@/lib/orbit-design";
import { parseSpec } from "@/lib/orbit-backend-spec";
import { getStoreCustomer } from "@/lib/store-auth";
import { toStorefrontProducts } from "@/lib/storefront-products";
import { parseWidgetCopy } from "@/lib/widget-copy";
import { StoreWidgets } from "@/components/store/StoreWidgets";
import { StoreAnalyticsBeacon } from "@/components/store/StoreAnalyticsBeacon";
import { CartSync } from "@/components/store/CartSync";
import { StoreCartBar } from "../StoreCartBar";

export const dynamic = "force-dynamic";

async function load(businessId: string) {
  const business = await prisma.business.findUnique({
    where: { id: businessId },
    select: { id: true, name: true, niche: true, storeCurrency: true, ga4MeasurementId: true, metaPixelId: true, widgetCopy: true, widgetMotion: true, storeDesign: { select: { doc: true, wired: true, published: true, backend: true } } },
  });
  if (!business) return null;
  const products = await prisma.product.findMany({
    where: { businessId },
    orderBy: { createdAt: "desc" },
    include: { variants: true, category: { select: { name: true } } },
  });
  return { business, products };
}

function safeDoc(raw: string | null | undefined, name: string, niche: string): OrbitDesignDoc | null {
  if (!raw) return null;
  try {
    return migrateDoc(JSON.parse(raw), name, niche);
  } catch {
    return null;
  }
}

export async function generateMetadata({ params }: { params: Promise<{ businessId: string }> }): Promise<Metadata> {
  const { businessId } = await params;
  const data = await load(businessId);
  if (!data?.business.storeDesign?.published) return { title: "Store" };
  const doc = safeDoc(data.business.storeDesign.doc, data.business.name, data.business.niche);
  return { title: doc?.storeName ?? data.business.name, description: doc?.tagline ?? data.business.niche };
}

export default async function StorefrontPage({ params }: { params: Promise<{ businessId: string }> }) {
  const { businessId } = await params;
  const data = await load(businessId);
  if (!data) notFound();

  const { business, products } = data;
  const design = business.storeDesign;

  if (!design?.published || !design.doc) {
    return (
      <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center px-6 text-center">
        <h1 className="text-lg font-semibold text-black">This store isn&apos;t live yet</h1>
        <p className="mt-2 text-sm text-neutral-500">The owner is still setting things up. Check back soon.</p>
      </main>
    );
  }

  const doc = safeDoc(design.wired ?? design.doc, business.name, business.niche);
  if (!doc) notFound();

  const sfProducts: StorefrontProduct[] = toStorefrontProducts(products);

  const spec = parseSpec(design.backend);
  const loggedIn = !!(await getStoreCustomer(businessId));
  const { fontHref, css, bodyHtml, widgets } = renderPageParts(doc, { products: sfProducts, businessId, pageSlug: "home", currency: business.storeCurrency, spec, loggedIn });

  return (
    <>
      {fontHref && <link rel="stylesheet" href={fontHref} />}
      <style dangerouslySetInnerHTML={{ __html: css }} />
      <div suppressHydrationWarning dangerouslySetInnerHTML={{ __html: bodyHtml }} />
      <StoreAnalyticsBeacon businessId={businessId} type="view_store" />
      <StoreWidgets
        widgets={widgets}
        businessId={businessId}
        storeName={doc.storeName}
        currency={business.storeCurrency}
        spec={spec}
        widgetCopy={parseWidgetCopy(business.widgetCopy)}
        widgetMotion={business.widgetMotion}
      />
      <script dangerouslySetInnerHTML={{ __html: storefrontRuntimeJs(businessId, sfProducts) }} />
      <CartSync businessId={businessId} />
      <StoreCartBar businessId={businessId} accent={doc.tokens.accent} accentText={doc.tokens.accentText} currency={business.storeCurrency} tokens={doc.tokens} />
    </>
  );
}
