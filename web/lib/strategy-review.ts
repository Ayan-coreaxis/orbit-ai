import type Anthropic from "@anthropic-ai/sdk";
import { anthropic, MODEL } from "@/lib/anthropic";
import { prisma } from "@/lib/prisma";
import { estimateCostUsd } from "@/lib/pricing";
import { assertUnderUsageCap } from "@/lib/usage-limit";
import { ORCHESTRATOR_TOOL, describeOps, filterOpsForPlan, getDiscussedPlan, planContextBlock, sanitizeOps } from "@/lib/strategy-chat";

/**
 * Review loop — the plan keeps talking to the owner after it's approved:
 *  1. When Orbit finishes carrying out steps, it says so in the Orchestrator chat (plain code, no AI).
 *  2. When a strategy's run is over (or every 2 weeks for ongoing ones) the Orchestrator reviews the
 *     REAL measured results in the chat, gives its honest opinion, and PROPOSES changes. Nothing
 *     changes until the owner presses Apply — mid-plan changes always go back to the owner.
 */

const DAY = 86400000;
const ONGOING_REVIEW_DAYS = 14;

/** Post "here's what I just did" into the Orchestrator chat after the harness ran. */
export async function postOrbitWorkSummary(businessId: string, strategyIds: string[]): Promise<void> {
  if (!strategyIds.length) return;
  const actions = await prisma.strategyAction.findMany({
    where: { businessId, strategyId: { in: strategyIds } },
    select: { status: true, summary: true, strategy: { select: { title: true, planId: true } } },
    orderBy: { createdAt: "asc" },
  });
  if (!actions.length) return;
  const done = actions.filter((a) => a.status === "done").map((a) => a.summary);
  const written = actions.filter((a) => a.status === "deliverable" || a.status === "needs_connection").length;
  const problems = actions.filter((a) => a.status === "failed" || a.status === "needs_connection").map((a) => a.summary);
  const lines = [
    done.length
      ? `I've set up my part of the plan: ${done.slice(0, 4).map((d) => d.replace(/\.$/, "")).join("; ")}${done.length > 4 ? `; and ${done.length - 4} more` : ""}.`
      : "I've gone through my part of the plan.",
    written ? `I also wrote ${written} thing${written === 1 ? "" : "s"} for you to use — open a strategy on the right and press View to copy them.` : "",
    problems.length ? `Heads up: ${problems.join(" ")}` : "",
    "Your own steps are marked \"You\" in each strategy.",
  ].filter(Boolean);
  await prisma.orchestratorMessage.create({
    data: {
      businessId,
      role: "assistant",
      speaker: "orchestrator",
      content: lines.join("\n\n"),
      planId: actions[0].strategy.planId,
      opsState: "applied",
      opsSummary: JSON.stringify([`Orbit carried out ${actions.length} step${actions.length === 1 ? "" : "s"} across ${strategyIds.length} strateg${strategyIds.length === 1 ? "y" : "ies"}`]),
    },
  });
}

type DueStrategy = { id: string; title: string; reason: string };

async function dueStrategies(businessId: string): Promise<DueStrategy[]> {
  const running = await prisma.strategy.findMany({
    where: { businessId, status: { in: ["running", "paused"] }, startedAt: { not: null }, plan: { status: "active" } },
    select: { id: true, title: true, startedAt: true, durationDays: true, lastReviewedAt: true },
  });
  const now = Date.now();
  const due: DueStrategy[] = [];
  for (const s of running) {
    const start = s.startedAt!.getTime();
    const last = s.lastReviewedAt?.getTime() ?? 0;
    if (s.durationDays) {
      const end = start + s.durationDays * DAY;
      if (now >= end && last < end) due.push({ id: s.id, title: s.title, reason: `its ${s.durationDays}-day run is over` });
    } else if (now - Math.max(start, last) >= ONGOING_REVIEW_DAYS * DAY) {
      due.push({ id: s.id, title: s.title, reason: `${ONGOING_REVIEW_DAYS}-day check-in on an ongoing strategy` });
    }
  }
  return due;
}

export async function hasDueReview(businessId: string): Promise<boolean> {
  return (await dueStrategies(businessId)).length > 0;
}

/**
 * The Orchestrator opens a review in the chat for every strategy that's due. Returns true if it
 * posted one. Changes it suggests are stored as a proposal that waits for the owner's Apply.
 */
export async function reviewDueStrategies(businessId: string): Promise<boolean> {
  const due = await dueStrategies(businessId);
  if (!due.length) return false;
  const plan = await getDiscussedPlan(businessId);
  const active = plan?.status === "active" ? plan : await prisma.growthPlan.findFirst({
    where: { businessId, status: "active" },
    include: { strategies: { orderBy: { position: "asc" } } },
  });
  if (!active) return false;

  // Claim first so a double trigger (cron + page load) can't post two reviews.
  const claimed = await prisma.strategy.updateMany({
    where: { id: { in: due.map((d) => d.id) }, OR: [{ lastReviewedAt: null }, { lastReviewedAt: { lt: new Date(Date.now() - 60 * 60 * 1000) } }] },
    data: { lastReviewedAt: new Date() },
  });
  if (claimed.count === 0) return false;

  await assertUnderUsageCap(businessId);
  const refs = due.map((d) => {
    const i = active.strategies.findIndex((s) => s.id === d.id);
    return `#${i + 1} ${d.title} — ${d.reason}`;
  });

  const system = `You are the Strategy Orchestrator of Orbit, speaking FIRST in the owner's chat to review their running growth plan. Conversational text. Keep it easy to scan: short paragraphs (1-3 sentences) separated by a blank line; when giving 3+ steps or options use "- " bullet lines; **bold** only a key number or the one key action. No headers, tables or code.
${await planContextBlock(businessId, active)}

THIS IS A SCHEDULED REVIEW of:
${refs.join("\n")}

For each strategy under review: say what REALLY happened using only the "RESULT SO FAR" numbers (never invent figures; if there's too little data, say it's too early), give your honest judgement (working / not working / too early), and recommend keep, scale up, change or stop. Put the changes you recommend in ops — they wait for the owner's Apply, so say "press Apply if you agree". If nothing should change, ops stay empty. Keep it under ~120 words, in the language the owner has been using in this chat (Roman Urdu if they write Roman Urdu).`;

  const lastOwner = await prisma.orchestratorMessage.findFirst({ where: { businessId, role: "user" }, orderBy: { createdAt: "desc" }, select: { content: true } });
  const msg = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 6000,
    system,
    tools: [ORCHESTRATOR_TOOL],
    tool_choice: { type: "tool", name: ORCHESTRATOR_TOOL.name },
    messages: [
      {
        role: "user",
        content: `(Automatic review time — the owner hasn't asked anything yet.${lastOwner ? ` The last thing they wrote in this chat was: "${lastOwner.content.slice(0, 300)}"` : ""}) Write your review now.`,
      },
    ],
  });
  await prisma.agentUsage.create({
    data: {
      businessId,
      agentId: "strategy-review",
      model: MODEL,
      inputTokens: msg.usage.input_tokens,
      outputTokens: msg.usage.output_tokens,
      costUsd: estimateCostUsd(MODEL, msg.usage.input_tokens, msg.usage.output_tokens),
    },
  });
  const block = msg.content.find((b): b is Anthropic.Messages.ToolUseBlock => b.type === "tool_use");
  const out = (block?.input ?? {}) as { reply?: string; ops?: unknown };
  const reply = typeof out.reply === "string" && out.reply.trim() ? out.reply.trim() : `Review time for: ${due.map((d) => d.title).join(", ")}.`;
  const ops = filterOpsForPlan(sanitizeOps(out.ops), active);

  await prisma.orchestratorMessage.create({
    data: {
      businessId,
      role: "assistant",
      speaker: "orchestrator",
      content: reply,
      planId: active.id,
      ...(ops.length ? { pendingOps: JSON.stringify(ops), opsState: "pending", opsSummary: JSON.stringify(describeOps(ops, active)) } : {}),
    },
  });
  return true;
}
