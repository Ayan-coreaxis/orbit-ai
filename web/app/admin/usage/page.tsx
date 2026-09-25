import { Topbar } from "@/components/Topbar";
import { Card, SectionLabel } from "@/components/ui";
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
  "web-search": "Web Search (Brave)",
};

function fmtCost(n: number) {
  return `$${n.toFixed(4)}`;
}

export default async function UsagePage() {
  const [usageRows, businesses] = await Promise.all([
    prisma.agentUsage.findMany({
      select: { businessId: true, agentId: true, model: true, inputTokens: true, outputTokens: true, costUsd: true, createdAt: true },
    }),
    prisma.business.findMany({ select: { id: true, name: true, niche: true } }),
  ]);

  const businessById = new Map(businesses.map((b) => [b.id, b]));

  type BizTotals = {
    id: string;
    name: string;
    niche: string;
    calls: number;
    inputTokens: number;
    outputTokens: number;
    costUsd: number;
    lastActivity: Date | null;
  };
  const byBusiness = new Map<string, BizTotals>();
  const byAgent = new Map<string, { calls: number; inputTokens: number; outputTokens: number; costUsd: number }>();

  let totalCost = 0;
  let totalInput = 0;
  let totalOutput = 0;

  for (const row of usageRows) {
    totalCost += row.costUsd;
    totalInput += row.inputTokens;
    totalOutput += row.outputTokens;

    const biz = businessById.get(row.businessId);
    const key = row.businessId;
    const existing = byBusiness.get(key) ?? {
      id: key,
      name: biz?.name ?? "(deleted business)",
      niche: biz?.niche ?? "",
      calls: 0,
      inputTokens: 0,
      outputTokens: 0,
      costUsd: 0,
      lastActivity: null,
    };
    existing.calls += 1;
    existing.inputTokens += row.inputTokens;
    existing.outputTokens += row.outputTokens;
    existing.costUsd += row.costUsd;
    if (!existing.lastActivity || row.createdAt > existing.lastActivity) existing.lastActivity = row.createdAt;
    byBusiness.set(key, existing);

    const agentExisting = byAgent.get(row.agentId) ?? { calls: 0, inputTokens: 0, outputTokens: 0, costUsd: 0 };
    agentExisting.calls += 1;
    agentExisting.inputTokens += row.inputTokens;
    agentExisting.outputTokens += row.outputTokens;
    agentExisting.costUsd += row.costUsd;
    byAgent.set(row.agentId, agentExisting);
  }

  const businessRows = Array.from(byBusiness.values()).sort((a, b) => b.costUsd - a.costUsd);
  const agentRows = Array.from(byAgent.entries())
    .map(([agentId, v]) => ({ agentId, label: AGENT_LABELS[agentId] ?? agentId, ...v }))
    .sort((a, b) => b.costUsd - a.costUsd);

  return (
    <div>
      <Topbar
        title="AI Usage & Cost"
        subtitle="Real Anthropic API spend, per business — computed from actual token usage, not estimated"
      />
      <div className="max-w-[1300px] space-y-6 p-10">
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-3">
          <Card className="p-6">
            <div className="text-[12.5px] font-medium text-text-faint">Total real spend (all time)</div>
            <div className="mt-2 text-2xl font-semibold">{fmtCost(totalCost)}</div>
          </Card>
          <Card className="p-6">
            <div className="text-[12.5px] font-medium text-text-faint">Total tokens used</div>
            <div className="mt-2 text-2xl font-semibold">{(totalInput + totalOutput).toLocaleString()}</div>
            <div className="mt-1 text-[12.5px] text-text-dim">
              {totalInput.toLocaleString()} in · {totalOutput.toLocaleString()} out
            </div>
          </Card>
          <Card className="p-6">
            <div className="text-[12.5px] font-medium text-text-faint">Businesses with usage</div>
            <div className="mt-2 text-2xl font-semibold">{businessRows.length}</div>
          </Card>
        </div>

        <SectionLabel>Spend by business — every real user, real cost</SectionLabel>
        <Card className="overflow-hidden">
          {businessRows.length === 0 ? (
            <p className="p-6 text-[13.5px] text-text-faint">
              No AI usage recorded yet — this fills in as real businesses run their weekly cycle or use the Orchestrator chat.
            </p>
          ) : (
            <table className="w-full text-[14px]">
              <thead>
                <tr className="border-b border-border bg-panel-2/60 text-left text-[12.5px] font-medium text-text-faint">
                  <th className="px-6 py-3.5 font-medium">Business</th>
                  <th className="px-6 py-3.5 font-medium">Calls</th>
                  <th className="px-6 py-3.5 font-medium">Input tokens</th>
                  <th className="px-6 py-3.5 font-medium">Output tokens</th>
                  <th className="px-6 py-3.5 font-medium">Real cost</th>
                  <th className="px-6 py-3.5 font-medium">Last activity</th>
                </tr>
              </thead>
              <tbody>
                {businessRows.map((b) => (
                  <tr key={b.id} className="border-b border-border last:border-0">
                    <td className="px-6 py-4">
                      <div className="font-medium">{b.name || "(unnamed)"}</div>
                      <div className="text-[12px] text-text-faint">{b.niche}</div>
                    </td>
                    <td className="px-6 py-4 text-text-dim">{b.calls.toLocaleString()}</td>
                    <td className="px-6 py-4 text-text-dim">{b.inputTokens.toLocaleString()}</td>
                    <td className="px-6 py-4 text-text-dim">{b.outputTokens.toLocaleString()}</td>
                    <td className="px-6 py-4 font-medium">{fmtCost(b.costUsd)}</td>
                    <td className="px-6 py-4 text-text-dim">
                      {b.lastActivity ? b.lastActivity.toLocaleString() : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>

        <SectionLabel>Spend by agent — which agent costs the most, across every business</SectionLabel>
        <Card className="overflow-hidden">
          {agentRows.length === 0 ? (
            <p className="p-6 text-[13.5px] text-text-faint">No agent calls logged yet.</p>
          ) : (
            <table className="w-full text-[14px]">
              <thead>
                <tr className="border-b border-border bg-panel-2/60 text-left text-[12.5px] font-medium text-text-faint">
                  <th className="px-6 py-3.5 font-medium">Agent</th>
                  <th className="px-6 py-3.5 font-medium">Calls</th>
                  <th className="px-6 py-3.5 font-medium">Total tokens</th>
                  <th className="px-6 py-3.5 font-medium">Real cost</th>
                  <th className="px-6 py-3.5 font-medium">Avg. cost / call</th>
                </tr>
              </thead>
              <tbody>
                {agentRows.map((a) => (
                  <tr key={a.agentId} className="border-b border-border last:border-0">
                    <td className="px-6 py-4 font-medium">{a.label}</td>
                    <td className="px-6 py-4 text-text-dim">{a.calls.toLocaleString()}</td>
                    <td className="px-6 py-4 text-text-dim">
                      {(a.inputTokens + a.outputTokens).toLocaleString()}
                    </td>
                    <td className="px-6 py-4 font-medium">{fmtCost(a.costUsd)}</td>
                    <td className="px-6 py-4 text-text-dim">{fmtCost(a.costUsd / a.calls)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>

        <Card className="p-6">
          <p className="text-[12.5px] leading-relaxed text-text-dim">
            Every row here comes from the real <code>AgentUsage</code> table — logged on every actual
            Anthropic API call (weekly intelligence cycle and Orchestrator chat), with the real token
            counts and cost computed from Anthropic&apos;s published per-model pricing. Nothing on this
            page is estimated or seeded.
          </p>
        </Card>
      </div>
    </div>
  );
}
