import type Anthropic from "@anthropic-ai/sdk";
import { anthropic, MODEL } from "@/lib/anthropic";
import { prisma } from "@/lib/prisma";
import { estimateCostUsd } from "@/lib/pricing";
import { PLAN_DEFAULT_CAP_USD } from "@/lib/usage-limit";
import { parseSteps } from "@/lib/strategy-lab";

/**
 * Hired agents (Max / "scale" plan only). When a plan is approved the Orchestrator staffs it: it
 * creates a few specialist agents, gives each ONLY the tools and data its strategies need, and
 * splits a budget out of the business's own monthly AI cap between them (it never asks the owner
 * to price each agent). When an agent's strategies are all over, it's retired and its grants end.
 */

export const HIRING_PLAN = "scale";
/** Share of the monthly AI cap the Orchestrator may hand to hired agents in total. */
const AGENT_POOL_SHARE = 0.3;

/** What an agent may be allowed to read. Enforced by the executor (it only passes granted data). */
export const DATA_SCOPES = {
  products: "Product names, prices and cost prices",
  store_numbers: "Order/revenue/customer counts",
  customers: "Customer names and contact details (for personal messages)",
  media: "The owner's media library — photos, videos, voice-note transcripts, PDFs",
} as const;
export type DataScope = keyof typeof DATA_SCOPES;

export function parseJsonList(raw: string | null | undefined): string[] {
  try {
    const v = JSON.parse(raw ?? "[]");
    return Array.isArray(v) ? v.filter((x) => typeof x === "string") : [];
  } catch {
    return [];
  }
}

const HIRE_TOOL: Anthropic.Messages.Tool = {
  name: "hire_agents",
  description: "Staff the approved plan with specialist agents.",
  input_schema: {
    type: "object",
    properties: {
      agents: {
        type: "array",
        minItems: 1,
        maxItems: 4,
        items: {
          type: "object",
          properties: {
            name: { type: "string", description: "Short job title, e.g. 'Loyalty Agent', 'Launch Copywriter'." },
            role: { type: "string", description: "One sentence: what this agent is responsible for in this plan." },
            instructions: { type: "string", description: "2-4 sentences: how it should work for THIS brand (voice, focus) and what it must never do." },
            strategies: { type: "array", items: { type: "string" }, description: "Strategy refs it owns, e.g. ['#1','#3']. Every strategy with Orbit steps must be owned by exactly one agent." },
            tools: { type: "array", items: { type: "string" }, description: "ONLY the tools its strategies need, from the allowed list." },
            data: { type: "array", items: { type: "string", enum: Object.keys(DATA_SCOPES) }, description: "ONLY the data it needs." },
            budget_share: { type: "number", description: "Relative share of the agent budget pool (e.g. 40)." },
          },
          required: ["name", "role", "instructions", "strategies", "tools", "data", "budget_share"],
        },
      },
    },
    required: ["agents"],
  },
};

/** Staff an approved plan (no-op below the Max plan, or if already staffed). */
export async function staffPlan(businessId: string, planId: string, toolNames: string[]): Promise<number> {
  const business = await prisma.business.findUniqueOrThrow({ where: { id: businessId }, select: { plan: true, monthlyUsageCapUsd: true, name: true, niche: true } });
  if (business.plan !== HIRING_PLAN) return 0;
  const plan = await prisma.growthPlan.findFirst({
    where: { id: planId, businessId, status: "active" },
    include: { strategies: { where: { status: "running" }, orderBy: { position: "asc" } }, agents: { select: { id: true } } },
  });
  if (!plan || plan.agents.length > 0) return 0;
  const withOrbit = plan.strategies.filter((s) => parseSteps(s.steps).some((st) => st.owner === "orbit"));
  if (!withOrbit.length) return 0;

  const cap = business.monthlyUsageCapUsd ?? PLAN_DEFAULT_CAP_USD[HIRING_PLAN] ?? 50;
  const pool = Math.round(cap * AGENT_POOL_SHARE * 100) / 100;
  const refOf = (id: string) => `#${plan.strategies.findIndex((s) => s.id === id) + 1}`;

  const msg = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 3000,
    system: `You are the Strategy Orchestrator of Orbit. The owner approved the growth plan for ${business.name} (${business.niche}). Staff it with 1-4 specialist agents. Group related strategies under one agent — don't hire one agent per strategy unless they're truly different jobs. Least privilege: each agent gets ONLY the tools and data its own strategies need. Allowed tools: ${toolNames.join(", ")}. Data scopes: ${Object.entries(DATA_SCOPES).map(([k, v]) => `${k} (${v})`).join("; ")}.`,
    tools: [HIRE_TOOL],
    tool_choice: { type: "tool", name: HIRE_TOOL.name },
    messages: [
      {
        role: "user",
        content: withOrbit
          .map((s) => `${refOf(s.id)} ${s.title} (${s.kind})\n${parseSteps(s.steps).filter((st) => st.owner === "orbit").map((st) => `  - [orbit] ${st.text}`).join("\n")}`)
          .join("\n\n"),
      },
    ],
  });
  await prisma.agentUsage.create({
    data: { businessId, agentId: "orchestrator-hiring", model: MODEL, inputTokens: msg.usage.input_tokens, outputTokens: msg.usage.output_tokens, costUsd: estimateCostUsd(MODEL, msg.usage.input_tokens, msg.usage.output_tokens) },
  });
  const block = msg.content.find((b): b is Anthropic.Messages.ToolUseBlock => b.type === "tool_use");
  let agents = (block?.input as { agents?: unknown })?.agents;
  if (typeof agents === "string") {
    try {
      agents = JSON.parse(agents);
    } catch {
      agents = [];
    }
  }
  const list = (Array.isArray(agents) ? agents : []) as Array<Record<string, unknown>>;
  const totalShare = list.reduce((a, x) => a + (typeof x.budget_share === "number" && x.budget_share > 0 ? x.budget_share : 1), 0) || 1;

  let hired = 0;
  const assigned = new Set<string>();
  for (const a of list.slice(0, 4)) {
    const refs = (Array.isArray(a.strategies) ? a.strategies : []).map(String);
    const ids = refs
      .map((r) => plan.strategies[Number(r.replace(/\D/g, "")) - 1]?.id)
      .filter((id): id is string => !!id && !assigned.has(id));
    if (!ids.length) continue;
    const tools = (Array.isArray(a.tools) ? a.tools : []).map(String).filter((t) => toolNames.includes(t));
    if (!tools.includes("write_for_seller")) tools.push("write_for_seller");
    const data = (Array.isArray(a.data) ? a.data : []).map(String).filter((d) => d in DATA_SCOPES);
    const share = typeof a.budget_share === "number" && a.budget_share > 0 ? a.budget_share : 1;
    const agent = await prisma.planAgent.create({
      data: {
        businessId,
        planId,
        name: String(a.name ?? "Specialist Agent").slice(0, 60),
        role: String(a.role ?? "").slice(0, 300),
        instructions: String(a.instructions ?? "").slice(0, 1200),
        tools: JSON.stringify(tools),
        dataScopes: JSON.stringify(data),
        budgetUsd: Math.round(((pool * share) / totalShare) * 100) / 100,
      },
    });
    await prisma.strategy.updateMany({ where: { id: { in: ids } }, data: { agentId: agent.id } });
    ids.forEach((id) => assigned.add(id));
    hired++;
  }
  return hired;
}

/** Retire agents whose strategies are all over — their grants end with them. */
export async function retireIdleAgents(businessId: string): Promise<void> {
  const agents = await prisma.planAgent.findMany({
    where: { businessId, status: "active" },
    select: { id: true, plan: { select: { status: true } }, strategies: { select: { status: true } } },
  });
  const idle = agents.filter((a) => a.plan.status !== "active" || !a.strategies.some((s) => s.status === "running" || s.status === "paused"));
  if (idle.length) {
    await prisma.planAgent.updateMany({ where: { id: { in: idle.map((a) => a.id) } }, data: { status: "retired", retiredAt: new Date() } });
  }
}
