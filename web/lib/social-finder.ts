import type Anthropic from "@anthropic-ai/sdk";
import { anthropic, MODEL_FAST } from "@/lib/anthropic";
import { extractContacts, fetchRawHtml, type SiteContacts } from "@/lib/scrape";

export type SocialKey = "instagram" | "facebook" | "tiktok" | "youtube" | "x";
const SOCIAL_KEYS: SocialKey[] = ["instagram", "facebook", "tiktok", "youtube", "x"];

/** Compare URLs without scheme, www., query or trailing slash. */
const canon = (u: string) =>
  u.toLowerCase().replace(/^https?:\/\//, "").replace(/^(www|m|web)\./, "").replace(/[?#].*$/, "").replace(/\/+$/, "");

/** The profile id from a social URL, in the same shape extractContacts returns it. */
function normalize(key: SocialKey, url: string): string | null {
  const c = extractContacts(`"${url}"`, "");
  return c[key];
}

/**
 * When a store's own site doesn't link its socials (placeholder `#` icons are common), Claude
 * searches the web for the brand's official profiles. Anti-invention rule: a profile is kept only
 * if its URL actually appeared in the web-search results Claude got back — anything Claude
 * "remembers" or guesses is dropped. A link-in-bio page (linktr.ee etc.) found this way is
 * opened and its real links read too.
 */
export async function findSocialsWithAI(
  business: { name: string; niche: string; website: string },
  have: SiteContacts,
): Promise<Partial<Record<SocialKey, string>>> {
  const missing = SOCIAL_KEYS.filter((k) => !have[k]);
  if (!missing.length || !business.name) return {};

  const host = business.website.replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/.*$/, "");
  let msg: Anthropic.Messages.Message;
  try {
    msg = await anthropic.messages.create({
      model: MODEL_FAST,
      max_tokens: 1200,
      tools: [{ type: "web_search_20250305", name: "web_search", max_uses: 4 }],
      messages: [
        {
          role: "user",
          content: `Find the OFFICIAL social media profiles of this business: "${business.name}" — website ${host}${business.niche ? `, sells ${business.niche}` : ""}.
Needed: ${missing.join(", ")}. Also note any link-in-bio page (linktr.ee, beacons, etc.) of theirs.
Only accept a profile if the search results make it clear it's THIS business (same name AND same product/country/website) — a different brand with a similar name is wrong. Skip anything unsure.
Answer with ONLY JSON, no prose: {"instagram":"url or empty","facebook":"","tiktok":"","youtube":"","x":"","linkInBio":""}`,
        },
      ],
    });
  } catch (e) {
    console.warn("[social-finder] web search failed", e instanceof Error ? e.message : e);
    return {};
  }

  // Every URL the search actually returned — the only URLs we'll trust.
  const seen = new Set<string>();
  for (const b of msg.content) {
    if (b.type === "web_search_tool_result" && Array.isArray(b.content)) {
      for (const r of b.content) if (r.type === "web_search_result") seen.add(canon(r.url));
    }
  }
  const text = msg.content.filter((b): b is Anthropic.Messages.TextBlock => b.type === "text").map((b) => b.text).join("");
  let picked: Record<string, string> = {};
  try {
    picked = JSON.parse(text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1));
  } catch {
    return {};
  }
  const trusted = (url: unknown): url is string => {
    if (typeof url !== "string" || !url) return false;
    const u = canon(url);
    return [...seen].some((s) => s === u || s.startsWith(`${u}/`));
  };

  const out: Partial<Record<SocialKey, string>> = {};
  for (const k of missing) {
    const url = picked[k];
    if (!trusted(url)) continue;
    const id = normalize(k, url);
    if (id) out[k] = id;
  }

  // A link-in-bio page lists the brand's real profiles — read them straight from it.
  const bio = picked.linkInBio;
  if (trusted(bio) && /^https?:\/\//.test(bio)) {
    const c = extractContacts(await fetchRawHtml(bio), "");
    for (const k of missing) if (!out[k] && c[k]) out[k] = c[k]!;
  }
  return out;
}
