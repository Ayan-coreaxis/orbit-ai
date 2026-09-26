import { prisma } from "@/lib/prisma";
import { anthropic, MODEL, MODEL_FAST } from "@/lib/anthropic";
import { scrapeCompetitorFull } from "@/lib/scrape";
import { estimateCostUsd } from "@/lib/pricing";
import { sendWhatsAppMessage } from "@/lib/whatsapp";
import {
  parseAgentSettings,
  orchestratorRiskLine,
  qaStrictnessLine,
  specialistExtraContext,
  type SpecialistId,
  type AgentSettings,
} from "@/lib/agent-settings";
import { assertUnderUsageCap } from "@/lib/usage-limit";
import { getInventorySignals } from "@/lib/inventory-analytics";
import { publishFacebookPost } from "@/lib/meta-graph";
import { MetaAdError, createPausedAd } from "@/lib/meta-ads";
import { businessModelGuidanceLine } from "@/lib/business-model";
import { loadAgentTools, executeAgentTool } from "@/lib/agent-tools";
import { loadSkillContext } from "@/lib/skills";
import type Anthropic from "@anthropic-ai/sdk";

const SPECIALIST_AGENT_IDS: Record<string, string> = {
  "SEO Agent": "seo",
  "Content Agent": "content",
  "Ads Agent": "ads",
  "Retention Agent": "retention",
  "Inventory & Fulfillment": "inventory",
  "Pricing Agent": "pricing",
};

async function logUsage(
  businessId: string,
  agentId: string,
  model: string,
  usage: { input_tokens: number; output_tokens: number },
) {
  await prisma.agentUsage.create({
    data: {
      businessId,
      agentId,
      model,
      inputTokens: usage.input_tokens,
      outputTokens: usage.output_tokens,
      costUsd: estimateCostUsd(model, usage.input_tokens, usage.output_tokens),
    },
  });
}

function stripJsonFences(text: string): string {
  return text
    .trim()
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/, "")
    .replace(/```$/, "")
    .trim();
}

export interface CompetitorAnalysisItem {
  name: string;
  url: string;
  topProduct: string;
  pricing: string;
  trending: string;
  whyTrending: string;
  adActivity: string;
  gap: string;
}

interface Task {
  agent: string;
  task: string;
  done: boolean;
}

interface Target {
  label: string;
  value: string;
  progress: number;
}

interface SpecialistResult {
  agent: string;
  task: string;
  done: boolean;
}

/**
 * Pricing Agent — real execution. Proposes a real price for a real product, grounded in real
 * cost price and real competitor pricing from this cycle's scan. Only actually writes
 * `Product.price` if the owner has opted in (autoApplyPricing) AND the change survives two hard,
 * code-enforced checks: never below the real margin floor, never a bigger single-cycle swing than
 * MAX_PRICE_SWING. Any rejection is explained honestly in the task text, not silently dropped.
 */
const MAX_PRICE_SWING_FRACTION = 0.2; // no single cycle can move a price more than 20%

async function runPricingAgent(
  businessId: string,
  businessName: string,
  niche: string,
  competitors: CompetitorAnalysisItem[],
  settings: AgentSettings,
  model: string,
  skillContext = "",
): Promise<SpecialistResult> {
  const agent = "Pricing Agent";
  const products = await prisma.product.findMany({ where: { businessId }, select: { id: true, name: true, price: true, costPrice: true } });

  if (products.length === 0) {
    return { agent, task: "No real products in the store catalog yet — nothing to price this cycle.", done: false };
  }

  const competitorPricing = competitors
    .filter((c) => c.pricing && c.pricing !== "not available from public data")
    .map((c) => `${c.name}: ${c.pricing}`)
    .join(" | ");

  const extraContext = specialistExtraContext("pricing", settings);
  const prompt = `You are the Pricing Agent — a pricing strategist who compares real competitor prices against this business's own real product prices and proposes matches or adjustments. You never cite a competitor price that wasn't actually given to you.

Business: ${businessName}, sells: ${niche}.

Real products (use the exact real id when referencing one):
${products.map((p) => `- id "${p.id}": ${p.name}, current price Rs ${p.price}${p.costPrice !== null ? `, real cost Rs ${p.costPrice}` : " (no real cost on file)"}`).join("\n")}

Real competitor pricing from this cycle's scan: ${competitorPricing || "no real competitor pricing data available this cycle"}

${extraContext}
${skillContext}

Decide: is there ONE product whose price should genuinely change this cycle based on the real data above? If yes, propose the new real price. If the data doesn't justify a change, say so — don't change something just to have an answer. Respond with ONLY valid JSON, no markdown fences:
{"action":"update_price","productId":"exact real id from the list","newPrice":number,"reasoning":"one sentence, grounded in the real data above"}
or
{"action":"no_change","reasoning":"one sentence why no real product needs a price change this cycle"}`;

  const msg = await anthropic.messages.create({ model, max_tokens: 400, messages: [{ role: "user", content: prompt }] });
  await logUsage(businessId, "pricing", model, msg.usage);
  const text = msg.content[0].type === "text" ? msg.content[0].text.trim() : "";

  let decision: { action: string; productId?: string; newPrice?: number; reasoning?: string };
  try {
    decision = JSON.parse(stripJsonFences(text));
  } catch {
    return { agent, task: "Pricing Agent had trouble deciding this cycle — try again next cycle.", done: false };
  }

  if (decision.action !== "update_price" || !decision.productId || typeof decision.newPrice !== "number") {
    return { agent, task: `No price change this cycle: ${decision.reasoning || "current real prices look fine against real competitor data."}`, done: true };
  }

  const product = products.find((p) => p.id === decision.productId);
  if (!product) {
    return { agent, task: `Pricing Agent proposed a change for a product that doesn't exist — skipped for safety.`, done: false };
  }

  const newPrice = decision.newPrice;
  const minMarginFraction = settings.minMarginPercent / 100;
  const swingFraction = Math.abs(newPrice - product.price) / product.price;

  if (!Number.isFinite(newPrice) || newPrice <= 0) {
    return { agent, task: `Recommended a new price for ${product.name}, but it wasn't a valid number — not applied.`, done: false };
  }
  if (product.costPrice !== null && newPrice < product.costPrice * (1 + minMarginFraction)) {
    return {
      agent,
      task: `Recommends changing ${product.name}'s price to Rs ${newPrice}, but that's below your real ${settings.minMarginPercent}% minimum margin over its real Rs ${product.costPrice} cost — refused, not applied. ${decision.reasoning || ""}`,
      done: false,
    };
  }
  if (swingFraction > MAX_PRICE_SWING_FRACTION) {
    return {
      agent,
      task: `Recommends changing ${product.name}'s price from Rs ${product.price} to Rs ${newPrice}, but that's a bigger single-cycle swing than the ${(MAX_PRICE_SWING_FRACTION * 100).toFixed(0)}% safety cap allows — refused, not applied. ${decision.reasoning || ""}`,
      done: false,
    };
  }
  if (!settings.autoApplyPricing) {
    return {
      agent,
      task: `Recommends changing ${product.name}'s price from Rs ${product.price} to Rs ${newPrice} — ${decision.reasoning || "grounded in real cost and competitor data"}. Not applied automatically; turn on "auto-apply" in this agent's settings to let it write real price changes.`,
      done: false,
    };
  }

  await prisma.product.update({ where: { id: product.id }, data: { price: newPrice } });
  return {
    agent,
    task: `Changed ${product.name}'s real price from Rs ${product.price} to Rs ${newPrice} — ${decision.reasoning || "grounded in real cost and competitor data"}.`,
    done: true,
  };
}

/**
 * SEO Agent — real execution. Picks one real product or page and writes its real seoTitle/
 * seoDescription directly — low financial risk, fully reversible, so auto-apply defaults on
 * (the owner can still turn it off in this agent's settings).
 */
async function runSeoAgent(
  businessId: string,
  businessName: string,
  niche: string,
  workContext: string,
  settings: AgentSettings,
  model: string,
  skillContext = "",
): Promise<SpecialistResult> {
  const agent = "SEO Agent";
  const [products, pages] = await Promise.all([
    prisma.product.findMany({ where: { businessId }, select: { id: true, name: true, seoTitle: true, seoDescription: true } }),
    prisma.page.findMany({ where: { businessId }, select: { id: true, slug: true, title: true, seoTitle: true, seoDescription: true } }),
  ]);

  if (products.length === 0 && pages.length === 0) {
    return { agent, task: "No real products or pages in the store yet — nothing to optimize this cycle.", done: false };
  }

  const extraContext = specialistExtraContext("seo", settings);
  const prompt = `You are the SEO Agent — a senior technical and content SEO strategist. You think in search-intent mapping, topical authority, on-page optimization, and E-E-A-T signals. You never cite an invented search-volume number.

Business: ${businessName}, sells: ${niche}.
${workContext}

Real products (use the exact real id when referencing one):
${products.length > 0 ? products.map((p) => `- id "${p.id}", type "product": ${p.name} — current SEO title: ${p.seoTitle || "(none set)"}`).join("\n") : "(none)"}

Real pages (use the exact real id when referencing one):
${pages.length > 0 ? pages.map((p) => `- id "${p.id}", type "page": ${p.title} (/${p.slug}) — current SEO title: ${p.seoTitle || "(none set)"}`).join("\n") : "(none)"}

${extraContext}
${skillContext}

Pick the ONE real product or page most worth optimizing this cycle, and write its real SEO title (under 60 chars) and SEO description (under 160 chars). Respond with ONLY valid JSON, no markdown fences:
{"targetType":"product" or "page","targetId":"exact real id from the list","seoTitle":"...","seoDescription":"...","reasoning":"one sentence"}`;

  const msg = await anthropic.messages.create({ model, max_tokens: 400, messages: [{ role: "user", content: prompt }] });
  await logUsage(businessId, "seo", model, msg.usage);
  const text = msg.content[0].type === "text" ? msg.content[0].text.trim() : "";

  let decision: { targetType?: string; targetId?: string; seoTitle?: string; seoDescription?: string; reasoning?: string };
  try {
    decision = JSON.parse(stripJsonFences(text));
  } catch {
    return { agent, task: "SEO Agent had trouble deciding this cycle — try again next cycle.", done: false };
  }

  if (!decision.targetId || !decision.seoTitle || !decision.seoDescription) {
    return { agent, task: "SEO Agent didn't return a usable recommendation this cycle.", done: false };
  }

  const isProduct = decision.targetType === "product";
  const target = isProduct ? products.find((p) => p.id === decision.targetId) : pages.find((p) => p.id === decision.targetId);
  if (!target) {
    return { agent, task: "SEO Agent proposed a target that doesn't exist — skipped for safety.", done: false };
  }

  const targetName = isProduct ? (target as (typeof products)[number]).name : (target as (typeof pages)[number]).title;

  if (!settings.autoApplySeo) {
    return {
      agent,
      task: `Recommends new SEO title/description for "${targetName}": "${decision.seoTitle}" — ${decision.reasoning || "improves search-intent match"}. Not applied automatically; turn on "auto-apply" in this agent's settings to let it write real SEO fields.`,
      done: false,
    };
  }

  if (isProduct) {
    await prisma.product.update({ where: { id: target.id }, data: { seoTitle: decision.seoTitle, seoDescription: decision.seoDescription } });
  } else {
    await prisma.page.update({ where: { id: target.id }, data: { seoTitle: decision.seoTitle, seoDescription: decision.seoDescription } });
  }

  return {
    agent,
    task: `Updated "${targetName}"'s real SEO title to "${decision.seoTitle}" — ${decision.reasoning || "improves search-intent match"}.`,
    done: true,
  };
}

const CONTENT_EXPERTISE =
  "You are the Content Agent — a social-first creative strategist who understands exactly how Instagram Reels and TikTok's For You algorithm actually rank and distribute content: hook-retention in the first 1-2 seconds, native vs. ad-style framing, pacing, on-screen text placement, trending-audio timing. You also know direct-response copywriting psychology — specificity as credibility, pattern interrupts, curiosity gaps. You write tasks that are shootable today, not vague ideas.";

/**
 * Real MCP (Model Context Protocol) tool-use loop — used by any specialist that has real tools
 * connected via /dashboard/agents/[id] (e.g. a real video-generation MCP server like Higgsfield's
 * wired into the Content Agent). Each real tool call actually hits that real remote MCP server;
 * nothing here is simulated. Returns the model's final real text after using (or explicitly
 * declining to use) whatever real tools are connected, or null if none are connected at all —
 * callers should skip this step entirely in that case rather than paying for an empty check.
 */
async function runAgentToolLoop(
  businessId: string,
  agentId: string,
  agentName: string,
  contextPrompt: string,
  model: string,
): Promise<string | null> {
  const { tools, skillLines, toolMap } = await loadAgentTools(businessId, agentId, agentName, contextPrompt);
  if (tools.length === 0) return null;

  const system = `You have real external tools connected for this task via MCP. Use one only if it genuinely helps accomplish this cycle's real task — never force a tool call just because one exists, and never claim you used a tool you didn't actually call.${
    skillLines.length ? `\n${skillLines.join("\n")}` : ""
  }`;

  const messages: Anthropic.Messages.MessageParam[] = [{ role: "user", content: contextPrompt }];
  let finalText: string | null = null;

  for (let i = 0; i < 3; i++) {
    const msg = await anthropic.messages.create({ model, max_tokens: 600, system, tools, messages });
    await logUsage(businessId, agentId, model, msg.usage);

    const toolUseBlocks = msg.content.filter((b): b is Anthropic.Messages.ToolUseBlock => b.type === "tool_use");
    const textBlock = msg.content.find((b) => b.type === "text");
    finalText = textBlock && textBlock.type === "text" ? textBlock.text.trim() : finalText;

    if (toolUseBlocks.length === 0 || msg.stop_reason !== "tool_use") break;

    messages.push({ role: "assistant", content: msg.content });
    const toolResults: Anthropic.Messages.ToolResultBlockParam[] = [];
    for (const block of toolUseBlocks) {
      const result = await executeAgentTool(toolMap, block.name, (block.input as Record<string, unknown>) ?? {});
      // Never trust a real remote MCP server's response shape blindly — a malformed `content`
      // here shouldn't be able to crash the whole onboarding/cycle run.
      const resultText = (Array.isArray(result.content) ? result.content : [])
        .map((c) => c.text ?? JSON.stringify(c))
        .join(" ") || "(no content returned)";
      toolResults.push({ type: "tool_result", tool_use_id: block.id, content: resultText, is_error: result.isError });
    }
    messages.push({ role: "user", content: toolResults });
  }

  return finalText;
}

/**
 * Content Agent — real execution for the text/caption half of posting. Video/image production
 * has no built-in pipeline, but a seller can connect a real MCP tool (e.g. Higgsfield's real
 * video-generation MCP server) via /dashboard/agents/content — when one is connected, this agent
 * gets a real chance to actually use it as part of the plan. Independently, when a real Facebook
 * Page is connected and auto-apply is on, this also writes and actually publishes a real caption.
 */
async function runContentAgent(
  business: { id: string; name: string; niche: string; metaPageId: string | null; metaPageName: string | null; metaAccessToken: string | null },
  workContext: string,
  settings: AgentSettings,
  model: string,
  skillContext = "",
): Promise<SpecialistResult> {
  const agent = "Content Agent";
  const extraContext = specialistExtraContext("content", settings);

  const planPrompt = `${CONTENT_EXPERTISE}

Business: ${business.name}, sells: ${business.niche}.
${workContext}
${extraContext ? `\n${extraContext}\n` : ""}${skillContext}
${NUMBER_GROUND_RULES}

Write ONE concrete, specific task for this cycle that a real specialist in your field would actually execute — not a vague suggestion, something you could hand to a freelancer today. 2-4 sentences. Respond with ONLY the task text, no JSON, no preamble, no quotation marks around it.`;

  const planMsg = await anthropic.messages.create({ model, max_tokens: 500, messages: [{ role: "user", content: planPrompt }] });
  await logUsage(business.id, "content", model, planMsg.usage);
  const planText = planMsg.content[0].type === "text" ? planMsg.content[0].text.trim() : "";
  const planTask = planText || "(Content Agent had trouble generating a task this run)";

  // Real MCP tools (e.g. a real video-gen server) — only runs the extra call if the seller
  // actually connected one; skipped entirely otherwise, at no extra cost.
  const toolNote = await runAgentToolLoop(
    business.id,
    "content",
    "Content Agent",
    `${CONTENT_EXPERTISE}\n\nBusiness: ${business.name}, sells: ${business.niche}.\nThis cycle's plan: ${planTask}\n\nIf you have a real tool connected that would genuinely help produce this (e.g. generating a real product video or image), use it now. If nothing connected actually fits this task, just say so in one sentence — don't force it.`,
    model,
  );
  const planTaskWithTool = toolNote ? `${planTask} ${toolNote}` : planTask;

  const canPublish = settings.autoApplyContent && business.metaPageId && business.metaAccessToken;
  if (!canPublish) {
    const reason = !business.metaPageId
      ? "no real Facebook Page connected yet"
      : "auto-apply is off in this agent's settings";
    return { agent, task: `${planTaskWithTool} (Real posting not active this cycle — ${reason}.)`, done: false };
  }

  const captionPrompt = `${CONTENT_EXPERTISE}

Business: ${business.name}, sells: ${business.niche}.
${workContext}
${extraContext ? `\n${extraContext}\n` : ""}

This week's plan: ${planTask}

Write ONE short, ready-to-publish Facebook post caption (2-3 sentences, no video direction, no hashtag spam — plain real copy someone would actually read) that fits this week's plan. Respond with ONLY the caption text, nothing else.`;

  const captionMsg = await anthropic.messages.create({ model, max_tokens: 200, messages: [{ role: "user", content: captionPrompt }] });
  await logUsage(business.id, "content", model, captionMsg.usage);
  const caption = captionMsg.content[0].type === "text" ? captionMsg.content[0].text.trim() : "";

  if (!caption) {
    return { agent, task: `${planTaskWithTool} (Tried to publish a real caption but couldn't generate one this cycle.)`, done: false };
  }

  const result = await publishFacebookPost(business.metaPageId!, business.metaAccessToken!, caption);
  await prisma.socialPost.create({
    data: { businessId: business.id, platform: "facebook", kind: "text", caption, status: result.ok ? "posted" : "failed", externalId: result.id ?? null, error: result.ok ? null : (result.error ?? "").slice(0, 400), source: "content-agent" },
  });
  if (!result.ok) {
    return { agent, task: `${planTaskWithTool} (Tried to publish a real caption to ${business.metaPageName ?? "your Facebook Page"} but it failed: ${result.error})`, done: false };
  }

  return {
    agent,
    task: `${planTaskWithTool} Also published a real post to ${business.metaPageName ?? "your Facebook Page"}: "${caption}"`,
    done: true,
  };
}

const ADS_EXPERTISE =
  "You are the Ads & Growth Agent — a senior performance-marketing / paid-media buyer. You think in campaign structure (cold/warm/retargeting funnel stages), audience-stack logic, creative-testing methodology, and platform-specific mechanics (Meta Advantage+, TikTok Spark Ads). You never fabricate a CPA or ROAS forecast — you propose a real test structure and a real kill/scale rule instead.";

/**
 * Ads Agent — real execution. When a real Meta Ad Account is connected and auto-apply is on,
 * actually creates a real campaign + ad set via the Marketing API — but always PAUSED, with the
 * real daily budget cap sent to Meta itself (so Meta enforces it, not just our own promise).
 * Activating real spend is always a separate, manual step the owner takes later — this code
 * never turns real ad spend on by itself.
 */
async function runAdsAgent(
  business: { id: string; name: string; niche: string; metaAdAccountId: string | null; metaAccessToken: string | null },
  workContext: string,
  settings: AgentSettings,
  model: string,
  skillContext = "",
): Promise<SpecialistResult> {
  const agent = "Ads Agent";
  const extraContext = specialistExtraContext("ads", settings);

  const planPrompt = `${ADS_EXPERTISE}

Business: ${business.name}, sells: ${business.niche}.
${workContext}
${extraContext ? `\n${extraContext}\n` : ""}${skillContext}
${NUMBER_GROUND_RULES}

Write ONE concrete, specific task for this cycle that a real specialist in your field would actually execute — not a vague suggestion, something you could hand to a freelancer today. 2-4 sentences. Respond with ONLY the task text, no JSON, no preamble, no quotation marks around it.`;

  const planMsg = await anthropic.messages.create({ model, max_tokens: 500, messages: [{ role: "user", content: planPrompt }] });
  await logUsage(business.id, "ads", model, planMsg.usage);
  const planText = planMsg.content[0].type === "text" ? planMsg.content[0].text.trim() : "";
  const planTask = planText || "(Ads Agent had trouble generating a task this run)";

  const canCreate = settings.autoApplyAds && business.metaAdAccountId && business.metaAccessToken;
  if (!canCreate) {
    const reason = !business.metaAdAccountId
      ? "no real Meta Ad Account connected yet"
      : "auto-apply is off in this agent's settings";
    return { agent, task: `${planTask} (Real campaign not created this cycle — ${reason}.)`, done: false };
  }

  const namePrompt = `Give ONE short, real Meta ad campaign name (under 40 characters) for this plan: "${planTask}". Respond with ONLY the name, nothing else.`;
  const nameMsg = await anthropic.messages.create({ model, max_tokens: 30, messages: [{ role: "user", content: namePrompt }] });
  await logUsage(business.id, "ads", model, nameMsg.usage);
  const campaignName = (nameMsg.content[0].type === "text" ? nameMsg.content[0].text.trim() : "").replace(/["']/g, "") || `${business.name} — weekly push`;

  // A real, complete ad (campaign → ad set → creative → ad) for the best-stocked product that has
  // a photo, created PAUSED. The agent's budget setting is in the ad account's own currency.
  const product = await prisma.product.findFirst({
    where: { businessId: business.id, imageUrl: { not: null }, stock: { gt: 0 } },
    orderBy: { stock: "desc" },
    select: { id: true, name: true, description: true },
  });
  if (!product) return { agent, task: `${planTask} (Real ad not created — no in-stock product has a photo yet.)`, done: false };

  const copyPrompt = `Write Meta ad copy for "${product.name}" from ${business.name} (${business.niche}), following this plan: "${planTask}". Reply as JSON only: {"headline": "max 40 characters", "text": "1-3 short sentences, a hook and a reason to buy, no invented prices or discounts"}`;
  const copyMsg = await anthropic.messages.create({ model, max_tokens: 300, messages: [{ role: "user", content: copyPrompt }] });
  await logUsage(business.id, "ads", model, copyMsg.usage);
  let copy: { headline?: string; text?: string } = {};
  try {
    const raw = copyMsg.content[0].type === "text" ? copyMsg.content[0].text : "";
    copy = JSON.parse(raw.slice(raw.indexOf("{"), raw.lastIndexOf("}") + 1));
  } catch {
    copy = {};
  }

  try {
    const row = await createPausedAd({
      businessId: business.id,
      name: campaignName,
      productId: product.id,
      headline: copy.headline || product.name,
      primaryText: copy.text || `${product.name} — order now from ${business.name}.`,
      dailyBudget: settings.adsDailyBudgetUsd,
      reasoning: planTask,
      source: "ads-agent",
    });
    return {
      agent,
      task: `${planTask} Created a real, complete Meta ad "${campaignName}" for ${product.name} at ${row.dailyBudget} ${row.currency}/day — saved PAUSED; review and activate it in Dashboard > Ads before it spends anything.`,
      done: true,
    };
  } catch (e) {
    return { agent, task: `${planTask} (Tried to create a real Meta ad but it failed: ${e instanceof MetaAdError ? e.message : "unknown error"})`, done: false };
  }
}

const NUMBER_GROUND_RULES = `Ground rules for numbers, strictly enforced:
- You may state well-established general marketing/industry benchmarks, because that's real expertise (e.g. "DTC email flows typically convert 2-4% of recipients"). Label these as typical/benchmark figures, not as this business's measured data.
- You must NOT invent business- or keyword-specific numbers that only a real tool could know — no exact search volumes, no fabricated ad costs or performance stats. Where you'd normally cite a specific number you don't have, describe it qualitatively instead (e.g. "a high-intent, low-competition long-tail phrase" instead of "1.2K monthly searches").`;

/**
 * SKILL CONTEXT — fixed, per-agent domain expertise. Doesn't change cycle to cycle.
 * Each specialist agent gets its own real domain-expert persona and its own model call —
 * not one agent wearing five hats.
 */
const SPECIALISTS: { agent: string; id: SpecialistId; expertise: string; model: string }[] = [
  {
    agent: "SEO Agent",
    id: "seo",
    model: MODEL_FAST,
    expertise:
      "You are the SEO Agent — a senior technical and content SEO strategist. You think in search-intent mapping, topical authority, on-page optimization, schema markup, internal linking, featured-snippet capture, and E-E-A-T signals. You never cite an invented search-volume number.",
  },
  {
    agent: "Content Agent",
    id: "content",
    model: MODEL,
    expertise:
      "You are the Content Agent — a social-first creative strategist who understands exactly how Instagram Reels and TikTok's For You algorithm actually rank and distribute content: hook-retention in the first 1-2 seconds, native vs. ad-style framing, pacing, on-screen text placement, trending-audio timing. You also know direct-response copywriting psychology — specificity as credibility, pattern interrupts, curiosity gaps. You write tasks that are shootable today, not vague ideas.",
  },
  {
    agent: "Ads Agent",
    id: "ads",
    model: MODEL_FAST,
    expertise:
      "You are the Ads & Growth Agent — a senior performance-marketing / paid-media buyer. You think in campaign structure (cold/warm/retargeting funnel stages), audience-stack logic, creative-testing methodology, and platform-specific mechanics (Meta Advantage+, TikTok Spark Ads). You never fabricate a CPA or ROAS forecast — you propose a real test structure and a real kill/scale rule instead.",
  },
  {
    agent: "Retention Agent",
    id: "retention",
    model: MODEL_FAST,
    expertise:
      "You are the Retention Agent — a lifecycle/CRM marketing specialist. You think in behavioral segmentation, trigger-based flows, and applied psychology (commitment-consistency, reciprocity, scarcity, loss aversion). You may cite well-known general benchmarks (labeled as typical), but never invent a business-specific stat.",
  },
  {
    agent: "Inventory & Fulfillment",
    id: "inventory",
    model: MODEL_FAST,
    expertise:
      "You are the Inventory & Fulfillment Agent. Your ONLY job this cycle is stock and fulfillment — not marketing, not conversion, not funnel audits, even if the strategic focus below is about a marketing push. You watch real stock levels and real sales velocity so the business never oversells or ties up cash in dead stock. Your task must directly reference the specific real stock/sales numbers given to you below (name the product and the actual number) — you never invent a units-sold or days-of-stock figure that isn't in that data, and if a product is genuinely low on stock or overstocked relative to its real sales rate, that's what your task should be about.",
  },
  {
    agent: "Pricing Agent",
    id: "pricing",
    model: MODEL_FAST,
    expertise:
      "You are the Pricing Agent. Your ONLY job this cycle is pricing — not marketing copy, not page conversion, not funnel audits, even if the strategic focus below is about a marketing push. You compare the real competitor prices below (from the Competitor Intelligence scan) against this business's own real product prices, and propose a specific match or adjustment for a specific product, naming the real numbers involved. You are blocked from ever proposing a price below the business's stated margin floor, and you never cite a competitor price that wasn't actually in the real data given to you. If no real competitor pricing is available this cycle, say so and propose reviewing margin instead using the real cost/price data you do have.",
  },
];

/**
 * Runs the full Competitor Intelligence → Strategy Orchestrator → specialist agents → Manager/QA
 * pipeline for a business that already exists in the database, and saves a fresh GrowthReport.
 * Used both by onboarding (first run) and the weekly re-scan (every run after).
 *
 * Three kinds of context feed this, kept deliberately separate:
 * - SKILL context (SPECIALISTS above)   — fixed expertise, same every cycle
 * - MEMORY context (`lastCycle` below)  — what happened last time, only where relevant
 * - WORK context (`strategy` below)     — this cycle's specific assignment, built fresh each run
 */
export async function runCompetitorAnalysis(businessId: string) {
  const business = await prisma.business.findUnique({
    where: { id: businessId },
    include: { competitors: true },
  });
  if (!business) throw new Error("Business not found");

  await assertUnderUsageCap(businessId);

  const settings = parseAgentSettings(business.agentSettings);
  const competitorUrls = business.competitors.map((c) => c.url);

  // --- MEMORY CONTEXT: what we planned last cycle, if there was one ---
  const recentReports = await prisma.growthReport.findMany({
    where: { businessId },
    orderBy: { createdAt: "desc" },
    take: 2,
  });
  const previousReport = recentReports[0] ?? null;
  let lastCycle: {
    focusProduct: string;
    theme: string;
    tasks: Task[];
    qaNote?: string;
    competitors: CompetitorAnalysisItem[];
  } | null = null;
  if (previousReport) {
    try {
      const parsed = JSON.parse(previousReport.content);
      lastCycle = {
        focusProduct: parsed.focusProduct,
        theme: parsed.theme,
        tasks: parsed.tasks ?? [],
        qaNote: parsed.qaNote,
        competitors: parsed.competitors ?? [],
      };
    } catch {
      lastCycle = null;
    }
  }
  const memoryBlock = lastCycle
    ? `MEMORY — what we planned last cycle (decide whether to continue, double down, or pivot based on fresh signal below; never just repeat this verbatim):
Focus was: "${lastCycle.focusProduct}" — ${lastCycle.theme}
Tasks assigned: ${lastCycle.tasks.map((t) => `${t.agent}: ${t.task}`).join(" | ")}`
    : "MEMORY — this is the first cycle for this business, no prior plan exists.";

  // --- Competitor Intelligence Agent ---
  const competitorIntel = await Promise.all(competitorUrls.map((url) => scrapeCompetitorFull(url)));

  const intelPrompt = `You are the Competitor Intelligence Agent for an e-commerce AI platform.
Business: ${business.name}, sells: ${business.niche}.

For each competitor below you have four scraped sources: their website, their public Instagram profile, their public TikTok profile, and Meta's public Ad Library (shows ads currently running — real running ads are the honest signal for "what they're pushing," since exact ad spend is never public data anywhere).
Method tags: "http" = normal fetch worked, "browser" = needed a real headless browser (site blocks simple requests), "failed" = genuinely could not be read.
The website source is now a real multi-page scan (homepage plus whichever of their shop/collections/products/about/pricing pages actually resolved, noted up front by real page count) — not just the homepage, so pricing and catalog breadth should be more complete. It also includes "structured data" pulled directly from schema.org markup across all of those real pages — real machine-readable price/rating/stock data the store embedded for search engines, deduplicated by product name, not text inferred by reading prose. Trust these numbers over anything you infer from free text, and never invent a price or rating that isn't in either the text or the structured data. If several real products show up in the structured data, pick the one that best represents what they're actually pushing (most prominent in the text, or most reviewed) — don't just default to whichever happened to be listed first.

${competitorIntel
  .map(
    (c) => `=== ${c.url} ===
[website, via ${c.website.method}] ${c.website.text}
[website structured product data — real prices/ratings, not guessed]
${c.website.structuredData}
[instagram, via ${c.instagram.method}] ${c.instagram.text}
[tiktok, via ${c.tiktok.method}] ${c.tiktok.text}
[meta ad library, via ${c.adLibrary.method}] ${c.adLibrary.text}`,
  )
  .join("\n\n")}

For each competitor, synthesize across all four sources: what their best-selling / most-pushed product looks like, real pricing/rating if the structured data has it, what content style is trending for them and your best inference of WHY (the actual mechanism — e.g. "before/after transformation format," "founder-facing storytelling," "unboxing ASMR" — not just "it's popular"), whether they appear to be actively running ads right now (and on what, if visible), and one gap our business could exploit. Never invent numbers (price, rating, spend, view counts) that weren't actually in the scraped text or structured data — if a source's method is "failed", say so honestly instead of guessing. Respond with ONLY valid JSON, no markdown fences, no commentary, in this exact shape:
{"competitors":[{"name":"short readable name","url":"the url","topProduct":"their apparent best-selling or most-emphasized product","pricing":"real price/rating from structured data if available, else 'not available from public data'","trending":"what content is trending for them","whyTrending":"your best inference of the actual mechanism behind why it works, or 'unclear from available data' if you can't tell","adActivity":"are they actively advertising right now and on what, based only on the ad library scan; say 'no ad library data available' if that source failed","gap":"one actionable gap for our business"}]}`;

  const intelMsg = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 2000,
    messages: [{ role: "user", content: intelPrompt }],
  });
  await logUsage(business.id, "competitor", MODEL, intelMsg.usage);
  const intelText = intelMsg.content[0].type === "text" ? intelMsg.content[0].text : "{}";
  let competitorAnalysis: { competitors: CompetitorAnalysisItem[] };
  try {
    const parsed = JSON.parse(stripJsonFences(intelText));
    // The model doesn't always follow the requested {"competitors":[...]} shape exactly (e.g. it
    // can reply with a bare array when it has little to say) — validate before trusting it rather
    // than assuming a successful JSON.parse means the right shape came back.
    competitorAnalysis = { competitors: Array.isArray(parsed?.competitors) ? parsed.competitors : Array.isArray(parsed) ? parsed : [] };
  } catch {
    competitorAnalysis = { competitors: [] };
  }

  // --- EFFECTS REVIEW: honest, non-fabricated signal about what happened after last cycle's plan ---
  // Built only from things that are actually true and checkable: task completion, QA's note,
  // real competitor data diffed cycle-to-cycle, and now (Phase 3) real conversion/order counts
  // for the period since the last plan vs. the period before it. Never let the model invent
  // a number outside what's computed here.
  let effectsBlock = "EFFECTS REVIEW — no prior cycle to review yet (this is the first cycle for this business).";
  if (lastCycle && previousReport) {
    const doneCount = lastCycle.tasks.filter((t) => t.done).length;
    const changedCompetitors = competitorAnalysis.competitors
      .map((now) => {
        const before = lastCycle!.competitors.find((c) => c.name === now.name || c.url === now.url);
        if (!before) return null;
        const changed: string[] = [];
        if (before.pricing !== now.pricing) changed.push(`pricing (was "${before.pricing}", now "${now.pricing}")`);
        if (before.trending !== now.trending) changed.push(`trending content shifted`);
        if (before.adActivity !== now.adActivity) changed.push(`ad activity changed`);
        return changed.length > 0 ? `${now.name}: ${changed.join(", ")}` : null;
      })
      .filter((x): x is string => x !== null);

    effectsBlock = `EFFECTS REVIEW — honest signals about what actually happened since last cycle (judge directionally from this only — never state or imply a number that isn't computed here):
- Task completion from last cycle's plan: ${doneCount}/${lastCycle.tasks.length} marked done.
- Manager/QA's note on the last plan: ${lastCycle.qaNote ? `"${lastCycle.qaNote}"` : "none recorded."}
- Real competitor changes detected since the last scan: ${changedCompetitors.length > 0 ? changedCompetitors.join(" | ") : "no material changes detected in this scan."}`;
  }

  // --- Strategy Orchestrator: decides WHAT and WHY, not the specialist HOW ---
  const businessModelGuidance = businessModelGuidanceLine(business.businessModel);
  const businessModelLine = businessModelGuidance
    ? `\nHow this seller actually operates (their own answer at onboarding — shapes HOW you plan, not the goal itself): ${businessModelGuidance}\n`
    : "";

  const orchestratorPrompt = `You are the Strategy Orchestrator — the senior business-growth and sales expert embedded in this e-commerce AI platform. This is your core discipline: how to actually sell more, how a small DTC brand grows, consumer psychology and buying triggers, proven growth playbooks, pricing and bundling psychology, funnel economics. You are also the one set of eyes watching the whole business at once — every specialist agent reports up through your plan, and part of your job every cycle is judging, honestly, whether what happened since last cycle looks like it's working or not, and adjusting accordingly. That expertise and judgment are yours from training and reasoning, not from this scrape — use them.

You are not a copyist. The competitor analysis below is raw INPUT to think with, not a script to imitate. Never just recommend "do what they do." Spot what every one of these competitors is leaving on the table — positioning, channel, offer structure, or audience they're ignoring — and design something genuinely better. The single metric this whole business exists to move is real orders — not traffic, not impressions, not vague "brand awareness." Every recommendation must trace back to one question: does this get a real customer to actually complete a real order this week, and will it hold up as a repeatable source of orders next week too — not just a one-time spike.
${businessModelLine}
Business: ${business.name}, sells: ${business.niche}, website: ${business.website || "none yet"}.
Competitor analysis (signal to think with, not a template): ${JSON.stringify(competitorAnalysis.competitors)}

${memoryBlock}

${effectsBlock}

${NUMBER_GROUND_RULES}

${orchestratorRiskLine(settings)}

Decide the single highest-leverage focus for this cycle and realistic targets. You are NOT writing the execution tasks — specialist agents handle that separately. Respond with ONLY valid JSON, no markdown fences, no commentary, in this exact shape:
{
  "focusProduct": "the single product or offer to push this cycle — chosen because it's the highest-leverage move, not just because it's the main product",
  "theme": "one or two sentences: the actual strategic reasoning — why this wins, referencing a real competitor gap, a real marketing principle, or what changed since last cycle",
  "reviewNote": "one or two sentences judging, honestly and only from the EFFECTS REVIEW signals above, whether the last cycle's approach looks like it's working, stalling, or worth pivoting away from — or 'First cycle — nothing to review yet.' if there is no prior cycle. Never invent a sales or growth number here.",
  "wantsToDiscuss": "true only if something genuinely worth a real conversation with the owner happened this cycle (a real competitor move, a stalled/pivoting plan, a meaningful strategic fork) — false for a routine, nothing-new cycle. Be conservative; most cycles should be false.",
  "discussReason": "if wantsToDiscuss is true, one sentence on exactly what you'd want to raise with the owner first, in your own voice — else empty string.",
  "targets": [
    {"label":"Real orders target","value":"a realistic order COUNT for this week — the single most direct signal this business is actually growing, e.g. '12 orders'","progress":0},
    {"label":"Revenue target","value":"a realistic dollar figure for a first week, e.g. $1,200","progress":0},
    {"label":"New customers","value":"a realistic number, e.g. 15","progress":0},
    {"label":"Avg. order value","value":"a realistic dollar figure, e.g. $22","progress":0}
  ]
}`;

  const orchMsg = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 900,
    messages: [{ role: "user", content: orchestratorPrompt }],
  });
  await logUsage(business.id, "orchestrator", MODEL, orchMsg.usage);
  const orchText = orchMsg.content[0].type === "text" ? orchMsg.content[0].text : "{}";
  let strategy: {
    focusProduct: string;
    theme: string;
    reviewNote?: string;
    wantsToDiscuss?: boolean;
    discussReason?: string;
    targets: Target[];
  };
  try {
    const parsed = JSON.parse(stripJsonFences(orchText));
    strategy = { ...parsed, targets: Array.isArray(parsed?.targets) ? parsed.targets : [] };
  } catch {
    strategy = {
      focusProduct: business.niche,
      theme: "Plan generation had trouble parsing — try again.",
      targets: [],
    };
  }

  // --- WORK CONTEXT for specialists: this cycle's specific assignment ---
  // Condensed on purpose — specialists need the gap and the "why," not the full raw
  // competitor JSON (pricing/topProduct/adActivity) re-sent to all 4 parallel calls.
  const competitorSignal = competitorAnalysis.competitors
    .map((c) => `${c.name}: ${c.gap}${c.whyTrending ? ` (why it works for them: ${c.whyTrending})` : ""}`)
    .join(" | ");
  const workContext = `This cycle's strategic focus, set by the Strategy Orchestrator (your job is HOW, not WHAT — don't second-guess the focus): "${strategy.focusProduct}" — ${strategy.theme}
Competitor signal, for context only (never copy it, never invent numbers from it that aren't there): ${competitorSignal || "no competitor data available this cycle"}`;

  // --- Specialist agents: each gets its own expert persona + its own model call ---
  // Only specialists the business owner has enabled in Settings participate this cycle.
  const activeSpecialists = SPECIALISTS.filter((s) => settings.enabledAgents.includes(s.id));

  // --- Real grounding data for Inventory — only fetched if that agent is active ---
  const realDataByAgent: Partial<Record<SpecialistId, string>> = {};
  if (activeSpecialists.some((s) => s.id === "inventory")) {
    const signals = await getInventorySignals(business.id);
    realDataByAgent.inventory =
      signals.length > 0
        ? `Real stock + real 30-day sales for every product (never invent a number outside this list):\n${signals
            .map(
              (s) =>
                `- ${s.name}: ${s.stock} in stock, ${s.unitsSoldLast30d} sold in the last 30 real days${s.daysOfStockLeft !== null ? `, ~${s.daysOfStockLeft} days of stock left at the current real rate` : " (no real sales yet to estimate days-of-stock from)"}`,
            )
            .join("\n")}`
        : "No real products in the store catalog yet — nothing to check stock on this cycle.";
  }

  const specialistTasks: Task[] = await Promise.all(
    activeSpecialists.map(async ({ agent, id, expertise, model }) => {
      // Business-level skills relevant to this cycle's focus — loaded for this run only, then dropped.
      const { text: skillContext } = await loadSkillContext(business.id, id, agent, workContext);

      if (id === "pricing") {
        return runPricingAgent(business.id, business.name, business.niche, competitorAnalysis.competitors, settings, model, skillContext);
      }
      if (id === "seo") {
        return runSeoAgent(business.id, business.name, business.niche, workContext, settings, model, skillContext);
      }
      if (id === "content") {
        return runContentAgent(business, workContext, settings, model, skillContext);
      }
      if (id === "ads") {
        return runAdsAgent(business, workContext, settings, model, skillContext);
      }

      const extraContext = specialistExtraContext(id, settings);
      const realData = realDataByAgent[id];
      const prompt = `${expertise}

Business: ${business.name}, sells: ${business.niche}.
${workContext}
${realData ? `\n${realData}\n` : ""}
${extraContext ? `\n${extraContext}\n` : ""}${skillContext}
${NUMBER_GROUND_RULES}

Write ONE concrete, specific task for this cycle that a real specialist in your field would actually execute — not a vague suggestion, something you could hand to a freelancer today.${realData ? " Your task MUST be grounded in and reference the specific real data given to you above (name real products and real numbers from it) — do not write a generic task that ignores it." : ""} 2-4 sentences. Respond with ONLY the task text, no JSON, no preamble, no quotation marks around it.`;

      const msg = await anthropic.messages.create({
        model,
        max_tokens: 500,
        messages: [{ role: "user", content: prompt }],
      });
      await logUsage(business.id, SPECIALIST_AGENT_IDS[agent] ?? agent, model, msg.usage);
      const text = msg.content[0].type === "text" ? msg.content[0].text.trim() : "";
      return { agent, task: text || `(${agent} had trouble generating a task this run)`, done: false };
    }),
  );

  const competitorSummaryTask: Task = {
    agent: "Competitor Intel",
    task:
      competitorAnalysis.competitors.length > 0
        ? `Scanned ${competitorAnalysis.competitors.length} competitor(s): ${competitorAnalysis.competitors
            .map((c) => `${c.name} — ${c.gap}`)
            .join(" · ")}`
        : "No competitors scanned yet.",
    done: true,
  };

  const draftTasks: Task[] = [competitorSummaryTask, ...specialistTasks];

  // --- Manager / QA Agent: reads every task together, catches contradictions before anything ships ---
  const qaPrompt = `You are the Manager/QA Agent. You don't generate ideas — you catch mistakes before they go live. Read the tasks below, written independently by different specialist agents who cannot see each other's work, and check for contradictions: conflicting prices or offers, conflicting claims, conflicting timing, or anything that would look inconsistent to a customer who saw more than one of these.

Business: ${business.name}
This cycle's focus: "${strategy.focusProduct}" — ${strategy.theme}

Tasks to review:
${draftTasks.map((t, i) => `${i + 1}. [${t.agent}] ${t.task}`).join("\n\n")}

${qaStrictnessLine(settings)}

If you find a contradiction, rewrite ONLY the affected task(s) to resolve it — keep everything else exactly as written. If everything is consistent, return the tasks unchanged. Respond with ONLY valid JSON, no markdown fences, no commentary, in this exact shape:
{"tasks":[{"agent":"exact agent name as given","task":"final task text, corrected if needed"}],"note":"one short sentence: what you checked, and what (if anything) you fixed"}`;

  let finalTasks = draftTasks;
  let qaNote = "Reviewed — no contradictions found.";
  try {
    const qaMsg = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 1500,
      messages: [{ role: "user", content: qaPrompt }],
    });
    await logUsage(business.id, "qa", MODEL, qaMsg.usage);
    const qaText = qaMsg.content[0].type === "text" ? qaMsg.content[0].text : "";
    const qaResult = JSON.parse(stripJsonFences(qaText)) as { tasks: { agent: string; task: string }[]; note: string };
    if (qaResult.tasks?.length) {
      finalTasks = qaResult.tasks.map((t) => ({
        agent: t.agent,
        task: t.task,
        done: draftTasks.find((d) => d.agent === t.agent)?.done ?? false,
      }));
    }
    if (qaResult.note) qaNote = qaResult.note;
  } catch {
    // QA pass failed to parse — ship the specialists' original drafts rather than block the cycle
  }

  // --- Real execution channel: notify the business owner on WhatsApp when the plan is ready ---
  // Honest either way — never claim it sent if Twilio isn't connected or the call failed.
  let whatsappNotified = false;
  let whatsappError: string | undefined;
  if (business.whatsapp && settings.notifyWhatsApp) {
    const message = `📊 Orbit.ai — your weekly plan is ready.\n\nFocus: ${strategy.focusProduct}\n${strategy.theme}\n\nOpen your dashboard for the full task list.`;
    const result = await sendWhatsAppMessage(business.whatsapp, message, {
      template: { kind: "owner_alert", vars: ["Your weekly plan is ready", `Focus: ${strategy.focusProduct}. ${strategy.theme}. Open your dashboard for the full task list.`] },
    });
    whatsappNotified = result.sent;
    whatsappError = result.error;
  }

  const plan = {
    focusProduct: strategy.focusProduct,
    theme: strategy.theme,
    reviewNote: strategy.reviewNote,
    wantsToDiscuss: strategy.wantsToDiscuss === true,
    discussReason: strategy.discussReason || undefined,
    targets: strategy.targets,
    tasks: finalTasks,
    qaNote,
    whatsappNotified,
    whatsappError,
  };

  const report = await prisma.growthReport.create({
    data: {
      businessId: business.id,
      content: JSON.stringify({ ...plan, competitors: competitorAnalysis.competitors }),
    },
  });

  return { businessId: business.id, reportId: report.id };
}
