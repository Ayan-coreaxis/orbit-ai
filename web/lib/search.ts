import { REALISTIC_HEADERS } from "@/lib/scrape";

export interface SearchResult {
  title: string;
  url: string;
}

const IGNORED_DOMAINS = [
  "amazon.",
  "wikipedia.org",
  "youtube.com",
  "facebook.com",
  "instagram.com",
  "pinterest.",
  "reddit.com",
  "tiktok.com",
  "twitter.com",
  "x.com",
  "google.com",
  "bing.com",
  "duckduckgo.com",
  "ebay.",
  "etsy.com",
  "linkedin.com",
];

const SOCIAL_DOMAINS = ["instagram.com", "facebook.com", "tiktok.com", "youtube.com", "x.com", "twitter.com", "linktr.ee"];

function decodeDuckDuckGoUrl(href: string): string | null {
  try {
    const url = href.startsWith("//") ? `https:${href}` : href;
    const parsed = new URL(url, "https://duckduckgo.com");
    const real = parsed.searchParams.get("uddg");
    return real ? decodeURIComponent(real) : parsed.toString();
  } catch {
    return null;
  }
}

function stripTags(html: string): string {
  return html.replace(/<[^>]+>/g, "").trim();
}

/**
 * Real web search — scrapes DuckDuckGo's no-JS HTML results page. No API key, no invented
 * results: every item returned is a real search result someone could click and verify.
 */
export async function searchWeb(query: string, limit = 8, opts: { socialOnly?: boolean } = {}): Promise<SearchResult[]> {
  const searchUrl = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
  try {
    const res = await fetch(searchUrl, { headers: REALISTIC_HEADERS, signal: AbortSignal.timeout(8000) });
    const html = await res.text();

    const results: SearchResult[] = [];
    const linkRe = /<a[^>]+class="result__a"[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g;
    let match: RegExpExecArray | null;
    while ((match = linkRe.exec(html)) && results.length < limit * 2) {
      const url = decodeDuckDuckGoUrl(match[1]);
      const title = stripTags(match[2]);
      if (!url || !title) continue;
      let host: string;
      try {
        host = new URL(url).hostname.replace(/^www\./, "");
      } catch {
        continue;
      }
      if (opts.socialOnly) {
        // Looking for a brand's own social profiles: keep only social-network results.
        if (!SOCIAL_DOMAINS.some((d) => host === d || host.endsWith(`.${d}`))) continue;
        if (results.some((r) => r.url === url)) continue;
      } else {
        if (IGNORED_DOMAINS.some((d) => host.includes(d))) continue;
        if (results.some((r) => r.url.includes(host))) continue; // one result per domain
      }
      results.push({ title, url });
    }
    return results.slice(0, limit);
  } catch {
    return [];
  }
}
