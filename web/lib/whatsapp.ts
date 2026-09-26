import crypto from "crypto";

const TWILIO_API = process.env.TWILIO_API_BASE?.replace(/\/+$/, "") || "https://api.twilio.com/2010-04-01/Accounts";

export interface WhatsAppSendResult {
  sent: boolean;
  error?: string;
  sid?: string;
}

function normalizeWhatsAppNumber(raw: string): string {
  const digits = raw.replace(/^whatsapp:/, "").replace(/[^\d+]/g, "");
  const withPlus = digits.startsWith("+") ? digits : `+${digits}`;
  return `whatsapp:${withPlus}`;
}

export function twilioConfigured(): boolean {
  const { TWILIO_ACCOUNT_SID: sid, TWILIO_AUTH_TOKEN: token, TWILIO_WHATSAPP_FROM: from } = process.env;
  return !!sid && !!token && !!from && sid !== "paste_your_key_here" && token !== "paste_your_key_here";
}

/** Twilio error codes that mean something the seller can act on. */
function explain(code: number | undefined, message: string): string {
  if (code === 63016 || code === 63032)
    return "WhatsApp only allows free-form messages within 24 hours of the customer's last message. Outside that window it needs a Meta-approved message template (set up in Twilio > Content Template Builder).";
  if (code === 63007 || code === 21606) return "The WhatsApp sender number isn't set up for WhatsApp in Twilio — check the sender in Super Admin > WhatsApp.";
  if (code === 21211 || code === 63024) return "That phone number isn't valid for WhatsApp.";
  if (code === 20003) return "Twilio rejected the Account SID / Auth Token — check them in Super Admin > API Keys.";
  return message;
}

/**
 * Sends a real WhatsApp message via Twilio. `from` defaults to the platform sender; replies to a
 * customer must come from the number they messaged (the seller's assigned number), so the chat
 * stays in one thread. Returns honestly whether it actually sent.
 */
export async function sendWhatsAppMessage(toRaw: string, body: string, opts: { from?: string; mediaUrl?: string } = {}): Promise<WhatsAppSendResult> {
  if (!twilioConfigured()) {
    return { sent: false, error: "Twilio isn't connected yet — add Account SID, Auth Token, and WhatsApp sender in Admin > API Keys." };
  }
  const sid = process.env.TWILIO_ACCOUNT_SID!;
  const token = process.env.TWILIO_AUTH_TOKEN!;
  const to = normalizeWhatsAppNumber(toRaw);
  const fromNumber = normalizeWhatsAppNumber(opts.from || process.env.TWILIO_WHATSAPP_FROM!);
  const auth = Buffer.from(`${sid}:${token}`).toString("base64");
  const params = new URLSearchParams({ To: to, From: fromNumber, Body: body.slice(0, 1600) });
  if (opts.mediaUrl) params.set("MediaUrl", opts.mediaUrl);

  try {
    const res = await fetch(`${TWILIO_API}/${sid}/Messages.json`, {
      method: "POST",
      headers: { Authorization: `Basic ${auth}`, "Content-Type": "application/x-www-form-urlencoded" },
      body: params.toString(),
      signal: AbortSignal.timeout(20000),
    });
    const data = (await res.json().catch(() => ({}))) as { sid?: string; code?: number; message?: string; error_code?: number; status?: string };
    if (!res.ok) return { sent: false, error: explain(data.code, `Twilio error ${res.status}: ${(data.message ?? "").slice(0, 200)}`) };
    if (data.status === "failed" || data.status === "undelivered") return { sent: false, error: explain(data.error_code, "Twilio couldn't deliver the message.") };
    return { sent: true, sid: data.sid };
  } catch (e) {
    return { sent: false, error: e instanceof Error ? e.message : "Unknown error sending WhatsApp message" };
  }
}

/**
 * Proves a webhook really came from Twilio (X-Twilio-Signature): HMAC-SHA1 over the exact URL
 * Twilio called plus the POST params sorted by name, keyed with the Auth Token.
 * TWILIO_WEBHOOK_URL overrides the URL when a proxy rewrites it.
 */
export function validTwilioSignature(url: string, params: Record<string, string>, signature: string | null): boolean {
  const token = process.env.TWILIO_AUTH_TOKEN;
  if (!token || !signature) return false;
  const data = Object.keys(params)
    .sort()
    .reduce((acc, k) => acc + k + params[k], url);
  const expected = crypto.createHmac("sha1", token).update(Buffer.from(data, "utf-8")).digest("base64");
  const a = Buffer.from(expected);
  const b = Buffer.from(signature);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
