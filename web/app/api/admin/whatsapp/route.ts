import { NextRequest, NextResponse } from "next/server";
import { isAdminAuthenticated } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { sendWhatsAppMessage, twilioConfigured } from "@/lib/whatsapp";
import { appBaseUrl, appIsPublic } from "@/lib/public-url";

/** Super Admin > WhatsApp: is Twilio set up, the webhook URL to paste into Twilio, and assigned numbers. */
export async function GET() {
  if (!(await isAdminAuthenticated())) return NextResponse.json({ error: "Not authorized." }, { status: 401 });
  const sellers = await prisma.business.findMany({ where: { whatsappInboundNumber: { not: null } }, select: { id: true, name: true, whatsappInboundNumber: true } });
  const since = new Date(Date.now() - 7 * 86400000);
  const inbound = await prisma.chatMessage.count({ where: { channel: "whatsapp", role: "user", createdAt: { gte: since } } }).catch(() => 0);
  return NextResponse.json({
    configured: twilioConfigured(),
    sender: process.env.TWILIO_WHATSAPP_FROM ?? null,
    webhookUrl: process.env.TWILIO_WEBHOOK_URL?.trim() || `${appBaseUrl()}/api/webhooks/twilio/whatsapp`,
    publicApp: appIsPublic(),
    sellers,
    inboundLast7Days: inbound,
  });
}

/** { to, from? } — send one real test message. */
export async function POST(req: NextRequest) {
  if (!(await isAdminAuthenticated())) return NextResponse.json({ error: "Not authorized." }, { status: 401 });
  const { to, from } = (await req.json().catch(() => ({}))) as { to?: string; from?: string };
  if (!to || !/^\+?\d[\d\s-]{6,}$/.test(to.trim())) return NextResponse.json({ ok: false, message: "Enter a phone number with country code, e.g. +923001234567." });
  const r = await sendWhatsAppMessage(to.trim(), "Test from Orbit ✅ — WhatsApp is connected.", { from: from?.trim() || undefined });
  return NextResponse.json({ ok: r.sent, message: r.sent ? `Sent (Twilio id ${r.sid ?? "?"}). If it doesn't arrive: in the Twilio sandbox, the phone must first send the sandbox's join code.` : r.error });
}
