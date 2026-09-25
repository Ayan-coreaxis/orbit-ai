import { cookies } from "next/headers";
import crypto from "crypto";
import { prisma } from "@/lib/prisma";
import { hashPassword, verifyPassword } from "@/lib/auth";
import { sendWhatsAppMessage } from "@/lib/whatsapp";

export { hashPassword, verifyPassword };

/**
 * Storefront customer auth — a signed cookie per store, `sc_<businessId>`. Mirrors the seller-side
 * session in lib/auth.ts (HMAC over the id with AUTH_SECRET, base64url). A customer session is
 * only ever valid for its own business: the cookie name is namespaced and every lookup is
 * `where: { id, businessId }`.
 */

const MAX_AGE = 60 * 60 * 24 * 30; // 30 days
const OTP_TTL_MS = 10 * 60 * 1000;

function secret(): string {
  const s = process.env.AUTH_SECRET;
  if (!s) throw new Error("AUTH_SECRET is not set in .env.local");
  return s;
}
function sign(v: string): string {
  return crypto.createHmac("sha256", secret()).update(v).digest("hex");
}
function makeToken(customerId: string): string {
  return Buffer.from(`${customerId}.${sign(customerId)}`).toString("base64url");
}
function readToken(token: string): string | null {
  try {
    const [id, sig] = Buffer.from(token, "base64url").toString("utf-8").split(".");
    if (!id || !sig) return null;
    const expected = sign(id);
    const a = Buffer.from(sig);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
    return id;
  } catch {
    return null;
  }
}

const cookieName = (businessId: string) => `sc_${businessId}`;

export async function setCustomerCookie(businessId: string, customerId: string): Promise<void> {
  const store = await cookies();
  store.set(cookieName(businessId), makeToken(customerId), {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: MAX_AGE,
  });
}

export async function clearCustomerCookie(businessId: string): Promise<void> {
  const store = await cookies();
  store.delete(cookieName(businessId));
}

export interface StoreCustomerSession {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
}

/** The verified signed-in customer for THIS store, or null. Never returns a customer of another business. */
export async function getStoreCustomer(businessId: string): Promise<StoreCustomerSession | null> {
  const store = await cookies();
  const token = store.get(cookieName(businessId))?.value;
  if (!token) return null;
  const id = readToken(token);
  if (!id) return null;
  const c = await prisma.storeCustomer.findFirst({
    where: { id, businessId },
    select: { id: true, name: true, email: true, phone: true },
  });
  return c;
}

// --------------------------------------------------------------------------
// OTP
// --------------------------------------------------------------------------

function sixDigits(): string {
  return String(crypto.randomInt(0, 1_000_000)).padStart(6, "0");
}

/**
 * Issues a one-time code for `target` (a phone number or email). Sends it via the store's WhatsApp
 * number when Twilio is connected; otherwise (dev / not connected) returns `devCode` so the flow is
 * still testable. Returns `{ sent, devCode? }`.
 */
export async function issueOtp(
  businessId: string,
  channel: "phone" | "email",
  target: string,
): Promise<{ sent: boolean; devCode?: string; error?: string }> {
  const code = sixDigits();
  await prisma.customerOtp.create({
    data: { businessId, channel, target: target.slice(0, 160), code, expiresAt: new Date(Date.now() + OTP_TTL_MS) },
  });

  if (channel === "phone") {
    const r = await sendWhatsAppMessage(target, `Your verification code is ${code}. It expires in 10 minutes.`);
    if (r.sent) return { sent: true };
    if (process.env.NODE_ENV === "production") return { sent: false, error: r.error };
    console.info(`[store-auth] OTP for ${target} (${businessId}): ${code}`);
    return { sent: false, devCode: code };
  }

  // email OTP: no store-scoped email sender wired yet — dev fallback only
  if (process.env.NODE_ENV === "production") return { sent: false, error: "Email codes aren't available for this store." };
  console.info(`[store-auth] OTP for ${target} (${businessId}): ${code}`);
  return { sent: false, devCode: code };
}

/** True + consumes the row if `code` matches an unexpired, unconsumed OTP for `target`. */
export async function consumeOtp(businessId: string, target: string, code: string): Promise<boolean> {
  const row = await prisma.customerOtp.findFirst({
    where: { businessId, target: target.slice(0, 160), code: code.trim(), consumedAt: null, expiresAt: { gt: new Date() } },
    orderBy: { createdAt: "desc" },
  });
  if (!row) return false;
  await prisma.customerOtp.update({ where: { id: row.id }, data: { consumedAt: new Date() } });
  return true;
}
