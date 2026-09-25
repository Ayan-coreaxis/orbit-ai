import { prisma } from "@/lib/prisma";

export interface ActiveExperiment {
  id: string;
  name: string;
  variantAText: string;
  variantBText: string;
}

export async function getActiveExperiment(businessId: string): Promise<ActiveExperiment | null> {
  const exp = await prisma.experiment.findFirst({
    where: { businessId, active: true },
    orderBy: { createdAt: "desc" },
  });
  if (!exp) return null;
  return { id: exp.id, name: exp.name, variantAText: exp.variantAText, variantBText: exp.variantBText };
}

export interface ExperimentResult {
  variant: "A" | "B";
  text: string;
  views: number;
  conversions: number;
  conversionRate: number;
}

export async function getExperimentResults(experimentId: string): Promise<ExperimentResult[]> {
  const exp = await prisma.experiment.findUnique({ where: { id: experimentId } });
  if (!exp) return [];

  const events = await prisma.experimentEvent.findMany({
    where: { experimentId },
    select: { variant: true, type: true, sessionId: true },
  });

  return (["A", "B"] as const).map((variant) => {
    const viewSessions = new Set(events.filter((e) => e.variant === variant && e.type === "view").map((e) => e.sessionId));
    const convertSessions = new Set(events.filter((e) => e.variant === variant && e.type === "convert").map((e) => e.sessionId));
    return {
      variant,
      text: variant === "A" ? exp.variantAText : exp.variantBText,
      views: viewSessions.size,
      conversions: convertSessions.size,
      conversionRate: viewSessions.size > 0 ? convertSessions.size / viewSessions.size : 0,
    };
  });
}
