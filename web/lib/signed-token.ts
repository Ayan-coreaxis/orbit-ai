import crypto from "crypto";

/**
 * Signed, expiring tokens for cookies: base64url("<purpose>.<subject>.<expires>.<hmac>").
 * The purpose is part of what's signed, so a shopper's store cookie can never be replayed as a
 * seller session or an admin session, and every token stops working at its expiry.
 */

function secret(): string {
  const s = process.env.AUTH_SECRET;
  if (!s) throw new Error("AUTH_SECRET is not set.");
  return s;
}

const hmac = (v: string) => crypto.createHmac("sha256", secret()).update(v).digest("hex");

export function signToken(purpose: string, subject: string, ttlSeconds: number): string {
  const exp = Math.floor(Date.now() / 1000) + ttlSeconds;
  const body = `${purpose}.${subject}.${exp}`;
  return Buffer.from(`${body}.${hmac(body)}`).toString("base64url");
}

/** The subject, or null if the token is forged, for another purpose, or expired. */
export function verifyToken(purpose: string, token: string | undefined | null): string | null {
  if (!token) return null;
  try {
    const parts = Buffer.from(token, "base64url").toString("utf-8").split(".");
    if (parts.length !== 4) return null;
    const [p, subject, exp, sig] = parts;
    if (p !== purpose || !subject) return null;
    const expected = hmac(`${p}.${subject}.${exp}`);
    const a = Buffer.from(sig);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
    if (!(Number(exp) > Date.now() / 1000)) return null;
    return subject;
  } catch {
    return null;
  }
}

/** Read the subject WITHOUT trusting it — only to look up what the purpose must be, then verifyToken. */
export function peekSubject(token: string | undefined | null): string | null {
  try {
    const parts = Buffer.from(token ?? "", "base64url").toString("utf-8").split(".");
    return parts.length === 4 ? parts[1] || null : null;
  } catch {
    return null;
  }
}

/** Cookies are https-only in production. */
export const secureCookie = () => process.env.NODE_ENV === "production";
