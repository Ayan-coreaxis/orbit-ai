import { throttle } from "@/lib/guard";
import { overLimit, rateLimit } from "@/lib/rate-limit";
import { secureCookie } from "@/lib/signed-token";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyPassword, setSessionCookie } from "@/lib/auth";
import { getMemberBusinessIds } from "@/lib/team";

export async function POST(req: NextRequest) {
  // Per IP: generous (a shop's staff often share one office IP). Per account: 10 WRONG passwords
  // in 15 minutes locks that account's login for the rest of the window — successful logins
  // don't count, so a seller who logs in often is never locked out.
  const limited = await throttle(req, "login", 60, 900000);
  if (limited) return limited;
  const { email, password } = (await req.json()) as { email?: string; password?: string };

  if (!email?.trim() || !password) {
    return NextResponse.json({ error: "Email and password are required." }, { status: 400 });
  }

  const normalizedEmail = email.trim().toLowerCase();
  const failKey = `login-fail:${normalizedEmail.slice(0, 120)}`;
  if (await overLimit(failKey, 10, 900000))
    return NextResponse.json({ error: "Too many wrong passwords — wait 15 minutes or reset your password." }, { status: 429 });
  const user = await prisma.user.findUnique({ where: { email: normalizedEmail } });
  if (!user || !(await verifyPassword(password, user.passwordHash))) {
    await rateLimit(failKey, 10, 900000);
    return NextResponse.json({ error: "Incorrect email or password." }, { status: 401 });
  }

  await setSessionCookie(user.id);

  // Real bug fix: login only ever set the auth session, never restored which business this
  // returning user was working on — every fresh login silently lost their business context
  // (dashboard pages read `businessId` from its own cookie, not derived from the session).
  // Restore it to their most recently created OWNED business; if they don't own one but have
  // accepted team access to someone else's (a staff account), use that instead.
  const business = await prisma.business.findFirst({
    where: { ownerId: user.id },
    orderBy: { createdAt: "desc" },
    select: { id: true },
  });
  const restoredBusinessId = business?.id ?? (await getMemberBusinessIds(user.id))[0];

  const response = NextResponse.json({ id: user.id, email: user.email, hasBusiness: !!restoredBusinessId });
  if (restoredBusinessId) {
    response.cookies.set("businessId", restoredBusinessId, { httpOnly: true, secure: secureCookie(), sameSite: "lax", path: "/" });
  }
  return response;
}
