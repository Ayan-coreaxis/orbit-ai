import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";

/**
 * The business the current browser session is pointed at, verified to actually belong to the
 * logged-in user. Returns null (never someone else's data) if: not logged in, no active business
 * cookie, or the cookie points at a business this user doesn't own.
 */
export async function getActiveBusinessId(): Promise<string | null> {
  const cookieStore = await cookies();
  const businessId = cookieStore.get("businessId")?.value;
  if (!businessId) return null;

  const user = await getCurrentUser();
  if (!user) return null;

  const business = await prisma.business.findUnique({
    where: { id: businessId },
    select: { ownerId: true },
  });
  if (!business) return null;
  if (business.ownerId === user.id) return businessId;

  const member = await prisma.businessMember.findFirst({
    where: { businessId, userId: user.id, acceptedAt: { not: null } },
    select: { id: true },
  });
  if (member) return businessId;

  return null;
}
