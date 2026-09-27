import { REALISTIC_HEADERS } from "@/lib/scrape";
import { assertPublicUrl, guardBrowserPage, safeFetch } from "@/lib/safe-fetch";

export interface SiteShot {
  /** base64 JPEG (no data: prefix), ready for an Anthropic image block */
  data: string;
  mediaType: "image/jpeg";
  /** most-used hex colours + linked Google Fonts, pulled from the raw HTML */
  hint: string;
}

/**
 * Renders a URL in a real headless browser and returns a screenshot of the top of the page
 * (hero + first sections — enough to read the design vibe) plus a short colour/font hint from
 * the HTML. Best-effort: returns null if the page can't be reached or rendered in time.
 */
export async function screenshotSite(rawUrl: string): Promise<SiteShot | null> {
  const url = rawUrl.startsWith("http") ? rawUrl : `https://${rawUrl}`;

  let shot: Buffer | null = null;
  try {
    const { chromium } = await import("playwright");
    const browser = await chromium.launch({ args: ["--disable-blink-features=AutomationControlled"] });
    try {
      const context = await browser.newContext({
        userAgent: REALISTIC_HEADERS["User-Agent"],
        viewport: { width: 1366, height: 1100 },
        locale: "en-US",
      });
      const page = await context.newPage();
      await assertPublicUrl(url);
      await guardBrowserPage(page);
      await page.goto(url, { waitUntil: "domcontentloaded", timeout: 20000 });
      await page.waitForTimeout(2500); // let hero images / lazy content settle
      shot = await page.screenshot({ type: "jpeg", quality: 70 }); // viewport only — bounded size
    } finally {
      await browser.close();
    }
  } catch {
    return null;
  }
  if (!shot) return null;

  let hint = "";
  try {
    const res = await safeFetch(url, { headers: REALISTIC_HEADERS, signal: AbortSignal.timeout(8000) });
    const html = await res.text();
    const freq = new Map<string, number>();
    for (const m of html.matchAll(/#[0-9a-fA-F]{6}\b/g)) {
      const h = m[0].toLowerCase();
      freq.set(h, (freq.get(h) ?? 0) + 1);
    }
    const colours = [...freq.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6).map(([h]) => h);
    const fonts = [...html.matchAll(/fonts\.googleapis\.com\/css2?\?family=([^"'&]+)/g)].map((m) =>
      decodeURIComponent(m[1]).replace(/\+/g, " ").split(":")[0],
    );
    hint = [
      colours.length ? `Most-used colours: ${colours.join(", ")}` : "",
      fonts.length ? `Google Fonts: ${[...new Set(fonts)].slice(0, 3).join(", ")}` : "",
    ]
      .filter(Boolean)
      .join(" · ");
  } catch {
    /* hint is optional */
  }

  return { data: shot.toString("base64"), mediaType: "image/jpeg", hint };
}

/** Pulls the first http(s) URL out of a free-text message, if any. */
export function firstUrl(text: string): string | null {
  const m = text.match(/https?:\/\/[^\s)]+/i);
  return m ? m[0].replace(/[.,;]+$/, "") : null;
}

export interface DocShot {
  label: string; // e.g. "home · desktop"
  data: string; // base64 JPEG
  mediaType: "image/jpeg";
}

/**
 * Renders finished storefront HTML strings in a headless browser and screenshots each at desktop
 * and mobile widths — used by the visual design-review pass. `pages` is [{label, html}] where html
 * is a full renderPageDocument() output. Best-effort: returns [] if the browser can't start.
 */
export async function renderDocShots(pages: { label: string; html: string }[]): Promise<DocShot[]> {
  if (!pages.length) return [];
  const shots: DocShot[] = [];
  try {
    const { chromium } = await import("playwright");
    const browser = await chromium.launch({ args: ["--disable-blink-features=AutomationControlled"] });
    try {
      for (const { label, html } of pages) {
        for (const view of [
          { name: "desktop", width: 1440, height: 900 },
          { name: "mobile", width: 390, height: 844 },
        ] as const) {
          const ctx = await browser.newContext({ viewport: { width: view.width, height: view.height }, deviceScaleFactor: 1 });
          const page = await ctx.newPage();
          await guardBrowserPage(page);
          try {
            await page.setContent(html, { waitUntil: "load", timeout: 15000 });
            // A full-page shot never scrolls, so scroll-reveal content below the fold would still be
            // invisible — the reviewer then reports a real section as an "empty gap" and deletes it.
            // Show everything in its final state first.
            await page.addStyleTag({
              content:
                "[data-od-reveal],[data-od-reveal-stagger]>*{opacity:1!important;transform:none!important;transition:none!important}[data-od-parallax]{transform:none!important}",
            });
            await page.waitForTimeout(1400); // fonts + marquee settle
            const buf = await page.screenshot({ type: "jpeg", quality: 68, fullPage: view.name === "desktop" });
            shots.push({ label: `${label} · ${view.name}`, data: buf.toString("base64"), mediaType: "image/jpeg" });
          } catch {
            /* skip this shot */
          } finally {
            await ctx.close();
          }
        }
      }
    } finally {
      await browser.close();
    }
  } catch {
    return shots;
  }
  return shots;
}
