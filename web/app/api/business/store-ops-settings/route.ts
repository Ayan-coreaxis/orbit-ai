import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getActiveBusinessId } from "@/lib/get-active-business-id";

const COURIERS = ["manual", "postex", "leopards", "tcs"];
const WIDGET_MOTIONS = ["none", "standard", "playful", "premium"];
const ACCOUNT_TABS = ["orders", "track", "rewards", "addresses", "profile"];

/** Seller store-operations config: shipping, tax, COD verification, seller alerts, courier. */
export async function PATCH(req: NextRequest) {
  const businessId = await getActiveBusinessId();
  if (!businessId) return NextResponse.json({ error: "No active business." }, { status: 401 });

  const b = (await req.json().catch(() => ({}))) as {
    shippingFee?: number;
    freeShippingOver?: number | null;
    taxRatePercent?: number | null;
    taxLabel?: string;
    taxInclusive?: boolean;
    codVerification?: boolean;
    notifyNewOrders?: boolean;
    courierProvider?: string;
    courierApiKey?: string | null;
    ga4MeasurementId?: string | null;
    metaPixelId?: string | null;
    relatedProductsEnabled?: boolean;
    recentlyViewedEnabled?: boolean;
    widgetMotion?: string;
    widgetCopy?: Record<string, string> | null;
    accountTabs?: string[] | null;
    checkoutCustomFields?: { key: string; label: string; type: string; required: boolean }[] | null;
  };

  const data: Record<string, unknown> = {};
  if (b.shippingFee !== undefined) data.shippingFee = Math.max(0, Number(b.shippingFee) || 0);
  if (b.freeShippingOver !== undefined)
    data.freeShippingOver = b.freeShippingOver == null || b.freeShippingOver === ("" as unknown) ? null : Math.max(0, Number(b.freeShippingOver));
  if (b.taxRatePercent !== undefined)
    data.taxRatePercent = b.taxRatePercent == null || b.taxRatePercent === ("" as unknown) ? null : Math.min(100, Math.max(0, Number(b.taxRatePercent)));
  if (typeof b.taxLabel === "string") data.taxLabel = b.taxLabel.trim().slice(0, 20) || "Tax";
  if (b.taxInclusive !== undefined) data.taxInclusive = !!b.taxInclusive;
  if (b.codVerification !== undefined) data.codVerification = !!b.codVerification;
  if (b.notifyNewOrders !== undefined) data.notifyNewOrders = !!b.notifyNewOrders;
  if (b.courierProvider !== undefined && COURIERS.includes(b.courierProvider)) data.courierProvider = b.courierProvider;
  if (b.courierApiKey !== undefined) data.courierApiKey = b.courierApiKey ? String(b.courierApiKey).trim().slice(0, 300) : null;
  if (b.ga4MeasurementId !== undefined) data.ga4MeasurementId = b.ga4MeasurementId ? String(b.ga4MeasurementId).trim().slice(0, 40) : null;
  if (b.metaPixelId !== undefined) data.metaPixelId = b.metaPixelId ? String(b.metaPixelId).trim().slice(0, 40) : null;
  if (b.relatedProductsEnabled !== undefined) data.relatedProductsEnabled = !!b.relatedProductsEnabled;
  if (b.recentlyViewedEnabled !== undefined) data.recentlyViewedEnabled = !!b.recentlyViewedEnabled;
  if (b.widgetMotion !== undefined && WIDGET_MOTIONS.includes(b.widgetMotion)) data.widgetMotion = b.widgetMotion;
  if (b.widgetCopy !== undefined) {
    if (b.widgetCopy && typeof b.widgetCopy === "object") {
      const cleaned: Record<string, string> = {};
      for (const [k, v] of Object.entries(b.widgetCopy)) {
        if (typeof v === "string" && v.trim()) cleaned[k] = v.trim().slice(0, 300);
      }
      data.widgetCopy = Object.keys(cleaned).length ? JSON.stringify(cleaned) : null;
    } else {
      data.widgetCopy = null;
    }
  }
  if (b.accountTabs !== undefined) {
    if (Array.isArray(b.accountTabs)) {
      const cleaned = b.accountTabs.filter((t) => ACCOUNT_TABS.includes(t));
      data.accountTabs = cleaned.length ? JSON.stringify(cleaned) : null;
    } else {
      data.accountTabs = null;
    }
  }

  if (b.checkoutCustomFields !== undefined) {
    if (Array.isArray(b.checkoutCustomFields)) {
      const cleaned = b.checkoutCustomFields
        .filter((f) => f && typeof f.key === "string" && f.key.trim() && typeof f.label === "string" && f.label.trim())
        .map((f) => ({
          key: f.key.trim().slice(0, 40),
          label: f.label.trim().slice(0, 80),
          type: f.type === "textarea" || f.type === "checkbox" ? f.type : "text",
          required: !!f.required,
        }))
        .slice(0, 10);
      data.checkoutCustomFields = cleaned.length ? JSON.stringify(cleaned) : null;
    } else {
      data.checkoutCustomFields = null;
    }
  }

  await prisma.business.update({ where: { id: businessId }, data });
  return NextResponse.json({ ok: true });
}
