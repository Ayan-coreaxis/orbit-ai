import { prisma } from "@/lib/prisma";
import { getActiveBusinessId } from "@/lib/get-active-business-id";
import { latestCompetitors, type CompetitorAnalysisItem } from "@/lib/competitor-intel";

/**
 * The signed-in seller's active business — what every dashboard page needs to know first.
 * (The old weekly "focus / tasks" plan is gone; the growth plan lives in Strategy Lab.)
 */
export interface BusinessSummary {
  businessId: string;
  businessName: string;
  competitors: CompetitorAnalysisItem[];
  competitorsScannedAt: Date | null;
  /** a drafted growth plan is waiting to be discussed */
  planWaiting: boolean;
}

export async function getBusinessSummary(): Promise<BusinessSummary | null> {
  const businessId = await getActiveBusinessId();
  if (!businessId) return null;
  const business = await prisma.business.findUnique({ where: { id: businessId }, select: { id: true, name: true } });
  if (!business) return null;
  const [{ competitors, scannedAt }, draft] = await Promise.all([
    latestCompetitors(business.id),
    prisma.growthPlan.findFirst({ where: { businessId: business.id, status: "draft" }, select: { id: true } }),
  ]);
  return { businessId: business.id, businessName: business.name, competitors, competitorsScannedAt: scannedAt, planWaiting: !!draft };
}
