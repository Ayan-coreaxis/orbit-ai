import { extractProductsFromHtml, extractProductsFromJsonLdStrings, formatProductSummaries, type ProductSummary } from "@/lib/structured-data";
import { assertPublicUrl, guardBrowserPage, safeFetch } from "@/lib/safe-fetch";
import { isApifyConfigured, scrapeInstagramProfileReal, scrapeTiktokProfileReal } from "@/lib/apify-scrape";
import { isAdLibraryConfigured, searchAdLibrary } from "@/lib/meta-ad-library";
import { safeSlice } from "@/lib/utils";

const BLOCK_SIGNALS = [
  "just a moment",
  "checking your browser",
  "enable javascript and cookies",
  "verify you are human",
  "are you a human",
  "captcha",
  "access denied",
  "attention required",
  "ddos protection by",
  "log into instagram",
  "log in to see photos",
  "you must log in to continue",
  "sorry, this page isn't available",
  "security checkpoint",
  "verifying your browser",
];

export const REALISTIC_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36",
  Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
  "Accept-Language": "en-US,en;q=0.9",
};

/** Real `<title>` text — often the one place a business's actual name is stated plainly, even
 * when the rendered body text (a logo image, no visible heading) never spells it out. */
function extractTitle(html: string): string | null {
  const m = html.match(/<title[^>]*>([^<]*)<\/title>/i);
  const title = m?.[1]?.trim();
  return title || null;
}

function htmlToText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Real links to individual product pages in raw HTML (same site only), absolute. */
function extractProductLinks(html: string, pageUrl: string): string[] {
  let origin = "";
  try {
    origin = new URL(pageUrl).origin;
  } catch {
    return [];
  }
  const out = new Set<string>();
  for (const m of html.matchAll(/href=["']([^"'#]+\/products?\/[^"'#?]+)[^"']*["']/gi)) {
    try {
      const u = new URL(m[1], pageUrl);
      if (u.origin === origin && !/\.(json|js|xml)$/i.test(u.pathname)) out.add(`${u.origin}${u.pathname}`);
    } catch {}
    if (out.size >= 12) break;
  }
  return [...out];
}

function looksBlocked(text: string): boolean {
  if (text.length < 200) return true;
  const lower = text.toLowerCase();
  return BLOCK_SIGNALS.some((signal) => lower.includes(signal));
}

interface RawFetch {
  text: string;
  structuredData: string;
  rawProducts: ProductSummary[];
  productLinks?: string[];
  instagram?: string | null;
  contacts?: SiteContacts;
}

async function fetchWithHttp(url: string): Promise<RawFetch> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  try {
    const res = await safeFetch(url, { signal: controller.signal, headers: REALISTIC_HEADERS });
    const html = await res.text();
    const rawProducts = extractProductsFromHtml(html);
    const title = extractTitle(html);
    return {
      text: title ? `Page title: ${title}\n${htmlToText(html)}` : htmlToText(html),
      structuredData: formatProductSummaries(rawProducts),
      rawProducts,
      // Extracted from the real HTML this exact fetch got — never from a second, separate
      // request that could hit a different result (e.g. a bot-check page with no real links).
      instagram: extractInstagramHandle(html),
      contacts: extractContacts(html, htmlToText(html)),
      productLinks: extractProductLinks(html, url),
    };
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchWithBrowser(url: string, waitMs = 3000): Promise<RawFetch> {
  const { chromium } = await import("playwright");
  const browser = await chromium.launch({
    args: ["--disable-blink-features=AutomationControlled"],
  });
  try {
    const context = await browser.newContext({
      userAgent: REALISTIC_HEADERS["User-Agent"],
      viewport: { width: 1366, height: 900 },
      locale: "en-US",
    });
    const page = await context.newPage();
    await assertPublicUrl(url);
    await guardBrowserPage(page);
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 20000 });
    // give a JS challenge / lazy content a moment to resolve
    await page.waitForTimeout(waitMs);
    const title = await page.title().catch(() => "");
    const bodyText = await page.locator("body").innerText({ timeout: 5000 }).catch(() => "");
    const text = title ? `Page title: ${title}\n${bodyText}` : bodyText;
    const jsonLdBlocks = await page
      .locator('script[type="application/ld+json"]')
      .allTextContents()
      .catch(() => [] as string[]);
    const rawProducts = extractProductsFromJsonLdStrings(jsonLdBlocks);
    // Real links to individual product pages actually present in the rendered DOM — many modern
    // storefronts only put full, real product markup (price, availability) on the product's own
    // page, not the listing page, so this lets the caller follow up on real, not-guessed URLs.
    const productLinks = await page
      .locator('a[href*="/products/"], a[href*="/product/"]')
      .evaluateAll((els) => els.map((el) => (el as HTMLAnchorElement).href))
      .catch(() => [] as string[]);
    // A real Instagram link, straight from the rendered DOM — innerText alone drops href
    // attributes (a social icon has no visible URL text), so this has to come from real anchors,
    // not from regex-matching the plain-text version above.
    const instagramHref = await page
      .locator('a[href*="instagram.com"]')
      .first()
      .getAttribute("href")
      .catch(() => null);
    const instagram = extractInstagramHandle(instagramHref);
    // Rendered HTML also carries links injected by JS widgets (e.g. a floating WhatsApp bubble).
    const renderedHtml = await page.content().catch(() => "");
    return {
      text: text.replace(/\s+/g, " ").trim(),
      structuredData: formatProductSummaries(rawProducts),
      instagram,
      contacts: extractContacts(renderedHtml, bodyText),
      rawProducts,
      productLinks: [...new Set(productLinks)].slice(0, 12),
    };
  } finally {
    await browser.close();
  }
}

export interface ScrapeResult {
  url: string;
  text: string;
  structuredData: string;
  rawProducts: ProductSummary[];
  method: "http" | "browser" | "api" | "failed";
  productLinks?: string[];
  /** A real Instagram handle found on this exact page, from whichever method actually succeeded
   * — never from a second, separate fetch that could land on a different result. */
  instagram?: string | null;
  /** Real social links / WhatsApp / phone / email found on this exact page. */
  contacts?: SiteContacts;
}

export async function scrapePage(rawUrl: string, waitMs = 3000): Promise<ScrapeResult> {
  const url = rawUrl.startsWith("http") ? rawUrl : `https://${rawUrl}`;

  try {
    const http = await fetchWithHttp(url);
    if (!looksBlocked(http.text)) {
      return { url, text: safeSlice(http.text, 1500), structuredData: http.structuredData, rawProducts: http.rawProducts, method: "http", instagram: http.instagram, contacts: http.contacts, productLinks: http.productLinks };
    }
  } catch {
    // fall through to browser fallback
  }

  try {
    const browserFetch = await fetchWithBrowser(url, waitMs);
    if (browserFetch.text && !looksBlocked(browserFetch.text)) {
      return {
        url,
        text: safeSlice(browserFetch.text, 1500),
        structuredData: browserFetch.structuredData,
        rawProducts: browserFetch.rawProducts,
        method: "browser",
        instagram: browserFetch.instagram,
        contacts: browserFetch.contacts,
        productLinks: browserFetch.productLinks,
      };
    }
    return {
      url,
      text: "(this page actively blocks automated visitors, even with a real browser)",
      structuredData: "(unavailable — page was blocked)",
      rawProducts: [],
      method: "failed",
    };
  } catch {
    return { url, text: "(could not be reached)", structuredData: "(unavailable — page was blocked)", rawProducts: [], method: "failed" };
  }
}

/**
 * Same as scrapePage, but for product discovery specifically: many real modern storefronts
 * (React/Next.js-rendered, not server-rendered Liquid/PHP) return real, non-blocked HTML with
 * zero product markup because the product grid only appears after client-side JS runs — a plain
 * HTTP fetch genuinely can't see it, not because the site is blocking anything. When that happens,
 * this also tries a real headless-browser render and prefers whichever pass actually found real
 * products, so a real modern storefront isn't wrongly reported as having none.
 */
export async function scrapePageForProducts(rawUrl: string, waitMs = 3000): Promise<ScrapeResult> {
  const url = rawUrl.startsWith("http") ? rawUrl : `https://${rawUrl}`;

  let httpResult: RawFetch | null = null;
  try {
    httpResult = await fetchWithHttp(url);
    if (httpResult.rawProducts.length > 0 && !looksBlocked(httpResult.text)) {
      return { url, text: safeSlice(httpResult.text, 1500), structuredData: httpResult.structuredData, rawProducts: httpResult.rawProducts, method: "http" };
    }
  } catch {
    // fall through to browser fallback
  }

  try {
    const browserFetch = await fetchWithBrowser(url, waitMs);
    if (browserFetch.rawProducts.length > 0) {
      return { url, text: safeSlice(browserFetch.text, 1500), structuredData: browserFetch.structuredData, rawProducts: browserFetch.rawProducts, method: "browser" };
    }
    // Neither pass found real product markup on THIS page — but real links to individual product
    // pages may still be present (common: listing pages only render full markup on the product's
    // own page), so the caller can follow up on those instead of giving up.
    if (httpResult && !looksBlocked(httpResult.text)) {
      return { url, text: safeSlice(httpResult.text, 1500), structuredData: httpResult.structuredData, rawProducts: [], method: "http", productLinks: browserFetch.productLinks };
    }
    return {
      url,
      text: browserFetch.text || "(no real product markup found on this page)",
      structuredData: "(unavailable)",
      rawProducts: [],
      method: browserFetch.text ? "browser" : "failed",
      productLinks: browserFetch.productLinks,
    };
  } catch {
    if (httpResult && !looksBlocked(httpResult.text)) {
      return { url, text: safeSlice(httpResult.text, 1500), structuredData: httpResult.structuredData, rawProducts: [], method: "http" };
    }
    return { url, text: "(could not be reached)", structuredData: "(unavailable)", rawProducts: [], method: "failed" };
  }
}

/** Fetches raw HTML (not stripped) so callers can regex out real, present links — never guessed. */
export async function fetchRawHtml(rawUrl: string): Promise<string | null> {
  const url = rawUrl.startsWith("http") ? rawUrl : `https://${rawUrl}`;
  try {
    const res = await safeFetch(url, { headers: REALISTIC_HEADERS, signal: AbortSignal.timeout(8000) });
    return await res.text();
  } catch {
    return null;
  }
}

/** Finds a real Instagram handle linked from the page's HTML, or from a single bare instagram.com
 * URL (e.g. a real anchor's href pulled straight from the DOM) — returns null if none is actually
 * present. The trailing quote/`?`/end-of-string is optional so both inputs match the same regex. */
export function extractInstagramHandle(html: string | null): string | null {
  if (!html) return null;
  const match = html.match(/instagram\.com\/([a-zA-Z0-9_.]{2,30})\/?(?:["'?]|$)/);
  const handle = match?.[1];
  if (!handle || ["p", "explore", "reel", "accounts", "share"].includes(handle.toLowerCase())) return null;
  return handle;
}

export interface SiteContacts {
  instagram: string | null;
  facebook: string | null;
  tiktok: string | null;
  youtube: string | null;
  x: string | null;
  whatsapp: string | null;
  phone: string | null;
  email: string | null;
}

const SOCIAL_PATTERNS: Record<"facebook" | "tiktok" | "youtube" | "x", { re: RegExp; skip: string[] }> = {
  facebook: { re: /(?:facebook|fb)\.com\/([a-zA-Z0-9_.-]{2,60})\/?(?=["'?#\s<]|$)/g, skip: ["sharer", "sharer.php", "share", "dialog", "tr", "plugins", "login", "watch", "groups", "events"] },
  tiktok: { re: /tiktok\.com\/@([a-zA-Z0-9_.]{2,30})/g, skip: [] },
  youtube: { re: /youtube\.com\/((?:@|c\/|channel\/|user\/)[a-zA-Z0-9_.-]{2,60})/g, skip: [] },
  x: { re: /(?:twitter|x)\.com\/([a-zA-Z0-9_]{2,15})\/?(?=["'?#\s<]|$)/g, skip: ["share", "intent", "home", "i", "search", "hashtag"] },
};

/** Keeps "+" and digits only; drops anything too short/long to be a real phone number. */
function cleanPhone(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const hasPlus = raw.trim().startsWith("+");
  const digits = raw.replace(/\D/g, "");
  if (digits.length < 9 || digits.length > 15) return null;
  return (hasPlus ? "+" : "") + digits;
}

/**
 * Pulls real contact channels off a page: social profile links, a WhatsApp number (wa.me /
 * api.whatsapp links first, then a number printed next to the word "WhatsApp"), a phone and an
 * email. Placeholder links like href="#" are ignored — only what's really there comes back.
 */
export function extractContacts(html: string | null, text: string | null): SiteContacts {
  try {
    return findContacts(html, text);
  } catch {
    return { instagram: null, facebook: null, tiktok: null, youtube: null, x: null, whatsapp: null, phone: null, email: null };
  }
}

function findContacts(html: string | null, text: string | null): SiteContacts {
  const h = (html ?? "").replace(/&amp;/g, "&").replace(/\\\//g, "/");
  const t = text ?? "";
  const first = (key: keyof typeof SOCIAL_PATTERNS) => {
    const { re, skip } = SOCIAL_PATTERNS[key];
    for (const m of h.matchAll(re)) if (!skip.includes(m[1].toLowerCase())) return m[1];
    return null;
  };
  const fb = first("facebook"), tt = first("tiktok"), yt = first("youtube"), xx = first("x");

  const waLink =
    h.match(/wa\.me\/\+?(\d{9,15})/)?.[1] ??
    h.match(/(?:api|web)\.whatsapp\.com\/send\/?\?(?:[^"'\s<]*?&)?phone=\+?(\d{9,15})/)?.[1] ??
    h.match(/whatsapp:\/\/send\?(?:[^"'\s<]*?&)?phone=\+?(\d{9,15})/)?.[1] ??
    null;
  const waText = t.match(/whats\s?app[^0-9+]{0,25}(\+?\d[\d\s().-]{7,18}\d)/i)?.[1] ?? null;
  const whatsapp = waLink ? `+${waLink}` : cleanPhone(waText);

  const telLink = h.match(/href=["']tel:([^"']+)["']/i)?.[1] ?? null;
  const phoneText = t.match(/(?:phone|call|tel|mobile|contact)[^0-9+]{0,20}(\+?\d[\d\s().-]{7,18}\d)/i)?.[1] ?? null;
  const email = h.match(/mailto:([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-z]{2,})/i)?.[1] ?? t.match(/\b[a-zA-Z0-9._%+-]+@[a-zA-Z0-9-]+\.[a-z]{2,}(?:\.[a-z]{2,})?\b/i)?.[0] ?? null;

  return {
    instagram: extractInstagramHandle(h),
    facebook: fb ? `https://facebook.com/${fb}` : null,
    tiktok: tt ? `@${tt}` : null,
    youtube: yt ? `https://youtube.com/${yt}` : null,
    x: xx ? `@${xx}` : null,
    whatsapp,
    phone: cleanPhone(telLink) ?? cleanPhone(phoneText) ?? whatsapp,
    email,
  };
}

/** Best-effort handle guess from a domain, e.g. "bluebottlecoffee.com" -> "bluebottlecoffee" */
export function guessHandle(rawUrl: string): string {
  return rawUrl
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .split("/")[0]
    .split(".")[0]
    .toLowerCase();
}

export interface CompetitorIntel {
  url: string;
  website: ScrapeResult;
  instagram: ScrapeResult;
  tiktok: ScrapeResult;
  adLibrary: ScrapeResult;
}

const DEEP_SCAN_PATHS = ["/shop", "/collections/all", "/products", "/about", "/pricing"];

/**
 * Real multi-page scan of a competitor's site — homepage plus a handful of common shop/about/
 * pricing paths, scraped in parallel and merged. A homepage alone usually only surfaces
 * featured items; real pricing and the fuller real catalog more often live on these subpages.
 * Every extra page that actually resolves is labelled by its real path so the model can tell
 * real per-page signal apart, and real structured product data is deduped by name across pages.
 */
/** HTTP-only, no browser fallback — used for the extra subpaths so a handful of blocked/slow
 * paths can't turn a multi-second scan into minutes. The homepage still gets the full real
 * browser-fallback treatment via scrapePage(), since it's the one page worth waiting for. */
async function fetchExtraPath(url: string): Promise<ScrapeResult> {
  try {
    const http = await fetchWithHttp(url);
    if (!looksBlocked(http.text)) {
      return { url, text: safeSlice(http.text, 1500), structuredData: http.structuredData, rawProducts: http.rawProducts, method: "http" };
    }
  } catch {
    // fall through to failed — no browser fallback for these, keep the scan fast
  }
  return { url, text: "", structuredData: "(unavailable)", rawProducts: [], method: "failed" };
}

type CatalogItem = { name: string; price: number; compareAt: number | null; available: boolean | null; added: string | null; currency: string | null };

async function getJson(url: string): Promise<unknown | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  try {
    const res = await safeFetch(url, { signal: controller.signal, headers: { ...REALISTIC_HEADERS, Accept: "application/json" } });
    if (!res.ok || !(res.headers.get("content-type") ?? "").includes("json")) return null;
    return await res.json();
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * The competitor's real catalog, when their platform publishes it: Shopify's public /products.json
 * or WooCommerce's public Store API. Real current prices, sale ("compare at") prices, stock and
 * launch dates — far better than reading prose. Null when neither exists.
 */
export async function readCatalogApi(base: string): Promise<{ platform: string; items: CatalogItem[] } | null> {
  const shop = (await getJson(`${base}/products.json?limit=60`)) as { products?: Record<string, unknown>[] } | null;
  if (shop && Array.isArray(shop.products) && shop.products.length) {
    const items = shop.products.map((p): CatalogItem => {
      const vs = Array.isArray(p.variants) ? (p.variants as Record<string, unknown>[]) : [];
      const prices = vs.map((v) => Number(v.price)).filter((n) => Number.isFinite(n) && n > 0);
      const compares = vs.map((v) => Number(v.compare_at_price)).filter((n) => Number.isFinite(n) && n > 0);
      const price = prices.length ? Math.min(...prices) : 0;
      const compareAt = compares.length ? Math.max(...compares) : null;
      return {
        name: String(p.title ?? "").slice(0, 90),
        price,
        compareAt: compareAt && compareAt > price ? compareAt : null,
        available: vs.length ? vs.some((v) => v.available !== false) : null,
        added: typeof p.published_at === "string" ? p.published_at.slice(0, 10) : typeof p.created_at === "string" ? p.created_at.slice(0, 10) : null,
        currency: null,
      };
    });
    return { platform: "Shopify", items: items.filter((i) => i.name && i.price > 0) };
  }
  const woo = (await getJson(`${base}/wp-json/wc/store/v1/products?per_page=60&orderby=date`)) as Record<string, unknown>[] | null;
  if (Array.isArray(woo) && woo.length) {
    const items = woo.map((p): CatalogItem => {
      const pr = (p.prices ?? {}) as Record<string, unknown>;
      const minor = Number(pr.currency_minor_unit ?? 2);
      const conv = (v: unknown) => (Number.isFinite(Number(v)) ? Number(v) / 10 ** minor : 0);
      const price = conv(pr.price);
      const regular = conv(pr.regular_price);
      return {
        name: String(p.name ?? "").replace(/<[^>]+>/g, "").slice(0, 90),
        price,
        compareAt: regular > price ? regular : null,
        available: typeof p.is_in_stock === "boolean" ? p.is_in_stock : null,
        added: null,
        currency: typeof pr.currency_code === "string" ? pr.currency_code : null,
      };
    });
    return { platform: "WooCommerce", items: items.filter((i) => i.name && i.price > 0) };
  }
  return null;
}

export function formatCatalog(c: { platform: string; items: CatalogItem[] }): string {
  const items = c.items;
  if (!items.length) return "";
  const fmt = (n: number) => Math.round(n).toLocaleString("en-US");
  const onSale = items.filter((i) => i.compareAt);
  const soldOut = items.filter((i) => i.available === false);
  const prices = items.map((i) => i.price).sort((a, b) => a - b);
  const median = prices[Math.floor(prices.length / 2)];
  const newest = [...items].filter((i) => i.added).sort((a, b) => (b.added! > a.added! ? 1 : -1));
  const line = (i: CatalogItem) =>
    `- ${i.name}: ${i.currency ?? ""}${fmt(i.price)}${i.compareAt ? ` (was ${fmt(i.compareAt)}, −${Math.round((1 - i.price / i.compareAt) * 100)}%)` : ""}${i.available === false ? " · SOLD OUT" : ""}${i.added ? ` · added ${i.added}` : ""}`;
  return [
    `REAL CATALOG from their ${c.platform} store (public product feed — exact numbers): ${items.length} products seen, prices ${fmt(prices[0])}–${fmt(prices[prices.length - 1])} (median ${fmt(median)}), ${onSale.length} on sale, ${soldOut.length} sold out.`,
    ...(newest.length ? ["Newest launches:", ...newest.slice(0, 8).map(line)] : []),
    ...(onSale.length ? ["Biggest discounts:", ...[...onSale].sort((a, b) => b.compareAt! / b.price - a.compareAt! / a.price).slice(0, 6).map(line)] : []),
    ...(soldOut.length ? ["Sold out (demand signal):", ...soldOut.slice(0, 6).map(line)] : []),
    ...(!newest.length ? ["Products:", ...items.slice(0, 12).map(line)] : []),
  ].join("\n");
}

async function scrapeSiteDeep(rawUrl: string): Promise<{ combinedText: string; rawProducts: ProductSummary[]; pagesFound: number; primaryMethod: ScrapeResult["method"]; catalog: string }> {
  const base = rawUrl.startsWith("http") ? rawUrl.replace(/\/$/, "") : `https://${rawUrl.replace(/\/$/, "")}`;
  const targets = DEEP_SCAN_PATHS.map((p) => `${base}${p}`);

  const [home, catalogApi, ...extra] = await Promise.all([scrapePage(base, 2000), readCatalogApi(base), ...targets.map(fetchExtraPath)]);
  // No public catalog feed → open a few real product pages the homepage links to; product pages
  // carry the real price / stock markup that listing pages often leave out.
  const productPages =
    catalogApi || !home.productLinks?.length ? [] : await Promise.all(home.productLinks.slice(0, 5).map(fetchExtraPath));
  const results = [home, ...extra, ...productPages];

  const seenProducts = new Set<string>();
  const rawProducts: ProductSummary[] = [];
  results.forEach((r) => {
    r.rawProducts.forEach((p) => {
      if (!p.name) return;
      const key = p.name.trim().toLowerCase();
      if (seenProducts.has(key)) return;
      seenProducts.add(key);
      rawProducts.push(p);
    });
  });

  const extraText = extra
    .filter((r) => r.method !== "failed" && r.text && r.text.length > 100)
    .map((r) => `[${r.url}] ${safeSlice(r.text, 600)}`)
    .join("\n\n");

  const combinedText = extraText ? `${home.text}\n\n--- additional real pages checked ---\n\n${extraText}` : home.text;
  const pagesFound = results.filter((r) => r.method !== "failed").length;
  const catalog = catalogApi ? formatCatalog(catalogApi) : "";

  return { combinedText, rawProducts, pagesFound, primaryMethod: home.method, catalog };
}

function toScrapeResult(url: string, r: { text: string; method: "api" | "failed" }): ScrapeResult {
  if (r.method === "failed") {
    return { url, text: "(no real data available from this source)", structuredData: "(unavailable)", rawProducts: [], method: "failed" };
  }
  return { url, text: r.text, structuredData: "(not applicable — this source is text-only)", rawProducts: [], method: "api" };
}

/**
 * Scans a competitor across their website, Instagram, TikTok, and Meta's public Ad Library.
 * Instagram/TikTok use Apify's proxy-backed scraper actors when APIFY_API_TOKEN is configured
 * (real, paid, residential-proxy scraping — succeeds where a plain headless browser hits an
 * anti-bot login wall); otherwise falls back to the direct-browser attempt, honestly likely to
 * be blocked. The Ad Library uses Meta's real, free Ad Library API when META_APP_ID/SECRET are
 * configured, instead of scraping the ad library webpage.
 */
export async function scrapeCompetitorFull(rawUrl: string): Promise<CompetitorIntel> {
  const handle = guessHandle(rawUrl);

  const [deepSite, instagram, tiktok, adLibrary] = await Promise.all([
    scrapeSiteDeep(rawUrl),
    isApifyConfigured()
      ? scrapeInstagramProfileReal(handle).then((r) => toScrapeResult(`https://www.instagram.com/${handle}/`, r))
      : scrapePage(`https://www.instagram.com/${handle}/`, 4000),
    isApifyConfigured()
      ? scrapeTiktokProfileReal(handle).then((r) => toScrapeResult(`https://www.tiktok.com/@${handle}`, r))
      : scrapePage(`https://www.tiktok.com/@${handle}`, 4000),
    isAdLibraryConfigured()
      ? searchAdLibrary(handle).then((r) => toScrapeResult(handle, r))
      : scrapePage(
          `https://www.facebook.com/ads/library/?active_status=active&ad_type=all&country=ALL&q=${encodeURIComponent(handle)}&media_type=all`,
          5000,
        ),
  ]);

  const website: ScrapeResult = {
    url: rawUrl,
    text: safeSlice(
      `(${deepSite.pagesFound} real page${deepSite.pagesFound === 1 ? "" : "s"} checked: homepage + shop/about/pricing paths that actually resolved) ${deepSite.combinedText}`,
      3000,
    ),
    structuredData: [deepSite.catalog, formatProductSummaries(deepSite.rawProducts)].filter(Boolean).join("\n\n"),
    rawProducts: deepSite.rawProducts,
    method: deepSite.primaryMethod,
  };

  return { url: rawUrl, website, instagram, tiktok, adLibrary };
}
