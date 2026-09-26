import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { migrateDoc, renderPageParts, storefrontRuntimeJs, LOGIN_PAGE, type OrbitDesignDoc } from "@/lib/orbit-design";
import { parseSpec } from "@/lib/orbit-backend-spec";
import { getStoreCustomer } from "@/lib/store-auth";
import { getAuthMethods } from "@/lib/store-auth-methods";
import { WidgetSlot } from "@/components/store/WidgetSlot";
import { StoreLogin } from "@/components/store/StoreLogin";
import { StoreWidgets } from "@/components/store/StoreWidgets";
import { CartSync } from "@/components/store/CartSync";
import { StoreCartBar } from "../../../StoreCartBar";
import { parseWidgetCopy } from "@/lib/widget-copy";

export const dynamic = "force-dynamic";

function safeDoc(raw: string | null | undefined, name: string, niche: string): OrbitDesignDoc | null {
  if (!raw) return null;
  try {
    return migrateDoc(JSON.parse(raw), name, niche);
  } catch {
    return null;
  }
}

export default async function LoginPage({ params }: { params: Promise<{ businessId: string }> }) {
  const { businessId } = await params;
  const business = await prisma.business.findUnique({
    where: { id: businessId },
    select: { name: true, niche: true, storeCurrency: true, widgetCopy: true, widgetMotion: true, storeDesign: { select: { doc: true, wired: true, published: true, backend: true } } },
  });
  if (!business?.storeDesign?.published) notFound();

  const doc = safeDoc(business.storeDesign.wired ?? business.storeDesign.doc, business.name, business.niche);
  if (!doc) notFound();

  const spec = parseSpec(business.storeDesign.backend);
  const [customer, methods] = await Promise.all([getStoreCustomer(businessId), getAuthMethods(businessId)]);
  const authMode = !methods.enabled ? "none" : methods.otp && methods.password ? "both" : methods.otp ? "otp" : "password";

  const { fontHref, css, bodyHtml, widgets } = renderPageParts(doc, {
    products: [],
    businessId,
    pageSlug: LOGIN_PAGE,
    currency: business.storeCurrency,
    spec,
    loggedIn: !!customer,
  });

  return (
    <>
      {fontHref && <link rel="stylesheet" href={fontHref} />}
      <style dangerouslySetInnerHTML={{ __html: css }} />
      <div suppressHydrationWarning dangerouslySetInnerHTML={{ __html: bodyHtml }} />
      <WidgetSlot kind="auth">
        <StoreLogin businessId={businessId} authMode={authMode} alreadyIn={!!customer} />
      </WidgetSlot>
      <StoreWidgets
        widgets={widgets}
        businessId={businessId}
        storeName={doc.storeName}
        currency={business.storeCurrency}
        spec={spec}
        widgetCopy={parseWidgetCopy(business.widgetCopy)}
        widgetMotion={business.widgetMotion}
      />
      <script dangerouslySetInnerHTML={{ __html: storefrontRuntimeJs(businessId, []) }} />
      <CartSync businessId={businessId} />
      <StoreCartBar businessId={businessId} storeName={doc.storeName} accent={doc.tokens.accent} accentText={doc.tokens.accentText} currency={business.storeCurrency} tokens={doc.tokens} />
    </>
  );
}
