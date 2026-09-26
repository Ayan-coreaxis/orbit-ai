import type Anthropic from "@anthropic-ai/sdk";
import { prisma } from "@/lib/prisma";
import { getBusinessSnapshot, parseMetric, parseSteps, measureStrategy } from "@/lib/strategy-lab";
import { STRATEGY_ITEM_SCHEMA, coerceArray, plannerPrinciples, strategyData, type RawStrategy } from "@/lib/strategy-planner";
import { STORE_CHANGES_SCHEMA, applyStoreChanges, splitPendingOps } from "@/lib/store-settings-ops";
import { after } from "next/server";
import { noteRestockedAds, pauseAdsForSoldOut } from "@/lib/inventory-ads";
import { STORE_DESIGN_SCHEMA, describeDesignJobs, runDesignJobs, sanitizeStoredDesignJobs } from "@/lib/design-ops";
import { DELETE_PRODUCTS_SCHEMA, NEW_PRODUCTS_SCHEMA, PRODUCT_CHANGES_SCHEMA, applyProductChanges } from "@/lib/product-ops";
import { CREATE_CONTENT_SCHEMA, describeStudioRequests, runStudioRequests, sanitizeStoredStudioRequests } from "@/lib/studio/ops";
import { META_ADS_SCHEMA, SOCIAL_POSTS_SCHEMA, runMetaOps, sanitizeStoredMetaOps } from "@/lib/meta-ops";

/**
 * The growth plan lives inside "Talk to your Orchestrator" — there is one chat, one Orchestrator.
 * This module gives that chat plan awareness: the plan as context, a tool that lets the
 * Orchestrator edit the plan (only when the owner asked / agreed) or draft a new one, and the
 * apply logic.
 *
 * Draft plan  -> edits apply immediately (nothing is running yet).
 * Active plan -> edits are stored on the message as a proposal and apply only when the owner
 *                presses Apply (mid-plan changes always go back to the owner first).
 */

export type PlanOp =
  | { op: "add_strategy"; strategy: RawStrategy }
  | { op: "update_strategy"; ref: string; changes: Partial<RawStrategy> }
  | { op: "remove_strategy"; ref: string }
  | { op: "update_plan"; title?: string; diagnosis?: string };

export const ORCHESTRATOR_TOOL: Anthropic.Messages.Tool = {
  name: "respond_to_owner",
  description: "Reply to the owner. Optionally change the growth plan (only if they asked for or agreed to it) or draft a new plan.",
  input_schema: {
    type: "object",
    properties: {
      reply: {
        type: "string",
        description:
          "What you say to the owner. Conversational, 2-6 short sentences. Keep it easy to scan: short paragraphs (1-3 sentences) separated by a blank line; when giving 3+ steps or options use \"- \" bullet lines; **bold** only a key number or the one key action. No headers, tables or code. Same language the owner writes in (Roman Urdu if they write Roman Urdu).",
      },
      ops: {
        type: "array",
        description: "Growth-plan changes. Empty unless the owner asked for or agreed to a change.",
        items: {
          type: "object",
          properties: {
            op: { type: "string", enum: ["add_strategy", "update_strategy", "remove_strategy", "update_plan"] },
            ref: { type: "string", description: "For update/remove: the strategy ref like '#2'." },
            strategy: { ...STRATEGY_ITEM_SCHEMA, description: "For add_strategy: the full new strategy." },
            changes: { type: "object", properties: STRATEGY_ITEM_SCHEMA.properties, description: "For update_strategy: only the fields that change." },
            title: { type: "string" },
            diagnosis: { type: "string" },
          },
          required: ["op"],
        },
      },
      sources: { type: "array", items: { type: "string" }, description: "URLs from web_search results you actually relied on for this reply (empty if you didn't search)." },
      store_changes: STORE_CHANGES_SCHEMA as unknown as Record<string, unknown>,
      product_changes: PRODUCT_CHANGES_SCHEMA as unknown as Record<string, unknown>,
      new_products: NEW_PRODUCTS_SCHEMA as unknown as Record<string, unknown>,
      store_design: STORE_DESIGN_SCHEMA as unknown as Record<string, unknown>,
      delete_products: DELETE_PRODUCTS_SCHEMA as unknown as Record<string, unknown>,
      create_content: CREATE_CONTENT_SCHEMA as unknown as Record<string, unknown>,
      social_posts: SOCIAL_POSTS_SCHEMA as unknown as Record<string, unknown>,
      meta_ads: META_ADS_SCHEMA as unknown as Record<string, unknown>,
      draft_new_plan: {
        type: "boolean",
        description: "True only when the owner asks for a (new) growth plan to be made. Orbit then drafts a full plan from their real numbers.",
      },
      plan_note: { type: "string", description: "With draft_new_plan: anything the owner said the new plan must respect (capacity, budget, dates, ideas)." },
      ask_approval: {
        type: "boolean",
        description: "True only when the owner says the DRAFT plan is right / wants to run it / wants to see the final plan.",
      },
    },
    required: ["reply", "ops", "draft_new_plan", "ask_approval"],
  },
};

export type DiscussedPlan = NonNullable<Awaited<ReturnType<typeof getDiscussedPlan>>>;

/** The plan the chat is about: an open draft if there is one, else the active plan. */
export async function getDiscussedPlan(businessId: string) {
  const include = { strategies: { orderBy: { position: "asc" as const } } };
  return (
    (await prisma.growthPlan.findFirst({ where: { businessId, status: "draft" }, orderBy: { createdAt: "desc" }, include })) ??
    (await prisma.growthPlan.findFirst({ where: { businessId, status: "active" }, orderBy: { approvedAt: "desc" }, include }))
  );
}

function toRaw(s: DiscussedPlan["strategies"][number]): RawStrategy {
  const m = parseMetric(s.metric);
  return {
    title: s.title,
    kind: s.kind,
    audience: s.audience,
    why: s.why,
    steps: parseSteps(s.steps),
    duration_days: s.durationDays ?? 0,
    metric_type: m.type,
    metric_label: m.label,
    coupon_code: m.couponCode,
    target: m.target,
    discount_pct: s.discountPct ?? undefined,
    cost_note: s.costNote ?? undefined,
  };
}

async function planText(businessId: string, plan: DiscussedPlan): Promise<string> {
  const rows = await Promise.all(
    plan.strategies.map(async (s, i) => {
      const steps = parseSteps(s.steps)
        .map((st) => `     - [${st.owner}] ${st.text}${st.note ? ` (${st.note})` : ""}`)
        .join("\n");
      const m = parseMetric(s.metric);
      let result = "";
      if (plan.status === "active") {
        const r = await measureStrategy(businessId, s);
        result =
          r.measurable && r.value != null
            ? `\n   RESULT SO FAR: ${r.value} (before: ${r.baseline ?? "n/a"}) over ${r.windowDays} days`
            : `\n   RESULT SO FAR: ${r.note ?? "none yet"}`;
      }
      return `#${i + 1} [${s.status}] ${s.title} (${s.kind}, ${s.durationDays ? `${s.durationDays} days` : "ongoing"})
   For: ${s.audience}
   Why: ${s.why}
   Steps:
${steps}
   Measured by: ${m.label}${m.couponCode ? ` (code ${m.couponCode})` : ""}${m.target != null ? `, target ${m.target}` : ""}${s.discountPct ? `\n   Discount: ${s.discountPct}% — profit check: ${s.profitNote}` : ""}${s.costNote ? `\n   Cost: ${s.costNote}` : ""}${result}`;
    }),
  );
  return `GROWTH PLAN (${plan.status.toUpperCase()}): ${plan.title}
Diagnosis: ${plan.diagnosis}

${rows.join("\n\n") || "(no strategies)"}`;
}

/** The plan section of the Orchestrator's system prompt. */
export async function planContextBlock(businessId: string, plan: DiscussedPlan | null): Promise<string> {
  const rules = `
GROWTH PLAN — you own it, together with the owner
${plannerPrinciples()}

PLAN CONVERSATION RULES
- Be a real partner: bring your own ideas and opinions, not just answers.
- If the owner's idea is wrong for THIS business (hurts profit, wrong for its stage, can't be executed, breaks a platform's rules, or the numbers don't support it), say so plainly with the real reason from their numbers and offer a better alternative. Never agree just to please. If they still insist after hearing the risk, it's their business: make the change and write the risk in the strategy's cost_note.
- Only change the plan when the owner asked for a change or agreed to your suggestion. A question (why / what / how / kya / kyun / kaise) is NOT a request to change — answer it, and if something should change, suggest it and ask. ops stay EMPTY until the owner says yes. A specialist suggesting something is not the owner agreeing.
- Refer to strategies by ref (#1, #2...). update_strategy changes only the fields given.
- If the owner asks for a plan / a new plan, set draft_new_plan (and pass their constraints in plan_note) — Orbit drafts it from their real numbers and it appears next to the chat. Don't write the plan out in your reply.`;

  if (!plan) {
    return `${rules}
- There is NO growth plan yet. If the owner wants one, set draft_new_plan. ops must be empty.`;
  }
  const state =
    plan.status === "active"
      ? `- This plan is ACTIVE (running). Your ops are PROPOSALS — they apply only when the owner presses Apply. In your reply never say you did/changed/stopped it; say you have PROPOSED it and they should press Apply below if they agree. Removing a strategy on an active plan stops it. ask_approval must be false.`
      : `- This plan is a DRAFT — nothing runs until the owner approves it, so ops apply immediately. Set ask_approval only when the owner says it's right / wants to run it / wants to see the final plan, then tell them to review and press Approve.`;
  return `${rules}
${state}

${await planText(businessId, plan)}`;
}

export function describeOps(ops: PlanOp[], plan: DiscussedPlan): string[] {
  const byRef = (ref: string) => plan.strategies[Number(ref.replace(/\D/g, "")) - 1];
  return ops.flatMap((o) => {
    if (o.op === "add_strategy") return [`Add strategy: ${o.strategy?.title ?? "new strategy"}`];
    if (o.op === "remove_strategy") {
      const s = byRef(o.ref);
      return s ? [`${plan.status === "active" ? "Stop" : "Remove"}: ${s.title}`] : [];
    }
    if (o.op === "update_strategy") {
      const s = byRef(o.ref);
      if (!s) return [];
      const before = toRaw(s) as Record<string, unknown>;
      const fields = Object.entries(o.changes ?? {})
        .filter(([k, v]) => JSON.stringify(v ?? null) !== JSON.stringify(before[k] ?? null))
        .map(([k]) => k.replace(/_/g, " "));
      return [`Change "${s.title}"${fields.length ? ` — ${fields.join(", ")}` : ""}`];
    }
    return [`Update plan ${[o.title && "title", o.diagnosis && "diagnosis"].filter(Boolean).join(" & ") || "details"}`];
  });
}

export function sanitizeOps(raw: unknown): PlanOp[] {
  return coerceArray<Record<string, unknown>>(raw).flatMap((o): PlanOp[] => {
    if (!o || typeof o.op !== "string") return [];
    if (o.op === "add_strategy" && o.strategy && typeof o.strategy === "object") return [{ op: "add_strategy", strategy: o.strategy as RawStrategy }];
    if (o.op === "remove_strategy" && typeof o.ref === "string") return [{ op: "remove_strategy", ref: o.ref }];
    if (o.op === "update_strategy" && typeof o.ref === "string" && o.changes && typeof o.changes === "object") {
      return [{ op: "update_strategy", ref: o.ref, changes: o.changes as Partial<RawStrategy> }];
    }
    if (o.op === "update_plan" && (typeof o.title === "string" || typeof o.diagnosis === "string")) {
      return [{ op: "update_plan", title: o.title as string | undefined, diagnosis: o.diagnosis as string | undefined }];
    }
    return [];
  });
}

/** Drop ops that can't do anything: bad refs, or edits/stops on strategies that are already over. */
export function filterOpsForPlan(ops: PlanOp[], plan: DiscussedPlan): PlanOp[] {
  const byRef = (ref: string) => plan.strategies[Number(ref.replace(/\D/g, "")) - 1];
  const live = (st: string) => (plan.status === "active" ? st === "running" || st === "paused" : true);
  return ops.filter((o) => {
    if (o.op === "remove_strategy" || o.op === "update_strategy") {
      const s = byRef(o.ref);
      return !!s && live(s.status);
    }
    return true;
  });
}

/**
 * Apply plan ops. Draft: add = proposed, remove = delete. Active: add = starts running now,
 * remove = stopped (kept for history, never deleted).
 */
export async function applyPlanOps(businessId: string, planId: string, ops: PlanOp[]): Promise<string[]> {
  const plan = await prisma.growthPlan.findFirst({
    where: { id: planId, businessId, status: { in: ["draft", "active"] } },
    include: { strategies: { orderBy: { position: "asc" } } },
  });
  if (!plan) throw new Error("That plan is no longer open.");
  const { products } = await getBusinessSnapshot(businessId);
  const active = plan.status === "active";
  const now = new Date();
  const byRef = (ref: string) => plan.strategies[Number(ref.replace(/\D/g, "")) - 1];
  const done: string[] = [];
  let nextPos = plan.strategies.length;

  for (const o of ops) {
    if (o.op === "add_strategy") {
      const data = strategyData(o.strategy, products);
      await prisma.strategy.create({
        data: { ...data, planId, businessId, position: nextPos++, status: active ? "running" : "proposed", startedAt: active ? now : null },
      });
      done.push(`Added: ${data.title}`);
    } else if (o.op === "remove_strategy") {
      const s = byRef(o.ref);
      if (!s) continue;
      if (active) {
        if (s.status === "running" || s.status === "paused") {
          await prisma.strategy.update({ where: { id: s.id }, data: { status: "stopped", endedAt: now } });
          done.push(`Stopped: ${s.title}`);
        }
      } else {
        await prisma.strategy.delete({ where: { id: s.id } });
        done.push(`Removed: ${s.title}`);
      }
    } else if (o.op === "update_strategy") {
      const s = byRef(o.ref);
      if (!s) continue;
      const data = strategyData({ ...toRaw(s), ...o.changes }, products);
      await prisma.strategy.update({ where: { id: s.id }, data });
      done.push(`Changed: ${data.title}`);
    } else if (o.op === "update_plan") {
      await prisma.growthPlan.update({
        where: { id: planId },
        data: {
          ...(o.title?.trim() ? { title: o.title.trim().slice(0, 120) } : {}),
          ...(o.diagnosis?.trim() ? { diagnosis: o.diagnosis.trim().slice(0, 1500) } : {}),
        },
      });
      done.push("Updated the plan summary");
    }
  }
  return done;
}

/** Owner's Apply / Dismiss on a proposal the Orchestrator made for the active plan. */
export async function resolveProposal(businessId: string, messageId: string, action: "apply" | "dismiss"): Promise<string[]> {
  const m = await prisma.orchestratorMessage.findFirst({ where: { id: messageId, businessId, opsState: "pending" } });
  if (!m) throw new Error("There's no pending change on that message.");
  // Claim the proposal atomically so a double-click / retry can't apply it (and post / build ads) twice.
  const claimed = await prisma.orchestratorMessage.updateMany({
    where: { id: m.id, opsState: "pending" },
    data: { opsState: action === "dismiss" ? "dismissed" : "applying" },
  });
  if (claimed.count !== 1) throw new Error("That change is already being handled.");
  if (action === "dismiss") return [];
  try {
    return await applyClaimedProposal(businessId, m);
  } catch (e) {
    await prisma.orchestratorMessage.update({ where: { id: m.id }, data: { opsState: "failed", opsSummary: JSON.stringify([e instanceof Error ? e.message : "Couldn't apply."]) } }).catch(() => {});
    throw e;
  }
}

async function applyClaimedProposal(businessId: string, m: { id: string; pendingOps: string | null; planId: string | null }): Promise<string[]> {
  const { planOps, storeChanges, productChanges } = splitPendingOps(m.pendingOps);
  let rawAll: unknown[] = [];
  try {
    rawAll = JSON.parse(m.pendingOps ?? "[]");
  } catch {
    rawAll = [];
  }
  const designJobs = sanitizeStoredDesignJobs(Array.isArray(rawAll) ? rawAll : []);
  const studioJobs = sanitizeStoredStudioRequests(Array.isArray(rawAll) ? rawAll : []);
  const metaOps = sanitizeStoredMetaOps(Array.isArray(rawAll) ? rawAll : []);
  const ops = sanitizeOps(planOps);
  if (ops.length && !m.planId) throw new Error("That plan is no longer open.");
  const applied = [
    ...(await applyStoreChanges(businessId, storeChanges)),
    ...(await applyProductChanges(businessId, productChanges, (await prisma.business.findUnique({ where: { id: businessId }, select: { storeCurrency: true } }))?.storeCurrency || "usd")),
    ...(ops.length ? await applyPlanOps(businessId, m.planId!, ops) : []),
    ...describeDesignJobs(designJobs).map((d) => `${d} — Orbit Design is on it; I'll post here when it's done`),
    ...describeStudioRequests(studioJobs).map((d) => `${d.replace(/ — uses 1 .*$/, "")} — being made; it'll show up here and in Content`),
    ...metaOps.map((o) => (o.op === "social_post" ? "Posting now — I'll tell you here when it's live" : `Building the ad "${o.headline}" in Meta (paused) — I'll tell you here when it's ready`)),
  ];
  // Design work takes a minute or two — run it after the response and report back in the chat.
  if (designJobs.length) after(() => runDesignJobs(businessId, designJobs, m.planId));
  if (studioJobs.length) after(() => runStudioRequests(businessId, studioJobs));
  if (metaOps.length) after(() => runMetaOps(businessId, metaOps));
  if (productChanges.length)
    after(async () => {
      await pauseAdsForSoldOut(businessId).catch(() => {});
      for (const c of productChanges) if (c.op === "product_update") await noteRestockedAds(businessId, c.productId).catch(() => {});
    });
  await prisma.orchestratorMessage.update({ where: { id: m.id }, data: { opsState: "applied", opsSummary: JSON.stringify(applied) } });
  return applied;
}

export function parseSummary(raw: string | null | undefined): string[] | null {
  try {
    const v = JSON.parse(raw ?? "null");
    return Array.isArray(v) ? (v as string[]) : null;
  } catch {
    return null;
  }
}
