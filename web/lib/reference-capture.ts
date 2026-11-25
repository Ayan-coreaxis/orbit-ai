/**
 * A site the seller wants their store to look like. One viewport screenshot isn't enough to copy a
 * look from, so this takes the whole page (desktop, in slices, and the phone's first screens) and
 * measures it: page colours, fonts, heading style, buttons, product cards, the header and the order
 * of its sections. The designer gets both, and can look again before it finishes.
 */
import sharp from "sharp";
import { assertPublicUrl, guardBrowserPage } from "@/lib/safe-fetch";

export interface ReferenceCapture {
  url: string;
  images: { data: string; mediaType: "image/jpeg"; label: string }[];
  spec: string;
}

const MEASURE = `(() => {
  const vis = (e) => { const r = e.getBoundingClientRect(); const s = getComputedStyle(e); return r.width > 0 && r.height > 0 && s.visibility !== "hidden" && s.display !== "none" };
  const st = (e) => (e ? getComputedStyle(e) : null);
  const font = (e) => { const s = st(e); return s ? s.fontFamily.split(",")[0].replace(/["']/g, "").trim() + " " + s.fontWeight + " " + Math.round(parseFloat(s.fontSize)) + "px" + (s.textTransform !== "none" ? " " + s.textTransform : "") + (parseFloat(s.letterSpacing) > 0.5 ? " letter-spacing " + s.letterSpacing : "") + (s.fontStyle === "italic" ? " italic" : "") : "" };
  const bgOf = (e) => { while (e) { const c = st(e).backgroundColor; if (c && !/rgba\\(0, 0, 0, 0\\)|transparent/.test(c)) return c; e = e.parentElement } return "rgb(255,255,255)" };
  const first = (sel) => [...document.querySelectorAll(sel)].find(vis);
  const header = first("header") || first("nav");
  const h1 = first("h1") || first("h2");
  const h2 = [...document.querySelectorAll("h2,h3")].find(vis);
  const btn = [...document.querySelectorAll("a,button")].find((e) => vis(e) && /add to cart|shop|buy|explore|view/i.test(e.textContent || "") && st(e).backgroundColor !== "rgba(0, 0, 0, 0)");
  const priceEl = [...document.querySelectorAll("*")].find((e) => vis(e) && e.children.length === 0 && /^\\s*(rs\\.?|pkr|\\$)\\s?[\\d,]+/i.test(e.textContent || ""));
  let card = priceEl; for (let i = 0; i < 6 && card && card.getBoundingClientRect().height < 220; i++) card = card.parentElement;
  const cardImg = card ? card.querySelector("img") : null;
  const sections = [];
  for (const h of document.querySelectorAll("h1,h2,h3")) {
    if (!vis(h)) continue;
    const t = (h.textContent || "").replace(/\\s+/g, " ").trim();
    if (!t || t.length > 70 || sections.some((s) => s.t === t)) continue;
    sections.push({ t, y: Math.round(h.getBoundingClientRect().top + scrollY), bg: bgOf(h) });
    if (sections.length >= 24) break;
  }
  const navLinks = header ? [...header.querySelectorAll("a")].filter(vis).map((a) => (a.textContent || "").trim()).filter((t) => t && t.length < 24).slice(0, 14) : [];
  const ann = [...document.querySelectorAll("body *")].find((e) => vis(e) && e.getBoundingClientRect().top < 60 && e.getBoundingClientRect().height < 50 && e.getBoundingClientRect().width > innerWidth * 0.8 && st(e).backgroundColor !== "rgba(0, 0, 0, 0)");
  return {
    page: { bg: bgOf(document.body), text: st(document.body).color, font: font(document.body), height: document.documentElement.scrollHeight, width: innerWidth },
    announcement: ann ? { bg: st(ann).backgroundColor, text: (ann.textContent || "").trim().slice(0, 80) } : null,
    header: header ? { bg: bgOf(header), height: Math.round(header.getBoundingClientRect().height), links: navLinks, font: font(header.querySelector("a")), logoCentred: (() => { const l = header.querySelector("img,svg"); if (!l) return null; const r = l.getBoundingClientRect(); return Math.abs(r.left + r.width / 2 - innerWidth / 2) < 80 })() } : null,
    h1: h1 ? { text: (h1.textContent || "").trim().slice(0, 60), font: font(h1), color: st(h1).color } : null,
    h2: h2 ? { text: (h2.textContent || "").trim().slice(0, 60), font: font(h2), color: st(h2).color, align: st(h2).textAlign } : null,
    button: btn ? { text: (btn.textContent || "").trim().slice(0, 30), bg: st(btn).backgroundColor, color: st(btn).color, radius: st(btn).borderRadius, font: font(btn) } : null,
    card: card ? { width: Math.round(card.getBoundingClientRect().width), radius: st(card).borderRadius, bg: bgOf(card), border: st(card).border, imageBg: cardImg ? bgOf(cardImg) : null, imageRatio: cardImg ? (cardImg.getBoundingClientRect().height / Math.max(1, cardImg.getBoundingClientRect().width)).toFixed(2) : null, price: (priceEl.textContent || "").trim(), priceFont: font(priceEl), perRow: Math.round(innerWidth / Math.max(1, card.getBoundingClientRect().width + 16)) } : null,
    sections,
  };
})()`;

function specText(url: string, d: Record<string, unknown>, mobileLinks: string): string {
  const j = (x: unknown) => JSON.stringify(x);
  const m = d as { page: Record<string, unknown>; announcement: unknown; header: unknown; h1: unknown; h2: unknown; button: unknown; card: unknown; sections: { t: string; y: number; bg: string }[] };
  return [
    `REFERENCE SITE ${url} — measured in a browser at 1440px wide:`,
    `- Page: ${j(m.page)}`,
    `- Announcement strip: ${j(m.announcement)}`,
    `- Header: ${j(m.header)}`,
    `- Main heading style: ${j(m.h1)}`,
    `- Section heading style: ${j(m.h2)}`,
    `- Main button: ${j(m.button)}`,
    `- Product card: ${j(m.card)}`,
    `- Sections from top to bottom (heading, distance from the top in px, background): ${m.sections.map((s) => `${s.t} @${s.y} ${s.bg}`).join(" | ")}`,
    mobileLinks ? `- On a phone: ${mobileLinks}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

export async function captureReference(rawUrl: string): Promise<ReferenceCapture | null> {
  const url = rawUrl.startsWith("http") ? rawUrl : `https://${rawUrl}`;
  try {
    await assertPublicUrl(url);
  } catch {
    return null;
  }
  const { chromium } = await import("playwright");
  const browser = await chromium.launch({ args: ["--disable-blink-features=AutomationControlled"] });
  try {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: "en-US", userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Safari/537.36" });
    const page = await ctx.newPage();
    await guardBrowserPage(page);
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
    await page.waitForTimeout(4000);
    await page.keyboard.press("Escape").catch(() => {});
    // scroll through so lazy images and reveals appear
    await page.evaluate("(async()=>{const H=Math.min(document.documentElement.scrollHeight,14000);for(let y=0;y<H;y+=500){scrollTo(0,y);await new Promise(r=>setTimeout(r,140))}scrollTo(0,0)})()");
    await page.waitForTimeout(1500);
    const measured = (await page.evaluate(MEASURE)) as Record<string, unknown>;
    const full = await page.screenshot({ type: "jpeg", quality: 70, fullPage: true, timeout: 60000 });
    const meta = await sharp(full).metadata();
    const H = Math.min(meta.height ?? 900, 9000);
    const images: ReferenceCapture["images"] = [];
    // desktop: first screen sharp, then the rest of the page in tall slices
    images.push({ data: (await sharp(full).extract({ left: 0, top: 0, width: meta.width!, height: Math.min(900, H) }).resize({ width: 1200 }).jpeg({ quality: 72 }).toBuffer()).toString("base64"), mediaType: "image/jpeg", label: "desktop, first screen" });
    for (let top = 900, i = 2; top < H && images.length < 5; top += 2700, i++) {
      const h = Math.min(2700, H - top);
      if (h < 200) break;
      images.push({ data: (await sharp(full).extract({ left: 0, top, width: meta.width!, height: h }).resize({ width: 800 }).jpeg({ quality: 65 }).toBuffer()).toString("base64"), mediaType: "image/jpeg", label: `desktop, further down (from ${top}px)` });
    }
    const phone = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    const mp = await phone.newPage();
    await guardBrowserPage(mp);
    let mobileLinks = "";
    try {
      await mp.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
      await mp.waitForTimeout(3500);
      await mp.keyboard.press("Escape").catch(() => {});
      const shot = await mp.screenshot({ type: "jpeg", quality: 70, clip: { x: 0, y: 0, width: 390, height: 1600 }, fullPage: true });
      images.push({ data: shot.toString("base64"), mediaType: "image/jpeg", label: "phone, first two screens" });
      mobileLinks = String(await mp.evaluate("(()=>{const h=document.querySelector('header');return h?'header '+Math.round(h.getBoundingClientRect().height)+'px, items: '+[...h.querySelectorAll('a,button')].filter(e=>e.getBoundingClientRect().width>0).map(e=>(e.getAttribute('aria-label')||e.textContent||'').trim().slice(0,20)).filter(Boolean).slice(0,8).join(' / '):''})()"));
    } catch {
      /* the desktop capture is enough */
    }
    return { url, images, spec: specText(url, measured, mobileLinks) };
  } catch {
    return null;
  } finally {
    await browser.close().catch(() => {});
  }
}
