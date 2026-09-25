import { Topbar } from "@/components/Topbar";
import { Card } from "@/components/ui";
import { getRealAgentRows } from "@/lib/admin-stats";

export default async function AgentsPage() {
  const rows = await getRealAgentRows();
  const totalCalls = rows.reduce((s, a) => s + a.calls, 0);
  const totalCost = rows.reduce((s, a) => s + a.costUsd, 0);

  return (
    <div>
      <Topbar
        title="Agent Activity"
        subtitle={`${totalCalls.toLocaleString()} real agent calls, all time, across every business · $${totalCost.toFixed(4)} real spend`}
      />
      <div className="max-w-[1300px] space-y-6 p-10">
        <Card className="overflow-hidden">
          {rows.length === 0 ? (
            <p className="p-6 text-[13.5px] text-text-faint">
              No agent calls logged yet — this fills in as real businesses run a weekly cycle or use the
              Orchestrator chat.
            </p>
          ) : (
            <table className="w-full text-[14px]">
              <thead>
                <tr className="border-b border-border bg-panel-2/60 text-left text-[12.5px] font-medium text-text-faint">
                  <th className="px-6 py-3.5 font-medium">Agent</th>
                  <th className="px-6 py-3.5 font-medium">Calls</th>
                  <th className="px-6 py-3.5 font-medium">Total tokens</th>
                  <th className="px-6 py-3.5 font-medium">Real cost</th>
                  <th className="px-6 py-3.5 font-medium">Avg. cost / call</th>
                  <th className="px-6 py-3.5 font-medium">Last ran</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((a) => (
                  <tr key={a.agentId} className="border-b border-border last:border-0">
                    <td className="px-6 py-4 font-medium">{a.label}</td>
                    <td className="px-6 py-4">{a.calls.toLocaleString()}</td>
                    <td className="px-6 py-4 text-text-dim">
                      {(a.inputTokens + a.outputTokens).toLocaleString()}
                    </td>
                    <td className="px-6 py-4 font-medium">${a.costUsd.toFixed(4)}</td>
                    <td className="px-6 py-4 text-text-dim">${(a.costUsd / a.calls).toFixed(4)}</td>
                    <td className="px-6 py-4 text-text-dim">
                      {a.lastRunAt ? a.lastRunAt.toLocaleString() : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>

        <Card className="p-6">
          <p className="text-[13px] leading-relaxed text-text-dim">
            No error-rate or uptime columns — there is no real monitoring system for that yet, so this
            page no longer shows invented percentages. What&apos;s here is exactly what the real{" "}
            <code>AgentUsage</code> table records: real calls, real tokens, real cost.
          </p>
        </Card>
      </div>
    </div>
  );
}
