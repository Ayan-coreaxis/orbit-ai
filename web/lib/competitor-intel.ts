import { prisma } from "@/lib/prisma";
import { anthropic, MODEL } from "@/lib/anthropic";
import { scrapeCompetitorFull } from "@/lib/scrape";
import { estimateCostUsd } from "@/lib/pricing";
import { assertUnderUsageCap } from "@/lib/usage-limit";

/**
 * Competitor notes — REFERENCE knowledge only (product decision: competitors are never the base of
 * a plan). Scans the seller's competitors' sites, Instagram, TikTok and Meta Ad Library, and saves
 * what each is pushing, their real prices when public, and one gap. The growth plan (Strategy Lab)
 * and the Orchestrator read these notes. Runs once at onboarding and when the seller presses
 * Refresh on the Competitors page — there is no weekly plan anymore.
 * Saved as a GrowthReport row whose content is { kind: "competitors", competitors, scannedAt }.
 */

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

function stripJsonFences(text: string): string {
  return text
    .trim()
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/, "")
    .replace(/```$/, "")
    .trim();
}

export async function scanCompetitors(businessId: string): Promise<{ reportId: string | null; competitors: CompetitorAnalysisItem[] }> {
  const business = await prisma.business.findUnique({ where: { id: businessId }, include: { competitors: true } });
  if (!business) throw new Error("Business not found");
  const competitorUrls = business.competitors.map((c) => c.url);
  if (competitorUrls.length === 0) return { reportId: null, competitors: [] };

  await assertUnderUsageCap(businessId);

  const competitorIntel = await Promise.all(competitorUrls.map((url) => scrapeCompetitorFull(url)));

  const intelPrompt = `You are the Competitor Intelligence Agent for an e-commerce AI platform.
Business: ${business.name}, sells: ${business.niche}.

For each competitor below you have four scraped sources: their website, their public Instagram profile, their public TikTok profile, and Meta's public Ad Library (shows ads currently running — real running ads are the honest signal for "what they're pushing," since exact ad spend is never public data anywhere).
Method tags: "http" = normal fetch worked, "browser" = needed a real headless browser (site blocks simple requests), "failed" = genuinely could not be read.
The website source is now a real multi-page scan (homepage plus whichever of their shop/collections/products/about/pricing pages actually resolved, noted up front by real page count) — not just the homepage, so pricing and catalog breadth should be more complete. It also includes "structured data" pulled directly from schema.org markup across all of those real pages — real machine-readable price/rating/stock data the store embedded for search engines, deduplicated by product name, not text inferred by reading prose. When a "REAL CATALOG" block is present it comes straight from the store's own public product feed (Shopify / WooCommerce) — exact current prices, sale prices with % off, sold-out items and launch dates; use it for pricing (give their real price range and how much of the range is on sale), for what they're launching now, and for demand signals (sold-out items). Trust these numbers over anything you infer from free text, and never invent a price or rating that isn't in either the text or the structured data. If several real products show up in the structured data, pick the one that best represents what they're actually pushing (most prominent in the text, or most reviewed) — don't just default to whichever happened to be listed first.

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

  await prisma.agentUsage.create({
    data: {
      businessId,
      agentId: "competitor",
      model: MODEL,
      inputTokens: intelMsg.usage.input_tokens,
      outputTokens: intelMsg.usage.output_tokens,
      costUsd: estimateCostUsd(MODEL, intelMsg.usage.input_tokens, intelMsg.usage.output_tokens),
    },
  });

  const report = await prisma.growthReport.create({
    data: { businessId, content: JSON.stringify({ kind: "competitors", competitors: competitorAnalysis.competitors, scannedAt: new Date().toISOString() }) },
  });
  return { reportId: report.id, competitors: competitorAnalysis.competitors };
}

/** The latest saved competitor notes (also reads old weekly-plan reports, which carried the same list). */
export async function latestCompetitors(businessId: string): Promise<{ competitors: CompetitorAnalysisItem[]; scannedAt: Date | null }> {
  const r = await prisma.growthReport.findFirst({ where: { businessId }, orderBy: { createdAt: "desc" }, select: { content: true, createdAt: true } });
  if (!r) return { competitors: [], scannedAt: null };
  try {
    const parsed = JSON.parse(r.content) as { competitors?: CompetitorAnalysisItem[] };
    return { competitors: Array.isArray(parsed.competitors) ? parsed.competitors : [], scannedAt: r.createdAt };
  } catch {
    return { competitors: [], scannedAt: r.createdAt };
  }
}
