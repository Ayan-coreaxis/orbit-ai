import { prisma } from "@/lib/prisma";

const AGENT_LABELS: Record<string, string> = {
  competitor: "Competitor Intelligence",
  orchestrator: "Strategy Orchestrator",
  seo: "SEO Agent",
  content: "Content Agent",
  ads: "Ads Agent",
  retention: "Retention Agent",
  qa: "Manager / QA Agent",
  "orchestrator-chat": "Orchestrator Chat",
  inventory: "Inventory & Fulfillment",
  pricing: "Pricing Agent",
  chatbot: "Omnichannel Chatbot",
};

function startOfToday(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

function startOfMonth(): Date {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

/** Every number here is computed from real rows — no seed data, no placeholders. */
export async function getRealPlatformStats() {
  const [businessCount, usageToday, usageThisMonth, allUsage] = await Promise.all([
    prisma.business.count(),
    prisma.agentUsage.aggregate({
      where: { createdAt: { gte: startOfToday() } },
      _count: true,
      _sum: { costUsd: true },
    }),
    prisma.agentUsage.aggregate({
      where: { createdAt: { gte: startOfMonth() } },
      _count: true,
      _sum: { costUsd: true },
    }),
    prisma.agentUsage.aggregate({ _count: true, _sum: { costUsd: true } }),
  ]);

  return {
    businessCount,
    agentRunsToday: usageToday._count,
    costToday: usageToday._sum.costUsd ?? 0,
    agentRunsThisMonth: usageThisMonth._count,
    costThisMonth: usageThisMonth._sum.costUsd ?? 0,
    totalRuns: allUsage._count,
    totalCostAllTime: allUsage._sum.costUsd ?? 0,
  };
}

export interface RealBusinessRow {
  id: string;
  name: string;
  niche: string;
  createdAt: Date;
  ownerEmail: string | null;
  productCount: number;
  orderCount: number;
  revenue: number;
  aiCostAllTime: number;
  aiCostThisMonth: number;
  plan: string;
  monthlyUsageCapUsd: number | null;
  wantsToDiscuss: boolean;
  whatsappError: string | null;
  whatsappInboundNumber: string | null;
  subscriptionStatus: string | null;
}

/** Real business list for the admin panel — no MRR/status columns, because no billing exists yet. */
export async function getRealBusinessRows(): Promise<RealBusinessRow[]> {
  const businesses = await prisma.business.findMany({
    include: {
      owner: { select: { email: true } },
      products: { select: { id: true } },
      orders: { select: { total: true, status: true } },
      agentUsage: { select: { costUsd: true, createdAt: true } },
      reports: { orderBy: { createdAt: "desc" }, take: 1, select: { content: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  const monthStart = startOfMonth();

  return businesses.map((b) => {
    let wantsToDiscuss = false;
    let whatsappError: string | null = null;
    if (b.reports[0]) {
      try {
        const content = JSON.parse(b.reports[0].content);
        wantsToDiscuss = content.wantsToDiscuss === true;
        whatsappError = content.whatsappError ?? null;
      } catch {
        // leave defaults
      }
    }
    return {
      id: b.id,
      name: b.name,
      niche: b.niche,
      createdAt: b.createdAt,
      ownerEmail: b.owner?.email ?? null,
      productCount: b.products.length,
      orderCount: b.orders.length,
      revenue: b.orders.filter((o) => o.status !== "cancelled").reduce((s, o) => s + o.total, 0),
      aiCostAllTime: b.agentUsage.reduce((s, u) => s + u.costUsd, 0),
      aiCostThisMonth: b.agentUsage.filter((u) => u.createdAt >= monthStart).reduce((s, u) => s + u.costUsd, 0),
      plan: b.plan,
      monthlyUsageCapUsd: b.monthlyUsageCapUsd,
      whatsappInboundNumber: b.whatsappInboundNumber,
      subscriptionStatus: b.subscriptionStatus,
      wantsToDiscuss,
      whatsappError,
    };
  });
}

export interface RealAgentRow {
  agentId: string;
  label: string;
  calls: number;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
  lastRunAt: Date | null;
}

/** Real per-agent activity across the whole platform — no fabricated error-rate/uptime, since no monitoring exists yet. */
export async function getRealAgentRows(): Promise<RealAgentRow[]> {
  const rows = await prisma.agentUsage.findMany({
    select: { agentId: true, inputTokens: true, outputTokens: true, costUsd: true, createdAt: true },
  });

  const byAgent = new Map<string, RealAgentRow>();
  for (const row of rows) {
    const existing = byAgent.get(row.agentId) ?? {
      agentId: row.agentId,
      label: AGENT_LABELS[row.agentId] ?? row.agentId,
      calls: 0,
      inputTokens: 0,
      outputTokens: 0,
      costUsd: 0,
      lastRunAt: null as Date | null,
    };
    existing.calls += 1;
    existing.inputTokens += row.inputTokens;
    existing.outputTokens += row.outputTokens;
    existing.costUsd += row.costUsd;
    if (!existing.lastRunAt || row.createdAt > existing.lastRunAt) existing.lastRunAt = row.createdAt;
    byAgent.set(row.agentId, existing);
  }

  return Array.from(byAgent.values()).sort((a, b) => b.costUsd - a.costUsd);
}
