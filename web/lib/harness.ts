import type Anthropic from "@anthropic-ai/sdk";
import { anthropic, MODEL } from "@/lib/anthropic";
import { prisma } from "@/lib/prisma";
import { estimateCostUsd } from "@/lib/pricing";
import { assertUnderUsageCap } from "@/lib/usage-limit";
import { parseCheckoutCustomFields } from "@/lib/checkout-fields";
import { createBundle } from "@/lib/bundles";
import { publishFacebookPost } from "@/lib/meta-graph";
import { parseMetric, parseSteps } from "@/lib/strategy-lab";
import { staffPlan, retireIdleAgents, parseJsonList } from "@/lib/plan-agents";
import { postOrbitWorkSummary } from "@/lib/strategy-review";

/**
 * Harness — the real tools Orbit uses to carry out the "Orbit" steps of an approved strategy.
 * Every tool is plain code with its own guard rails; the model only chooses which tool to call and
 * with what input. Every call is logged as a StrategyAction (what happened, in plain words), and
 * anything Orbit writes for the seller (captions, messages, briefs) is kept there to copy.
 *
 * The seller's approval of the plan is the permission for these actions. Nothing here moves money
 * or spends ad budget; publishing only happens on a channel the seller connected themselves.
 */

type Status = "done" | "skipped" | "failed" | "needs_connection" | "deliverable";
interface ToolResult {
  status: Status;
  summary: string;
  output?: string;
}
type Input = Record<string, unknown>;

const str = (v: unknown, max = 500) => (typeof v === "string" ? v.trim().slice(0, max) : "");
const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : typeof v === "string" && v.trim() && Number.isFinite(Number(v)) ? Number(v) : null);

async function findProducts(businessId: string, names: string[]) {
  const all = await prisma.product.findMany({ where: { businessId }, select: { id: true, name: true, price: true } });
  return names.map((n) => {
    const q = n.toLowerCase().trim();
    return all.find((p) => p.name.toLowerCase() === q) ?? all.find((p) => p.name.toLowerCase().includes(q) || q.includes(p.name.toLowerCase())) ?? null;
  });
}

interface HarnessTool {
  def: Anthropic.Messages.Tool;
  run: (businessId: string, input: Input) => Promise<ToolResult>;
}

const TOOLS: HarnessTool[] = [
  {
    def: {
      name: "create_coupon",
      description: "Create a coupon code in the store (the code a strategy uses to bring and count its orders).",
      input_schema: {
        type: "object",
        properties: {
          code: { type: "string", description: "UPPERCASE, no spaces — use the strategy's coupon code if it has one." },
          type: { type: "string", enum: ["percent", "fixed"] },
          value: { type: "number", description: "Percent off (1-50) or fixed amount off." },
          first_order_only: { type: "boolean" },
          per_customer_limit: { type: "integer" },
          free_shipping: { type: "boolean" },
          min_subtotal: { type: "number" },
          expires_in_days: { type: "integer" },
          product_names: { type: "array", items: { type: "string" }, description: "Only if the discount is limited to these products." },
        },
        required: ["code", "type", "value"],
      },
    },
    async run(businessId, i) {
      const code = str(i.code, 30).toUpperCase().replace(/\s+/g, "");
      const type = i.type === "fixed" ? "fixed" : "percent";
      const value = num(i.value);
      if (!code || value == null || value <= 0) return { status: "failed", summary: "Coupon needs a code and a value above 0." };
      if (type === "percent" && value > 50) return { status: "skipped", summary: `Didn't create ${code}: ${value}% is above Orbit's 50% safety limit — set it by hand if you really want it.` };
      const existing = await prisma.coupon.findUnique({ where: { businessId_code: { businessId, code } } });
      if (existing) return { status: "skipped", summary: `Coupon ${code} already exists — kept as is.` };
      let productIds: string[] | null = null;
      if (Array.isArray(i.product_names) && i.product_names.length) {
        const found = (await findProducts(businessId, i.product_names.map(String))).filter(Boolean);
        productIds = found.map((p) => p!.id);
      }
      const days = num(i.expires_in_days);
      await prisma.coupon.create({
        data: {
          businessId,
          code,
          type,
          value,
          firstOrderOnly: i.first_order_only === true,
          perCustomerLimit: num(i.per_customer_limit) ?? null,
          freeShipping: i.free_shipping === true,
          minSubtotal: num(i.min_subtotal) ?? null,
          productIds: productIds?.length ? JSON.stringify(productIds) : null,
          expiresAt: days && days > 0 ? new Date(Date.now() + days * 86400000) : null,
        },
      });
      return { status: "done", summary: `Created coupon ${code} (${type === "percent" ? `${value}% off` : `${value} off`}${i.first_order_only === true ? ", first order only" : ""}${i.free_shipping === true ? ", free shipping" : ""}).` };
    },
  },
  {
    def: {
      name: "enable_loyalty",
      description: "Turn on the store's loyalty points program (points on every confirmed order, redeemable at checkout).",
      input_schema: { type: "object", properties: {} },
    },
    async run(businessId) {
      const b = await prisma.business.findUniqueOrThrow({ where: { id: businessId }, select: { loyaltyEnabled: true } });
      if (b.loyaltyEnabled) return { status: "skipped", summary: "Loyalty points were already on." };
      await prisma.business.update({ where: { id: businessId }, data: { loyaltyEnabled: true } });
      return { status: "done", summary: "Turned on loyalty points." };
    },
  },
  {
    def: {
      name: "enable_referral",
      description: "Turn on the referral program (rewards paid as loyalty points, so loyalty is turned on too).",
      input_schema: {
        type: "object",
        properties: { referrer_points: { type: "integer" }, referee_points: { type: "integer" } },
      },
    },
    async run(businessId, i) {
      const b = await prisma.business.findUniqueOrThrow({ where: { id: businessId }, select: { referralEnabled: true, loyaltyEnabled: true } });
      if (b.referralEnabled) return { status: "skipped", summary: "Referral program was already on." };
      const referrer = num(i.referrer_points);
      const referee = num(i.referee_points);
      await prisma.business.update({
        where: { id: businessId },
        data: {
          referralEnabled: true,
          loyaltyEnabled: true,
          ...(referrer && referrer > 0 && referrer <= 5000 ? { referralReferrerPoints: Math.round(referrer) } : {}),
          ...(referee && referee > 0 && referee <= 5000 ? { referralRefereePoints: Math.round(referee) } : {}),
        },
      });
      return { status: "done", summary: `Turned on referrals${b.loyaltyEnabled ? "" : " (and loyalty points, which pay the rewards)"}.` };
    },
  },
  {
    def: { name: "enable_gift_cards", description: "Turn on gift cards for the store.", input_schema: { type: "object", properties: {} } },
    async run(businessId) {
      const b = await prisma.business.findUniqueOrThrow({ where: { id: businessId }, select: { giftCardsEnabled: true } });
      if (b.giftCardsEnabled) return { status: "skipped", summary: "Gift cards were already on." };
      await prisma.business.update({ where: { id: businessId }, data: { giftCardsEnabled: true } });
      return { status: "done", summary: "Turned on gift cards." };
    },
  },
  {
    def: {
      name: "enable_cod_confirmation",
      description: "Require COD shoppers to confirm their order (WhatsApp reply / link) before it counts.",
      input_schema: { type: "object", properties: {} },
    },
    async run(businessId) {
      const b = await prisma.business.findUniqueOrThrow({ where: { id: businessId }, select: { codVerification: true } });
      if (b.codVerification) return { status: "skipped", summary: "COD confirmation was already on." };
      await prisma.business.update({ where: { id: businessId }, data: { codVerification: true } });
      return { status: "done", summary: "Turned on COD order confirmation." };
    },
  },
  {
    def: {
      name: "add_checkout_field",
      description: "Add an extra field to the store's checkout (e.g. date of birth, name to print, who is this gift for). Answers are saved on each order.",
      input_schema: {
        type: "object",
        properties: {
          label: { type: "string" },
          type: { type: "string", enum: ["text", "textarea", "checkbox"] },
          required: { type: "boolean", description: "Almost always false — don't block checkout." },
        },
        required: ["label"],
      },
    },
    async run(businessId, i) {
      const label = str(i.label, 80);
      if (!label) return { status: "failed", summary: "Checkout field needs a label." };
      const b = await prisma.business.findUniqueOrThrow({ where: { id: businessId }, select: { checkoutCustomFields: true } });
      const fields = parseCheckoutCustomFields(b.checkoutCustomFields);
      const norm = (x: string) => x.toLowerCase().replace(/\([^)]*\)/g, "").replace(/[^a-z0-9 ]/g, "").replace(/\s+/g, " ").trim().slice(0, 24);
      const dupe = fields.find((f) => norm(f.label) === norm(label) || norm(f.label).startsWith(norm(label)) || norm(label).startsWith(norm(f.label)));
      if (dupe) return { status: "skipped", summary: `Checkout already asks "${dupe.label}".` };
      if (fields.length >= 8) return { status: "skipped", summary: "Checkout already has 8 extra fields — not adding more." };
      const key = label.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "").slice(0, 40) || `field_${fields.length + 1}`;
      fields.push({ key, label, type: i.type === "textarea" || i.type === "checkbox" ? i.type : "text", required: i.required === true });
      await prisma.business.update({ where: { id: businessId }, data: { checkoutCustomFields: JSON.stringify(fields) } });
      return { status: "done", summary: `Added "${label}" to checkout (optional${i.required === true ? " → required" : ""}).` };
    },
  },
  {
    def: {
      name: "create_bundle",
      description: "Create a product bundle sold at one price.",
      input_schema: {
        type: "object",
        properties: {
          name: { type: "string" },
          description: { type: "string" },
          price: { type: "number", description: "Bundle price in the store currency — must still be profitable." },
          items: {
            type: "array",
            items: { type: "object", properties: { product_name: { type: "string" }, qty: { type: "integer" } }, required: ["product_name"] },
          },
        },
        required: ["name", "price", "items"],
      },
    },
    async run(businessId, i) {
      const name = str(i.name, 160);
      const price = num(i.price);
      const items = Array.isArray(i.items) ? (i.items as Input[]) : [];
      if (!name || !price || !items.length) return { status: "failed", summary: "Bundle needs a name, a price and products." };
      const found = await findProducts(businessId, items.map((x) => str(x.product_name, 160)));
      if (found.some((f) => !f)) return { status: "failed", summary: `Couldn't match every product in the bundle "${name}" to a real product.` };
      const full = found.reduce((s, p, k) => s + p!.price * Math.max(1, Math.floor(num(items[k].qty) ?? 1)), 0);
      if (price > full) return { status: "skipped", summary: `Bundle "${name}" at ${price} would cost more than buying the items separately (${full}).` };
      await createBundle(businessId, {
        name,
        description: str(i.description, 500) || null,
        price,
        items: found.map((p, k) => ({ productId: p!.id, qty: Math.max(1, Math.floor(num(items[k].qty) ?? 1)) })),
      });
      return { status: "done", summary: `Created bundle "${name}" at ${price} (items normally ${Math.round(full)}).` };
    },
  },
  {
    def: {
      name: "write_for_seller",
      description:
        "Write something the seller will use by hand: a caption, a WhatsApp/email message, a script, product copy, a card text, an Orbit Design page brief. Write the FULL finished text in `text`.",
      input_schema: {
        type: "object",
        properties: {
          kind: { type: "string", enum: ["caption", "message", "script", "copy", "card", "page_brief", "other"] },
          title: { type: "string", description: "What it is, e.g. 'Thank-you WhatsApp message for first customers'." },
          text: { type: "string", description: "The finished text, ready to copy. For several variants, separate them with a blank line." },
        },
        required: ["kind", "title", "text"],
      },
    },
    async run(_businessId, i) {
      const text = str(i.text, 6000);
      if (!text) return { status: "failed", summary: "Nothing was written." };
      const title = str(i.title, 160) || "Written for you";
      const hint = i.kind === "page_brief" ? " — paste it into Orbit Design to build the page." : " — ready to copy.";
      return { status: "deliverable", summary: `${title}${hint}`, output: text };
    },
  },
  {
    def: {
      name: "publish_facebook_post",
      description: "Publish a text post to the seller's connected Facebook Page.",
      input_schema: { type: "object", properties: { text: { type: "string" } }, required: ["text"] },
    },
    async run(businessId, i) {
      const text = str(i.text, 3000);
      if (!text) return { status: "failed", summary: "Post had no text." };
      const b = await prisma.business.findUniqueOrThrow({ where: { id: businessId }, select: { metaPageId: true, metaAccessToken: true, metaPageName: true } });
      if (!b.metaPageId || !b.metaAccessToken) {
        return { status: "needs_connection", summary: "Facebook isn't connected — here's the post to publish yourself, or connect Facebook in Settings.", output: text };
      }
      const r = await publishFacebookPost(b.metaPageId, b.metaAccessToken, text);
      if (!r.ok) return { status: "failed", summary: `Facebook rejected the post: ${r.error}`, output: text };
      return { status: "done", summary: `Published a post to ${b.metaPageName ?? "your Facebook Page"}.`, output: text };
    },
  },
];

const BY_NAME = new Map(TOOLS.map((t) => [t.def.name, t]));
const STALE_RUN_MS = 10 * 60 * 1000;

export const HARNESS_TOOL_NAMES = TOOLS.map((t) => t.def.name);

/**
 * Carry out the Orbit steps of one strategy. Safe to call again: tools skip what already exists,
 * and a strategy that already ran is not re-run unless `force`.
 */
export async function executeStrategy(businessId: string, strategyId: string, opts: { force?: boolean } = {}): Promise<number> {
  const s = await prisma.strategy.findFirst({
    where: { id: strategyId, businessId },
    include: { plan: { select: { status: true } }, agent: true },
  });
  if (!s || s.plan.status !== "active" || s.status !== "running") return 0;
  const agent = s.agent && s.agent.status === "active" ? s.agent : null;
  // Atomic claim: only one run per strategy even if two triggers race (approve + page load).
  const claim = await prisma.strategy.updateMany({
    where: { id: s.id, ...(opts.force ? {} : { executedAt: null }) },
    data: { executedAt: new Date() },
  });
  if (claim.count === 0) return 0;

  const steps = parseSteps(s.steps);
  const orbitSteps = steps.filter((st) => st.owner === "orbit");
  if (orbitSteps.length === 0) return 0;

  await assertUnderUsageCap(businessId);
  // A hired agent works inside its own budget (carved from the owner's monthly cap).
  if (agent && agent.spentUsd >= agent.budgetUsd) {
    await prisma.strategyAction.create({
      data: {
        strategyId: s.id,
        businessId,
        tool: "budget",
        input: "{}",
        status: "skipped",
        summary: `${agent.name} has used its budget (${agent.spentUsd.toFixed(2)} of ${agent.budgetUsd.toFixed(2)} USD) — ask the Orchestrator to give it more or do these steps yourself.`,
      },
    });
    return 1;
  }
  const allowedTools = agent ? new Set(parseJsonList(agent.tools)) : null;
  const scopes = agent ? new Set(parseJsonList(agent.dataScopes)) : null;
  const toolDefs = TOOLS.filter((t) => !allowedTools || allowedTools.has(t.def.name)).map((t) => t.def);
  const business = await prisma.business.findUniqueOrThrow({
    where: { id: businessId },
    select: { name: true, niche: true, storeCurrency: true, products: { select: { name: true, price: true, costPrice: true }, take: 40 } },
  });
  const metric = parseMetric(s.metric);
  // Media library: listed only for agents granted "media" (the default executor sees it too).
  const media =
    !scopes || scopes.has("media")
      ? await prisma.mediaAsset.findMany({ where: { businessId }, orderBy: { createdAt: "desc" }, take: 20, select: { kind: true, name: true, url: true, text: true } })
      : null;

  const persona = agent
    ? `You are ${agent.name}, a specialist the Orchestrator hired for this plan. Your job: ${agent.role} How you work: ${agent.instructions}
You may ONLY use the tools you were given. `
    : "You are Orbit's executor. ";
  const system = `${persona}The seller approved this growth strategy; carry out ONLY ITS steps marked [orbit] by calling the tools. Call every tool you need in this one response.
- Every tool call must serve one of THIS strategy's [orbit] steps listed below. Even if your wider role covers other strategies, do nothing for them now — they run separately.
Rules:
- One step can need several tools; a step that is just writing (captions, messages, copy, scripts, card text, page briefs) = write_for_seller with the finished text, written for THIS brand, in a natural voice.
- If the strategy has a coupon code, create exactly that coupon with create_coupon (match the discount the strategy describes; if none is described, use a small one).
- Never do [seller] or [not_possible] steps. Never invent a tool. If no tool fits an [orbit] step, write_for_seller what Orbit would produce for it.
- Don't write anything misleading (fake reviews, fake scarcity, fake stats).`;

  const user = `BUSINESS: ${business.name} — ${business.niche}. Currency: ${business.storeCurrency.toUpperCase()}.
PRODUCTS: ${!scopes || scopes.has("products") ? business.products.map((p) => `${p.name} (${p.price}${p.costPrice != null ? `, cost ${p.costPrice}` : ""})`).join("; ") || "none" : "(not granted to you)"}
MEDIA LIBRARY (owner's own files — use these real links in posts/content instead of asking again): ${media === null ? "(not granted to you)" : media.length ? media.map((m) => `${m.kind} "${m.name}" ${m.url}${m.kind === "audio" && m.text ? ` — says: "${m.text.slice(0, 200)}"` : ""}`).join("; ") : "empty"}

STRATEGY: ${s.title}
For: ${s.audience}
Why: ${s.why}
Discount in this strategy: ${s.discountPct ? `${s.discountPct}%` : "none stated"}
Coupon code for measuring: ${metric.couponCode ?? "none"}
Steps:
${steps.map((st, k) => `${k + 1}. [${st.owner}] ${st.text}${st.note ? ` (${st.note})` : ""}`).join("\n")}`;

  const msg = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 8000,
    system,
    tools: toolDefs,
    tool_choice: { type: "any" },
    messages: [{ role: "user", content: user }],
  });
  const cost = estimateCostUsd(MODEL, msg.usage.input_tokens, msg.usage.output_tokens);
  await prisma.agentUsage.create({
    data: {
      businessId,
      agentId: agent ? `hired:${agent.name}` : "strategy-executor",
      model: MODEL,
      inputTokens: msg.usage.input_tokens,
      outputTokens: msg.usage.output_tokens,
      costUsd: cost,
    },
  });
  if (agent) await prisma.planAgent.update({ where: { id: agent.id }, data: { spentUsd: { increment: cost } } });

  const calls = msg.content.filter((b): b is Anthropic.Messages.ToolUseBlock => b.type === "tool_use");
  let n = 0;
  for (const call of calls.slice(0, 12)) {
    const tool = BY_NAME.get(call.name);
    const input = (call.input ?? {}) as Input;
    let result: ToolResult;
    try {
      if (allowedTools && !allowedTools.has(call.name)) {
        // Grants are enforced in code, not just in the prompt.
        result = { status: "skipped", summary: `${agent?.name ?? "This agent"} isn't allowed to use ${call.name}.` };
      } else {
        result = tool ? await tool.run(businessId, input) : { status: "failed", summary: `Unknown tool ${call.name}.` };
      }
    } catch (e) {
      result = { status: "failed", summary: `${call.name} failed: ${e instanceof Error ? e.message : "unknown error"}` };
    }
    await prisma.strategyAction.create({
      data: {
        strategyId: s.id,
        businessId,
        tool: call.name,
        input: JSON.stringify(input).slice(0, 8000),
        status: result.status,
        summary: result.summary.slice(0, 500),
        output: result.output ?? null,
      },
    });
    n++;
  }
  return n;
}

/**
 * Run every running strategy of the active plan that hasn't been executed yet. On the Max plan the
 * Orchestrator first staffs the plan with hired agents. Afterwards Orbit tells the owner in the
 * Orchestrator chat what it did.
 */
export async function executeActivePlan(businessId: string): Promise<void> {
  const active = await prisma.growthPlan.findFirst({ where: { businessId, status: "active" }, select: { id: true } });
  if (!active) return;
  try {
    await staffPlan(businessId, active.id, HARNESS_TOOL_NAMES);
  } catch (e) {
    console.warn("[harness] staffing failed", e);
  }
  const pending = await prisma.strategy.findMany({
    where: { businessId, status: "running", executedAt: null, planId: active.id },
    select: { id: true },
  });
  // A run that was cut off (server restart/deploy mid-run) leaves executedAt set but no actions.
  const stale = await prisma.strategy.findMany({
    where: { businessId, status: "running", planId: active.id, executedAt: { lt: new Date(Date.now() - STALE_RUN_MS) }, actions: { none: {} } },
    select: { id: true, steps: true },
  });
  const staleIds = new Set(stale.filter((x) => parseSteps(x.steps).some((st) => st.owner === "orbit")).map((x) => x.id));
  const ran: string[] = [];
  for (const p of [...pending, ...[...staleIds].map((id) => ({ id }))]) {
    try {
      if ((await executeStrategy(businessId, p.id, { force: staleIds.has(p.id) })) > 0) ran.push(p.id);
    } catch (e) {
      console.warn("[harness] strategy execution failed", p.id, e);
    }
  }
  try {
    await postOrbitWorkSummary(businessId, ran);
    await retireIdleAgents(businessId);
  } catch (e) {
    console.warn("[harness] post-run bookkeeping failed", e);
  }
}
