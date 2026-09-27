import type Anthropic from "@anthropic-ai/sdk";
import { anthropic, MODEL } from "@/lib/anthropic";
import { prisma } from "@/lib/prisma";
import { estimateCostUsd } from "@/lib/pricing";
import type { BusinessSnapshot } from "@/lib/strategy-lab";

/**
 * Market research before a growth plan. Claude searches the web itself (Anthropic's server-side
 * web_search tool — no Brave key needed) for what's working in THIS niche and country right now:
 * demand, seasons and dates coming up, buyer objections, how small brands in the niche grew,
 * which channels work, price bands and claims to avoid. The brief is kept for 14 days inside the
 * plan's snapshot, so redrafting a plan doesn't pay for the same research again.
 */

const FRESH_DAYS = 14;
const WEB_SEARCH_USD = 0.01; // Anthropic web search: $10 per 1,000 searches

export type MarketResearch = { at: string; brief: string; sources: string[] };

const COUNTRY: Record<string, string> = { pkr: "Pakistan", inr: "India", aed: "the UAE", sar: "Saudi Arabia", bdt: "Bangladesh", gbp: "the UK", usd: "the US" };

export function countryOf(currency: string): string {
  return COUNTRY[currency.toLowerCase()] ?? "the seller's country";
}

/** The newest research saved with any of this business's plans, if still fresh. */
async function cached(businessId: string): Promise<MarketResearch | null> {
  const plans = await prisma.growthPlan.findMany({ where: { businessId }, orderBy: { createdAt: "desc" }, take: 5, select: { snapshot: true } });
  for (const p of plans) {
    try {
      const r = (JSON.parse(p.snapshot ?? "{}") as { research?: MarketResearch }).research;
      if (r?.brief && Date.now() - new Date(r.at).getTime() < FRESH_DAYS * 86400000) return r;
    } catch {
      /* ignore */
    }
  }
  return null;
}

export async function researchMarket(businessId: string, s: BusinessSnapshot, opts: { force?: boolean } = {}): Promise<MarketResearch | null> {
  if (!opts.force) {
    const hit = await cached(businessId);
    if (hit) return hit;
  }
  const country = countryOf(s.currency);
  const today = new Date().toISOString().slice(0, 10);
  const products = s.products.slice(0, 12).map((p) => `${p.name} (${p.price} ${s.currency.toUpperCase()})`).join(", ");

  const prompt = `Today is ${today}. Research the market for this small online business before we plan how to grow its sales.

Business: ${s.name} — sells ${s.niche} online in ${country}, mostly cash on delivery.
Products: ${products || "not listed yet"}.
Stage: ${s.allTimeOrders} orders so far.

Use web search (several focused searches) to find what is TRUE NOW for this niche in ${country}:
1. Demand: what people in ${country} buy in this niche, what's trending, typical price bands.
2. Calendar: festivals, seasons, paydays and events in the next 60 days that change demand for this niche (with dates).
3. Buyers: who buys, their main doubts and objections before ordering online (trust, COD, authenticity, delivery), and what removes them.
4. How small brands in this niche in ${country} actually grew — specific tactics, channels (WhatsApp, TikTok, Instagram, Facebook groups, marketplaces, offline) and partnerships that worked.
5. Rules and risks: claims or practices to avoid (e.g. health claims), common reasons such stores fail.

Then write a RESEARCH BRIEF, max 350 words, plain text, grouped under those 5 headings. Only facts you found or that are well established — say "not found" rather than guess. Mention dates and numbers only when a source showed them.`;

  try {
    // Long server-side search turns can come back as "pause_turn" — continue them (max 3 times).
    const messages: Anthropic.Messages.MessageParam[] = [{ role: "user", content: prompt }];
    const all: Anthropic.Messages.ContentBlock[] = [];
    for (let round = 0; round < 4; round++) {
      const msg = await anthropic.messages.create({
        model: MODEL,
        max_tokens: 6000,
        tools: [{ type: "web_search_20250305", name: "web_search", max_uses: 6 } as unknown as Anthropic.Messages.Tool],
        messages,
      });
      const searches = (msg.usage as { server_tool_use?: { web_search_requests?: number } }).server_tool_use?.web_search_requests ?? 0;
      await prisma.agentUsage.create({
        data: {
          businessId,
          agentId: "market-research",
          model: MODEL,
          inputTokens: msg.usage.input_tokens,
          outputTokens: msg.usage.output_tokens,
          costUsd: estimateCostUsd(MODEL, msg.usage.input_tokens, msg.usage.output_tokens) + searches * WEB_SEARCH_USD,
        },
      });
      all.push(...msg.content);
      if (msg.stop_reason !== "pause_turn") break;
      messages.push({ role: "assistant", content: msg.content });
    }

    // The brief is the text written after the last search; sources are every result the model saw.
    const blocks = all as unknown as { type: string; text?: string; content?: { url?: string }[] }[];
    let lastSearch = -1;
    blocks.forEach((b, i) => {
      if (b.type === "web_search_tool_result") lastSearch = i;
    });
    const brief = blocks
      .slice(lastSearch + 1)
      .filter((b) => b.type === "text")
      .map((b) => b.text ?? "")
      .join("")
      .trim();
    const sources = [
      ...new Set(
        blocks
          .filter((b) => b.type === "web_search_tool_result" && Array.isArray(b.content))
          .flatMap((b) => (b.content ?? []).map((r) => r.url))
          .filter((u): u is string => typeof u === "string"),
      ),
    ].slice(0, 12);
    if (!brief) return null;
    return { at: new Date().toISOString(), brief: brief.slice(0, 4000), sources };
  } catch (e) {
    console.warn("[growth-research] failed", e instanceof Error ? e.message : e);
    return null; // research is an enhancement — a plan can still be made without it
  }
}
