import crypto from "crypto";
import { prisma } from "@/lib/prisma";
import { peekSubject, signToken, verifyToken } from "@/lib/signed-token";

/**
 * Password reset links: a signed token valid 30 minutes whose purpose includes a fingerprint of the
 * CURRENT password hash — so a link stops working the moment the password changes (single use).
 */

const TTL = 30 * 60;
const purposeFor = (passwordHash: string) => `reset:${crypto.createHash("sha256").update(passwordHash).digest("hex").slice(0, 16)}`;

export async function resetTokenFor(email: string): Promise<{ token: string; email: string } | null> {
  const user = await prisma.user.findUnique({ where: { email: email.trim().toLowerCase() }, select: { id: true, email: true, passwordHash: true } });
  if (!user) return null;
  return { token: signToken(purposeFor(user.passwordHash), user.id, TTL), email: user.email };
}

export async function userForResetToken(token: string): Promise<{ id: string } | null> {
  const id = peekSubject(token);
  if (!id) return null;
  const user = await prisma.user.findUnique({ where: { id }, select: { id: true, passwordHash: true } });
  if (!user) return null;
  return verifyToken(purposeFor(user.passwordHash), token) === user.id ? { id: user.id } : null;
}
