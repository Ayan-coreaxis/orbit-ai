import { prisma } from "@/lib/prisma";
import { sendEmail } from "@/lib/email";
import { signToken, verifyToken } from "@/lib/signed-token";
import { appBaseUrl } from "@/lib/public-url";

const PURPOSE = "verify-email";
const TTL = 3 * 24 * 3600; // 3 days

/** Email the owner a link that confirms their address. Returns the link in dev when email isn't set up. */
export async function sendVerifyEmail(user: { id: string; email: string }): Promise<{ sent: boolean; devLink?: string }> {
  const link = `${appBaseUrl()}/verify-email?token=${encodeURIComponent(signToken(PURPOSE, user.id, TTL))}`;
  const r = await sendEmail(
    user.email,
    "Confirm your email for Orbit",
    `Welcome to Orbit!\n\nConfirm your email so we can reach you about orders, billing and your account:\n${link}\n\nThe link works for 3 days.`,
    `<div style="font-family:system-ui,sans-serif;font-size:15px;color:#18261e;line-height:1.6;background:#ece4d6;padding:28px"><div style="max-width:480px;margin:0 auto;background:#fbf8f2;border-radius:22px;padding:28px"><p style="font-size:20px;font-weight:600;margin:0 0 8px">Welcome to Orbit</p><p>Confirm your email so we can reach you about orders, billing and your account.</p><p><a href="${link}" style="display:inline-block;background:#1f4a37;color:#fbf8f2;padding:12px 22px;border-radius:999px;text-decoration:none;font-weight:600">Confirm my email</a></p><p style="color:#6b7569;font-size:13px">The link works for 3 days. If you didn't sign up, ignore this email.</p></div></div>`,
  );
  return { sent: r.sent, ...(!r.sent && process.env.NODE_ENV !== "production" ? { devLink: link } : {}) };
}

/** Confirm a link. Returns true when the account is (now) verified. */
export async function confirmVerifyToken(token: string | null | undefined): Promise<boolean> {
  const userId = verifyToken(PURPOSE, token);
  if (!userId) return false;
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { emailVerifiedAt: true } });
  if (!user) return false;
  if (!user.emailVerifiedAt) await prisma.user.update({ where: { id: userId }, data: { emailVerifiedAt: new Date() } });
  return true;
}

export async function isEmailVerified(userId: string): Promise<boolean> {
  const u = await prisma.user.findUnique({ where: { id: userId }, select: { emailVerifiedAt: true } });
  return !!u?.emailVerifiedAt;
}
