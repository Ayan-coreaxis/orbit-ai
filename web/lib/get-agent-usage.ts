import { prisma } from "@/lib/prisma";
import { getActiveBusinessId } from "@/lib/get-active-business-id";

export interface AgentUsageSummary {
  totalCostUsd: number;
  totalCalls: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  lastRunAt: Date | null;
}

export async function getAgentUsage(agentId: string): Promise<AgentUsageSummary | null> {
  const businessId = await getActiveBusinessId();
  if (!businessId) return null;

  const rows = await prisma.agentUsage.findMany({
    where: { businessId, agentId },
    orderBy: { createdAt: "desc" },
  });

  return {
    totalCostUsd: rows.reduce((sum, r) => sum + r.costUsd, 0),
    totalCalls: rows.length,
    totalInputTokens: rows.reduce((sum, r) => sum + r.inputTokens, 0),
    totalOutputTokens: rows.reduce((sum, r) => sum + r.outputTokens, 0),
    lastRunAt: rows[0]?.createdAt ?? null,
  };
}
