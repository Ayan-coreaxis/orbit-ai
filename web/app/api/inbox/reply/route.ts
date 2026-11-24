import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getActiveBusinessId } from "@/lib/get-active-business-id";
import { sendWhatsAppMessage } from "@/lib/whatsapp";
import { sendDm } from "@/lib/meta-messaging";
import { isDemoRef } from "@/lib/inbox";

/**
 * The seller answers a customer from the Inbox. The message is sent on the customer's own channel
 * (WhatsApp / Instagram / Messenger), or — for the website chat — kept in the thread the visitor sees
 * next time they open the widget. Demo threads are saved but never sent anywhere.
 */
export async function POST(req: NextRequest) {
  const businessId = await getActiveBusinessId();
  if (!businessId) return NextResponse.json({ error: "No active business." }, { status: 400 });
  const { channel, customerRef, text } = (await req.json().catch(() => ({}))) as { channel?: string; customerRef?: string; text?: string };
  const body = (text ?? "").trim().slice(0, 1000);
  if (!channel || !customerRef || !body) return NextResponse.json({ error: "Write a message first." }, { status: 400 });

  // Only reply into a conversation that really exists for this business.
  const known = await prisma.chatMessage.findFirst({ where: { businessId, channel, customerRef }, select: { id: true } });
  if (!known) return NextResponse.json({ error: "That conversation wasn't found." }, { status: 404 });

  let delivered = false;
  let note = "";
  if (isDemoRef(customerRef)) {
    note = "Demo conversation — saved here, not sent to anyone.";
  } else if (channel === "whatsapp") {
    const r = await sendWhatsAppMessage(customerRef, body);
    delivered = r.sent;
    note = r.sent ? "Sent on WhatsApp." : (r.error ?? "WhatsApp couldn't send this.");
  } else if (channel === "instagram" || channel === "messenger") {
    const biz = await prisma.business.findUnique({ where: { id: businessId }, select: { metaAccessToken: true } });
    if (!biz?.metaAccessToken) note = "Connect your Facebook / Instagram page in Settings → Channels to send replies.";
    else {
      const r = await sendDm(biz.metaAccessToken, customerRef, body, fetch);
      delivered = r.sent;
      note = r.sent ? `Sent on ${channel === "instagram" ? "Instagram" : "Messenger"}.` : (r.error ?? "Meta couldn't send this.");
    }
  } else {
    delivered = true;
    note = "Saved — the visitor sees it next time they open the chat.";
  }

  const saved = await prisma.chatMessage.create({ data: { businessId, channel, customerRef, role: "assistant", sender: "owner", content: body } });
  return NextResponse.json({ ok: true, delivered, note, id: saved.id, at: saved.createdAt.toISOString() });
}
