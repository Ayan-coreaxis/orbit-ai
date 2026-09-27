import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getChatbotReply } from "@/lib/chatbot";
import { whatsAppNumberKey, sendWhatsAppMessage, validTwilioSignature } from "@/lib/whatsapp";
import { looksLikeYes, verifyLatestOrderForPhone } from "@/lib/order-verify";

const normalizePhone = whatsAppNumberKey;

/**
 * Real inbound WhatsApp webhook. Twilio POSTs here whenever a real customer messages a business's
 * real, admin-assigned WhatsApp number. Real conversation memory now comes from the persisted
 * ChatMessage log (also what powers /dashboard/inbox) — the last few real messages from this same
 * phone number are replayed as history, not a fresh-every-time answer.
 */
export async function POST(req: NextRequest) {
  const form = await req.formData();
  const body = (form.get("Body") as string) ?? "";
  const from = (form.get("From") as string) ?? "";
  const to = (form.get("To") as string) ?? "";

  const emptyTwiml = () => new NextResponse("<Response></Response>", { headers: { "Content-Type": "text/xml" } });

  // Only Twilio may talk to this endpoint — otherwise anyone could pose as a customer (e.g. send
  // "YES" to confirm someone's cash-on-delivery order) or burn the seller's AI budget.
  const params: Record<string, string> = {};
  form.forEach((v, k) => {
    if (typeof v === "string") params[k] = v;
  });
  const proto = req.headers.get("x-forwarded-proto") || req.nextUrl.protocol.replace(":", "");
  const host = req.headers.get("x-forwarded-host") || req.headers.get("host") || req.nextUrl.host;
  const calledUrl = process.env.TWILIO_WEBHOOK_URL?.trim() || `${proto}://${host}${req.nextUrl.pathname}${req.nextUrl.search}`;
  if (!validTwilioSignature(calledUrl, params, req.headers.get("x-twilio-signature"))) {
    return new NextResponse("Invalid signature", { status: 403 });
  }

  if (!body.trim() || !from || !to) return emptyTwiml();

  const toNumber = normalizePhone(to);
  const businesses = await prisma.business.findMany({ where: { whatsappInboundNumber: { not: null } } });
  const matched = businesses.find((b) => b.whatsappInboundNumber && normalizePhone(b.whatsappInboundNumber) === toNumber);

  if (!matched) {
    return emptyTwiml(); // no real business owns this number — nothing honest to reply with
  }

  const customerRef = normalizePhone(from);

  // "YES" to confirm a pending cash-on-delivery order — handled before the chatbot
  if (looksLikeYes(body)) {
    const verified = await verifyLatestOrderForPhone(matched.id, customerRef, `${proto}://${host}`);
    if (verified) {
      await sendWhatsAppMessage(from, "Thanks! Your order is confirmed. We'll be in touch about delivery.", { from: to });
      return emptyTwiml();
    }
  }

  const priorMessages = await prisma.chatMessage.findMany({
    where: { businessId: matched.id, channel: "whatsapp", customerRef },
    orderBy: { createdAt: "desc" },
    take: 10,
  });
  const history = priorMessages
    .reverse()
    .map((m) => ({ role: m.role as "user" | "assistant", content: m.content }));

  const result = await getChatbotReply(matched.id, body, history, { channel: "whatsapp", customerRef });
  // Reply from the number the customer wrote to, so it stays one conversation.
  await sendWhatsAppMessage(from, result.reply, { from: to });

  return emptyTwiml();
}
