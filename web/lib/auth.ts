import { cookies } from "next/headers";
import crypto from "crypto";
import { secureCookie, signToken, verifyToken } from "@/lib/signed-token";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";

const SESSION_COOKIE = "session";
const ADMIN_SESSION_COOKIE = "admin_session";
const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 30; // 30 days
const ADMIN_MAX_AGE_SECONDS = 60 * 60 * 12; // admin sessions end after 12 hours

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 10);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

export async function setSessionCookie(userId: string): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE, signToken("user", userId, SESSION_MAX_AGE_SECONDS), {
    httpOnly: true,
    secure: secureCookie(),
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_MAX_AGE_SECONDS,
  });
}

export async function clearSessionCookie(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete(SESSION_COOKIE);
}

export interface CurrentUser {
  id: string;
  email: string;
}

/** Real, verified current user from a signed session cookie — null if not logged in or the signature doesn't match. */
export async function getCurrentUser(): Promise<CurrentUser | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (!token) return null;

  const userId = verifyToken("user", token);
  if (!userId) return null;

  const user = await prisma.user.findUnique({ where: { id: userId }, select: { id: true, email: true } });
  return user;
}

/** Verifies a submitted admin password against ADMIN_PASSWORD, timing-safe. */
export function verifyAdminPassword(password: string): boolean {
  const expected = process.env.ADMIN_PASSWORD;
  if (!expected) return false;
  // Hash both so the comparison is constant-time even when the lengths differ.
  const a = crypto.createHash("sha256").update(password).digest();
  const b = crypto.createHash("sha256").update(expected).digest();
  return crypto.timingSafeEqual(a, b);
}

export async function setAdminSessionCookie(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.set(ADMIN_SESSION_COOKIE, signToken("admin", "admin", ADMIN_MAX_AGE_SECONDS), {
    httpOnly: true,
    secure: secureCookie(),
    sameSite: "strict",
    path: "/",
    maxAge: ADMIN_MAX_AGE_SECONDS,
  });
}

export async function clearAdminSessionCookie(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete(ADMIN_SESSION_COOKIE);
}

/** Real, verified — true only for a signed admin session token that matches this server's secret. */
export async function isAdminAuthenticated(): Promise<boolean> {
  const cookieStore = await cookies();
  const token = cookieStore.get(ADMIN_SESSION_COOKIE)?.value;
  if (!token) return false;
  return verifyToken("admin", token) === "admin";
}
