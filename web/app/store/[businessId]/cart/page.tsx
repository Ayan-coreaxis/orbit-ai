import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { migrateDoc, renderPageParts, storefrontRuntimeJs, CART_PAGE, type OrbitDesignDoc } from "@/lib/orbit-design";
import { parseSpec } from "@/lib/orbit-backend-spec";
import { getStoreCustomer } from "@/lib/store-auth";
import { WidgetSlot } from "@/components/store/WidgetSlot";
import { CartWidget } from "@/components/store/CartWidget";
import { StoreWidgets } from "@/components/store/StoreWidgets";
import { CartSync } from "@/components/store/CartSync";
import { StoreCartBar } from "../../StoreCartBar";
import { parseWidgetCopy } from "@/lib/widget-copy";
import { parseCheckoutCustomFields } from "@/lib/checkout-fields";

export const dynamic = "force-dynamic";

function safeDoc(raw: string | null | undefined, name: string, niche: string): OrbitDesignDoc | null {
  if (!raw) return null;
  try {
    return migrateDoc(JSON.parse(raw), name, niche);
  } catch {
    return null;
  }
}

export default async function CartPage({ params }: { params: Promise<{ businessId: string }> }) {
  const { businessId } = await params;
  const business = await prisma.business.findUnique({
    where: { id: businessId },
    select: {
      name: true,
      niche: true,
      storeCurrency: true,
      widgetCopy: true,
      widgetMotion: true,
      checkoutCustomFields: true,
      storeDesign: { select: { doc: true, wired: true, published: true, backend: true } },
    },
  });
  if (!business?.storeDesign?.published) notFound();

  const doc = safeDoc(business.storeDesign.wired ?? business.storeDesign.doc, business.name, business.niche);
  if (!doc) notFound();

  const spec = parseSpec(business.storeDesign.backend);
  const loggedIn = !!(await getStoreCustomer(businessId));
  const { fontHref, css, bodyHtml, widgets } = renderPageParts(doc, {
    products: [],
    businessId,
    pageSlug: CART_PAGE,
    currency: business.storeCurrency,
    spec,
    loggedIn,
  });

  const widgetCopy = parseWidgetCopy(business.widgetCopy);

  return (
    <>
      {fontHref && <link rel="stylesheet" href={fontHref} />}
      <style dangerouslySetInnerHTML={{ __html: css }} />
      <div suppressHydrationWarning dangerouslySetInnerHTML={{ __html: bodyHtml }} />
      <WidgetSlot kind="cart">
        <CartWidget
          businessId={businessId}
          storeName={doc.storeName}
          currency={business.storeCurrency}
          widgetCopy={widgetCopy}
          widgetMotion={business.widgetMotion}
          checkoutCustomFields={parseCheckoutCustomFields(business.checkoutCustomFields)}
        />
      </WidgetSlot>
      <StoreWidgets
        widgets={widgets}
        businessId={businessId}
        storeName={doc.storeName}
        currency={business.storeCurrency}
        spec={spec}
        widgetCopy={widgetCopy}
        widgetMotion={business.widgetMotion}
      />
      <script dangerouslySetInnerHTML={{ __html: storefrontRuntimeJs(businessId, []) }} />
      <CartSync businessId={businessId} />
      <StoreCartBar businessId={businessId} accent={doc.tokens.accent} accentText={doc.tokens.accentText} currency={business.storeCurrency} tokens={doc.tokens} />
    </>
  );
}
