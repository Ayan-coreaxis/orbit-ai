import { randomBytes } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { throttle } from "@/lib/guard";
import { getChatbotReply } from "@/lib/chatbot";

/**
 * The storefront chat bubble. The visitor is identified by an httpOnly cookie, and the conversation
 * history is read back from the database — never taken from the request — so a shopper can't feed
 * the bot a fake "assistant said…" turn. Every exchange is logged and shows up in /dashboard/inbox.
 */

const COOKIE = "orbit_chat";
const MAX_LEN = 600;

function visitorId(req: NextRequest): string | null {
  const v = req.cookies.get(COOKIE)?.value ?? "";
  return /^[a-f0-9]{24}$/.test(v) ? v : null;
}

async function enabledStore(businessId: string) {
  return prisma.business.findUnique({ where: { id: businessId }, select: { id: true, chatWidgetEnabled: true } });
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ businessId: string }> }) {
  const { businessId } = await params;
  const store = await enabledStore(businessId);
  const aiReady = !!process.env.ANTHROPIC_API_KEY && process.env.ANTHROPIC_API_KEY !== "paste_your_key_here";
  if (!store?.chatWidgetEnabled || !aiReady) return NextResponse.json({ enabled: false, messages: [] });
  const vid = visitorId(req);
  if (!vid) return NextResponse.json({ enabled: true, messages: [] });
  const rows = await prisma.chatMessage.findMany({
    where: { businessId, channel: "website", customerRef: vid },
    orderBy: { createdAt: "desc" },
    take: 30,
    select: { role: true, content: true },
  });
  return NextResponse.json({ enabled: true, messages: rows.reverse() });
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ businessId: string }> }) {
  const limited = (await throttle(req, "shop-chat", 12, 60_000)) ?? (await throttle(req, "shop-chat-h", 80, 3_600_000));
  if (limited) return limited;
  const { businessId } = await params;
  const store = await enabledStore(businessId);
  if (!store) return NextResponse.json({ error: "Store not found." }, { status: 404 });
  if (!store.chatWidgetEnabled) return NextResponse.json({ error: "Chat is turned off for this store." }, { status: 403 });

  const b = (await req.json().catch(() => ({}))) as { message?: unknown };
  const message = typeof b.message === "string" ? b.message.trim() : "";
  if (!message) return NextResponse.json({ error: "Type a message first." }, { status: 400 });
  if (message.length > MAX_LEN) return NextResponse.json({ error: `Keep it under ${MAX_LEN} characters.` }, { status: 400 });

  const existing = visitorId(req);
  const vid = existing ?? randomBytes(12).toString("hex");

  const past = existing
    ? await prisma.chatMessage.findMany({
        where: { businessId, channel: "website", customerRef: vid },
        orderBy: { createdAt: "desc" },
        take: 10,
        select: { role: true, content: true },
      })
    : [];
  const history = past
    .reverse()
    .filter((m): m is { role: "user" | "assistant"; content: string } => m.role === "user" || m.role === "assistant");
  // The model needs strictly alternating turns starting with the user.
  while (history.length && history[0].role !== "user") history.shift();

  const result = await getChatbotReply(businessId, message, history, { channel: "website", customerRef: vid });
  const res = NextResponse.json({ reply: result.reply, failed: !!result.error });
  if (!existing) {
    res.cookies.set(COOKIE, vid, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 60 * 60 * 24 * 180,
    });
  }
  return res;
}
