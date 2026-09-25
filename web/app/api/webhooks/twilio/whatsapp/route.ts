import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getChatbotReply } from "@/lib/chatbot";
import { sendWhatsAppMessage } from "@/lib/whatsapp";
import { looksLikeYes, verifyLatestOrderForPhone } from "@/lib/order-verify";

function normalizePhone(raw: string): string {
  return raw.replace(/^whatsapp:/, "").replace(/[^\d+]/g, "");
}

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
    const proto = req.headers.get("x-forwarded-proto") || "https";
    const host = req.headers.get("x-forwarded-host") || req.headers.get("host") || "";
    const verified = await verifyLatestOrderForPhone(matched.id, customerRef, `${proto}://${host}`);
    if (verified) {
      await sendWhatsAppMessage(from, "Thanks! Your order is confirmed. We'll be in touch about delivery.");
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
  await sendWhatsAppMessage(from, result.reply);

  return emptyTwiml();
}
