import { prisma } from "@/lib/prisma";

export interface AgentActivity {
  lastRunAt: Date | null;
  callsToday: number;
  callsAllTime: number;
}

export interface RecentActivityItem {
  agentId: string;
  createdAt: Date;
}

/** Real per-agent activity for one business, computed from AgentUsage — no simulated/fake status. */
export async function getRealAgentActivity(
  businessId: string,
): Promise<Record<string, AgentActivity>> {
  const rows = await prisma.agentUsage.findMany({
    where: { businessId },
    select: { agentId: true, createdAt: true },
  });

  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);

  const map: Record<string, AgentActivity> = {};
  for (const row of rows) {
    const existing = map[row.agentId] ?? { lastRunAt: null, callsToday: 0, callsAllTime: 0 };
    existing.callsAllTime += 1;
    if (row.createdAt >= startOfToday) existing.callsToday += 1;
    if (!existing.lastRunAt || row.createdAt > existing.lastRunAt) existing.lastRunAt = row.createdAt;
    map[row.agentId] = existing;
  }
  return map;
}

/** Real, recent agent calls for a business — used for an honest "recent activity" feed, no random generation. */
export async function getRecentAgentActivity(
  businessId: string,
  limit = 8,
): Promise<RecentActivityItem[]> {
  const rows = await prisma.agentUsage.findMany({
    where: { businessId },
    select: { agentId: true, createdAt: true },
    orderBy: { createdAt: "desc" },
    take: limit,
  });
  return rows;
}
