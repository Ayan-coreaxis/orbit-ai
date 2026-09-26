import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { throttle } from "@/lib/guard";
import { hashPassword, setSessionCookie } from "@/lib/auth";
import { userForResetToken } from "@/lib/password-reset";

/** { token, password } — sets the new password and signs the user in. */
export async function POST(req: Request) {
  const limited = await throttle(req, "reset", 10, 3600_000);
  if (limited) return limited;
  const { token, password } = (await req.json().catch(() => ({}))) as { token?: string; password?: string };
  if (!password || password.length < 8) return NextResponse.json({ error: "Use at least 8 characters." }, { status: 400 });
  const user = token ? await userForResetToken(token) : null;
  if (!user) return NextResponse.json({ error: "This link has expired or was already used — ask for a new one." }, { status: 400 });
  await prisma.user.update({ where: { id: user.id }, data: { passwordHash: await hashPassword(password) } });
  await setSessionCookie(user.id);
  return NextResponse.json({ ok: true });
}
