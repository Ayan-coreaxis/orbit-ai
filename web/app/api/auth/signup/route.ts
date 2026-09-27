import { throttle } from "@/lib/guard";
import { secureCookie } from "@/lib/signed-token";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { hashPassword, setSessionCookie } from "@/lib/auth";
import { linkPendingInvites, getMemberBusinessIds } from "@/lib/team";

export async function POST(req: NextRequest) {
  const limited = await throttle(req, "signup", 20, 3600000);
  if (limited) return limited;
  const { email, password } = (await req.json()) as { email?: string; password?: string };

  if (!email?.trim() || !password) {
    return NextResponse.json({ error: "Email and password are required." }, { status: 400 });
  }
  if (password.length < 8) {
    return NextResponse.json({ error: "Password must be at least 8 characters." }, { status: 400 });
  }

  const normalizedEmail = email.trim().toLowerCase();
  const existing = await prisma.user.findUnique({ where: { email: normalizedEmail } });
  if (existing) {
    return NextResponse.json({ error: "An account with that email already exists." }, { status: 409 });
  }

  const passwordHash = await hashPassword(password);
  const user = await prisma.user.create({
    data: { email: normalizedEmail, passwordHash },
  });

  await setSessionCookie(user.id);

  // auto-accept any team invite sitting under this exact email, and land them straight in that
  // business's dashboard if they don't own one of their own yet (a brand-new signup never does)
  await linkPendingInvites(user.id, normalizedEmail);
  const response = NextResponse.json({ id: user.id, email: user.email });
  const memberBusinessIds = await getMemberBusinessIds(user.id);
  if (memberBusinessIds[0]) {
    response.cookies.set("businessId", memberBusinessIds[0], { httpOnly: true, secure: secureCookie(), sameSite: "lax", path: "/" });
  }
  return response;
}
