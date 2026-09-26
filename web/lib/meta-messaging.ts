import crypto from "crypto";
import { prisma } from "@/lib/prisma";
import { GRAPH_BASE } from "@/lib/meta-oauth";
import { getChatbotReply } from "@/lib/chatbot";

/**
 * Facebook Messenger + Instagram DMs → the seller's store chatbot, and into /dashboard/inbox.
 *  - The platform owner points the Meta app's webhook (objects "page" and "instagram", field
 *    "messages") at /api/webhooks/meta with META_WEBHOOK_VERIFY_TOKEN.
 *  - When a seller connects (or switches) their Page, Orbit subscribes that Page to the app.
 *  - Each incoming DM is checked against Meta's signature, answered by the chatbot, and the reply
 *    goes back from the seller's own Page / Instagram account.
 */

type Fetch = typeof fetch;

export type DmChannel = "messenger" | "instagram";

export function metaWebhookUrl(base: string): string {
  return `${base}/api/webhooks/meta`;
}

/** X-Hub-Signature-256 = "sha256=" + HMAC-SHA256(raw body, app secret). */
export function validMetaSignature(raw: string, header: string | null): boolean {
  const secret = process.env.META_APP_SECRET;
  if (!secret || !header?.startsWith("sha256=")) return false;
  const expected = crypto.createHmac("sha256", secret).update(raw, "utf8").digest("hex");
  const a = Buffer.from(expected);
  const b = Buffer.from(header.slice(7));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

/** Ask Meta to deliver this Page's (and its Instagram's) messages to Orbit. Best effort. */
export async function subscribePage(pageId: string, pageToken: string, f: Fetch = fetch): Promise<{ ok: boolean; error?: string }> {
  try {
    const res = await f(`${GRAPH_BASE}/${pageId}/subscribed_apps`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ subscribed_fields: ["messages", "messaging_postbacks"], access_token: pageToken }),
      signal: AbortSignal.timeout(15000),
    });
    const d = (await res.json().catch(() => ({}))) as { success?: boolean; error?: { message?: string } };
    return d.success ? { ok: true } : { ok: false, error: d.error?.message ?? `Meta error ${res.status}` };
  } catch {
    return { ok: false, error: "Couldn't reach Meta." };
  }
}

/** Is this Page subscribed to Orbit's app for messages? */
export async function pageSubscribed(pageId: string, pageToken: string, f: Fetch = fetch): Promise<boolean | null> {
  try {
    const res = await f(`${GRAPH_BASE}/${pageId}/subscribed_apps?access_token=${encodeURIComponent(pageToken)}`, { signal: AbortSignal.timeout(15000) });
    if (!res.ok) return null;
    const d = (await res.json()) as { data?: { id?: string; subscribed_fields?: string[] }[] };
    const appId = process.env.META_APP_ID;
    return (d.data ?? []).some((a) => (!appId || a.id === appId) && (a.subscribed_fields ?? []).includes("messages"));
  } catch {
    return null;
  }
}

async function sendDm(pageToken: string, recipientId: string, text: string, f: Fetch): Promise<{ sent: boolean; error?: string }> {
  // Messenger allows 2000 characters; Instagram 1000.
  const res = await f(`${GRAPH_BASE}/me/messages?access_token=${encodeURIComponent(pageToken)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ recipient: { id: recipientId }, messaging_type: "RESPONSE", message: { text: text.slice(0, 1000) } }),
    signal: AbortSignal.timeout(20000),
  }).catch(() => null);
  if (!res) return { sent: false, error: "Couldn't reach Meta." };
  if (res.ok) return { sent: true };
  const d = (await res.json().catch(() => ({}))) as { error?: { message?: string } };
  return { sent: false, error: d.error?.message ?? `Meta error ${res.status}` };
}

type Messaging = {
  sender?: { id?: string };
  recipient?: { id?: string };
  message?: { mid?: string; text?: string; is_echo?: boolean; attachments?: { type?: string }[] };
  postback?: { title?: string; payload?: string };
};
export type MetaWebhookBody = { object?: string; entry?: { id?: string; messaging?: Messaging[] }[] };

// Meta can deliver the same message twice; remember recent ids so the customer gets one answer.
const seen = new Map<string, number>();
function firstTime(mid: string): boolean {
  const now = Date.now();
  if (seen.size > 2000) for (const [k, t] of seen) if (now - t > 3600_000) seen.delete(k);
  if (seen.has(mid)) return false;
  seen.set(mid, now);
  return true;
}

/** Handle one verified webhook delivery. Returns what it did, for logs/tests. */
export async function handleMetaWebhook(body: MetaWebhookBody, f: Fetch = fetch): Promise<{ handled: number; replies: { to: string; sent: boolean; error?: string }[] }> {
  const channel: DmChannel | null = body.object === "page" ? "messenger" : body.object === "instagram" ? "instagram" : null;
  const out = { handled: 0, replies: [] as { to: string; sent: boolean; error?: string }[] };
  if (!channel) return out;

  for (const entry of body.entry ?? []) {
    if (!entry.id) continue;
    const business = await prisma.business.findFirst({
      where: channel === "messenger" ? { metaPageId: entry.id } : { metaInstagramUserId: entry.id },
      select: { id: true, metaAccessToken: true, metaPageId: true, metaInstagramUserId: true },
    });
    if (!business?.metaAccessToken) continue;
    const own = new Set([business.metaPageId, business.metaInstagramUserId].filter(Boolean));

    for (const m of entry.messaging ?? []) {
      const sender = m.sender?.id;
      if (!sender || own.has(sender) || m.message?.is_echo) continue; // our own replies come back as echoes
      const text = (m.message?.text ?? m.postback?.title ?? "").trim();
      const mid = m.message?.mid ?? `${sender}:${text}:${Date.now()}`;
      if (!firstTime(mid)) continue;
      out.handled++;

      if (!text) {
        // A photo / voice note / sticker: the chatbot can't read it — say so honestly.
        const r = await sendDm(business.metaAccessToken, sender, "Thanks! I can only read text messages here — please type your question and I'll help right away.", f);
        out.replies.push({ to: sender, ...r });
        continue;
      }

      const prior = await prisma.chatMessage.findMany({
        where: { businessId: business.id, channel, customerRef: sender },
        orderBy: { createdAt: "desc" },
        take: 10,
      });
      const history = prior.reverse().map((p) => ({ role: p.role as "user" | "assistant", content: p.content }));
      const result = await getChatbotReply(business.id, text, history, { channel, customerRef: sender });
      const r = await sendDm(business.metaAccessToken, sender, result.reply, f);
      out.replies.push({ to: sender, ...r });
    }
  }
  return out;
}
