import type Anthropic from "@anthropic-ai/sdk";
import { sellerAnswersBlock } from "@/lib/onboarding-questions";
import { anthropic, MODEL } from "@/lib/anthropic";
import { prisma } from "@/lib/prisma";
import { estimateCostUsd } from "@/lib/pricing";
import { assertUnderUsageCap } from "@/lib/usage-limit";
import { researchMarket } from "@/lib/growth-research";
import { playbookFor } from "@/lib/growth-playbook";
import { learnedOutcomesFor } from "@/lib/growth-learning";
import { brainstormIdeas } from "@/lib/growth-ideas";
import {
  METRIC_TYPES,
  ORBIT_CAN,
  ORBIT_CANNOT_YET,
  STRATEGY_KINDS,
  getBusinessSnapshot,
  profitGuard,
  type BusinessSnapshot,
} from "@/lib/strategy-lab";

/**
 * Strategy planner — drafts a Strategy Lab plan. The base is the seller's OWN business (real
 * snapshot numbers, products, margins, what's connected); competitor notes are passed as optional
 * reference only. The model proposes varied, specific strategies and honestly tags every step as
 * something Orbit can do today, something the seller must do, or something not possible yet.
 * Profit is checked by real code afterwards, not by the model.
 */

/** One strategy, as the model writes it — shared by the planner and the plan chat. */
export const STRATEGY_ITEM_SCHEMA = {
  type: "object",
  properties: {
    title: { type: "string" },
    kind: { type: "string", enum: [...STRATEGY_KINDS] },
    audience: { type: "string", description: "Exactly who this targets (e.g. 'customers with 2+ orders', 'people who never heard of us in Lahore')." },
    why: { type: "string", description: "1-2 sentences: why this should work for THIS business, tied to the diagnosis." },
    steps: {
      type: "array",
      minItems: 2,
      maxItems: 7,
      items: {
        type: "object",
        properties: {
          text: { type: "string", description: "One concrete action." },
          owner: {
            type: "string",
            enum: ["orbit", "seller", "not_possible"],
            description: "orbit = a capability listed under ORBIT CAN (and its required connection is connected). seller = a human must do it. not_possible = nobody can do it inside Orbit yet.",
          },
          note: { type: "string", description: "For seller/not_possible: why, and the workaround if any. For orbit steps needing a connection that is missing: say to connect it first." },
        },
        required: ["text", "owner"],
      },
    },
    duration_days: { type: "integer", description: "How long to run before judging it. 0 = ongoing, no fixed end. Pick what fits the idea — not always 7." },
    metric_type: { type: "string", enum: Object.keys(METRIC_TYPES) },
    metric_label: { type: "string", description: "Plain-language success measure, e.g. 'Orders using code FRIDAY'." },
    coupon_code: { type: "string", description: "Only when metric_type is coupon_orders: the dedicated code for this strategy (UPPERCASE, no spaces)." },
    target: { type: "number", description: "Optional realistic target for the metric over the duration. Omit rather than guess wildly." },
    discount_pct: { type: "number", description: "If the strategy gives customers a percentage discount, the percent. Omit otherwise." },
    cost_note: { type: "string", description: "What it costs the seller (money/time/effort), briefly." },
  },
  required: ["title", "kind", "audience", "why", "steps", "duration_days", "metric_type", "metric_label"],
} as const;

const PLAN_TOOL: Anthropic.Messages.Tool = {
  name: "propose_growth_plan",
  description: "Propose a growth plan for this business as a set of distinct, testable strategies.",
  input_schema: {
    type: "object",
    properties: {
      title: { type: "string", description: "Short plan name, e.g. 'First 30 customers' or 'Stop the COD leak'." },
      diagnosis: {
        type: "string",
        description:
          "2-4 sentences: the single biggest thing holding THIS business back right now and why, grounded only in the snapshot numbers. Name the real stage (no one knows us / visitors don't buy / orders come back / one-time buyers / thin profit).",
      },
      strategies: {
        type: "array",
        minItems: 3,
        maxItems: 6,
        items: STRATEGY_ITEM_SCHEMA,
      },
    },
    required: ["diagnosis", "strategies", "title"],
  },
};

export function snapshotText(s: BusinessSnapshot): string {
  const money = (n: number) => `${n} ${s.currency.toUpperCase()}`;
  const products = s.products.length
    ? s.products
        .slice(0, 30)
        .map((p) => `- ${p.name}: price ${money(p.price)}, ${p.marginPct != null ? `margin ${p.marginPct}%` : "no cost price (margin unknown)"}, stock ${p.stock}`)
        .join("\n")
    : "- (no products yet)";
  const connected = Object.entries(s.connected)
    .map(([k, v]) => `${k}: ${v ? "connected" : "NOT connected"}`)
    .join(", ");
  return `BUSINESS: ${s.name} — sells ${s.niche}. Business model: ${s.businessModel ?? "not stated"}. Orbit plan: ${s.plan}.${sellerAnswersBlock(s.onboardingAnswers)}
LAST 30 DAYS (real): ${s.last30.orders} valid orders, revenue ${money(s.last30.revenue)}, avg order ${money(s.last30.aov)}, ${s.last30.cancelled} cancelled, ${s.last30.newCustomers} new customers, ${s.last30.repeatCustomers} returning customers.
PREVIOUS 30 DAYS: ${s.prev30.orders} orders, revenue ${money(s.prev30.revenue)}.
ALL TIME: ${s.allTimeOrders} orders from ${s.allTimeCustomers} customers.
STORE TRAFFIC (30d): ${s.visitors30 >= s.last30.orders && s.visitors30 > 0 ? `${s.visitors30} visitors, conversion ${s.conversion30}%` : `${s.visitors30} tracked visitors — visitor tracking is incomplete (fewer tracked visitors than orders), so do NOT quote a conversion rate`}.
PRODUCTS:
${products}
CONNECTED: ${connected}.
FEATURES ALREADY ON: ${s.featuresOn.length ? s.featuresOn.join(", ") : "none"}.
ACTIVE COUPONS: ${s.activeCoupons.length ? s.activeCoupons.join(", ") : "none"}.`;
}

export interface RawStrategy {
  title?: string;
  kind?: string;
  audience?: string;
  why?: string;
  steps?: Array<{ text?: string; owner?: string; note?: string }> | string;
  duration_days?: number;
  metric_type?: string;
  metric_label?: string;
  coupon_code?: string;
  target?: number;
  discount_pct?: number;
  cost_note?: string;
}

/** Models occasionally send a nested array as a JSON *string*; accept both. */
export function coerceArray<T>(v: unknown): T[] {
  if (typeof v === "string") {
    try {
      v = JSON.parse(v);
    } catch {
      return [];
    }
  }
  return Array.isArray(v) ? (v as T[]) : [];
}

/** Model output -> validated Strategy row fields (profit guard included). Pure. */
export function strategyData(s: RawStrategy, products: BusinessSnapshot["products"]) {
  const kind = (STRATEGY_KINDS as readonly string[]).includes(s.kind ?? "") ? (s.kind as string) : "other";
  const metricType = s.metric_type && s.metric_type in METRIC_TYPES ? s.metric_type : "manual";
  const discountPct = typeof s.discount_pct === "number" && s.discount_pct > 0 && s.discount_pct < 100 ? s.discount_pct : null;
  const steps = coerceArray<{ text?: string; owner?: string; note?: string }>(s.steps)
    .filter((st) => st && typeof st.text === "string" && st.text.trim())
    .map((st) => ({
      text: String(st.text).slice(0, 400),
      owner: ["orbit", "seller", "not_possible"].includes(st.owner ?? "") ? st.owner : "seller",
      ...(st.note ? { note: String(st.note).slice(0, 300) } : {}),
    }));
  return {
    title: String(s.title ?? "Untitled strategy").slice(0, 140),
    kind,
    audience: String(s.audience ?? "").slice(0, 300),
    why: String(s.why ?? "").slice(0, 800),
    steps: JSON.stringify(steps),
    durationDays: typeof s.duration_days === "number" && s.duration_days > 0 ? Math.min(365, Math.round(s.duration_days)) : null,
    metric: JSON.stringify({
      type: metricType,
      label: String(s.metric_label ?? "").slice(0, 160),
      ...(metricType === "coupon_orders" && s.coupon_code ? { couponCode: String(s.coupon_code).toUpperCase().replace(/\s+/g, "").slice(0, 30) } : {}),
      ...(typeof s.target === "number" && Number.isFinite(s.target) ? { target: s.target } : {}),
    }),
    costNote: s.cost_note ? String(s.cost_note).slice(0, 300) : null,
    discountPct,
    profitNote: profitGuard(discountPct, products),
  };
}

/** How the Orchestrator thinks about a plan + the honest capability/measurement rules. */
export function plannerPrinciples(): string {
  return `HOW YOU THINK
- The base of the plan is THIS business: its real numbers, products, margins, capacity, and what is connected. Diagnose its real bottleneck first, then design strategies aimed at it.
- Competitor notes (if any) are optional reference knowledge. Never build the plan around copying or reacting to competitors.
- Think out of the box. Propose genuinely different kinds of strategies (word of mouth, loyalty, surprise-and-delight, partnerships, offers, content, operations, ads...) — specific, human, memorable, the kind a sharp founder would think of. Not generic advice like "post more on social media" or "run ads".
- At least HALF of the strategies must be unconventional for this niche — something a customer would talk about or remember (e.g. a ritual, a surprise, a personal touch, a community moment, an unusual collaboration, a product twist, a limited drop). Invent them for THIS business; don't reuse stock examples. The rest can be solid fundamentals if the numbers call for them.
- Each strategy must be a different kind of lever. Never two strategies that are just "a discount code shared somewhere".
- A zero-sales business cannot use tactics that need existing traffic or customers (cart recovery, A/B tests, repeat offers). Match tactics to the stage the numbers show.
- Protect profit. Never propose blanket heavy discounts. If a strategy gives a percentage discount, set discount_pct so real code can check it against margins.
- Durations fit the idea (a 5-day drop, a 45-day loyalty loop, or ongoing). Repeating something that works is fine.
- Every number you mention must come from the snapshot or the market research. Never invent sales figures, market sizes or conversion rates.
- Use the MARKET RESEARCH (when given) for timing (upcoming festivals, seasons, paydays — plan around real dates), the channels buyers in this niche actually use, and the doubts that stop them buying. Use the PLAYBOOK as proven patterns to adapt, and ORBIT'S OWN RESULTS as real evidence of what works for similar stores.
- Timing: at least one strategy must be built around a real upcoming moment in the next 60 days — from the research calendar, or a well-known season for this niche (e.g. winter cold-and-flu season for herbal remedies, wedding season, exams, a payday) — and say the dates.
- Foundation + originals: the PLAYBOOK basics that this store is missing (trust page, COD confirmation, thank-you cards, bundle ladder, WhatsApp Status, community groups, free-delivery threshold…) go together into ONE strategy titled "Foundation: …" (kind operations) — its steps are those basics. EVERY other strategy must be an original idea invented for THIS store — built on its specific products, city, buyers, story and the research — the kind a customer would talk about. If an idea could be pasted into any other store unchanged, it's not good enough.
- To invent the originals, think from angles like these (angles, not ideas to copy): the product's own story and origin; the buyer's daily or seasonal rituals; a local moment or place only this city has; an unusual partner whose customers overlap; a twist on the product itself (size, format, personalisation, a kit); a service wrapped around the product (advice, a routine, a follow-up); something the buyer can show or gift to others. Each original must use a real fact from the snapshot or the research.
- Make the store fit the plan: at least one strategy must include an "orbit" step that shapes the storefront around it with Orbit Design (hero message, a trust / proof section, a landing page for the offer, a gift or bundle page) — the store should look like it was built for this plan.
- Health, food and beauty: never plan cure or treatment claims, "guaranteed results" or fake reviews.
- Never assume the seller has something they didn't tell you — a shop, a pickup point, an address, staff, a supplier, a certificate, a family recipe. A step that depends on one is owner "seller" with a note to confirm it first, and no "orbit" step may put it on the store or the checkout until they have.

HONEST EXECUTION TAGS — for EVERY step:
ORBIT CAN (owner "orbit"; if it needs a connection that is NOT connected, still use "orbit" but say in note to connect it first):
${ORBIT_CAN.map((c) => `- ${c}`).join("\n")}
ORBIT CANNOT YET (owner "seller" if a human can do it by hand — say so in the note; otherwise "not_possible"):
${ORBIT_CANNOT_YET.map((c) => `- ${c}`).join("\n")}

MEASUREMENT: pick the metric real code can compute (${Object.entries(METRIC_TYPES)
    .map(([k, v]) => `${k} = ${v}`)
    .join("; ")}). Prefer a dedicated coupon code per strategy when the strategy brings orders, so its orders can be counted exactly. Use "manual" only when nothing in the store can capture it.

Write in clear, simple English. Be concrete.`;
}

export async function draftGrowthPlan(businessId: string, sellerNote?: string): Promise<{ planId: string }> {
  await assertUnderUsageCap(businessId);
  const snapshot = await getBusinessSnapshot(businessId);
  // Beyond the store's own numbers: fresh market research (web), proven playbook patterns for its
  // stage + niche, and Orbit's own measured results on similar stores.
  const pb = playbookFor(snapshot);
  const [research, learned] = await Promise.all([
    researchMarket(businessId, snapshot),
    learnedOutcomesFor(businessId, pb.niches, pb.stage).catch(() => ""),
  ]);
  const ideas = await brainstormIdeas(businessId, snapshotText(snapshot), research?.brief ?? null);

  const system = `You are the Strategy Orchestrator of Orbit, an e-commerce growth OS — a senior growth operator who has grown many small brands from zero. You design growth plans for ONE specific business.

${plannerPrinciples()}`;

  const userMsg = `${snapshotText(snapshot)}
${snapshot.competitorNotes.length ? `\nCOMPETITOR NOTES (reference only, do not build the plan on these):\n${snapshot.competitorNotes.map((c) => `- ${c}`).join("\n")}` : ""}
${research ? `\nMARKET RESEARCH (searched on the web ${research.at.slice(0, 10)}):\n${research.brief}` : "\nMARKET RESEARCH: not available this time — rely on the playbook and general knowledge, and don't state market facts as certain."}

${pb.text}
${ideas ? `
BRAINSTORMED ORIGINAL IDEAS for this store (made just now — at least 2 of the non-Foundation strategies MUST be built on ideas from this list — pick the strongest, sharpen or combine them; a plain seasonal bundle or discount is not enough on its own):
${ideas}
` : ""}${learned ? `\n${learned}` : ""}
${sellerNote?.trim() ? `\nTHE SELLER SAYS: ${sellerNote.trim().slice(0, 1500)}` : ""}

Draft the plan now with the propose_growth_plan tool.`;

  // The nested tool payload occasionally comes back malformed (e.g. the strategies array as broken
  // text). Try twice before giving up — a transient model glitch shouldn't cost the seller a plan.
  let input: { title?: string; diagnosis?: string; strategies?: unknown } = {};
  let strategies: RawStrategy[] = [];
  for (let attempt = 1; attempt <= 2; attempt++) {
    const msg = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 8000,
      system,
      tools: [PLAN_TOOL],
      tool_choice: { type: "tool", name: PLAN_TOOL.name },
      messages: [{ role: "user", content: userMsg }],
    });
    await prisma.agentUsage.create({
      data: {
        businessId,
        agentId: "strategy-planner",
        model: MODEL,
        inputTokens: msg.usage.input_tokens,
        outputTokens: msg.usage.output_tokens,
        costUsd: estimateCostUsd(MODEL, msg.usage.input_tokens, msg.usage.output_tokens),
      },
    });
    const block = msg.content.find((b): b is Anthropic.Messages.ToolUseBlock => b.type === "tool_use");
    input = (block?.input ?? {}) as typeof input;
    // Validate shape even though the tool call "succeeded" — a parsed-but-wrong shape must not crash.
    strategies = coerceArray<RawStrategy>(input.strategies).filter((x) => !!x && typeof x.title === "string");
    if (input.diagnosis && strategies.length > 0) break;
    console.warn(`[strategy-planner] unusable plan (attempt ${attempt})`, msg.stop_reason, JSON.stringify(input).slice(0, 400));
  }
  if (!input.diagnosis || strategies.length === 0) {
    throw new Error("The planner didn't return a usable plan — try again.");
  }
  const diagnosis = input.diagnosis;

  // Only one open draft at a time: a new draft replaces the old one (an active plan is untouched).
  await prisma.growthPlan.deleteMany({ where: { businessId, status: "draft" } });

  const plan = await prisma.growthPlan.create({
    data: {
      businessId,
      title: (input.title?.trim() || `Growth plan — ${new Date().toLocaleDateString("en-GB", { day: "numeric", month: "short" })}`).slice(0, 120),
      diagnosis: diagnosis.slice(0, 1500),
      snapshot: JSON.stringify({ ...snapshot, research, stage: pb.stage, niches: pb.niches }),
      status: "draft",
      strategies: {
        create: strategies.map((s, i) => ({ businessId, position: i, ...strategyData(s, snapshot.products) })),
      },
    },
  });

  return { planId: plan.id };
}
