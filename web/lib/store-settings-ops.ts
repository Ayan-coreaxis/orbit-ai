import { prisma } from "@/lib/prisma";
import { createShippingZone, deleteShippingZone, listShippingZones, updateShippingZone } from "@/lib/shipping-zones";
import { money } from "@/lib/money";
import { STORE_CURRENCIES } from "@/lib/currencies";
import { sanitizeStoredProductChanges, type ProductChange } from "@/lib/product-ops";

export { STORE_CURRENCIES };

/**
 * Store settings the Orchestrator may change from the chat. Every change is a PROPOSAL shown with
 * Apply / Dismiss — it touches the live store, so it never applies until the owner presses Apply.
 */

const CURRENCY_CODES = STORE_CURRENCIES.map((c) => c.code);

export type StoreSetting = "currency" | "shipping_fee" | "free_shipping_over" | "tax_rate_percent";
export type ZoneValue = { name: string; cities: string[]; fee: number; freeOver: number | null };
export type StoreChange =
  | { op: "store_setting"; setting: StoreSetting; value: string | number | null }
  | { op: "store_setting"; setting: "shipping_zone"; value: ZoneValue }
  | { op: "store_setting"; setting: "remove_shipping_zone"; value: string };

export const STORE_CHANGES_SCHEMA = {
  type: "array",
  description:
    "Store settings to change. Only when the owner asked for it or agreed. Each one is shown to the owner as a proposal with an Apply button — say \"press Apply\" in your reply, never that it's already done.",
  items: {
    type: "object",
    properties: {
      setting: { type: "string", enum: ["currency", "shipping_fee", "free_shipping_over", "tax_rate_percent", "shipping_zone", "remove_shipping_zone"] },
      value: {
        description: `currency: one of ${CURRENCY_CODES.join(", ")}. shipping_fee / free_shipping_over: amount in the store currency (free_shipping_over null = never free). tax_rate_percent: number, or null for no tax. shipping_zone: {name, cities: string[], fee, freeOver: number|null} — a city-wise delivery rate; a zone with the same name as an existing one is updated, otherwise a new zone is added. remove_shipping_zone: the zone's name.`,
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
    if (setting === "shipping_zone") {
      const z = (value && typeof value === "object" ? value : {}) as { name?: unknown; cities?: unknown; fee?: unknown; freeOver?: unknown };
      const name = typeof z.name === "string" ? z.name.trim().slice(0, 60) : "";
      const cities = Array.isArray(z.cities)
        ? [...new Set(z.cities.filter((c): c is string => typeof c === "string").map((c) => c.trim().slice(0, 60)).filter(Boolean))].slice(0, 60)
        : [];
      const fee = num(z.fee);
      const freeOver = z.freeOver == null || z.freeOver === "" ? null : num(z.freeOver);
      if (!name || !cities.length || fee == null) return [];
      return [{ op: "store_setting", setting, value: { name, cities, fee, freeOver } }];
    }
    if (setting === "remove_shipping_zone") {
      const name = typeof value === "string" ? value.trim().slice(0, 60) : "";
      return name ? [{ op: "store_setting", setting, value: name }] : [];
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
    planOps: all.filter((o) => opOf(o) !== "store_setting" && !String(opOf(o) ?? "").startsWith("product_") && opOf(o) !== "design_request" && opOf(o) !== "publish_store" && opOf(o) !== "studio_job" && opOf(o) !== "social_post" && opOf(o) !== "meta_ad"),
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
  const zones = await listShippingZones(businessId);
  return `
STORE SETTINGS (you CAN propose changes to these with store_changes; the owner presses Apply)
- Currency: ${cur.toUpperCase()} (options: ${CURRENCY_CODES.map((c) => c.toUpperCase()).join(", ")}). Changing it only changes the currency label — product price numbers stay the same, so after switching the owner must make sure prices are entered in the new currency.${b.paymentProvider !== "cod" ? " The store takes Stripe card payments, so the currency must match what their Stripe account settles in — warn them." : ""}
- Delivery fee: ${money(b.shippingFee, cur)}${b.freeShippingOver != null ? `, free over ${money(b.freeShippingOver, cur)}` : ", never free"}${zones.length ? " (used for cities not in a zone below)" : ""}
${!zones.length ? "- No city delivery zones yet — every city pays the fee above. If the owner says Lahore/Karachi etc. should cost differently, propose shipping_zone items.\n" : ""}${zones.length ? `- City delivery zones (propose adds / edits / removals with shipping_zone / remove_shipping_zone; the owner can also edit them in Settings > Delivery): ${zones.map((z) => `${z.name} [${z.cities.slice(0, 12).join(", ")}${z.cities.length > 12 ? "…" : ""}] ${money(z.fee, cur)}${z.freeOver != null ? `, free over ${money(z.freeOver, cur)}` : ""}`).join(" | ")}\n` : ""}- Tax: ${b.taxRatePercent != null ? `${b.taxRatePercent}%` : "not charged"}`;
}

export async function describeStoreChanges(businessId: string, changes: StoreChange[]): Promise<string[]> {
  const b = await current(businessId);
  const cur = b?.storeCurrency || "usd";
  const next = (changes.find((c) => c.setting === "currency")?.value as string | undefined) ?? cur;
  return changes.map((c) => {
    if (c.setting === "shipping_zone") {
      const z = c.value;
      const cities = z.cities.slice(0, 6).join(", ") + (z.cities.length > 6 ? ` +${z.cities.length - 6} more` : "");
      return `Delivery zone "${z.name}" (${cities}): ${money(z.fee, next)}${z.freeOver != null ? `, free over ${money(z.freeOver, next)}` : ""}`;
    }
    if (c.setting === "remove_shipping_zone") return `Remove delivery zone "${c.value}"`;
    if (c.setting === "currency") return `Store currency: ${cur.toUpperCase()} → ${String(c.value).toUpperCase()}`;
    if (c.setting === "shipping_fee") return `Delivery fee → ${money(c.value as number, next)}`;
    if (c.setting === "free_shipping_over") return c.value == null ? "Free delivery: turn off" : `Free delivery over ${money(c.value as number, next)}`;
    return c.value == null ? "Tax: stop charging" : `Tax rate → ${c.value}%`;
  });
}

export async function applyStoreChanges(businessId: string, changes: StoreChange[]): Promise<string[]> {
  if (!changes.length) return [];
  const data: { storeCurrency?: string; shippingFee?: number; freeShippingOver?: number | null; taxRatePercent?: number | null } = {};
  const summary = await describeStoreChanges(businessId, changes);
  const zones = await listShippingZones(businessId);
  let nextPriority = zones.reduce((m, z) => Math.max(m, z.priority + 1), 0);
  const byName = (n: string) => zones.find((z) => z.name.trim().toLowerCase() === n.trim().toLowerCase());
  for (const c of changes) {
    if (c.setting === "shipping_zone") {
      const hit = byName(c.value.name);
      if (hit) await updateShippingZone(businessId, hit.id, { cities: c.value.cities, fee: c.value.fee, freeOver: c.value.freeOver });
      else await createShippingZone(businessId, { ...c.value, priority: nextPriority++ });
      continue;
    }
    if (c.setting === "remove_shipping_zone") {
      const hit = byName(c.value);
      if (hit) await deleteShippingZone(businessId, hit.id);
      else summary[changes.indexOf(c)] = `No delivery zone called "${c.value}" — nothing removed`;
      continue;
    }
    if (c.setting === "currency") data.storeCurrency = c.value as string;
    if (c.setting === "shipping_fee") data.shippingFee = c.value as number;
    if (c.setting === "free_shipping_over") data.freeShippingOver = c.value as number | null;
    if (c.setting === "tax_rate_percent") data.taxRatePercent = c.value as number | null;
  }
  if (Object.keys(data).length) await prisma.business.update({ where: { id: businessId }, data });
  return summary;
}
