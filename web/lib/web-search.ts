import type Anthropic from "@anthropic-ai/sdk";
import { prisma } from "@/lib/prisma";
import { scrapePage } from "@/lib/scrape";

/**
 * Web search for Orbit's agents, on the Brave Search API. Every search is logged as an AgentUsage
 * row (agentId "web-search", model "brave") so it shows up in cost reports and counts against the
 * seller's monthly search limit. Settings live in .env.local and are edited in Super Admin > Web Search.
 */

export const SEARCH_AGENT_ID = "web-search";
export const BRAVE_COST_PER_SEARCH = 0.005; // $5 per 1,000 requests (Sep 2026)
export const BRAVE_FREE_MONTHLY_USD = 5; // Brave gives $5 of free credit every month ≈ 1,000 searches

export const DEFAULT_SEARCH_LIMITS: Record<string, number> = { starter: 300, growth: 600, scale: 1500 };
export const DEFAULT_PER_TURN = 3;

const int = (v: string | undefined, d: number) => {
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : d;
};

export function searchConfig() {
  const key = process.env.BRAVE_SEARCH_API_KEY?.trim() || "";
  return {
    configured: !!key,
    enabled: !!key && process.env.WEB_SEARCH_ENABLED?.trim() !== "false",
    country: (process.env.WEB_SEARCH_COUNTRY?.trim() || "pk").toLowerCase(),
    perTurn: int(process.env.WEB_SEARCH_PER_TURN, DEFAULT_PER_TURN),
    limits: {
      starter: int(process.env.WEB_SEARCH_LIMIT_STARTER, DEFAULT_SEARCH_LIMITS.starter),
      growth: int(process.env.WEB_SEARCH_LIMIT_GROWTH, DEFAULT_SEARCH_LIMITS.growth),
      scale: int(process.env.WEB_SEARCH_LIMIT_SCALE, DEFAULT_SEARCH_LIMITS.scale),
    } as Record<string, number>,
  };
}

const monthStart = () => {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), 1);
};

export async function searchStatus(businessId: string) {
  const cfg = searchConfig();
  const [used, biz] = await Promise.all([
    prisma.agentUsage.count({ where: { businessId, agentId: SEARCH_AGENT_ID, createdAt: { gte: monthStart() } } }),
    prisma.business.findUnique({ where: { id: businessId }, select: { plan: true } }),
  ]);
  const limit = cfg.limits[biz?.plan ?? "starter"] ?? cfg.limits.starter;
  return { ...cfg, used, limit, left: Math.max(0, limit - used) };
}

export type SearchResult = { title: string; url: string; snippet: string; age?: string };

class SearchUnavailable extends Error {}

async function brave(query: string, country: string, count = 6): Promise<SearchResult[]> {
  const key = process.env.BRAVE_SEARCH_API_KEY?.trim();
  if (!key) throw new SearchUnavailable("Web search isn't set up yet.");
  const url = new URL("https://api.search.brave.com/res/v1/web/search");
  url.searchParams.set("q", query.slice(0, 380));
  url.searchParams.set("count", String(count));
  if (country && country !== "all") url.searchParams.set("country", country);
  url.searchParams.set("extra_snippets", "true");
  const res = await fetch(url, { headers: { Accept: "application/json", "X-Subscription-Token": key }, signal: AbortSignal.timeout(15000) });
  if (res.status === 401 || res.status === 403) throw new SearchUnavailable("The Brave API key was rejected — check it in Super Admin > Web Search.");
  if (res.status === 429) throw new SearchUnavailable("Brave's rate or monthly limit was hit — try again later.");
  if (!res.ok) throw new SearchUnavailable(`Search failed (${res.status}).`);
  const data = (await res.json()) as { web?: { results?: { title?: string; url?: string; description?: string; extra_snippets?: string[]; age?: string }[] } };
  const strip = (s: string) => s.replace(/<[^>]+>/g, "").replace(/&#x27;|&#39;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, "&");
  return (data.web?.results ?? [])
    .filter((r) => r.url && r.title)
    .map((r) => ({
      title: strip(r.title!),
      url: r.url!,
      snippet: strip([r.description ?? "", ...(r.extra_snippets ?? []).slice(0, 2)].filter(Boolean).join(" … ")).slice(0, 600),
      age: r.age,
    }));
}

/** One search for a business: checks the switch + monthly limit, runs it, logs the cost. */
export async function searchForBusiness(businessId: string, query: string, agentLabel = "orchestrator"): Promise<{ ok: true; results: SearchResult[] } | { ok: false; reason: string }> {
  const st = await searchStatus(businessId);
  if (!st.configured) return { ok: false, reason: "Web search isn't set up on this platform yet." };
  if (!st.enabled) return { ok: false, reason: "Web search is switched off by the platform admin." };
  if (st.left <= 0) return { ok: false, reason: `This month's web-search limit (${st.limit}) is used up — it resets on the 1st.` };
  try {
    const results = await brave(query, st.country);
    await prisma.agentUsage.create({
      data: { businessId, agentId: SEARCH_AGENT_ID, model: `brave:${agentLabel}`, inputTokens: 0, outputTokens: 0, costUsd: BRAVE_COST_PER_SEARCH },
    });
    return { ok: true, results };
  } catch (e) {
    return { ok: false, reason: e instanceof SearchUnavailable ? e.message : "Search failed — try again." };
  }
}

/** Admin "Test" button — runs one real search outside any business. */
export async function testSearch(query: string) {
  const cfg = searchConfig();
  try {
    return { ok: true as const, results: await brave(query, cfg.country, 5) };
  } catch (e) {
    return { ok: false as const, reason: e instanceof Error ? e.message : String(e) };
  }
}

// ---------- Tools the Orchestrator can call ----------

export const WEB_SEARCH_TOOL: Anthropic.Messages.Tool = {
  name: "web_search",
  description:
    "Search the live web (Brave). Use it only when the answer needs fresh outside facts you don't have: current market prices, what's trending, a platform's current rules/fees, a competitor's current offer, news. Don't search for things in the store data you were given, or general knowledge. Write a short, specific query (add 'Pakistan' or the city when local).",
  input_schema: { type: "object", properties: { query: { type: "string" } }, required: ["query"] },
};

export const READ_PAGE_TOOL: Anthropic.Messages.Tool = {
  name: "read_page",
  description: "Open one web page from your search results and read its text (e.g. a product page to see the real price). Only URLs that came from web_search.",
  input_schema: { type: "object", properties: { url: { type: "string" } }, required: ["url"] },
};

export function formatResults(results: SearchResult[]): string {
  if (!results.length) return "No results.";
  return results.map((r, i) => `[${i + 1}] ${r.title}\n${r.url}${r.age ? ` (${r.age})` : ""}\n${r.snippet}`).join("\n\n");
}

export async function readPageText(url: string): Promise<string> {
  try {
    const page = await scrapePage(url, 2000);
    if (page.method === "failed") return `Couldn't open ${url} — it blocks automated visitors.`;
    return `${page.text}${page.structuredData && !page.structuredData.startsWith("(") ? `\nProducts on the page: ${page.structuredData}` : ""}`.slice(0, 4000);
  } catch {
    return `Couldn't open ${url}.`;
  }
}

// ---------- Admin reporting ----------

export async function searchUsageReport() {
  const since = monthStart();
  const [rows, businesses] = await Promise.all([
    prisma.agentUsage.groupBy({ by: ["businessId"], where: { agentId: SEARCH_AGENT_ID, createdAt: { gte: since } }, _count: { _all: true }, _sum: { costUsd: true } }),
    prisma.business.findMany({ select: { id: true, name: true, plan: true } }),
  ]);
  const cfg = searchConfig();
  const byId = new Map(rows.map((r) => [r.businessId, r]));
  const total = rows.reduce((a, r) => a + r._count._all, 0);
  const grossUsd = total * BRAVE_COST_PER_SEARCH;
  return {
    total,
    grossUsd: Number(grossUsd.toFixed(2)),
    billedUsd: Number(Math.max(0, grossUsd - BRAVE_FREE_MONTHLY_USD).toFixed(2)),
    freeLeft: Math.max(0, Math.round((BRAVE_FREE_MONTHLY_USD - grossUsd) / BRAVE_COST_PER_SEARCH)),
    sellers: businesses
      .map((b) => {
        const r = byId.get(b.id);
        const limit = cfg.limits[b.plan] ?? cfg.limits.starter;
        return { id: b.id, name: b.name, plan: b.plan, used: r?._count._all ?? 0, limit, costUsd: Number((r?._sum.costUsd ?? 0).toFixed(3)) };
      })
      .sort((a, b) => b.used - a.used),
  };
}
