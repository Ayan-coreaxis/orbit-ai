import { prisma } from "@/lib/prisma";

/**
 * Storefront dispatch through the seller's OWN courier account (PostEx / Leopards / TCS).
 *  - bookShipment: books the parcel and puts the real tracking number on the order.
 *  - trackShipment / syncCourierStatuses: reads the courier's status back (cron + "Refresh" button),
 *    so a delivered parcel marks the order fulfilled and a returned one is flagged for the seller.
 * Honest: a missing key or a courier error is reported as it is — never a made-up tracking number.
 *
 * Credentials are stored as JSON in Business.courierApiKey (see CourierCreds). Old rows hold a
 * plain string: PostEx token, "api_key:api_password" for Leopards, or the TCS client id.
 * Endpoints follow each courier's merchant API: PostEx api.postex.pk (header `token`), Leopards
 * merchantapi.leopardscourier.com (api_key + api_password, city ids from getAllCities), TCS COD API
 * (X-IBM-Client-Id + portal user/password/cost centre). COURIER_API_BASE_* override them for tests.
 */

export type CourierProvider = "postex" | "leopards" | "tcs" | "manual";
export const COURIERS: CourierProvider[] = ["postex", "leopards", "tcs"];

export const COURIER_LABEL: Record<CourierProvider, string> = { postex: "PostEx", leopards: "Leopards", tcs: "TCS", manual: "Manual" };

export type CourierCreds = {
  postex?: { token: string; pickupAddressCode?: string };
  leopards?: { apiKey: string; apiPassword: string };
  tcs?: { clientId: string; userName: string; password: string; costCenterCode: string; originCity: string };
};

/** The fields each courier needs, for the Settings form. */
export const CRED_FIELDS: Record<Exclude<CourierProvider, "manual">, { key: string; label: string; secret?: boolean; optional?: boolean; hint?: string }[]> = {
  postex: [
    { key: "token", label: "API token", secret: true, hint: "PostEx merchant portal > Integration > API token" },
    { key: "pickupAddressCode", label: "Pickup address code", optional: true, hint: "Only if you have more than one pickup address" },
  ],
  leopards: [
    { key: "apiKey", label: "API key", secret: true, hint: "Leopards merchant portal > API management" },
    { key: "apiPassword", label: "API password", secret: true },
  ],
  tcs: [
    { key: "clientId", label: "API client id", secret: true, hint: "From TCS when they enable API access" },
    { key: "userName", label: "COD portal username" },
    { key: "password", label: "COD portal password", secret: true },
    { key: "costCenterCode", label: "Cost centre code", hint: "COD portal > Setup > Cost centre details" },
    { key: "originCity", label: "Pickup city", hint: "e.g. Lahore" },
  ],
};

const BASE = {
  postex: () => process.env.COURIER_API_BASE_POSTEX?.replace(/\/+$/, "") || "https://api.postex.pk/services/integration/api/order",
  leopards: () => process.env.COURIER_API_BASE_LEOPARDS?.replace(/\/+$/, "") || "https://merchantapi.leopardscourier.com/api",
  tcs: () => process.env.COURIER_API_BASE_TCS?.replace(/\/+$/, "") || "https://api.tcscourier.com/production",
};

export function parseCreds(raw: string | null | undefined, provider?: string | null): CourierCreds {
  if (!raw) return {};
  try {
    const j = JSON.parse(raw) as CourierCreds;
    if (j && typeof j === "object" && !Array.isArray(j)) return j;
  } catch {
    /* legacy plain string */
  }
  if (provider === "postex") return { postex: { token: raw } };
  if (provider === "leopards") {
    const [apiKey, apiPassword = ""] = raw.split(":");
    return { leopards: { apiKey, apiPassword } };
  }
  if (provider === "tcs") return { tcs: { clientId: raw, userName: "", password: "", costCenterCode: "", originCity: "" } };
  return {};
}

/** Which required fields are still empty for a provider. */
export function missingFields(provider: CourierProvider, creds: CourierCreds): string[] {
  if (provider === "manual") return [];
  const c = (creds[provider] ?? {}) as Record<string, string | undefined>;
  return CRED_FIELDS[provider].filter((f) => !f.optional && !c[f.key]?.trim()).map((f) => f.label);
}

// ---------------- shared ----------------

export interface BookResult {
  ok: boolean;
  courierName: string;
  trackingNumber?: string;
  trackingUrl?: string;
  error?: string;
}

/** Normalised status every courier maps into. */
export type ShipStatus = "booked" | "in_transit" | "out_for_delivery" | "delivered" | "attempted" | "returning" | "returned" | "cancelled" | "unknown";

export const SHIP_STATUS_LABEL: Record<ShipStatus, string> = {
  booked: "Booked",
  in_transit: "On the way",
  out_for_delivery: "Out for delivery",
  delivered: "Delivered",
  attempted: "Delivery attempted",
  returning: "Being returned",
  returned: "Returned to you",
  cancelled: "Cancelled",
  unknown: "Unknown",
};

export interface TrackResult {
  ok: boolean;
  status?: ShipStatus;
  text?: string; // the courier's own words
  error?: string;
}

/** Map a courier's free-text status to ours. Order matters: "return" beats "deliver". */
export function normaliseStatus(text: string): ShipStatus {
  const t = text.toLowerCase();
  if (/cancel/.test(t)) return "cancelled";
  if (/returned to (shipper|merchant|origin|vendor)|return(ed)? delivered|rts|delivered to (shipper|merchant)/.test(t)) return "returned";
  if (/return|rto|being return|ready for return/.test(t)) return "returning";
  if (/out for delivery|on route|en route to consignee|assigned to rider|with rider/.test(t)) return "out_for_delivery";
  if (/attempt|refused|not available|unable to deliver|undelivered|consignee not|reattempt/.test(t)) return "attempted";
  if (/delivered/.test(t)) return "delivered";
  if (/transit|dispatched|arrived|hub|warehouse|picked|en.?route|shipped|departed|received at/.test(t)) return "in_transit";
  if (/book|unbooked|pending|at merchant|pickup requested|created/.test(t)) return "booked";
  return "unknown";
}

async function readJson(res: Response): Promise<Record<string, unknown>> {
  const text = await res.text();
  try {
    return JSON.parse(text) as Record<string, unknown>;
  } catch {
    return { _raw: text.slice(0, 200) };
  }
}

/** Couriers want 03XXXXXXXXX. */
export function localPhone(p: string): string {
  let d = p.replace(/\D/g, "");
  if (d.startsWith("0092")) d = d.slice(4);
  if (d.startsWith("92") && d.length === 12) d = d.slice(2);
  if (d.length === 10 && d.startsWith("3")) d = `0${d}`;
  return d;
}

interface OrderForBooking {
  id: string;
  customerName: string;
  customerPhone: string;
  customerEmail: string | null;
  address: string;
  shippingAddress: string | null;
  total: number;
  paymentProvider: string;
  paymentStatus: string;
  items: string;
}

function parseAddr(o: OrderForBooking): { line1: string; city: string } {
  try {
    if (o.shippingAddress) {
      const a = JSON.parse(o.shippingAddress) as { line1?: string; area?: string; city?: string };
      return { line1: [a.line1, a.area].filter(Boolean).join(", "), city: a.city || "" };
    }
  } catch {
    /* ignore */
  }
  return { line1: o.address, city: "" };
}

function itemInfo(itemsJson: string): { detail: string; pieces: number } {
  try {
    const items = JSON.parse(itemsJson) as { name?: string; qty?: number }[];
    return {
      detail: items.map((i) => `${i.name} x${i.qty}`).join(", ").slice(0, 250) || "Order",
      pieces: Math.max(1, items.reduce((s, i) => s + (i.qty ?? 1), 0)),
    };
  } catch {
    return { detail: "Order", pieces: 1 };
  }
}

export function trackingUrlFor(provider: CourierProvider, tn: string): string | undefined {
  const n = encodeURIComponent(tn);
  if (provider === "postex") return `https://postex.pk/tracking?cn=${n}`;
  if (provider === "leopards") return `https://www.leopardscourier.com/leopards-tracking?cn=${n}`;
  if (provider === "tcs") return `https://www.tcsexpress.com/track/${n}`;
  return undefined;
}

// ---------------- booking ----------------

export async function bookShipment(businessId: string, orderId: string, f: typeof fetch = fetch): Promise<BookResult> {
  const business = await prisma.business.findUnique({ where: { id: businessId }, select: { courierProvider: true, courierApiKey: true, name: true } });
  const provider = (business?.courierProvider as CourierProvider) || "manual";
  const label = COURIER_LABEL[provider] ?? "Courier";
  if (provider === "manual") return { ok: false, courierName: label, error: "No courier connected — enter the tracking number by hand, or connect one in Settings." };
  const creds = parseCreds(business?.courierApiKey, provider);
  const missing = missingFields(provider, creds);
  if (missing.length) return { ok: false, courierName: label, error: `Add your ${label} ${missing.join(", ")} in Settings > Courier to book automatically.` };

  const order = await prisma.order.findFirst({
    where: { id: orderId, businessId },
    select: { id: true, customerName: true, customerPhone: true, customerEmail: true, address: true, shippingAddress: true, total: true, paymentProvider: true, paymentStatus: true, items: true },
  });
  if (!order) return { ok: false, courierName: label, error: "Order not found." };
  const { line1, city } = parseAddr(order);
  if (!city) return { ok: false, courierName: label, error: "This order has no city in its address — add it (edit the order) or book it by hand." };
  // Card-paid orders are already paid: the courier collects nothing.
  const codAmount = order.paymentProvider === "cod" ? Math.round(order.total) : 0;
  const { detail, pieces } = itemInfo(order.items);
  const ref = order.id.slice(-10).toUpperCase();
  const ctx = { line1, city, codAmount, detail, pieces, ref, from: business?.name ?? "Store" };

  try {
    if (provider === "postex") return await bookPostEx(creds.postex!, order, ctx, f);
    if (provider === "leopards") return await bookLeopards(creds.leopards!, order, ctx, f);
    if (provider === "tcs") return await bookTcs(creds.tcs!, order, ctx, f);
  } catch (e) {
    return { ok: false, courierName: label, error: `Couldn't reach ${label}: ${e instanceof Error ? e.message : String(e)}`.slice(0, 200) };
  }
  return { ok: false, courierName: label, error: "Unsupported courier." };
}

type Ctx = { line1: string; city: string; codAmount: number; detail: string; pieces: number; ref: string; from: string };

async function bookPostEx(c: NonNullable<CourierCreds["postex"]>, o: OrderForBooking, x: Ctx, f: typeof fetch): Promise<BookResult> {
  const res = await f(`${BASE.postex()}/v3/create-order`, {
    method: "POST",
    headers: { "Content-Type": "application/json", token: c.token },
    body: JSON.stringify({
      cityName: x.city,
      customerName: o.customerName,
      customerPhone: localPhone(o.customerPhone),
      deliveryAddress: x.line1,
      invoiceDivision: 1,
      invoicePayment: x.codAmount,
      items: x.pieces,
      orderDetail: x.detail,
      orderRefNumber: x.ref,
      orderType: "Normal",
      ...(c.pickupAddressCode ? { pickupAddressCode: c.pickupAddressCode } : {}),
    }),
    signal: AbortSignal.timeout(20000),
  });
  const d = (await readJson(res)) as { statusCode?: string; statusMessage?: string; dist?: { trackingNumber?: string } };
  const tn = d.dist?.trackingNumber;
  if (!res.ok || !tn) return { ok: false, courierName: "PostEx", error: `PostEx: ${d.statusMessage || `error ${res.status}`}` };
  return { ok: true, courierName: "PostEx", trackingNumber: tn, trackingUrl: trackingUrlFor("postex", tn) };
}

// Leopards wants its own city id, not a name. Cache the list per API key for a day.
const leopardsCities = new Map<string, { at: number; list: { id: number | string; name: string }[] }>();

async function leopardsCityId(c: NonNullable<CourierCreds["leopards"]>, city: string, f: typeof fetch): Promise<string | null> {
  let hit = leopardsCities.get(c.apiKey);
  if (!hit || Date.now() - hit.at > 86400000) {
    const qs = new URLSearchParams({ api_key: c.apiKey, api_password: c.apiPassword });
    const res = await f(`${BASE.leopards()}/getAllCities/format/json/?${qs}`, { signal: AbortSignal.timeout(20000) });
    const d = (await readJson(res)) as { status?: number; city_list?: { id: number | string; name: string }[]; error?: string };
    if (d.status !== 1 || !Array.isArray(d.city_list)) throw new Error(`Leopards: ${d.error || "couldn't load its city list"}`);
    hit = { at: Date.now(), list: d.city_list };
    leopardsCities.set(c.apiKey, hit);
  }
  const want = city.trim().toLowerCase();
  const found = hit.list.find((x) => String(x.name).trim().toLowerCase() === want);
  return found ? String(found.id) : null;
}

async function bookLeopards(c: NonNullable<CourierCreds["leopards"]>, o: OrderForBooking, x: Ctx, f: typeof fetch): Promise<BookResult> {
  const cityId = await leopardsCityId(c, x.city, f);
  if (!cityId) return { ok: false, courierName: "Leopards", error: `Leopards doesn't deliver to "${x.city}" (or spells it differently) — check the city on the order.` };
  const form = new URLSearchParams({
    api_key: c.apiKey,
    api_password: c.apiPassword,
    booked_packet_weight: String(500 * Math.min(x.pieces, 10)), // grams — the seller can correct it in the Leopards portal
    booked_packet_no_piece: String(x.pieces),
    booked_packet_collect_amount: String(x.codAmount),
    booked_packet_order_id: x.ref,
    origin_city: "self",
    destination_city: cityId,
    shipment_name_eng: "self",
    shipment_email: "self",
    shipment_phone: "self",
    shipment_address: "self",
    consignment_name_eng: o.customerName,
    consignment_email: o.customerEmail || "",
    consignment_phone: localPhone(o.customerPhone),
    consignment_address: x.line1,
    special_instructions: x.detail,
  });
  const res = await f(`${BASE.leopards()}/bookPacket/format/json/`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: form.toString(),
    signal: AbortSignal.timeout(20000),
  });
  const d = (await readJson(res)) as { status?: number; track_number?: string; error?: string | string[] };
  if (d.status !== 1 || !d.track_number) return { ok: false, courierName: "Leopards", error: `Leopards: ${[d.error].flat().filter(Boolean).join(", ") || `error ${res.status}`}` };
  return { ok: true, courierName: "Leopards", trackingNumber: d.track_number, trackingUrl: trackingUrlFor("leopards", d.track_number) };
}

async function bookTcs(c: NonNullable<CourierCreds["tcs"]>, o: OrderForBooking, x: Ctx, f: typeof fetch): Promise<BookResult> {
  const res = await f(`${BASE.tcs()}/v1/cod/create-order`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-IBM-Client-Id": c.clientId },
    body: JSON.stringify({
      userName: c.userName,
      password: c.password,
      costCenterCode: c.costCenterCode,
      consigneeName: o.customerName,
      consigneeAddress: x.line1,
      consigneeMobNo: localPhone(o.customerPhone),
      consigneeEmail: o.customerEmail || "",
      originCityName: c.originCity,
      destinationCityName: x.city,
      weight: 0.5 * Math.min(x.pieces, 10),
      pieces: x.pieces,
      codAmount: String(x.codAmount),
      customerReferenceNo: x.ref,
      services: "O",
      productDetails: x.detail,
      fragile: "No",
      remarks: "",
      insuranceValue: 0,
    }),
    signal: AbortSignal.timeout(20000),
  });
  const d = (await readJson(res)) as { returnStatus?: { status?: string; message?: string }; bookingReply?: { result?: string } };
  const tn = d.bookingReply?.result?.match(/\d{6,}/)?.[0];
  if (!res.ok || !tn) return { ok: false, courierName: "TCS", error: `TCS: ${d.returnStatus?.message || `error ${res.status}`}` };
  return { ok: true, courierName: "TCS", trackingNumber: tn, trackingUrl: trackingUrlFor("tcs", tn) };
}

// ---------------- tracking ----------------

export async function trackShipment(provider: CourierProvider, creds: CourierCreds, tn: string, f: typeof fetch = fetch): Promise<TrackResult> {
  try {
    if (provider === "postex" && creds.postex) {
      const res = await f(`${BASE.postex()}/v1/track-order/${encodeURIComponent(tn)}`, { headers: { token: creds.postex.token }, signal: AbortSignal.timeout(20000) });
      const d = (await readJson(res)) as { statusMessage?: string; dist?: { transactionStatus?: string; transactionStatusHistory?: { transactionStatusMessage?: string }[] } };
      const history = d.dist?.transactionStatusHistory ?? [];
      const text = d.dist?.transactionStatus || history[history.length - 1]?.transactionStatusMessage;
      if (!res.ok || !text) return { ok: false, error: `PostEx: ${d.statusMessage || `error ${res.status}`}` };
      return { ok: true, status: normaliseStatus(text), text };
    }
    if (provider === "leopards" && creds.leopards) {
      const qs = new URLSearchParams({ api_key: creds.leopards.apiKey, api_password: creds.leopards.apiPassword, track_numbers: tn });
      const res = await f(`${BASE.leopards()}/trackBookedPacket/format/json/?${qs}`, { signal: AbortSignal.timeout(20000) });
      const d = (await readJson(res)) as { status?: number; error?: string; packet_list?: { booked_packet_status?: string }[] };
      const text = d.packet_list?.[0]?.booked_packet_status;
      if (d.status !== 1 || !text) return { ok: false, error: `Leopards: ${d.error || `error ${res.status}`}` };
      return { ok: true, status: normaliseStatus(text), text };
    }
    if (provider === "tcs" && creds.tcs) {
      const res = await f(`${BASE.tcs()}/track/v1/shipments/detail?consignmentNo=${encodeURIComponent(tn)}`, {
        headers: { "X-IBM-Client-Id": creds.tcs.clientId },
        signal: AbortSignal.timeout(20000),
      });
      const d = (await readJson(res)) as {
        returnStatus?: { message?: string };
        TrackDetailReply?: { DeliveryInfo?: { status?: string }[]; Checkpoints?: { status?: string }[] };
      };
      const r = d.TrackDetailReply;
      const text = r?.DeliveryInfo?.[0]?.status || r?.Checkpoints?.[0]?.status;
      if (!res.ok || !text) return { ok: false, error: `TCS: ${d.returnStatus?.message || `error ${res.status}`}` };
      return { ok: true, status: normaliseStatus(text), text };
    }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Couldn't reach the courier." };
  }
  return { ok: false, error: "Courier not connected." };
}

/** Which courier booked this order (by the name saved on it). */
export function providerFromName(name: string | null | undefined): CourierProvider | null {
  const n = (name ?? "").toLowerCase();
  if (n.includes("postex")) return "postex";
  if (n.includes("leopard")) return "leopards";
  if (n.includes("tcs")) return "tcs";
  return null;
}

const FINAL: ShipStatus[] = ["delivered", "returned", "cancelled"];

/**
 * Read the courier status for one order and apply it:
 * delivered → order fulfilled (the review request follows); returned → flagged for the seller
 * (stock is NOT put back automatically — they check the parcel first).
 */
export async function syncOrderCourier(orderId: string, f: typeof fetch = fetch): Promise<TrackResult> {
  const o = await prisma.order.findUnique({
    where: { id: orderId },
    select: { id: true, status: true, courierName: true, trackingNumber: true, flagReason: true, paymentProvider: true, business: { select: { courierApiKey: true, courierProvider: true } } },
  });
  if (!o?.trackingNumber) return { ok: false, error: "No tracking number." };
  const provider = providerFromName(o.courierName);
  if (!provider) return { ok: false, error: "Tracked by hand — no courier connection for this order." };
  const creds = parseCreds(o.business.courierApiKey, o.business.courierProvider);
  const r = await trackShipment(provider, creds, o.trackingNumber, f);
  const now = new Date();
  if (!r.ok || !r.status) {
    await prisma.order.update({ where: { id: o.id }, data: { courierCheckedAt: now, courierStatusText: r.error?.slice(0, 200) ?? null } });
    return r;
  }
  const data: Record<string, unknown> = { courierStatus: r.status, courierStatusText: r.text?.slice(0, 200) ?? null, courierCheckedAt: now };
  if (r.status === "delivered" && o.status !== "fulfilled" && o.status !== "cancelled") {
    data.status = "fulfilled";
    data.fulfilledAt = now;
    if (o.paymentProvider === "cod") data.paymentStatus = "paid"; // delivered = cash collected
  }
  if (r.status === "returned" && !(o.flagReason ?? "").includes("Returned by courier")) {
    data.flagged = true;
    data.flagReason = `${o.flagReason ? `${o.flagReason} · ` : ""}Returned by courier — check the parcel, then cancel the order to put the stock back`;
  }
  await prisma.order.update({ where: { id: o.id }, data });
  return r;
}

/** Cron: every shipped order still moving, checked at most every 2 hours. */
export async function syncCourierStatuses(limit = 200, f: typeof fetch = fetch) {
  const due = await prisma.order.findMany({
    where: {
      trackingNumber: { not: null },
      status: { in: ["shipped", "confirmed"] },
      OR: [{ courierStatus: null }, { courierStatus: { notIn: FINAL } }],
      AND: [{ OR: [{ courierCheckedAt: null }, { courierCheckedAt: { lt: new Date(Date.now() - 2 * 3600000) } }] }],
      shippedAt: { gt: new Date(Date.now() - 45 * 86400000) },
    },
    select: { id: true, courierName: true },
    orderBy: { courierCheckedAt: { sort: "asc", nulls: "first" } },
    take: limit,
  });
  const results: { orderId: string; ok: boolean; status?: ShipStatus; error?: string }[] = [];
  for (const o of due) {
    if (!providerFromName(o.courierName)) continue;
    const r = await syncOrderCourier(o.id, f);
    results.push({ orderId: o.id, ok: r.ok, status: r.status, error: r.error });
  }
  return results;
}

/** "Test connection" in Settings: a cheap read-only call. */
export async function testCourier(provider: CourierProvider, creds: CourierCreds, f: typeof fetch = fetch): Promise<{ ok: boolean; message: string }> {
  const missing = missingFields(provider, creds);
  if (missing.length) return { ok: false, message: `Fill in: ${missing.join(", ")}.` };
  try {
    if (provider === "postex") {
      const res = await f(`${BASE.postex()}/v2/get-operational-city`, { headers: { token: creds.postex!.token }, signal: AbortSignal.timeout(20000) });
      const d = (await readJson(res)) as { statusMessage?: string; dist?: unknown[] };
      return res.ok && Array.isArray(d.dist) ? { ok: true, message: `Connected to PostEx — ${d.dist.length} cities available.` } : { ok: false, message: `PostEx: ${d.statusMessage || `error ${res.status}`}` };
    }
    if (provider === "leopards") {
      leopardsCities.delete(creds.leopards!.apiKey);
      const id = await leopardsCityId(creds.leopards!, "lahore", f);
      return { ok: true, message: `Connected to Leopards${id ? "" : " (city list loaded)"}.` };
    }
    if (provider === "tcs") return { ok: true, message: "Saved. TCS has no test call — book one order to confirm the details." };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "Couldn't reach the courier." };
  }
  return { ok: false, message: "Pick a courier." };
}
