import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { prisma } from "@/lib/prisma";
import { migrateDoc, renderPageParts, storefrontRuntimeJs, PRODUCT_PAGE, type OrbitDesignDoc } from "@/lib/orbit-design";
import { parseSpec } from "@/lib/orbit-backend-spec";
import { getStoreCustomer } from "@/lib/store-auth";
import { sanitizeHtml } from "@/lib/sanitize-html";
import { parseOptionTypes, hasVariants } from "@/lib/variants";
import { WidgetSlot } from "@/components/store/WidgetSlot";
import { ProductWidget, type ProductWidgetData } from "@/components/store/ProductWidget";
import { StoreWidgets } from "@/components/store/StoreWidgets";
import { StoreAnalyticsBeacon } from "@/components/store/StoreAnalyticsBeacon";
import { RelatedProducts } from "@/components/store/RelatedProducts";
import { getRelatedProducts } from "@/lib/personalization";
import { ProductReviews } from "@/components/store/ProductReviews";
import { getProductReviews } from "@/lib/product-reviews";
import { RecentlyViewed } from "@/components/store/RecentlyViewed";
import { PreFooterSlot } from "@/components/store/PreFooterSlot";
import { CartSync } from "@/components/store/CartSync";
import { parseWidgetCopy } from "@/lib/widget-copy";
import { StoreCartBar } from "../../../StoreCartBar";

export const dynamic = "force-dynamic";

function safeDoc(raw: string | null | undefined, name: string, niche: string): OrbitDesignDoc | null {
  if (!raw) return null;
  try {
    return migrateDoc(JSON.parse(raw), name, niche);
  } catch {
    return null;
  }
}

export async function generateMetadata({ params }: { params: Promise<{ productId: string }> }): Promise<Metadata> {
  const { productId } = await params;
  const p = await prisma.product.findUnique({
    where: { id: productId },
    select: { name: true, seoTitle: true, seoDescription: true, imageUrl: true, description: true },
  });
  if (!p) return { title: "Product" };
  const title = p.seoTitle ?? p.name;
  const description = p.seoDescription ?? p.description?.replace(/<[^>]+>/g, " ").slice(0, 200) ?? undefined;
  return {
    title,
    description,
    openGraph: {
      title,
      description,
      type: "website",
      images: p.imageUrl ? [p.imageUrl] : undefined,
    },
    twitter: { card: p.imageUrl ? "summary_large_image" : "summary", title, description },
  };
}

export default async function ProductPage({ params }: { params: Promise<{ businessId: string; productId: string }> }) {
  const { businessId, productId } = await params;
  const product = await prisma.product.findUnique({
    where: { id: productId },
    include: { variants: { orderBy: { createdAt: "asc" } } },
  });
  if (!product || product.businessId !== businessId) notFound();

  const business = await prisma.business.findUnique({
    where: { id: businessId },
    select: {
      name: true,
      niche: true,
      storeCurrency: true,
      relatedProductsEnabled: true,
      recentlyViewedEnabled: true,
      widgetCopy: true,
      widgetMotion: true,
      storeDesign: { select: { doc: true, wired: true, published: true, backend: true } },
    },
  });
  if (!business?.storeDesign?.published) notFound();
  const spec = parseSpec(business.storeDesign.backend);

  const doc = safeDoc(business.storeDesign.wired ?? business.storeDesign.doc, business.name, business.niche);
  if (!doc) notFound();

  const gallery: string[] = (() => {
    try {
      return product.galleryUrls ? (JSON.parse(product.galleryUrls) as string[]) : [];
    } catch {
      return [];
    }
  })();

  const optionTypes = parseOptionTypes(product.optionTypes);
  const widgetData: ProductWidgetData = {
    id: product.id,
    name: product.name,
    price: product.price,
    stock: product.stock,
    imageUrl: product.imageUrl,
    images: [product.imageUrl, ...gallery].filter(Boolean) as string[],
    descriptionHtml: product.description ? sanitizeHtml(product.description) : null,
    optionTypes,
    variants: hasVariants(optionTypes)
      ? product.variants.map((v) => ({
          id: v.id,
          label: v.label,
          options: (() => {
            try {
              return JSON.parse(v.options) as Record<string, string>;
            } catch {
              return {};
            }
          })(),
          price: v.price,
          stock: v.stock,
          imageUrl: v.imageUrl,
        }))
      : [],
  };

  const loggedIn = !!(await getStoreCustomer(businessId));
  const { fontHref, css, bodyHtml, widgets } = renderPageParts(doc, {
    products: [],
    businessId,
    pageSlug: PRODUCT_PAGE,
    currency: business.storeCurrency,
    spec,
    loggedIn,
  });

  const [related, reviews] = await Promise.all([
    business.relatedProductsEnabled ? getRelatedProducts(businessId, product.id) : Promise.resolve([]),
    getProductReviews(businessId, product.id),
  ]);

  return (
    <>
      {fontHref && <link rel="stylesheet" href={fontHref} />}
      <style dangerouslySetInnerHTML={{ __html: css }} />
      <div suppressHydrationWarning dangerouslySetInnerHTML={{ __html: bodyHtml }} />
      <StoreAnalyticsBeacon businessId={businessId} type="view_product" productId={product.id} />
      <WidgetSlot kind="product">
        <ProductWidget
          businessId={businessId}
          product={widgetData}
          currency={business.storeCurrency}
          rating={reviews.count ? { average: reviews.average, count: reviews.count } : undefined}
          widgetCopy={parseWidgetCopy(business.widgetCopy)}
          widgetMotion={business.widgetMotion}
        />
      </WidgetSlot>
      <PreFooterSlot>
        <ProductReviews summary={reviews} />
        {business.relatedProductsEnabled && related.length > 0 && (
          <RelatedProducts businessId={businessId} items={related} currency={business.storeCurrency} />
        )}
        {business.recentlyViewedEnabled && (
          <RecentlyViewed
            businessId={businessId}
            currency={business.storeCurrency}
            current={{ id: product.id, name: product.name, price: product.price, imageUrl: product.imageUrl }}
          />
        )}
      </PreFooterSlot>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "Product",
            name: product.name,
            image: widgetData.images,
            description: product.seoDescription || product.description?.replace(/<[^>]+>/g, " ").slice(0, 300),
            offers: {
              "@type": "Offer",
              price: (hasVariants(optionTypes) ? Math.min(...product.variants.map((v) => v.price ?? product.price)) : product.price).toFixed(2),
              priceCurrency: (business.storeCurrency || "USD").toUpperCase(),
              availability:
                (hasVariants(optionTypes) ? product.variants.some((v) => v.stock > 0) : product.stock > 0)
                  ? "https://schema.org/InStock"
                  : "https://schema.org/OutOfStock",
            },
            ...(reviews.count > 0
              ? { aggregateRating: { "@type": "AggregateRating", ratingValue: reviews.average, reviewCount: reviews.count } }
              : {}),
          }),
        }}
      />
      <StoreWidgets
        widgets={widgets}
        businessId={businessId}
        storeName={doc.storeName}
        currency={business.storeCurrency}
        spec={spec}
        productId={product.id}
        widgetCopy={parseWidgetCopy(business.widgetCopy)}
        widgetMotion={business.widgetMotion}
      />
      <script dangerouslySetInnerHTML={{ __html: storefrontRuntimeJs(businessId, []) }} />
      <CartSync businessId={businessId} />
      <StoreCartBar businessId={businessId} accent={doc.tokens.accent} accentText={doc.tokens.accentText} currency={business.storeCurrency} tokens={doc.tokens} />
    </>
  );
}
