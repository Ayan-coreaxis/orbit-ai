import { prisma } from "@/lib/prisma";

/**
 * Storefront dispatch. Each seller connects their own courier account (PostEx / Leopards / TCS)
 * with their own API key; we book the shipment and pull the tracking number back onto the order.
 * "manual" (the default) just means the seller types the tracking in by hand. Honest: if the key
 * is missing or the courier API errors, we say so — we never fabricate a tracking number.
 */

export type CourierProvider = "postex" | "leopards" | "tcs" | "manual";

export interface BookResult {
  ok: boolean;
  courierName: string;
  trackingNumber?: string;
  trackingUrl?: string;
  error?: string;
}

interface OrderForBooking {
  id: string;
  customerName: string;
  customerPhone: string;
  address: string;
  shippingAddress: string | null;
  total: number;
  paymentProvider: string;
  items: string;
}

const COURIER_LABEL: Record<CourierProvider, string> = {
  postex: "PostEx",
  leopards: "Leopards",
  tcs: "TCS",
  manual: "Manual",
};

function parseAddr(o: OrderForBooking): { line1: string; city: string } {
  try {
    if (o.shippingAddress) {
      const a = JSON.parse(o.shippingAddress);
      return { line1: [a.line1, a.area].filter(Boolean).join(", "), city: a.city || "" };
    }
  } catch {
    /* ignore */
  }
  return { line1: o.address, city: "" };
}

function itemSummary(itemsJson: string): string {
  try {
    const items = JSON.parse(itemsJson) as { name?: string; qty?: number }[];
    return items.map((i) => `${i.name} x${i.qty}`).join(", ").slice(0, 250) || "Order";
  } catch {
    return "Order";
  }
}

export async function bookShipment(businessId: string, orderId: string): Promise<BookResult> {
  const business = await prisma.business.findUnique({
    where: { id: businessId },
    select: { courierProvider: true, courierApiKey: true, name: true, whatsapp: true },
  });
  const provider = (business?.courierProvider as CourierProvider) || "manual";
  const label = COURIER_LABEL[provider] ?? "Courier";

  if (provider === "manual")
    return { ok: false, courierName: label, error: "No courier connected — enter the tracking number by hand, or connect one in Settings." };
  if (!business?.courierApiKey)
    return { ok: false, courierName: label, error: `Add your ${label} API key in Settings to auto-book.` };

  const order = (await prisma.order.findFirst({
    where: { id: orderId, businessId },
    select: {
      id: true,
      customerName: true,
      customerPhone: true,
      address: true,
      shippingAddress: true,
      total: true,
      paymentProvider: true,
      items: true,
    },
  })) as OrderForBooking | null;
  if (!order) return { ok: false, courierName: label, error: "Order not found." };

  const codAmount = order.paymentProvider === "cod" ? Math.round(order.total) : 0;
  const { line1, city } = parseAddr(order);
  const detail = itemSummary(order.items);

  try {
    if (provider === "postex") return await bookPostEx(business.courierApiKey, order, { line1, city, codAmount, detail });
    if (provider === "leopards") return await bookLeopards(business.courierApiKey, order, { line1, city, codAmount, detail, from: business.name });
    if (provider === "tcs") return await bookTcs(business.courierApiKey, order, { line1, city, codAmount, detail });
  } catch (e) {
    return { ok: false, courierName: label, error: `${label} API error: ${String(e).slice(0, 160)}` };
  }
  return { ok: false, courierName: label, error: "Unsupported courier." };
}

interface Ctx {
  line1: string;
  city: string;
  codAmount: number;
  detail: string;
  from?: string;
}

// --- PostEx (https://api.postex.pk) -----------------------------------------
async function bookPostEx(apiKey: string, o: OrderForBooking, c: Ctx): Promise<BookResult> {
  const res = await fetch("https://api.postex.pk/services/integration/api/order/v3/create-order", {
    method: "POST",
    headers: { "Content-Type": "application/json", token: apiKey },
    body: JSON.stringify({
      cityName: c.city || "Karachi",
      customerName: o.customerName,
      customerPhone: o.customerPhone,
      deliveryAddress: c.line1,
      invoicePayment: c.codAmount,
      orderRefNumber: o.id.slice(-10),
      orderDetail: c.detail,
      items: 1,
    }),
  });
  const data = (await res.json().catch(() => ({}))) as { dist?: { trackingNumber?: string }; statusMessage?: string };
  const tn = data?.dist?.trackingNumber;
  if (!res.ok || !tn) return { ok: false, courierName: "PostEx", error: data?.statusMessage || `HTTP ${res.status}` };
  return { ok: true, courierName: "PostEx", trackingNumber: tn, trackingUrl: `https://postex.pk/tracking?trackingNumber=${tn}` };
}

// --- Leopards (https://merchantapi.leopardscourier.com) ---------------------
async function bookLeopards(apiKey: string, o: OrderForBooking, c: Ctx): Promise<BookResult> {
  const [api_key, api_password] = apiKey.split(":");
  const res = await fetch("https://merchantapi.leopardscourier.com/api/bookPacket/format/json/", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      api_key,
      api_password: api_password || "",
      booked_packet_weight: 500,
      booked_packet_no_piece: 1,
      booked_packet_collect_amount: c.codAmount,
      booked_packet_order_id: o.id.slice(-10),
      origin_city: "self",
      destination_city: c.city || "self",
      shipment_name_eng: c.from || "Store",
      consignment_name_eng: o.customerName,
      consignment_phone_number: o.customerPhone,
      consignment_address: c.line1,
      special_instructions: c.detail,
    }),
  });
  const data = (await res.json().catch(() => ({}))) as { status?: number; track_number?: string; error_msg?: string };
  if (data?.status !== 1 || !data.track_number)
    return { ok: false, courierName: "Leopards", error: data?.error_msg || `HTTP ${res.status}` };
  return {
    ok: true,
    courierName: "Leopards",
    trackingNumber: data.track_number,
    trackingUrl: `https://www.leopardscourier.com/tracking?tn=${data.track_number}`,
  };
}

// --- TCS (COD API) --------------------------------------------------------
async function bookTcs(apiKey: string, o: OrderForBooking, c: Ctx): Promise<BookResult> {
  const res = await fetch("https://api.tcscourier.com/production/v1/cod/create-order", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-IBM-Client-Id": apiKey },
    body: JSON.stringify({
      consigneeName: o.customerName,
      consigneeMobNo: o.customerPhone,
      consigneeAddress: c.line1,
      destCityName: c.city || "Karachi",
      weight: 0.5,
      pieces: 1,
      codAmount: c.codAmount,
      customerReferenceNo: o.id.slice(-10),
      contentDesc: c.detail,
      services: "O",
    }),
  });
  const data = (await res.json().catch(() => ({}))) as { returnStatus?: { status?: string }; consignmentNo?: string; returnStatusMessage?: string };
  if (!res.ok || !data.consignmentNo)
    return { ok: false, courierName: "TCS", error: data?.returnStatusMessage || `HTTP ${res.status}` };
  return {
    ok: true,
    courierName: "TCS",
    trackingNumber: data.consignmentNo,
    trackingUrl: `https://www.tcsexpress.com/track/?trackingNumber=${data.consignmentNo}`,
  };
}
