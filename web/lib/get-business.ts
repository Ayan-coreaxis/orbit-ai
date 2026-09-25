import { prisma } from "@/lib/prisma";
import { getActiveBusinessId } from "@/lib/get-active-business-id";

export interface RealPlan {
  isReal: true;
  businessId: string;
  businessName: string;
  reportId: string;
  focusProduct: string;
  theme: string;
  reviewNote?: string;
  wantsToDiscuss: boolean;
  discussReason?: string;
  lastSeenReportId: string | null;
  targets: { label: string; value: string; progress: number }[];
  tasks: { agent: string; task: string; done: boolean }[];
  qaNote?: string;
  whatsappNotified: boolean;
  whatsappError?: string;
  competitors: {
    name: string;
    url: string;
    topProduct?: string;
    pricing?: string;
    trending: string;
    whyTrending?: string;
    adActivity?: string;
    gap: string;
  }[];
}

export async function getRealPlan(): Promise<RealPlan | null> {
  const businessId = await getActiveBusinessId();
  if (!businessId) return null;

  const business = await prisma.business.findUnique({
    where: { id: businessId },
    include: {
      reports: { orderBy: { createdAt: "desc" }, take: 1 },
    },
  });
  if (!business || business.reports.length === 0) return null;

  try {
    const content = JSON.parse(business.reports[0].content);
    return {
      isReal: true,
      businessId: business.id,
      businessName: business.name,
      reportId: business.reports[0].id,
      focusProduct: content.focusProduct ?? business.niche,
      theme: content.theme ?? "",
      reviewNote: content.reviewNote,
      wantsToDiscuss: content.wantsToDiscuss === true,
      discussReason: content.discussReason,
      lastSeenReportId: business.lastSeenReportId,
      targets: content.targets ?? [],
      tasks: content.tasks ?? [],
      qaNote: content.qaNote,
      whatsappNotified: content.whatsappNotified ?? false,
      whatsappError: content.whatsappError,
      competitors: content.competitors ?? [],
    };
  } catch {
    return null;
  }
}
