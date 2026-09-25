import { prisma } from "@/lib/prisma";
import { parseSpec } from "@/lib/orbit-backend-spec";

/**
 * Which sign-in methods a storefront accepts. In the v3 model every store has a `login` + `account`
 * core page, so accounts are ON by default and BOTH methods are offered (the shopper picks a code
 * or a password). A store that was already handed off under the old single-mode model keeps whatever
 * Orbit Code classified — `mode: "none"` there genuinely means "no account UI was designed".
 */
export interface AuthMethods {
  otp: boolean;
  password: boolean;
  /** false only for legacy handed-off stores whose design had no sign-in slot at all */
  enabled: boolean;
}

export async function getAuthMethods(businessId: string): Promise<AuthMethods> {
  const d = await prisma.storeDesign.findUnique({ where: { businessId }, select: { backend: true } });
  // v3: every store has core login + account pages, so accounts are always on. A legacy spec can
  // still PIN the store to a single method it was wired for; "none" (no sign-in slot was designed)
  // no longer means "no accounts" — it just falls through to the both-methods default.
  if (!d?.backend) return { otp: true, password: true, enabled: true };

  const mode = parseSpec(d.backend).auth.mode as "otp" | "password" | "none" | "both";
  if (mode === "otp") return { otp: true, password: false, enabled: true };
  if (mode === "password") return { otp: false, password: true, enabled: true };
  return { otp: true, password: true, enabled: true }; // "both" | "none" | anything else
}
