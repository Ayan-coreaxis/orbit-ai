import { NextRequest, NextResponse } from "next/server";
import { anthropic, MODEL_FAST } from "@/lib/anthropic";
import { scrapePage } from "@/lib/scrape";
import { searchWeb } from "@/lib/search";
import { findSocialsWithAI } from "@/lib/social-finder";

function stripJsonFences(text: string): string {
  return text
    .trim()
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/, "")
    .replace(/```$/, "")
    .trim();
}

export async function POST(req: NextRequest) {
  if (!process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_API_KEY === "paste_your_key_here") {
    return NextResponse.json({ error: "ANTHROPIC_API_KEY is not set in .env.local yet." }, { status: 400 });
  }

  const { website } = (await req.json()) as { website?: string };
  if (!website?.trim()) {
    return NextResponse.json({ error: "A website is required to analyze." }, { status: 400 });
  }

  // --- Real signals only: what's actually on the page, and a real Instagram link if one exists ---
  // The Instagram link comes from scrapePage's own result — whichever method (plain fetch, or a
  // real headless-browser fallback for a bot-protected site) actually reached real content, not
  // from a second, separate plain fetch that could land on a completely different page (e.g. a
  // bot-check page with no real links on it at all).
  const page = await scrapePage(website);
  const contacts = page.contacts ?? null;
  const instagram = page.instagram ?? contacts?.instagram ?? null;

  if (page.method === "failed") {
    return NextResponse.json({
      error: "Couldn't read that website — it may block automated visitors. You can fill this in manually instead.",
    });
  }

  // --- Claude reads the REAL scraped text only — extracts, never invents ---
  const extractPrompt = `Read this real, scraped homepage text from a business's own website and extract facts that are ACTUALLY stated or clearly implied by it. Never invent a business name or product category that isn't supported by the text.

Scraped homepage text:
${page.text}
${page.structuredData ? `\nReal structured product data from the page:\n${page.structuredData}` : ""}

Respond with ONLY valid JSON, no markdown fences, no commentary:
{"businessName":"the business's real name as it appears on the page, or empty string if genuinely unclear","niche":"one concise, factual line describing what they sell, grounded only in the text above, e.g. 'organic cold-pressed oils and herbal supplements'","searchQuery":"a short, real search-engine query that would find this business's direct competitors, e.g. 'organic moringa oil brand UK'"}`;

  const extractMsg = await anthropic.messages.create({
    model: MODEL_FAST,
    max_tokens: 300,
    messages: [{ role: "user", content: extractPrompt }],
  });
  const extractText = extractMsg.content[0].type === "text" ? extractMsg.content[0].text : "{}";
  let extracted: { businessName: string; niche: string; searchQuery: string };
  try {
    extracted = JSON.parse(stripJsonFences(extractText));
  } catch {
    extracted = { businessName: "", niche: "", searchQuery: "" };
  }

  // --- Socials the site doesn't link (e.g. placeholder "#" icons): AI web search, verified URLs only ---
  const socialsFound = contacts ? await findSocialsWithAI({ name: extracted.businessName, niche: extracted.niche, website }, contacts) : {};
  const allContacts = contacts ? { ...contacts, ...socialsFound } : null;

  // --- Real web search for competitors — never a model-invented list ---
  let competitors: string[] = [];
  if (extracted.searchQuery) {
    const rawResults = await searchWeb(extracted.searchQuery, 8);
    const ownHost = (() => {
      try {
        return new URL(website.startsWith("http") ? website : `https://${website}`).hostname.replace(/^www\./, "");
      } catch {
        return "";
      }
    })();
    const candidates = rawResults.filter((r) => !r.url.includes(ownHost));

    if (candidates.length > 0) {
      const pickPrompt = `Here are REAL web search results for "${extracted.searchQuery}". Pick up to 5 that look like genuine direct-competitor e-commerce brand websites (not marketplaces, blogs, review sites, or directories). Only choose from the URLs given — never write a URL that isn't in this list.

${candidates.map((c, i) => `${i + 1}. ${c.title} — ${c.url}`).join("\n")}

Respond with ONLY valid JSON, no markdown fences: {"picks":["exact url from the list", "..."]}`;

      const pickMsg = await anthropic.messages.create({
        model: MODEL_FAST,
        max_tokens: 300,
        messages: [{ role: "user", content: pickPrompt }],
      });
      const pickText = pickMsg.content[0].type === "text" ? pickMsg.content[0].text : "{}";
      try {
        const picked = JSON.parse(stripJsonFences(pickText)) as { picks: string[] };
        const validUrls = new Set(candidates.map((c) => c.url));
        competitors = (picked.picks ?? []).filter((u) => validUrls.has(u)).slice(0, 5);
      } catch {
        competitors = candidates.slice(0, 5).map((c) => c.url);
      }
    }
  }

  return NextResponse.json({
    businessName: extracted.businessName || "",
    niche: extracted.niche || "",
    instagram: instagram || socialsFound.instagram || "",
    whatsapp: contacts?.whatsapp || "",
    contacts: allContacts,
    socialsFromSearch: Object.keys(socialsFound),
    competitors,
    scrapeMethod: page.method,
  });
}
