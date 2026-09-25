import { prisma } from "@/lib/prisma";
import { money } from "@/lib/money";
import { STORE_CURRENCIES } from "@/lib/currencies";
import { productsContext, sanitizeStoredProductChanges, type ProductChange } from "@/lib/product-ops";

export { STORE_CURRENCIES };

/**
 * Store settings the Orchestrator may change from the chat. Every change is a PROPOSAL shown with
 * Apply / Dismiss — it touches the live store, so it never applies until the owner presses Apply.
 */

const CURRENCY_CODES = STORE_CURRENCIES.map((c) => c.code);

export type StoreSetting = "currency" | "shipping_fee" | "free_shipping_over" | "tax_rate_percent";
export type StoreChange = { op: "store_setting"; setting: StoreSetting; value: string | number | null };

export const STORE_CHANGES_SCHEMA = {
  type: "array",
  description:
    "Store settings to change. Only when the owner asked for it or agreed. Each one is shown to the owner as a proposal with an Apply button — say \"press Apply\" in your reply, never that it's already done.",
  items: {
    type: "object",
    properties: {
      setting: { type: "string", enum: ["currency", "shipping_fee", "free_shipping_over", "tax_rate_percent"] },
      value: {
        description: `currency: one of ${CURRENCY_CODES.join(", ")}. shipping_fee / free_shipping_over: amount in the store currency (free_shipping_over null = never free). tax_rate_percent: number, or null for no tax.`,
      },
    },
    required: ["setting", "value"],
  },
} as const;

const num = (v: unknown): number | null => {
  const n = typeof v === "number" ? v : typeof v === "string" && v.trim() ? Number(v.replace(/[^\d.]/g, "")) : NaN;
  return Number.isFinite(n) && n >= 0 ? n : null;
};

export function sanitizeStoreChanges(raw: unknown): StoreChange[] {
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((o): StoreChange[] => {
    if (!o || typeof o !== "object") return [];
    const { setting, value } = o as { setting?: string; value?: unknown };
    if (setting === "currency") {
      const code = typeof value === "string" ? value.trim().toLowerCase() : "";
      return CURRENCY_CODES.includes(code) ? [{ op: "store_setting", setting, value: code }] : [];
    }
    if (setting === "shipping_fee") {
      const n = num(value);
      return n != null ? [{ op: "store_setting", setting, value: n }] : [];
    }
    if (setting === "free_shipping_over" || setting === "tax_rate_percent") {
      if (value === null || value === "" || value === "none") return [{ op: "store_setting", setting, value: null }];
      const n = num(value);
      if (n == null || (setting === "tax_rate_percent" && n > 50)) return [];
      return [{ op: "store_setting", setting, value: n }];
    }
    return [];
  });
}

/** Pending ops on a message are one JSON array; store changes are the items tagged store_setting. */
export function splitPendingOps(raw: string | null | undefined): { planOps: unknown[]; storeChanges: StoreChange[]; productChanges: ProductChange[] } {
  let all: unknown[] = [];
  try {
    const v = JSON.parse(raw ?? "[]");
    all = Array.isArray(v) ? v : [];
  } catch {
    all = [];
  }
  const opOf = (o: unknown) => (o && typeof o === "object" ? (o as { op?: string }).op : undefined);
  return {
    planOps: all.filter((o) => opOf(o) !== "store_setting" && !String(opOf(o) ?? "").startsWith("product_") && opOf(o) !== "design_request" && opOf(o) !== "publish_store"),
    storeChanges: sanitizeStoreChanges(all.filter((o) => opOf(o) === "store_setting")),
    productChanges: sanitizeStoredProductChanges(all),
  };
}

async function current(businessId: string) {
  return prisma.business.findUnique({
    where: { id: businessId },
    select: { storeCurrency: true, shippingFee: true, freeShippingOver: true, taxRatePercent: true, paymentProvider: true },
  });
}

/** What the Orchestrator needs to know about the store's settings (for its system prompt). */
export async function storeSettingsContext(businessId: string): Promise<string> {
  const b = await current(businessId);
  if (!b) return "";
  const cur = b.storeCurrency || "usd";
  return `
STORE SETTINGS (you CAN propose changes to these with store_changes; the owner presses Apply)
- Currency: ${cur.toUpperCase()} (options: ${CURRENCY_CODES.map((c) => c.toUpperCase()).join(", ")}). Changing it only changes the currency label — product price numbers stay the same, so after switching the owner must make sure prices are entered in the new currency.${b.paymentProvider !== "cod" ? " The store takes Stripe card payments, so the currency must match what their Stripe account settles in — warn them." : ""}
- Delivery fee: ${money(b.shippingFee, cur)}${b.freeShippingOver != null ? `, free over ${money(b.freeShippingOver, cur)}` : ", never free"}
- Tax: ${b.taxRatePercent != null ? `${b.taxRatePercent}%` : "not charged"}
${await productsContext(businessId, cur)}`;
}

export async function describeStoreChanges(businessId: string, changes: StoreChange[]): Promise<string[]> {
  const b = await current(businessId);
  const cur = b?.storeCurrency || "usd";
  const next = (changes.find((c) => c.setting === "currency")?.value as string | undefined) ?? cur;
  return changes.map((c) => {
    if (c.setting === "currency") return `Store currency: ${cur.toUpperCase()} → ${String(c.value).toUpperCase()}`;
    if (c.setting === "shipping_fee") return `Delivery fee → ${money(c.value as number, next)}`;
    if (c.setting === "free_shipping_over") return c.value == null ? "Free delivery: turn off" : `Free delivery over ${money(c.value as number, next)}`;
    return c.value == null ? "Tax: stop charging" : `Tax rate → ${c.value}%`;
  });
}

export async function applyStoreChanges(businessId: string, changes: StoreChange[]): Promise<string[]> {
  if (!changes.length) return [];
  const data: { storeCurrency?: string; shippingFee?: number; freeShippingOver?: number | null; taxRatePercent?: number | null } = {};
  for (const c of changes) {
    if (c.setting === "currency") data.storeCurrency = c.value as string;
    if (c.setting === "shipping_fee") data.shippingFee = c.value as number;
    if (c.setting === "free_shipping_over") data.freeShippingOver = c.value as number | null;
    if (c.setting === "tax_rate_percent") data.taxRatePercent = c.value as number | null;
  }
  const summary = await describeStoreChanges(businessId, changes);
  await prisma.business.update({ where: { id: businessId }, data });
  return summary;
}
