import { NextRequest, NextResponse } from "next/server";
import { throttle } from "@/lib/guard";
import { getCurrentUser } from "@/lib/auth";
import { sendVerifyEmail, isEmailVerified } from "@/lib/email-verify";

/** POST — send the signed-in owner a fresh "confirm your email" link. */
export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Log in first." }, { status: 401 });
  const limited = await throttle(req, "verify-email", 5, 3600_000, user.id);
  if (limited) return limited;
  if (await isEmailVerified(user.id)) return NextResponse.json({ ok: true, alreadyVerified: true });
  const r = await sendVerifyEmail(user);
  if (!r.sent && !r.devLink) return NextResponse.json({ error: "Couldn't send the email right now — try again in a bit." }, { status: 502 });
  return NextResponse.json({ ok: true, ...(r.devLink ? { devLink: r.devLink } : {}) });
}
