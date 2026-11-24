// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { Browser, Page } from "playwright";

vi.mock("@/lib/safe-fetch", () => ({ guardBrowserPage: async () => {} }));

import { qaHtml, remainingIssues } from "@/lib/site-craft-qa";

const DESKTOP = { name: "desktop" as const, width: 1440, height: 900 };
const IMG = "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='10' height='10'><rect width='10' height='10' fill='%23888'/></svg>";

/** A page with the exact mistakes found on the Shehd Ghar / offcut build. */
const BROKEN = (extraCss = "") => `<!doctype html><html><head><style>
body{margin:0;font-family:Arial;background:#2a3cf0;color:#fff}
header{background:#2a3cf0;padding:24px 48px} header a{color:#3b3b3b;text-decoration:none;margin-right:20px}
.hero{padding:140px 48px} .hero h1{font-size:230px;line-height:1;margin:0} .hero .btn{display:inline-block;background:#d4ff3a;color:#111;padding:16px 28px}
.grid{padding:60px 48px;background:#2a3cf0} .card{background:#fff;width:360px;padding:16px} .card h3{margin:0}
.big{width:100%;display:block}
.strip{background:#fff;color:#111;padding:40px;margin-top:-60px;position:relative} .heading{font-size:60px;margin:0;color:#fff;padding:10px 48px}
${extraCss}</style></head><body>
<header><a href="#">Shop Drop 07</a><a href="#">Lookbook</a></header>
<section class="hero"><h1>CUT FROM WHAT FASHION THREW AWAY</h1><p>Tees and denim.</p><a class="btn" href="#">Shop drop</a></section>
<section class="grid"><h2 class="heading">DROP</h2><div class="card"><h3 class="name" style="color:#fff">Salvage Tee</h3><p>Rs 3,200</p></div></section>
<section><img class="big" src="${IMG}" style="aspect-ratio:1/1" alt=""></section>
</body></html>`;

let browser: Browser;
let page: Page;

beforeAll(async () => {
  const { chromium } = await import("playwright");
  browser = await chromium.launch();
  page = await (await browser.newContext()).newPage();
}, 60000);
afterAll(async () => {
  await browser?.close();
});

describe("site-craft QA", () => {
  it("finds and fixes unreadable text, an oversize image and a hero that spills off the screen", async () => {
    const m = await qaHtml(BROKEN(), DESKTOP, true, page);
    const kinds = m.issues.map((i) => i.kind);
    expect(kinds).toContain("contrast");
    expect(kinds).toContain("tall-image");
    expect(kinds).toContain("hero-fit");
    // product name (white on white card) and nav links (grey on blue) both got a colour rule
    expect(m.rules.join("\n")).toMatch(/\.name\{color:#111111/);
    expect(m.rules.join("\n")).toMatch(/header a\{color:#ffffff/i);

    // apply the generated CSS and measure again: nothing left to fix
    const fixed = await qaHtml(BROKEN(m.rules.join("\n")), DESKTOP, true, page);
    expect(fixed.issues.filter((i) => i.kind === "contrast" && !i.fixed)).toHaveLength(0);
    expect(fixed.issues.filter((i) => i.kind === "contrast")).toHaveLength(0);
    expect(fixed.issues.filter((i) => i.kind === "tall-image" || i.kind === "hero-fit")).toHaveLength(0);
  }, 60000);

  it("fixes platform links that have no class of their own, and a heading hidden under the section above", async () => {
    const html = (extra = "") => `<!doctype html><html><head><style>
body{margin:0;font-family:Arial;background:#2a3cf0;color:#fff}
.bar{background:#2a3cf0;padding:20px}
.bar a{color:#444;margin-right:16px}
.strip{background:#fff;color:#111;padding:60px;position:relative;z-index:2;margin-bottom:-70px;height:80px}
.drop{padding:0 48px 80px}
.drop h2{font-size:64px;margin:0;line-height:1}
${extra}</style></head><body>
<div class="bar"><nav><a href="#">One</a><a href="#">Two</a></nav><a href="#" style="color:#fff">Logo</a></div>
<section class="strip">Trust strip</section>
<section class="drop"><h2>DROP</h2><p>sub</p></section>
</body></html>`;
    const m = await qaHtml(html(), DESKTOP, false, page);
    expect(m.issues.some((i) => i.kind === "overlap" && i.fixed)).toBe(true);
    expect(m.issues.filter((i) => i.kind === "contrast" && !i.fixed)).toHaveLength(0);
    const after = await qaHtml(html(m.rules.join("\n")), DESKTOP, false, page);
    expect(after.issues.filter((i) => i.kind === "overlap" || i.kind === "contrast")).toHaveLength(0);
  }, 60000);

  it("leaves a healthy page alone", async () => {
    const ok = `<!doctype html><body style="margin:0;background:#fff;color:#111"><header style="padding:20px"><a href="#" style="color:#111">Shop</a></header><section style="padding:60px"><h1 style="margin:0;font-size:48px">Hello</h1><a href="#" style="color:#111">Buy</a></section></body>`;
    const m = await qaHtml(ok, DESKTOP, true, page);
    expect(m.rules).toHaveLength(0);
    expect(m.issues).toHaveLength(0);
  }, 60000);

  it("lists only what it could not fix", () => {
    const list = remainingIssues([
      { kind: "contrast", page: "home", viewport: "desktop", detail: "a", fixed: true },
      { kind: "big-card", page: "shop", viewport: "desktop", detail: "cards are huge", fixed: false },
    ]);
    expect(list).toEqual(["[shop · desktop] big-card: cards are huge"]);
  });
});

describe("fallback mobile menu", () => {
  it("opens and shows readable links even when the designer's CSS hides every header nav on phones", async () => {
    const { withMobileMenu } = await import("@/lib/site-craft-build");
    const { defaultDoc, renderPageDocument } = await import("@/lib/orbit-design");
    const base = defaultDoc("Mehfil Mugs", "mugs");
    const doc = withMobileMenu({
      ...base,
      components: { ...base.components, header: '<header class="sc-h"><a href="#page:home" class="logo">Mehfil</a></header>' },
      css: "header nav{display:none!important} header a{color:#fff;padding:0} header div{display:none!important} @media(max-width:700px){.sc-h *{opacity:.9}}",
      pages: [
        ...base.pages.map((p) => ({ ...p, nav: p.slug === "home" ? false : p.nav })),
        { slug: "shop", title: "Shop", nav: true, sections: [] },
        { slug: "about", title: "Our story", nav: true, sections: [] },
        { slug: "contact", title: "Contact", nav: true, sections: [] },
      ],
    });
    expect(doc.motion?.mobileMenu).toBe(true);
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const page = await ctx.newPage();
    await page.setContent(renderPageDocument(doc, { products: [], businessId: "b", pageSlug: "home" }), { waitUntil: "load" });
    await page.locator("details.od-qa-menu > summary").click();
    const links = await page.locator(".od-qa-panel a").evaluateAll((as) => as.map((a) => ({ t: (a as HTMLElement).innerText.trim(), c: getComputedStyle(a).color, w: a.getBoundingClientRect().width, h: a.getBoundingClientRect().height })));
    expect(links.length).toBeGreaterThanOrEqual(2);
    for (const l of links) {
      expect(l.t.length).toBeGreaterThan(0);
      expect(l.w).toBeGreaterThan(100);
      expect(l.h).toBeGreaterThan(30);
      expect(l.c).toBe("rgb(26, 26, 26)"); // dark ink on the white panel, not the designer's white
    }
    // and it is gone on desktop
    await page.setViewportSize({ width: 1200, height: 800 });
    expect(await page.locator("details.od-qa-menu").isVisible()).toBe(false);
    await ctx.close();
  }, 60000);
});
