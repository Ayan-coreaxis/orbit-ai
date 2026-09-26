import { after } from "next/server";
import { attachmentViews } from "@/lib/media";
import { Topbar } from "@/components/Topbar";
import { executeActivePlan } from "@/lib/harness";
import { reviewDueStrategies } from "@/lib/strategy-review";
import { OrchestratorWorkspace } from "@/components/orchestrator/OrchestratorWorkspace";
import { getBusinessSummary } from "@/lib/get-business";
import { prisma } from "@/lib/prisma";
import { loadStrategyLab } from "@/lib/strategy-lab";
import { parseSummary } from "@/lib/strategy-chat";

export const dynamic = "force-dynamic";

/** Milliseconds since `d`, at request time (this is a server component, rendered per request). */
function msSince(d: Date | string): number {
  return Date.now() - new Date(d).getTime();
}

export default async function OrchestratorPage() {
  const real = await getBusinessSummary();

  if (!real) {
    return (
      <div>
        <Topbar title="Talk to your Orchestrator" subtitle="No business yet" />
        <div className="mx-5 sm:mx-8 lg:mx-10 mt-6 rounded-xl border border-border bg-panel-2 px-4 py-3.5 text-[13.5px] text-text-dim">
          Complete onboarding first — the Orchestrator needs your business to talk about.
        </div>
      </div>
    );
  }

  const [messages, lab, business] = await Promise.all([
    prisma.orchestratorMessage.findMany({
      where: { businessId: real.businessId },
      orderBy: { createdAt: "asc" },
    }),
    loadStrategyLab(real.businessId),
    prisma.business.findUnique({ where: { id: real.businessId }, select: { storeCurrency: true } }),
  ]);

  const files = await attachmentViews(real.businessId, messages);

  // Safety net: any running strategy whose Orbit steps never ran (e.g. approved before the
  // harness existed, or a background run died) gets carried out now.
  const died = (s: NonNullable<typeof lab.active>["strategies"][number]) =>
    !!s.executedAt && s.actions.length === 0 && s.steps.some((st) => st.owner === "orbit") && msSince(s.executedAt) > 10 * 60 * 1000;
  if (lab.active?.strategies.some((s) => s.status === "running" && (!s.executedAt || died(s)))) {
    after(() => executeActivePlan(real.businessId));
  }
  // A strategy whose run is over gets reviewed in the chat (the cron does this daily too).
  if (lab.active) {
    after(() => reviewDueStrategies(real.businessId).catch((e) => console.warn("[orchestrator] review failed", e)));
  }

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <Topbar title="Talk to your Orchestrator" subtitle={`${real.businessName} — plan, discuss and decide together, on your real data`} />
      <div className="min-h-0 flex-1 px-6 py-5 lg:px-8">
        <OrchestratorWorkspace
          active={lab.active}
          canHire={lab.canHire}
          draft={lab.draft}
          currency={business?.storeCurrency ?? "usd"}
          initialMessages={messages.map((m) => ({
            id: m.id,
            role: m.role as "user" | "assistant",
            content: m.content,
            speaker: m.speaker,
            needsUser: m.needsUser,
            opsState: m.opsState,
            opsSummary: parseSummary(m.opsSummary),
            askApproval: m.askApproval,
            attachments: files.get(m.id) ?? [],
          }))}
        />
      </div>
    </div>
  );
}
