import { anthropic, MODEL } from "@/lib/anthropic";
import { prisma } from "@/lib/prisma";
import { estimateCostUsd } from "@/lib/pricing";

/**
 * Brainstorm before planning. Asked in one go to write a whole plan, a model reaches for the safe,
 * standard moves. So the planner first gets a separate brainstorm — a dozen original ideas for
 * THIS store, with the standard playbook moves banned — and then picks the strongest. Evals showed
 * this is what lifts plans from "textbook" to "made for this business".
 */

const BANNED =
  "thank-you cards / friend or referral codes, good-better-best bundle ladders, WhatsApp Status routines, seeding community / mothers' groups, micro-influencer kits, free-delivery thresholds, trust / about pages, COD confirmation, generic discounts, 'post more on social media', 'run ads'";

export async function brainstormIdeas(businessId: string, storeFacts: string, research: string | null): Promise<string> {
  const prompt = `You are a wildly creative but practical growth strategist for tiny online stores in Pakistan.

${storeFacts}
${research ? `\nMARKET RESEARCH:\n${research}` : ""}

Brainstorm 12 ORIGINAL ideas to get this store more real orders in the next 60 days.
Rules:
- BANNED (these are the basics, handled elsewhere — do not use them or disguise them): ${BANNED}.
- Every idea must use a real fact above (a specific product, the city, the buyers, a date, something the research found).
- Doable by the owner plus a simple online store this month, with almost no budget. No health cure claims.
- Think from different angles: the product's story, buyers' rituals, a local place or moment, an unusual partner, a product-format twist, a service around the product, something people show or gift.
One line each: "N. Name — what happens, and the fact it's built on." No intro, no outro.`;
  try {
    const msg = await anthropic.messages.create({ model: MODEL, max_tokens: 1800, messages: [{ role: "user", content: prompt }] });
    await prisma.agentUsage.create({
      data: {
        businessId,
        agentId: "strategy-ideas",
        model: MODEL,
        inputTokens: msg.usage.input_tokens,
        outputTokens: msg.usage.output_tokens,
        costUsd: estimateCostUsd(MODEL, msg.usage.input_tokens, msg.usage.output_tokens),
      },
    });
    return msg.content.map((b) => (b.type === "text" ? b.text : "")).join("").trim().slice(0, 5000);
  } catch (e) {
    console.warn("[growth-ideas] brainstorm failed", e instanceof Error ? e.message : e);
    return ""; // the plan can still be made without a brainstorm
  }
}
