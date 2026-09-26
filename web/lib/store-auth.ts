import { cookies } from "next/headers";
import crypto from "crypto";
import { prisma } from "@/lib/prisma";
import { hashPassword, verifyPassword } from "@/lib/auth";
import { sendWhatsAppMessage } from "@/lib/whatsapp";
import { sendEmail } from "@/lib/email";

export { hashPassword, verifyPassword };

/**
 * Storefront customer auth — a signed cookie per store, `sc_<businessId>`. Mirrors the seller-side
 * session in lib/auth.ts (HMAC over the id with AUTH_SECRET, base64url). A customer session is
 * only ever valid for its own business: the cookie name is namespaced and every lookup is
 * `where: { id, businessId }`.
 */

const MAX_AGE = 60 * 60 * 24 * 30; // 30 days
const OTP_TTL_MS = 10 * 60 * 1000;
const OTP_MAX_PER_HOUR = 5; // per phone / email — stops code spam (every WhatsApp / email costs money)
const OTP_MIN_GAP_MS = 45 * 1000;
const OTP_MAX_ATTEMPTS = 5; // wrong guesses before a code stops working

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
 * Issues a one-time code for `target` (a phone number or email) — by WhatsApp or by email (sent in
 * the store's name). Rate-limited per target. When the channel isn't connected, dev mode returns
 * `devCode` so the flow is still testable; production returns an honest error.
 */
export async function issueOtp(
  businessId: string,
  channel: "phone" | "email",
  target: string,
): Promise<{ sent: boolean; devCode?: string; error?: string }> {
  const t = target.slice(0, 160);
  const recent = await prisma.customerOtp.findMany({
    where: { businessId, target: t, createdAt: { gt: new Date(Date.now() - 3600_000) } },
    orderBy: { createdAt: "desc" },
    select: { createdAt: true },
  });
  if (recent.length >= OTP_MAX_PER_HOUR) return { sent: false, error: "Too many codes asked for — please try again in an hour." };
  if (recent[0] && Date.now() - recent[0].createdAt.getTime() < OTP_MIN_GAP_MS) return { sent: false, error: "Please wait a moment before asking for another code." };

  const code = sixDigits();
  await prisma.customerOtp.create({
    data: { businessId, channel, target: target.slice(0, 160), code, expiresAt: new Date(Date.now() + OTP_TTL_MS) },
  });

  if (channel === "phone") {
    const r = await sendWhatsAppMessage(target, `Your verification code is ${code}. It expires in 10 minutes.`, {
      template: { kind: "otp", vars: [code] },
    });
    if (r.sent) return { sent: true };
    if (process.env.NODE_ENV === "production") return { sent: false, error: r.error };
    console.info(`[store-auth] OTP for ${target} (${businessId}): ${code}`);
    return { sent: false, devCode: code };
  }

  const store = await prisma.business.findUnique({ where: { id: businessId }, select: { name: true } });
  const storeName = store?.name ?? "the store";
  const r = await sendEmail(
    target,
    `${code} is your ${storeName} code`,
    `Your code for ${storeName} is ${code}.\nIt expires in 10 minutes. If you didn't ask for it, you can ignore this email.`,
    `<div style="font-family:system-ui,sans-serif;font-size:15px;color:#222"><p>Your code for <b>${escapeHtml(storeName)}</b> is</p><p style="font-size:28px;font-weight:700;letter-spacing:4px">${code}</p><p style="color:#666">It expires in 10 minutes. If you didn't ask for it, you can ignore this email.</p></div>`,
    { fromName: storeName },
  );
  if (r.sent) return { sent: true };
  if (process.env.NODE_ENV === "production") return { sent: false, error: r.error ?? "Couldn't send the email." };
  console.info(`[store-auth] OTP for ${target} (${businessId}): ${code}`);
  return { sent: false, devCode: code };
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

/**
 * True + consumes the code if it matches the newest live code for `target`. Each wrong guess counts;
 * after 5 the code stops working, so a 6-digit code can't be guessed by trying them all.
 */
export async function consumeOtp(businessId: string, target: string, code: string): Promise<boolean> {
  const row = await prisma.customerOtp.findFirst({
    where: { businessId, target: target.slice(0, 160), consumedAt: null, expiresAt: { gt: new Date() } },
    orderBy: { createdAt: "desc" },
  });
  if (!row || row.attempts >= OTP_MAX_ATTEMPTS) return false;
  const a = Buffer.from(row.code);
  const b = Buffer.from(code.trim());
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    await prisma.customerOtp.update({ where: { id: row.id }, data: { attempts: { increment: 1 } } });
    return false;
  }
  await prisma.customerOtp.update({ where: { id: row.id }, data: { consumedAt: new Date() } });
  return true;
}
