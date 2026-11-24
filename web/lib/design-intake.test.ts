// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Browser } from "playwright";
import { INTAKE, composeIntake, emptyAnswers, splashFrom } from "@/lib/design-intake";
import { defaultDoc, renderPageParts, type OrbitDesignDoc } from "@/lib/orbit-design";

describe("design intake", () => {
  it("offers the choices the owner asked for", () => {
    const ids = INTAKE.map((s) => s.id);
    expect(ids).toEqual(expect.arrayContaining(["hero", "header", "splash", "cards", "sections", "feel"]));
    expect(INTAKE.find((s) => s.id === "splash")!.options.map((o) => o.id)).toEqual(["none", "fade", "counter", "curtain"]);
    expect(INTAKE.find((s) => s.id === "hero")!.options.map((o) => o.id)).toEqual(expect.arrayContaining(["photo", "slider", "video", "videos"]));
    // every option has a one-line hint and a binding instruction
    for (const s of INTAKE) for (const o of s.options) expect(o.hint && o.brief).toBeTruthy();
  });

  it("returns the brief untouched when nothing was chosen", () => {
    expect(composeIntake("Sell honey", emptyAnswers())).toEqual({ message: "Sell honey", images: [] });
  });

  it("turns choices into binding lines and a splash marker", () => {
    const a = emptyAnswers();
    a.picks = { hero: ["video"], cards: ["overlay"], splash: ["counter"], sections: ["bestsellers", "faq"] };
    a.notes = { cards: "rounded corners" };
    a.brand = "forest green";
    const { message, images } = composeIntake("Sell honey", a);
    expect(message).toContain("binding");
    expect(message).toContain("full-screen looping background video");
    expect(message).toContain("overlay cards");
    expect(message).toContain("rounded corners");
    expect(message).toContain("a best-sellers rail");
    expect(message).toContain("forest green");
    expect(splashFrom(message)).toBe("counter");
    expect(images).toEqual([]);
  });

  it("labels each reference image with the part it is for, in order", () => {
    const a = emptyAnswers();
    a.picks = { header: ["centered"] };
    a.refs = { header: ["data:image/jpeg;base64,AAA"], site: ["data:image/jpeg;base64,BBB", "data:image/jpeg;base64,CCC"] };
    const { message, images } = composeIntake("Sell honey", a);
    expect(images).toEqual(["data:image/jpeg;base64,AAA", "data:image/jpeg;base64,BBB", "data:image/jpeg;base64,CCC"]);
    expect(message).toContain("Image 1: reference for the HEADER");
    expect(message).toContain("Image 2: reference for the WHOLE STORE");
    expect(message).toContain("follow the attached reference image");
  });

  it("never sends more than 8 reference images", () => {
    const a = emptyAnswers();
    a.refs = { site: Array.from({ length: 12 }, (_, i) => `data:image/jpeg;base64,${i}`) };
    expect(composeIntake("x", a).images).toHaveLength(8);
  });
});

describe("splash screens (rendered in a real browser)", () => {
  let browser: Browser;
  beforeAll(async () => {
    const { chromium } = await import("playwright");
    browser = await chromium.launch();
  }, 60000);
  afterAll(async () => {
    await browser?.close();
  });

  const docWith = (splash: "fade" | "counter" | "curtain"): OrbitDesignDoc => ({ ...defaultDoc("Shehd Ghar", "honey"), motion: { preloader: true, splash } });
  const html = (d: OrbitDesignDoc) => {
    // the splash is a live-store feature (the studio preview skips it) — render it the way /store does
    const p = renderPageParts(d, { products: [], businessId: "b1", pageSlug: "home", preview: false });
    return `<!doctype html><html><head><style>${p.css}</style></head><body>${p.bodyHtml}</body></html>`;
  };

  it("counter: counts up to 100, then lifts", async () => {
    const page = await browser.newPage();
    await page.setContent(html(docWith("counter")), { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(500);
    const mid = Number(await page.locator(".od-preload-count").textContent());
    expect(mid).toBeGreaterThan(0);
    expect(mid).toBeLessThan(100);
    await page.waitForSelector("#od-preload[data-od-gone]", { timeout: 6000 });
    await page.waitForSelector("#od-preload", { state: "detached", timeout: 6000 });
    await page.close();
  }, 30000);

  it("curtain: two panels slide apart and the splash goes away", async () => {
    const page = await browser.newPage();
    await page.setContent(html(docWith("curtain")), { waitUntil: "domcontentloaded" });
    expect(await page.locator(".od-curtain").count()).toBe(2);
    // the left panel ends up off-screen (or the splash has already removed itself) — never stuck over the page
    await page.waitForFunction(() => {
      const el = document.querySelector(".od-curtain-l");
      return !el || el.getBoundingClientRect().right <= 2;
    }, undefined, { timeout: 8000 });
    await page.waitForSelector("#od-preload", { state: "detached", timeout: 6000 });
    await page.close();
  }, 30000);

  it("fade: still works, and nothing shows without a splash", async () => {
    const page = await browser.newPage();
    await page.setContent(html(docWith("fade")), { waitUntil: "domcontentloaded" });
    expect(await page.locator("#od-preload[data-splash=fade] .od-preload-mark").count()).toBe(1);
    await page.close();
    const plain = html({ ...defaultDoc("Shehd Ghar", "honey"), motion: undefined });
    expect(plain).not.toContain("od-preload");
  }, 30000);
});
