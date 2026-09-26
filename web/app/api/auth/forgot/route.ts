import { NextResponse } from "next/server";
import { throttle } from "@/lib/guard";
import { resetTokenFor } from "@/lib/password-reset";
import { sendEmail } from "@/lib/email";
import { appBaseUrl } from "@/lib/public-url";

/** { email } — emails a reset link. Always answers the same way, so it can't reveal who has an account. */
export async function POST(req: Request) {
  const { email } = (await req.json().catch(() => ({}))) as { email?: string };
  const clean = (email ?? "").trim().toLowerCase().slice(0, 160);
  const limited = await throttle(req, "forgot", 5, 3600_000, clean);
  if (limited) return limited;
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(clean)) return NextResponse.json({ error: "Enter the email you signed up with." }, { status: 400 });

  const t = await resetTokenFor(clean);
  let devLink: string | undefined;
  if (t) {
    const link = `${appBaseUrl()}/reset-password?token=${encodeURIComponent(t.token)}`;
    const r = await sendEmail(
      t.email,
      "Reset your Orbit password",
      `Someone (hopefully you) asked to reset your Orbit password.\n\nSet a new one here (the link works for 30 minutes, once):\n${link}\n\nIf it wasn't you, ignore this email — your password stays the same.`,
      `<div style="font-family:system-ui,sans-serif;font-size:15px;color:#222;line-height:1.6"><p>Someone (hopefully you) asked to reset your Orbit password.</p><p><a href="${link}" style="display:inline-block;background:#a21caf;color:#fff;padding:10px 18px;border-radius:10px;text-decoration:none;font-weight:600">Set a new password</a></p><p style="color:#666">The link works for 30 minutes, once. If it wasn't you, ignore this email.</p></div>`,
    );
    if (!r.sent && process.env.NODE_ENV !== "production") devLink = link;
  }
  return NextResponse.json({ ok: true, ...(devLink ? { devLink } : {}) });
}
