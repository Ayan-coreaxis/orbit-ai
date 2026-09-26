import { createHash } from "crypto";
import { prisma } from "@/lib/prisma";
import { GRAPH_BASE } from "@/lib/meta-oauth";

/**
 * Meta Conversions API — tells Meta about each real purchase from the server, so ads can optimise
 * for sales even when the browser pixel is blocked (ad blockers, iOS). The browser pixel sends the
 * same Purchase with the same event id (`order_<id>`), and Meta counts it once.
 *
 * Token: the seller's own Conversions API token from Events Manager (best — never expires), or the
 * user token saved when they connected Meta (works when the pixel belongs to their ad account).
 */

type Fetch = typeof fetch;

export type AdContext = { fbp?: string; fbc?: string; ip?: string; ua?: string; url?: string };

const sha = (s: string) => createHash("sha256").update(s).digest("hex");

/** Browser details worth keeping with an order so the server event matches the shopper. */
export function adContextFrom(req: Request, cookie: (name: string) => string | undefined): AdContext {
  const h = req.headers;
  const ip = (h.get("x-forwarded-for") ?? "").split(",")[0].trim() || h.get("x-real-ip") || undefined;
  const ctx: AdContext = {
    fbp: cookie("_fbp")?.slice(0, 200),
    fbc: cookie("_fbc")?.slice(0, 300),
    ip: ip?.slice(0, 64),
    ua: h.get("user-agent")?.slice(0, 400) ?? undefined,
    url: h.get("referer")?.slice(0, 500) ?? undefined,
  };
  return Object.fromEntries(Object.entries(ctx).filter(([, v]) => v)) as AdContext;
}

/** Meta's normalisation: lower-case trimmed email; phone as digits with country code. */
export function hashedUserData(o: { email?: string | null; phone?: string | null; name?: string | null; city?: string | null; country?: string | null }) {
  const out: Record<string, string[]> = {};
  const em = o.email?.trim().toLowerCase();
  if (em && em.includes("@")) out.em = [sha(em)];
  let ph = (o.phone ?? "").replace(/\D/g, "");
  if (ph.startsWith("00")) ph = ph.slice(2);
  if (ph.length === 11 && ph.startsWith("03")) ph = `92${ph.slice(1)}`; // Pakistani mobile written locally
  if (ph.length >= 8) {
    out.ph = [sha(ph)];
    out.external_id = [sha(ph)];
  }
  const parts = (o.name ?? "").trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (parts[0]) out.fn = [sha(parts[0])];
  if (parts.length > 1) out.ln = [sha(parts[parts.length - 1])];
  const ct = o.city?.toLowerCase().replace(/[^a-z]/g, "");
  if (ct) out.ct = [sha(ct)];
  const country = o.country?.trim().toLowerCase();
  if (country && /^[a-z]{2}$/.test(country)) out.country = [sha(country)];
  return out;
}

function parseContext(raw: string | null): AdContext {
  try {
    return raw ? (JSON.parse(raw) as AdContext) : {};
  } catch {
    return {};
  }
}

/** Send the Purchase for one order, once. Records the outcome on the business so Settings can show it. */
export async function sendPurchaseEvent(orderId: string, f: Fetch = fetch): Promise<{ sent: boolean; error?: string }> {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: { business: { select: { id: true, metaPixelId: true, metaCapiToken: true, metaUserToken: true, storeCurrency: true } } },
  });
  if (!order) return { sent: false, error: "No such order." };
  const b = order.business;
  const pixel = b.metaPixelId?.trim();
  if (!pixel || !/^\d{6,20}$/.test(pixel)) return { sent: false, error: "No pixel." };
  if (order.capiSentAt) return { sent: true };
  const token = b.metaCapiToken?.trim() || b.metaUserToken;
  if (!token) return note(b.id, false, "Add a Conversions API token (Settings > Store) so purchases reach Meta from the server.");

  const ctx = parseContext(order.adContext);
  let items: { productId?: string; qty?: number; price?: number }[] = [];
  try {
    items = JSON.parse(order.items);
  } catch {
    items = [];
  }
  const ids = [...new Set(items.map((i) => i.productId).filter((x): x is string => !!x))];
  let city: string | null = null;
  try {
    city = order.shippingAddress ? ((JSON.parse(order.shippingAddress) as { city?: string }).city ?? null) : null;
  } catch {
    city = null;
  }

  const event = {
    event_name: "Purchase",
    event_time: Math.floor(order.createdAt.getTime() / 1000),
    event_id: `order_${order.id}`,
    action_source: "website",
    ...(ctx.url ? { event_source_url: ctx.url } : {}),
    user_data: {
      ...hashedUserData({ email: order.customerEmail, phone: order.customerPhone, name: order.customerName, city }),
      ...(ctx.fbp ? { fbp: ctx.fbp } : {}),
      ...(ctx.fbc ? { fbc: ctx.fbc } : {}),
      ...(ctx.ip ? { client_ip_address: ctx.ip } : {}),
      ...(ctx.ua ? { client_user_agent: ctx.ua } : {}),
    },
    custom_data: {
      currency: (b.storeCurrency || "PKR").toUpperCase(),
      value: Number(order.total.toFixed(2)),
      order_id: order.id,
      content_type: "product",
      content_ids: ids,
      contents: items.filter((i) => i.productId).map((i) => ({ id: i.productId, quantity: i.qty ?? 1, item_price: i.price })),
      num_items: items.reduce((s, i) => s + (i.qty ?? 1), 0),
    },
  };

  const body: Record<string, unknown> = { data: [event], access_token: token };
  if (process.env.META_CAPI_TEST_CODE) body.test_event_code = process.env.META_CAPI_TEST_CODE;
  try {
    const res = await f(`${GRAPH_BASE}/${pixel}/events`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(15000),
    });
    const d = (await res.json().catch(() => ({}))) as { events_received?: number; error?: { message?: string; error_user_msg?: string } };
    if (!res.ok || !d.events_received) {
      const msg = d.error?.error_user_msg || d.error?.message || `Meta error ${res.status}`;
      return note(b.id, false, `Meta didn't accept the purchase: ${msg}`.slice(0, 400));
    }
    await prisma.order.update({ where: { id: order.id }, data: { capiSentAt: new Date() } });
    return note(b.id, true);
  } catch {
    return note(b.id, false, "Couldn't reach Meta to send the purchase.");
  }
}

async function note(businessId: string, ok: boolean, error?: string) {
  await prisma.business
    .update({ where: { id: businessId }, data: { metaCapiNote: ok ? `ok:${new Date().toISOString()}` : error } })
    .catch(() => {});
  return { sent: ok, error };
}
