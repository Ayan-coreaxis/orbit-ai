import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { migrateDoc, renderPageParts, resolvePage, storefrontRuntimeJs, type OrbitDesignDoc, type StorefrontProduct } from "@/lib/orbit-design";
import { parseSpec } from "@/lib/orbit-backend-spec";
import { getStoreCustomer } from "@/lib/store-auth";
import { CartSync } from "@/components/store/CartSync";
import { StoreCartBar } from "../../../StoreCartBar";
import { StoreWidgets } from "@/components/store/StoreWidgets";
import { StoreAnalyticsBeacon } from "@/components/store/StoreAnalyticsBeacon";
import { toStorefrontProducts } from "@/lib/storefront-products";
import { parseWidgetCopy } from "@/lib/widget-copy";

export const dynamic = "force-dynamic";

async function load(businessId: string) {
  const business = await prisma.business.findUnique({
    where: { id: businessId },
    select: {
      id: true, name: true, niche: true, storeCurrency: true, ga4MeasurementId: true, metaPixelId: true,
      widgetCopy: true, widgetMotion: true,
      storeDesign: { select: { doc: true, wired: true, published: true, backend: true } },
    },
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

export async function generateMetadata({ params }: { params: Promise<{ businessId: string; slug: string }> }): Promise<Metadata> {
  const { businessId, slug } = await params;
  const data = await load(businessId);
  if (!data?.business.storeDesign?.published) return { title: "Store" };
  const doc = safeDoc(data.business.storeDesign.doc, data.business.name, data.business.niche);
  const page = doc ? resolvePage(doc, slug) : null;
  return { title: page ? `${doc!.storeName} — ${page.title}` : data.business.name };
}

export default async function StorefrontSubPage({ params }: { params: Promise<{ businessId: string; slug: string }> }) {
  const { businessId, slug } = await params;
  const data = await load(businessId);
  if (!data) notFound();

  const design = data.business.storeDesign;
  if (!design?.published || !design.doc) notFound();

  const doc = safeDoc(design.wired ?? design.doc, data.business.name, data.business.niche);
  if (!doc) notFound();
  if (!doc.pages.some((p) => p.slug === slug)) notFound();

  const spec = parseSpec(design.backend);
  const sfProducts: StorefrontProduct[] = toStorefrontProducts(data.products);
  const loggedIn = !!(await getStoreCustomer(businessId));

  const { fontHref, css, bodyHtml, widgets } = renderPageParts(doc, {
    products: sfProducts,
    businessId,
    pageSlug: slug,
    currency: data.business.storeCurrency,
    spec,
    loggedIn,
  });

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
        currency={data.business.storeCurrency}
        spec={spec}
        widgetCopy={parseWidgetCopy(data.business.widgetCopy)}
        widgetMotion={data.business.widgetMotion}
      />
      <script dangerouslySetInnerHTML={{ __html: storefrontRuntimeJs(businessId, sfProducts) }} />
      <CartSync businessId={businessId} />
      <StoreCartBar businessId={businessId} accent={doc.tokens.accent} accentText={doc.tokens.accentText} currency={data.business.storeCurrency} tokens={doc.tokens} />
    </>
  );
}
