import { NextResponse } from "next/server";
import { rateLimit } from "@/lib/rate-limit";

/** The caller's IP (first hop of x-forwarded-for on Vercel / behind a proxy). */
export function clientIp(req: Request): string {
  const h = req.headers;
  return (h.get("x-forwarded-for") ?? "").split(",")[0].trim() || h.get("x-real-ip") || "unknown";
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
