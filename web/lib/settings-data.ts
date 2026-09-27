import { cache } from "react";
import { prisma } from "@/lib/prisma";
import { getActiveBusinessId } from "@/lib/get-active-business-id";
import { parseWidgetCopy } from "@/lib/widget-copy";
import { parseCheckoutCustomFields } from "@/lib/checkout-fields";

/** Everything the seller's Settings pages read, loaded once per request. */
export const getSettingsBusiness = cache(async () => {
  const businessId = await getActiveBusinessId();
  if (!businessId) return null;
  const b = await prisma.business.findUnique({
    where: { id: businessId },
    select: {
      id: true,
      name: true,
      plan: true,
      whatsapp: true,
      whatsappInboundNumber: true,
      metaPageId: true,
      metaPageName: true,
      metaInstagramUserId: true,
      metaAdAccountId: true,
      metaConnectedAt: true,
      paymentProvider: true,
      stripeSecretKey: true,
      stripePublishableKey: true,
      storeCurrency: true,
      shippingFee: true,
      freeShippingOver: true,
      taxRatePercent: true,
      taxLabel: true,
      taxInclusive: true,
      codVerification: true,
      notifyNewOrders: true,
      courierProvider: true,
      ga4MeasurementId: true,
      metaPixelId: true,
      metaCapiToken: true,
      metaCapiNote: true,
      relatedProductsEnabled: true,
      recentlyViewedEnabled: true,
      chatWidgetEnabled: true,
      widgetMotion: true,
      widgetCopy: true,
      accountTabs: true,
      checkoutCustomFields: true,
      subscriptionStatus: true,
      stripeCustomerId: true,
      customDomain: true,
      customDomainStatus: true,
      _count: { select: { members: true, shippingZones: true, mcpConnections: true, skills: true, pluginInstalls: true } },
    },
  });
  if (!b) return null;
  return { businessId, ...b };
});

export type SettingsBusiness = NonNullable<Awaited<ReturnType<typeof getSettingsBusiness>>>;

export function opsInitial(b: SettingsBusiness) {
  return {
    shippingFee: b.shippingFee ?? 0,
    freeShippingOver: b.freeShippingOver ?? null,
    taxRatePercent: b.taxRatePercent ?? null,
    taxLabel: b.taxLabel ?? "Tax",
    taxInclusive: b.taxInclusive ?? false,
    codVerification: b.codVerification ?? false,
    notifyNewOrders: b.notifyNewOrders ?? true,
    ga4MeasurementId: b.ga4MeasurementId ?? null,
    metaPixelId: b.metaPixelId ?? null,
    metaCapiTokenSet: !!b.metaCapiToken,
    metaCapiNote: b.metaCapiNote ?? null,
    relatedProductsEnabled: b.relatedProductsEnabled ?? true,
    recentlyViewedEnabled: b.recentlyViewedEnabled ?? true,
    chatWidgetEnabled: b.chatWidgetEnabled ?? true,
    currency: b.storeCurrency ?? "usd",
  };
}

export function widgetInitial(b: SettingsBusiness) {
  let accountTabs: string[] | undefined;
  try {
    accountTabs = b.accountTabs ? (JSON.parse(b.accountTabs) as string[]) : undefined;
  } catch {
    accountTabs = undefined;
  }
  return {
    widgetMotion: b.widgetMotion ?? "standard",
    widgetCopy: parseWidgetCopy(b.widgetCopy),
    accountTabs,
    checkoutCustomFields: parseCheckoutCustomFields(b.checkoutCustomFields),
  };
}
