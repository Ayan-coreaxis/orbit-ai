import { prisma } from "@/lib/prisma";
import { PK_CITIES, canonicalCity } from "@/lib/pk-cities";

/**
 * The COD risk score run at checkout. It only ever *scores and flags* an order for the seller's
 * attention — it never blocks a sale and never fabricates a reason. Every signal is read from real
 * data: the seller's blocklist, what happened to this phone's earlier orders (in this store and,
 * as bare counts, across Orbit), the phone and address the shopper typed, and the cart itself.
 */

/**
 * Every weight in one place. Points are added to a score that is clamped to 0–100.
 * `each` is per past order, `cap` is the most that signal may add (or take off, when negative).
 * Levels: low < 35, medium 35–64, high >= 65. A hard rule (the blocklist) is always high.
 */
export const RISK_WEIGHTS = {
  blocklist: 100, // hard rule — the seller said so
  storeReturned: { each: 30, cap: 60 }, // courier brought this phone's parcel back to this store
  storeCancelled: { each: 15, cap: 45 },
  storeDelivered: { each: -10, cap: -30 }, // delivered history lowers risk
  networkReturned: { each: 15, cap: 45 }, // same phone, other Orbit stores — counts only
  networkCancelled: { each: 6, cap: 24 },
  networkDelivered: { each: -5, cap: -20 },
  phoneFake: 45, // 03000000000, 03001234567 …
  phoneInvalid: 30, // not a Pakistani mobile number
  addressShort: 15,
  addressNoLocality: 10, // no house / street / block / sector / area in it
  cityMissing: 15,
  cityUnknown: 8,
  largeFirstOrder: 25,
  bulkQty: 20,
  repeat24h: 20,
} as const;

export const RISK_THRESHOLDS = { medium: 35, high: 65 } as const;

/** A first order counts as "large" above this multiple of the store's recent average. */
const LARGE_ORDER_MULTIPLE = 3;
const LARGE_ORDER_MIN_SAMPLE = 3;
const BULK_QTY = 10;
/** Orders already placed from this phone in the last 24h before this one counts as "several". */
const REPEAT_24H = 2;
const SHORT_ADDRESS_CHARS = 10;

export type RiskLevel = "low" | "medium" | "high";

export interface RiskSignal {
  label: string;
  weight: number;
}

export interface FraudResult {
  flagged: boolean;
  reason: string | null;
  score: number;
  level: RiskLevel;
  signals: RiskSignal[];
}

/** What happened to a phone's earlier orders. `returned` comes from courier sync (lib/courier.ts). */
export interface HistoryCounts {
  cancelled: number;
  returned: number;
  delivered: number;
  total: number;
}

export interface RiskFacts {
  /** Pakistani store — the phone-format and city checks only make sense there. */
  pakistan: boolean;
  blocklisted: boolean;
  phone: string;
  store: HistoryCounts;
  /** Same phone on other Orbit stores — counts only. Null when it wasn't looked up. */
  network: HistoryCounts | null;
  /** Orders from this phone (any store) in the last 24 hours, before this one. */
  ordersLast24h: number;
  address: { line1?: string | null; area?: string | null; city?: string | null; raw?: string | null; structured: boolean };
  subtotal: number;
  /** Average of the store's recent non-cancelled orders; null when there are too few to compare. */
  storeAverage: number | null;
  maxLineQty: number;
}

// ---------------------------------------------------------------------------------------------
// Phone
// ---------------------------------------------------------------------------------------------

/** "+92 300 1234567", "0092-300-1234567", "3001234567" → "03001234567". Null when it isn't one. */
export function normalizePkPhone(input: string | null | undefined): string | null {
  let d = (input ?? "").replace(/\D/g, "");
  if (d.startsWith("0092")) d = d.slice(4);
  else if (d.startsWith("92") && d.length === 12) d = d.slice(2);
  if (d.length === 10 && d.startsWith("3")) d = `0${d}`;
  return /^03\d{9}$/.test(d) ? d : null;
}

export type PhoneCheck = "ok" | "invalid" | "fake";

/** Valid Pakistani mobile (11 digits, 03…), and not an obvious placeholder. */
export function checkPkPhone(input: string | null | undefined): PhoneCheck {
  const n = normalizePkPhone(input);
  if (!n) return "invalid";
  const subscriber = n.slice(4); // the 7 digits after the 03xx network code
  if (/^(\d)\1{6}$/.test(subscriber)) return "fake"; // 0300 0000000, 0321 1111111
  if (/(\d)\1{7,}/.test(n)) return "fake"; // 03000000001, 03333333334
  if (subscriber === "1234567" || /0?3123456789$/.test(n)) return "fake"; // 0300 1234567, 0312 3456789
  return "ok";
}

/**
 * The spellings one phone can be stored under ("0300…", "+92300…", "92300…", "300…"), so history
 * is found however it was typed. A number that isn't Pakistani is matched as typed.
 */
export function phoneVariants(input: string | null | undefined): string[] {
  const raw = (input ?? "").trim();
  const compact = raw.replace(/[\s()-]/g, "");
  const n = normalizePkPhone(raw);
  const out = new Set<string>();
  if (raw) out.add(raw);
  if (compact) out.add(compact);
  if (n) {
    const ten = n.slice(1);
    for (const v of [n, `+92${ten}`, `92${ten}`, `0092${ten}`, ten, `${n.slice(0, 4)} ${n.slice(4)}`, `${n.slice(0, 4)}-${n.slice(4)}`, `+92 ${ten}`]) out.add(v);
  }
  return [...out];
}

// ---------------------------------------------------------------------------------------------
// Address
// ---------------------------------------------------------------------------------------------

const LOCALITY =
  /\b(house|home|flat|apartment|apt|plot|shop|office|street|st|gali|gully|galli|road|rd|block|blk|sector|phase|town|colony|society|scheme|mohalla|muhalla|mohallah|chowk|bazar|bazaar|market|near|opposite|opp|village|chak|floor|plaza|lane|avenue|ave|cantt|dha|bahria|gulshan|gulberg|nagar|area|ward|unit|basti|goth|kot|pura|pind|tehsil|district|p\.?\s?o|post office)\b|#|\d/i;

const KNOWN_CITIES = new Set(PK_CITIES.map((c) => c.toLowerCase()));

export function isKnownPkCity(city: string | null | undefined): boolean {
  return KNOWN_CITIES.has(canonicalCity(city));
}

export interface AddressCheck {
  tooShort: boolean;
  noLocality: boolean;
  cityMissing: boolean;
  cityUnknown: boolean;
}

/**
 * How deliverable the typed address looks. A structured address is judged on its street line and
 * area with the city checked on its own; a single-line address is searched for a city name.
 */
export function checkAddress(a: RiskFacts["address"]): AddressCheck {
  const street = (a.structured ? [a.line1, a.area].map((s) => (s ?? "").trim()).filter(Boolean).join(", ") : (a.raw ?? "")).trim();
  const tooShort = street.replace(/\s+/g, " ").length < SHORT_ADDRESS_CHARS;
  const hasArea = a.structured && !!(a.area ?? "").trim();
  const noLocality = !hasArea && !LOCALITY.test(street);
  let cityMissing = false;
  let cityUnknown = false;
  if (a.structured) {
    const city = (a.city ?? "").trim();
    if (!city) cityMissing = true;
    else if (!isKnownPkCity(city)) cityUnknown = true;
  } else {
    const words = canonicalCity(street);
    const found = [...KNOWN_CITIES].some((c) => new RegExp(`\\b${c}\\b`).test(words)) || street.split(/[\s,]+/).some((w) => isKnownPkCity(w));
    if (!found) cityMissing = true;
  }
  return { tooShort, noLocality, cityMissing, cityUnknown };
}

// ---------------------------------------------------------------------------------------------
// Scoring — pure, so it can be tested without a database
// ---------------------------------------------------------------------------------------------

function capped(count: number, w: { each: number; cap: number }): number {
  const v = count * w.each;
  return w.cap < 0 ? Math.max(v, w.cap) : Math.min(v, w.cap);
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

export function levelFor(score: number): RiskLevel {
  return score >= RISK_THRESHOLDS.high ? "high" : score >= RISK_THRESHOLDS.medium ? "medium" : "low";
}

/** Turn the facts about an order into a 0–100 score, a level and the plain-words signals behind it. */
export function scoreSignals(f: RiskFacts): FraudResult {
  const signals: RiskSignal[] = [];
  const add = (label: string, weight: number) => {
    if (weight !== 0) signals.push({ label, weight });
  };
  const W = RISK_WEIGHTS;

  if (f.blocklisted) add("Phone is on your blocklist", W.blocklist);

  // this store's history for the phone
  const s = f.store;
  if (s.returned > 0) add(`${plural(s.returned, "past order", "past orders")} from this phone came back undelivered (courier return)`, capped(s.returned, W.storeReturned));
  if (s.cancelled > 0) add(`${plural(s.cancelled, "past order", "past orders")} from this phone ${s.cancelled === 1 ? "was" : "were"} cancelled`, capped(s.cancelled, W.storeCancelled));
  if (s.delivered > 0) add(`${plural(s.delivered, "past order", "past orders")} from this phone ${s.delivered === 1 ? "was" : "were"} delivered — lowers the risk`, capped(s.delivered, W.storeDelivered));

  // the same phone on other Orbit stores — counts only
  const n = f.network;
  if (n) {
    if (n.returned > 0) add(`${plural(n.returned, "order", "orders")} from this phone ${n.returned === 1 ? "was" : "were"} returned undelivered on other Orbit stores`, capped(n.returned, W.networkReturned));
    if (n.cancelled > 0) add(`${plural(n.cancelled, "order", "orders")} from this phone ${n.cancelled === 1 ? "was" : "were"} cancelled on other Orbit stores`, capped(n.cancelled, W.networkCancelled));
    if (n.delivered > 0) add(`${plural(n.delivered, "order", "orders")} from this phone ${n.delivered === 1 ? "was" : "were"} delivered on other Orbit stores — lowers the risk`, capped(n.delivered, W.networkDelivered));
  }

  // phone
  if (f.pakistan) {
    const p = checkPkPhone(f.phone);
    if (p === "fake") add("Phone number looks made up (repeated or 1234567 digits)", W.phoneFake);
    else if (p === "invalid") add("Phone is not a valid Pakistani mobile number (03xx xxxxxxx)", W.phoneInvalid);
  }

  // address
  const a = checkAddress(f.address);
  if (a.tooShort) add("Address is very short", W.addressShort);
  else if (a.noLocality) add("Address has no house, street, block, sector or area", W.addressNoLocality);
  if (a.cityMissing && f.address.structured) add("No city given", W.cityMissing);
  else if (a.cityMissing && f.pakistan) add("No city found in the address", W.cityMissing);
  else if (a.cityUnknown && f.pakistan) add(`City "${(f.address.city ?? "").trim()}" is not one we recognise`, W.cityUnknown);

  // large first order vs the store's own average
  if (s.total === 0 && f.storeAverage != null && f.subtotal > 0 && f.subtotal > f.storeAverage * LARGE_ORDER_MULTIPLE)
    add("First order from this phone, and much larger than your typical order", W.largeFirstOrder);

  if (f.maxLineQty >= BULK_QTY) add(`${f.maxLineQty} units of a single item`, W.bulkQty);

  if (f.ordersLast24h >= REPEAT_24H) add(`${f.ordersLast24h} other orders from this phone in the last 24 hours`, W.repeat24h);

  const raw = signals.reduce((sum, x) => sum + x.weight, 0);
  let score = Math.max(0, Math.min(100, Math.round(raw)));
  if (f.blocklisted) score = 100; // a hard rule isn't argued down by good history
  const level = levelFor(score);
  const flagged = f.blocklisted || level === "high";
  // most important first; the ones that lower risk last
  signals.sort((x, y) => y.weight - x.weight);
  const reason = flagged
    ? signals
        .filter((x) => x.weight > 0)
        .map((x) => x.label)
        .join(" · ") || null
    : null;
  return { flagged, reason, score, level, signals };
}

// ---------------------------------------------------------------------------------------------
// Data
// ---------------------------------------------------------------------------------------------

/** Courier statuses that mean the parcel is coming / came back (see ShipStatus in lib/courier.ts). */
const RETURNED_COURIER = ["returned", "returning"];

type HistoryRow = { status: string; courierStatus: string | null; _count: { _all: number } };

/** A courier return counts as returned whatever the order status is; otherwise cancelled / fulfilled. */
export function tallyHistory(rows: HistoryRow[]): HistoryCounts {
  const out: HistoryCounts = { cancelled: 0, returned: 0, delivered: 0, total: 0 };
  for (const r of rows) {
    const c = r._count._all;
    out.total += c;
    if (r.courierStatus && RETURNED_COURIER.includes(r.courierStatus)) out.returned += c;
    else if (r.status === "cancelled") out.cancelled += c;
    else if (r.status === "fulfilled") out.delivered += c;
  }
  return out;
}

/**
 * The network signal: how this phone's orders ended on OTHER Orbit stores. It returns counts and
 * nothing else — never which store, what was bought, a name or an address — so one seller learns
 * only "N delivered, N cancelled, N returned elsewhere" about a shopper.
 */
export async function networkPhoneHistory(phone: string, excludeBusinessId: string): Promise<HistoryCounts> {
  const variants = phoneVariants(phone);
  if (!variants.length) return { cancelled: 0, returned: 0, delivered: 0, total: 0 };
  const rows = await prisma.order.groupBy({
    by: ["status", "courierStatus"],
    where: { customerPhone: { in: variants }, businessId: { not: excludeBusinessId } },
    _count: { _all: true },
  });
  return tallyHistory(rows);
}

interface ScreenInput {
  customerPhone: string;
  customerId?: string | null;
  subtotal: number;
  items: { qty: number }[];
  /** The formatted single-line address. */
  address?: string | null;
  /** The structured address, when the checkout collected one. */
  shipping?: { line1?: string | null; area?: string | null; city?: string | null } | null;
}

function onBlocklist(json: string | null | undefined, phone: string): boolean {
  if (!json || !phone) return false;
  try {
    const list = (JSON.parse(json) as string[]).map((p) => String(p).replace(/\s/g, ""));
    return list.some((p) => p && (phone.endsWith(p.slice(-10)) || p.endsWith(phone.slice(-10))));
  } catch {
    return false;
  }
}

export async function screenOrder(businessId: string, input: ScreenInput): Promise<FraudResult> {
  const phone = (input.customerPhone || "").replace(/\s/g, "");
  const variants = phoneVariants(input.customerPhone);

  const business = await prisma.business.findUnique({
    where: { id: businessId },
    select: { fraudBlocklist: true, storeCurrency: true },
  });

  const none: HistoryCounts = { cancelled: 0, returned: 0, delivered: 0, total: 0 };
  const [storeRows, network, ordersLast24h] = phone
    ? await Promise.all([
        prisma.order.groupBy({
          by: ["status", "courierStatus"],
          where: { businessId, customerPhone: { in: variants } },
          _count: { _all: true },
        }),
        // the network look-up is extra — if it fails, the order is still scored on everything else
        networkPhoneHistory(input.customerPhone, businessId).catch(() => null),
        prisma.order.count({ where: { customerPhone: { in: variants }, createdAt: { gte: new Date(Date.now() - 24 * 3600000) } } }),
      ])
    : [[], null, 0];
  const store = phone ? tallyHistory(storeRows) : none;

  // the store's typical order, only needed to judge a first order
  let storeAverage: number | null = null;
  if (store.total === 0) {
    const recent = await prisma.order.findMany({
      where: { businessId, status: { not: "cancelled" } },
      select: { total: true },
      orderBy: { createdAt: "desc" },
      take: 20,
    });
    if (recent.length >= LARGE_ORDER_MIN_SAMPLE) storeAverage = recent.reduce((s, o) => s + o.total, 0) / recent.length;
  }

  const structured = !!input.shipping;
  const city = input.shipping?.city ?? null;
  return scoreSignals({
    // "usd" is only the default a store starts with, so a Pakistani city or number also counts
    pakistan: (business?.storeCurrency ?? "").toLowerCase() === "pkr" || isKnownPkCity(city) || normalizePkPhone(input.customerPhone) != null,
    blocklisted: onBlocklist(business?.fraudBlocklist, phone),
    phone: input.customerPhone,
    store,
    network,
    ordersLast24h,
    address: { line1: input.shipping?.line1, area: input.shipping?.area, city, raw: input.address, structured },
    subtotal: input.subtotal,
    storeAverage,
    maxLineQty: Math.max(0, ...input.items.map((i) => Number(i.qty) || 0)),
  });
}

/** Read the signals JSON stored on an order; anything malformed is treated as "no signals". */
export function parseRiskSignals(json: string | null | undefined): RiskSignal[] {
  if (!json) return [];
  try {
    const v = JSON.parse(json);
    if (!Array.isArray(v)) return [];
    return v
      .filter((x) => x && typeof x.label === "string" && typeof x.weight === "number")
      .map((x) => ({ label: x.label as string, weight: x.weight as number }));
  } catch {
    return [];
  }
}
