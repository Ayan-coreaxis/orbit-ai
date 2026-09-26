import { NextRequest, NextResponse, after } from "next/server";
import { handleMetaWebhook, validMetaSignature, type MetaWebhookBody } from "@/lib/meta-messaging";
import { bestEffort } from "@/lib/log";

/** Meta's one-time check when the webhook is saved in the app dashboard. */
export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams;
  const token = process.env.META_WEBHOOK_VERIFY_TOKEN?.trim();
  if (q.get("hub.mode") === "subscribe" && token && q.get("hub.verify_token") === token) {
    return new NextResponse(q.get("hub.challenge") ?? "", { headers: { "Content-Type": "text/plain" } });
  }
  return new NextResponse("Forbidden", { status: 403 });
}

/** Messenger / Instagram DMs. Signed by Meta; answered after the 200 so Meta doesn't retry. */
export async function POST(req: NextRequest) {
  const raw = await req.text();
  if (!validMetaSignature(raw, req.headers.get("x-hub-signature-256"))) return new NextResponse("Invalid signature", { status: 403 });
  let body: MetaWebhookBody;
  try {
    body = JSON.parse(raw) as MetaWebhookBody;
  } catch {
    return new NextResponse("Bad JSON", { status: 400 });
  }
  after(() => bestEffort("meta.webhook", () => handleMetaWebhook(body)));
  return NextResponse.json({ ok: true });
}
