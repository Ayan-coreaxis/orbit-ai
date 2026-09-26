import { NextResponse } from "next/server";
import { rateLimit } from "@/lib/rate-limit";

/**
 * The caller's IP. Vercel sets x-real-ip / x-vercel-forwarded-for itself (they can't be forged);
 * behind another proxy the LAST x-forwarded-for entry is the one our proxy added — earlier entries
 * are whatever the client sent.
 */
export function clientIp(req: Request): string {
  const h = req.headers;
  const trusted = h.get("x-vercel-forwarded-for") || h.get("x-real-ip");
  if (trusted) return trusted.split(",")[0].trim();
  const xff = (h.get("x-forwarded-for") ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  return xff[xff.length - 1] || "unknown";
}

/**
 * Throttle a public endpoint: returns a 429 response when `name` has been hit more than `limit`
 * times in `windowMs` by this IP (and, if given, this extra key such as an email), else null.
 */
export async function throttle(req: Request, name: string, limit: number, windowMs: number, extra?: string): Promise<NextResponse | null> {
  const keys = [`${name}:ip:${clientIp(req)}`];
  if (extra) keys.push(`${name}:k:${extra.toLowerCase().slice(0, 120)}`);
  for (const k of keys) {
    if (await rateLimit(k, limit, windowMs)) {
      return NextResponse.json({ error: "Too many tries — please wait a few minutes and try again." }, { status: 429, headers: { "Retry-After": String(Math.ceil(windowMs / 1000)) } });
    }
  }
  return null;
}

/** Cron endpoints: in production they must carry the CRON_SECRET bearer (Vercel Cron sends it). */
export function cronAllowed(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return process.env.NODE_ENV !== "production";
  return req.headers.get("authorization") === `Bearer ${secret}`;
}
