import { prisma } from "@/lib/prisma";

export interface TeamMember {
  id: string;
  email: string;
  role: string;
  accepted: boolean;
  invitedAt: string;
}

export async function listMembers(businessId: string): Promise<TeamMember[]> {
  const rows = await prisma.businessMember.findMany({ where: { businessId }, orderBy: { invitedAt: "asc" } });
  return rows.map((r) => ({ id: r.id, email: r.email, role: r.role, accepted: !!r.acceptedAt, invitedAt: r.invitedAt.toISOString() }));
}

/** Owner invites a teammate by email. If that email already has a real account, access is
 *  instant; otherwise it links automatically the moment someone signs up with that exact email
 *  (see `linkPendingInvites`, called from the signup route). */
export async function inviteMember(businessId: string, rawEmail: string, role: "staff" | "admin"): Promise<void> {
  const email = rawEmail.trim().toLowerCase();
  if (!email || !email.includes("@")) throw new Error("Enter a valid email.");

  const business = await prisma.business.findUnique({ where: { id: businessId }, select: { owner: { select: { email: true } } } });
  if (business?.owner?.email === email) throw new Error("That's already the account owner.");

  const existingMember = await prisma.businessMember.findUnique({ where: { businessId_email: { businessId, email } } });
  if (existingMember) throw new Error("Already invited.");

  const user = await prisma.user.findUnique({ where: { email } });
  await prisma.businessMember.create({
    data: { businessId, email, role, userId: user?.id ?? null, acceptedAt: user ? new Date() : null },
  });
}

export async function removeMember(businessId: string, memberId: string): Promise<void> {
  await prisma.businessMember.deleteMany({ where: { id: memberId, businessId } });
}

/** Called right after a new account is created — auto-accepts any pending team invite sitting
 *  under this exact email, on every business that invited it. */
export async function linkPendingInvites(userId: string, email: string): Promise<void> {
  await prisma.businessMember.updateMany({
    where: { email: email.toLowerCase(), userId: null },
    data: { userId, acceptedAt: new Date() },
  });
}

/** Every business (by id) this user has accepted dashboard access to as a team member — most
 *  recently invited first. Does NOT include businesses they own (that's `ownerId` elsewhere). */
export async function getMemberBusinessIds(userId: string): Promise<string[]> {
  const rows = await prisma.businessMember.findMany({
    where: { userId, acceptedAt: { not: null } },
    orderBy: { invitedAt: "desc" },
    select: { businessId: true },
  });
  return rows.map((r) => r.businessId);
}
