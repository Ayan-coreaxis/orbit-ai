import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { setSessionCookie } from "@/lib/auth";

/**
 * DEV ONLY. Logs the browser in as a given user + points it at a business, without going through
 * the signup/onboarding flow. Refuses to run in production. Used for local end-to-end testing.
 */
export async function GET(req: NextRequest) {
  if (process.env.NODE_ENV === "production") return NextResponse.json({ error: "disabled" }, { status: 403 });

  const url = new URL(req.url);
  const userId = url.searchParams.get("userId");
  const businessId = url.searchParams.get("businessId");
  if (!userId) return NextResponse.json({ error: "userId required" }, { status: 400 });

  const user = await prisma.user.findUnique({ where: { id: userId }, select: { id: true, email: true } });
  if (!user) return NextResponse.json({ error: "user not found" }, { status: 404 });

  await setSessionCookie(user.id);
  const res = NextResponse.json({ ok: true, user, businessId });
  if (businessId) res.cookies.set("businessId", businessId, { httpOnly: true, sameSite: "lax", path: "/" });
  return res;
}
