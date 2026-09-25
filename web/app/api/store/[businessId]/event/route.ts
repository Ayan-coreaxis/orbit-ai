import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import crypto from "crypto";
import { recordEvent, isEventType } from "@/lib/store-analytics";
import { rateLimit } from "@/lib/rate-limit";

/**
 * Storefront analytics ingest. The page beacons `{ type, productId?, referrer? }` here; we tie it
 * to an anonymous, http-only `sc_sess` cookie (one per browser, not per account). Enum-restricted
 * and rate-limited so it can't be used to flood the table.
 */

const SESS_COOKIE = "sc_sess";
const SESS_MAX_AGE = 60 * 60 * 24 * 365;

/** document.referrer host, but only when it's a real external source (not this store, not junk). */
function externalHost(raw: unknown, selfHost: string | null): string | null {
  if (typeof raw !== "string" || !raw) return null;
  try {
    const h = new URL(raw).host.toLowerCase();
    if (!h || h === selfHost) return null;
    return h.slice(0, 120);
  } catch {
    return null;
  }
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ businessId: string }> }) {
  const { businessId } = await params;

  const store = await cookies();
  let sess = store.get(SESS_COOKIE)?.value;
  if (!sess || sess.length < 8 || sess.length > 64) {
    sess = crypto.randomUUID();
    store.set(SESS_COOKIE, sess, { httpOnly: true, sameSite: "lax", path: "/", maxAge: SESS_MAX_AGE });
  }

  if (await rateLimit(`ev:${businessId}:${sess}`, 60, 60_000)) return NextResponse.json({ ok: false }, { status: 429 });

  const body = (await req.json().catch(() => ({}))) as { type?: string; productId?: string; referrer?: string };
  if (!isEventType(body.type)) return NextResponse.json({ ok: false, error: "bad type" }, { status: 400 });

  const selfHost = (() => {
    try {
      return new URL(req.url).host.toLowerCase();
    } catch {
      return null;
    }
  })();

  await recordEvent(businessId, sess, body.type, {
    productId: body.productId,
    referrer: externalHost(body.referrer, selfHost),
  });

  return NextResponse.json({ ok: true });
}
