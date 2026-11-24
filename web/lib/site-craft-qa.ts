/**
 * Automatic QA for a site-craft store — the step the designer never had.
 *
 * Claude Code builds a store, LOOKS at it, and fixes what is wrong. The Orbit builder wrote HTML
 * blind, so the same mistakes shipped every time: nav links the colour of the header, product names
 * white on a white card, a hero whose button sits below the fold, a 1,400px stock photo, a heading
 * hidden under the next section. This module opens the finished store in a real browser, MEASURES
 * those things, and writes the CSS that fixes them — no AI, no cost. What it can't fix on its own
 * is returned as a plain-language issue list for one cheap text-only repair call.
 */
import type { Page } from "playwright";
import { guardBrowserPage } from "@/lib/safe-fetch";
import { renderPageDocument, type OrbitDesignDoc, type StorefrontProduct } from "@/lib/orbit-design";

export interface QaIssue {
  kind: "contrast" | "no-mobile-nav" | "hero-fit" | "tall-image" | "overlap" | "overflow" | "broken-image" | "big-card";
  page: string;
  viewport: "desktop" | "mobile";
  detail: string;
  /** true when this module already wrote CSS for it */
  fixed: boolean;
}

export interface QaResult {
  /** CSS to append to the store stylesheet */
  css: string;
  issues: QaIssue[];
}

interface Viewport {
  name: "desktop" | "mobile";
  width: number;
  height: number;
}
const DESKTOP: Viewport = { name: "desktop", width: 1440, height: 900 };
const WIDE: Viewport = { name: "desktop", width: 1920, height: 960 }; // a typical big laptop/monitor with browser chrome
const MOBILE: Viewport = { name: "mobile", width: 390, height: 844 };

interface Measure {
  rules: string[];
  issues: { kind: QaIssue["kind"]; detail: string; fixed: boolean }[];
}

/** Everything is measured inside the page. Returns CSS rules (already scoped to the viewport) + issues. */
async function measure(page: Page, vp: Viewport, isHome: boolean): Promise<Measure> {
  // esbuild/tsx keep-names wrap every inner function in __name(), which doesn't exist in the page.
  await page.evaluate("window.__name = window.__name || function (f) { return f; }");
  return page.evaluate(
    ({ vp, isHome }) => {
      const rules: string[] = [];
      const issues: { kind: string; detail: string; fixed: boolean }[] = [];
      type C = { r: number; g: number; b: number; a: number };

      const parse = (s: string): C | null => {
        const m = s.match(/[\d.]+/g);
        if (!m || m.length < 3) return null;
        const n = m.map(Number);
        return { r: n[0], g: n[1], b: n[2], a: n.length > 3 ? n[3] : 1 };
      };
      const lin = (v: number) => {
        v /= 255;
        return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
      };
      const lum = (c: C) => 0.2126 * lin(c.r) + 0.7152 * lin(c.g) + 0.0722 * lin(c.b);
      const ratio = (a: C, b: C) => {
        const x = lum(a);
        const y = lum(b);
        return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
      };
      const over = (top: C, bottom: C): C => ({
        r: top.r * top.a + bottom.r * (1 - top.a),
        g: top.g * top.a + bottom.g * (1 - top.a),
        b: top.b * top.a + bottom.b * (1 - top.a),
        a: 1,
      });
      /** the colour actually behind an element, or null when a photo/gradient sits there (can't judge) */
      const bgOf = (el: Element): C | null => {
        const stack: C[] = [];
        let e: Element | null = el;
        while (e && e.nodeType === 1) {
          const cs = getComputedStyle(e);
          if (cs.backgroundImage && cs.backgroundImage !== "none") return null;
          const c = parse(cs.backgroundColor);
          if (c && c.a > 0) {
            stack.push(c);
            if (c.a >= 1) break;
          }
          e = e.parentElement;
        }
        let base: C = { r: 255, g: 255, b: 255, a: 1 };
        for (let i = stack.length - 1; i >= 0; i--) base = over(stack[i], base);
        return base;
      };

      const esc = (s: string) => (window.CSS && CSS.escape ? CSS.escape(s) : s.replace(/[^\w-]/g, "\\$&"));
      const classes = (e: Element) => [...e.classList].filter((c) => !/^(od-|data-)/.test(c)).slice(0, 2);
      const self = (e: Element) => e.tagName.toLowerCase() + classes(e).map((c) => "." + esc(c)).join("");
      // Most specific first (nearest ancestor + the element): the stylesheet is shared by every page, so a
      // rule must only hit the context that failed — `span.sc-num` alone can be right on cream and wrong on dark.
      const candidates = (e: Element): string[] => {
        const out: string[] = [];
        let p = e.parentElement;
        let d = 0;
        while (p && p !== document.body && d < 3) {
          out.push(self(p) + " " + self(e));
          p = p.parentElement;
          d++;
        }
        out.push(self(e));
        return out;
      };
      /** exact address of one element: climbs (with nth-child at every level) until it is unique on the page */
      const pathSel = (e: Element): string => {
        const parts: string[] = [];
        let cur: Element | null = e;
        for (let d = 0; cur && cur !== document.body && d < 14; d++) {
          const par: Element | null = cur.parentElement;
          if (!par) break;
          const idx = Array.from(par.children).indexOf(cur) + 1;
          parts.unshift((d === 0 ? cur.tagName.toLowerCase() : self(cur)) + ":nth-child(" + idx + ")");
          const sel = parts.join(" > ");
          try {
            if (d >= 1 && document.querySelectorAll(sel).length === 1) return sel;
          } catch {
            /* keep climbing */
          }
          cur = par;
        }
        return parts.join(" > ");
      };
      const wrap = (css: string) => (vp.name === "mobile" ? `@media (max-width:700px){${css}}` : `@media (min-width:701px){${css}}`);

      // ---- 1. text contrast ------------------------------------------------------------------
      type Fail = { el: Element; bg: C; ratio: number };
      const fails: Fail[] = [];
      const skip = /^(SCRIPT|STYLE|SVG|PATH|NOSCRIPT|OPTION|INPUT|TEXTAREA|SELECT)$/i;
      for (const el of Array.from(document.body.querySelectorAll("*"))) {
        if (skip.test(el.tagName) || el.closest("svg")) continue;
        if (![...el.childNodes].some((n) => n.nodeType === 3 && (n.textContent || "").trim().length > 1)) continue;
        const r = el.getBoundingClientRect();
        if (r.width < 4 || r.height < 4) continue;
        const cs = getComputedStyle(el);
        if (cs.visibility === "hidden" || cs.display === "none" || Number(cs.opacity) < 0.5) continue;
        const fg = parse(cs.color);
        const bg = bgOf(el);
        if (!fg || !bg) continue;
        const size = parseFloat(cs.fontSize);
        const bold = Number(cs.fontWeight) >= 700;
        const need = size >= 24 || (size >= 18.66 && bold) ? 3 : 4.5;
        const ratioNow = ratio(over(fg, bg), bg);
        if (ratioNow < need) fails.push({ el, bg, ratio: ratioNow });
      }
      const failSet = new Set(fails.map((f) => f.el));
      const handled = new Set<Element>();
      const colourRules = new Map<string, string>();
      for (const f of fails) {
        if (handled.has(f.el)) continue;
        let chosen: string | null = null;
        for (const cand of candidates(f.el)) {
          let matches: Element[] = [];
          try {
            matches = [...document.querySelectorAll(cand)];
          } catch {
            continue;
          }
          if (matches.length && matches.every((m) => failSet.has(m))) {
            chosen = cand;
            matches.forEach((m) => handled.add(m));
            // pick the ink that is best on the WORST background in this group
            const bgs = matches.map((m) => fails.find((x) => x.el === m)!.bg);
            const dark: C = { r: 17, g: 17, b: 17, a: 1 };
            const light: C = { r: 255, g: 255, b: 255, a: 1 };
            const worst = (ink: C) => Math.min(...bgs.map((b) => ratio(ink, b)));
            colourRules.set(cand, worst(dark) >= worst(light) ? "#111111" : "#ffffff");
            break;
          }
        }
        if (!chosen) {
          // no class-based selector isolates it (platform-made links, shared widgets): address it exactly
          const ps = pathSel(f.el);
          let ok = false;
          try {
            const hit = document.querySelectorAll(ps);
            ok = hit.length === 1 && hit[0] === f.el;
          } catch {
            ok = false;
          }
          if (ok) {
            const dark: C = { r: 17, g: 17, b: 17, a: 1 };
            const light: C = { r: 255, g: 255, b: 255, a: 1 };
            colourRules.set(ps, ratio(dark, f.bg) >= ratio(light, f.bg) ? "#111111" : "#ffffff");
            handled.add(f.el);
          } else {
            issues.push({
              kind: "contrast",
              detail: `text "${(f.el.textContent || "").trim().slice(0, 40)}" in <${self(f.el)}> has contrast ${f.ratio.toFixed(1)}:1 (needs 4.5)`,
              fixed: false,
            });
          }
        }
      }
      for (const [sel, colour] of colourRules) rules.push(`${sel}{color:${colour}!important}`);
      if (colourRules.size)
        issues.push({
          kind: "contrast",
          detail: `${fails.length} unreadable text element(s) recoloured: ${[...colourRules.keys()].slice(0, 6).join(", ")}`,
          fixed: true,
        });

      // ---- 2. oversize images (outside the first screen) -------------------------------------
      const tall: string[] = [];
      for (const img of Array.from(document.querySelectorAll("img,[data-od-imgslot]"))) {
        const r = img.getBoundingClientRect();
        const top = r.top + window.scrollY;
        if (r.height > vp.height * 0.85 && top > vp.height * 0.6) {
          const sel = candidates(img).find((c) => {
            try {
              return document.querySelectorAll(c).length >= 1;
            } catch {
              return false;
            }
          });
          if (sel && !tall.includes(sel)) tall.push(sel);
        }
      }
      for (const sel of tall) rules.push(`${sel}{max-height:min(78svh,720px)!important;width:100%!important;object-fit:cover!important}`);
      if (tall.length) issues.push({ kind: "tall-image", detail: `image(s) taller than the screen capped: ${tall.slice(0, 4).join(", ")}`, fixed: true });

      // ---- 3. product cards bigger than the screen allows -----------------------------------
      const bigCards = [...document.querySelectorAll("[data-od-product],article")].filter((c) => c.getBoundingClientRect().height > vp.height * 0.95 && c.querySelector("img,[data-od-imgslot]"));
      if (bigCards.length)
        issues.push({
          kind: "big-card",
          detail: `product cards are ${Math.round(bigCards[0].getBoundingClientRect().height)}px tall on a ${vp.height}px screen (${self(bigCards[0])}) — use more columns / a shorter image ratio`,
          fixed: false,
        });

      // ---- 4. text hidden under something (ask the browser who is on top at the text's own point) ----
      const padFix = new Map<string, number>();
      const coverBy = new Map<string, { count: number; sample: string; fixedPos: boolean; big: boolean }>();
      /** text that sits in a collapsed / clipped container (closed accordion, off-canvas panel) isn't "covered" */
      const clippedAway = (t: Element): boolean => {
        const r = t.getBoundingClientRect();
        for (let p = t.parentElement; p && p !== document.body; p = p.parentElement) {
          const cs = getComputedStyle(p);
          if (cs.display === "none" || cs.visibility === "hidden") return true;
          if (cs.overflow !== "visible" || cs.overflowY !== "visible" || cs.clipPath !== "none") {
            const pr = p.getBoundingClientRect();
            if (pr.height < 2 || r.bottom <= pr.top + 1 || r.top >= pr.bottom - 1 || r.right <= pr.left + 1 || r.left >= pr.right - 1) return true;
          }
        }
        return false;
      };
      const heads = Array.from(document.body.querySelectorAll("h1,h2,h3,h4,p,a,button,li,span,label")).filter((t) => {
        if (![...t.childNodes].some((n) => n.nodeType === 3 && (n.textContent || "").trim().length > 1)) return false;
        const r = t.getBoundingClientRect();
        return r.width > 20 && r.height > 12 && getComputedStyle(t).visibility !== "hidden" && !t.closest("[aria-hidden='true']") && !t.closest("[data-od-marquee]") && !clippedAway(t);
      });
      const step = Math.max(1, Math.ceil(heads.length / 140));
      for (let i = 0; i < heads.length; i += step) {
        const t = heads[i] as HTMLElement;
        t.scrollIntoView({ block: "center" });
        const r = t.getBoundingClientRect();
        if (r.top < 0 || r.bottom > window.innerHeight) continue;
        const pts = [
          [r.left + Math.min(r.width / 2, 40), r.top + 3],
          [r.left + r.width / 2, r.top + r.height / 2],
          [r.right - 6, r.top + r.height / 2],
        ];
        for (const [x, y] of pts) {
          const top = document.elementFromPoint(x, y);
          if (!top || top === t || t.contains(top) || top.contains(t)) continue;
          if (getComputedStyle(top).pointerEvents === "none") continue;
          const coverSec = top.closest("section");
          const ownSec = t.closest("section") as HTMLElement | null;
          if (ownSec && coverSec && ownSec !== coverSec) {
            const need = Math.ceil(coverSec.getBoundingClientRect().bottom - r.top + 16);
            const sel = candidates(ownSec).find((c) => {
              try {
                return document.querySelectorAll(c).length === 1;
              } catch {
                return false;
              }
            });
            if (sel && need > 0 && need < 400) {
              const base = parseFloat(getComputedStyle(ownSec).paddingTop) || 0;
              padFix.set(sel, Math.max(padFix.get(sel) ?? 0, Math.round(base + need)));
              break;
            }
          }
          const key = self(top);
          const prev = coverBy.get(key);
          let fixedPos = false;
          for (let q: Element | null = top; q && q !== document.body; q = q.parentElement) if (getComputedStyle(q).position === "fixed") fixedPos = true;
          coverBy.set(key, { count: (prev?.count ?? 0) + 1, sample: prev?.sample ?? (t.textContent || "").trim().slice(0, 30), fixedPos: prev?.fixedPos || fixedPos, big: prev?.big || parseFloat(getComputedStyle(t).fontSize) >= 28 });
          break;
        }
      }
      window.scrollTo(0, 0);
      for (const [sel, pad] of padFix) rules.push(`${sel}{padding-top:${pad}px!important}`);
      if (padFix.size) issues.push({ kind: "overlap", detail: `text was hidden under the section above — pushed down: ${[...padFix.keys()].slice(0, 4).join(", ")}`, fixed: true });
      for (const [key, v] of coverBy) {
        if (v.fixedPos && v.count >= 3)
          issues.push({
            kind: "overlap",
            detail: `a fixed overlay <${key}> sits on top of the page at load and hides ${v.count}+ text elements (e.g. "${v.sample}") — it must be CLOSED until the visitor opens it. Its closed state (transform/visibility/opacity) is being overridden: look for a ':checked ~ ${key}' rule whose checkbox shares a class with other checkboxes, or a checkbox that is checked by default. Every toggle input needs its own unique class and id and must start unchecked`,
            fixed: false,
          });
        else if (v.count >= 4 || v.big) issues.push({ kind: "overlap", detail: `text "${v.sample}" (${v.count} element(s)) is covered by <${key}>`, fixed: false });
      }
      const dupIds = new Map<string, number>();
      document.querySelectorAll("[id]").forEach((e) => dupIds.set(e.id, (dupIds.get(e.id) ?? 0) + 1));
      const dups = [...dupIds].filter(([, n]) => n > 1).map(([id]) => id);
      if (dups.length) issues.push({ kind: "overlap", detail: `duplicate element ids (${dups.slice(0, 4).join(", ")}) — CSS-only toggles and <label for> break when an id repeats; every id must be unique on the page`, fixed: false });

      // ---- 5. sideways overflow --------------------------------------------------------------
      if (document.documentElement.scrollWidth - window.innerWidth > 1) {
        rules.push("html,body{overflow-x:clip!important}");
        issues.push({ kind: "overflow", detail: "the page scrolled sideways — clipped", fixed: true });
      }

      // ---- 6. broken images ------------------------------------------------------------------
      const broken = [...document.querySelectorAll("img")].filter((i) => (i as HTMLImageElement).complete && (i as HTMLImageElement).naturalWidth === 0);
      if (broken.length) issues.push({ kind: "broken-image", detail: `${broken.length} image(s) failed to load`, fixed: false });

      // ---- 6b. can a phone visitor reach the other pages? (home, phone only) -----------------
      if (isHome && vp.name === "mobile") {
        const header = document.querySelector("header");
        if (header) {
          const shown = (e: Element) => {
            const r = e.getBoundingClientRect();
            const cs = getComputedStyle(e);
            return r.width > 6 && r.height > 6 && cs.visibility !== "hidden" && cs.display !== "none";
          };
          const hrefs = new Set([...header.querySelectorAll("a[href]")].filter((a) => shown(a) && (a.textContent || "").trim().length > 1).map((a) => a.getAttribute("href")));
          const burger = [...header.querySelectorAll("button,label,summary,[role=button]")].some((b) => shown(b) && /menu|nav|burger|toggle/i.test(`${b.getAttribute("aria-label") ?? ""} ${b.className} ${b.textContent ?? ""}`));
          if (hrefs.size < 3 && !burger)
            issues.push({ kind: "no-mobile-nav", detail: "the header has no way to reach the other pages on a phone (no visible links and no menu button)", fixed: false });
        }
      }

      // ---- 7. does the hero fit the first screen? (home only) --------------------------------
      if (isHome) {
        const h1 = document.querySelector("h1") as HTMLElement | null;
        const hero = (h1 && (h1.closest("section") as HTMLElement | null)) || null;
        if (h1 && hero) {
          const cta = [...hero.querySelectorAll("a,button")].find((x) => {
            const t = (x.textContent || "").trim();
            return t.length > 1 && x.getBoundingClientRect().top >= h1.getBoundingClientRect().top && !x.closest("header");
          }) as HTMLElement | undefined;
          const fits = () => {
            if (!cta) return hero.getBoundingClientRect().bottom <= vp.height * 1.1;
            const r = cta.getBoundingClientRect();
            return r.top + r.height * 0.7 <= vp.height - 6; // at least ~70% of the button is on the first screen
          };
          if (!fits()) {
            const startFont = parseFloat(getComputedStyle(h1).fontSize);
            const cs = getComputedStyle(hero);
            let font = startFont;
            let pt = parseFloat(cs.paddingTop);
            let pb = parseFloat(cs.paddingBottom);
            const startBtm = cta ? Math.round(cta.getBoundingClientRect().bottom) : Math.round(hero.getBoundingClientRect().bottom);
            for (let i = 0; i < 9 && !fits() && font > 26; i++) {
              font *= 0.92;
              pt = Math.max(16, pt * 0.88);
              pb = Math.max(16, pb * 0.88);
              h1.style.fontSize = font + "px";
              hero.style.paddingTop = pt + "px";
              hero.style.paddingBottom = pb + "px";
            }
            const ok = fits();
            const uniq = (e: Element) => candidates(e).find((c) => { try { return document.querySelectorAll(c).length === 1; } catch { return false; } });
            const hs = uniq(h1);
            const ss = uniq(hero);
            if (ok && hs && ss) {
              rules.push(
                wrap(
                  `${hs}{font-size:min(${font.toFixed(1)}px,${((font / vp.height) * 100).toFixed(2)}svh)!important}${ss}{padding-top:${pt.toFixed(0)}px!important;padding-bottom:${pb.toFixed(0)}px!important}`,
                ),
              );
              issues.push({ kind: "hero-fit", detail: `hero button sat at ${startBtm}px on a ${vp.height}px screen — headline and padding scaled down to fit`, fixed: true });
            } else {
              issues.push({ kind: "hero-fit", detail: `hero does not fit the first screen: its main button is at ${startBtm}px but the screen is ${vp.height}px tall (headline ${Math.round(startFont)}px)`, fixed: false });
            }
          }
        }
      }

      // viewport-scope the rules written so far for mobile-only findings (contrast etc. are global)
      return { rules, issues } as { rules: string[]; issues: { kind: QaIssue["kind"]; detail: string; fixed: boolean }[] };
    },
    { vp, isHome },
  );
}

const REVEAL_OFF =
  "[data-od-reveal],[data-od-reveal-stagger]>*{opacity:1!important;transform:none!important;transition:none!important}[data-od-parallax]{transform:none!important}*{animation-play-state:paused!important}";

/** Measure one standalone HTML document at one viewport. Exported for tests. */
export async function qaHtml(html: string, vp: Viewport, isHome: boolean, page: Page): Promise<Measure> {
  await page.setViewportSize({ width: vp.width, height: vp.height });
  await page.setContent(html, { waitUntil: "load", timeout: 20000 }).catch(() => {});
  await page.addStyleTag({ content: REVEAL_OFF });
  await page.waitForTimeout(1200);
  return measure(page, vp, isHome);
}

const PAGES: { slug: string; vps: Viewport[] }[] = [
  { slug: "home", vps: [DESKTOP, WIDE, MOBILE] },
  { slug: "shop", vps: [DESKTOP, MOBILE] },
  { slug: "about", vps: [DESKTOP] },
  { slug: "contact", vps: [DESKTOP] },
  { slug: "faq", vps: [DESKTOP] },
];

/** Run the whole QA over a store. Never throws — returns an empty result when no browser is available. */
export async function runStoreQa(doc: OrbitDesignDoc, products: StorefrontProduct[], businessId: string): Promise<QaResult> {
  const rules = new Set<string>();
  const colours = new Map<string, string>();
  const issues: QaIssue[] = [];
  let browser: import("playwright").Browser | null = null;
  try {
    const { chromium } = await import("playwright");
    browser = await chromium.launch({ args: ["--disable-blink-features=AutomationControlled"] });
    const slugs = new Set(doc.pages.map((p) => p.slug));
    for (const pg of PAGES) {
      if (!slugs.has(pg.slug)) continue;
      const html = renderPageDocument(doc, { products, businessId, pageSlug: pg.slug });
      for (const vp of pg.vps) {
        const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height }, deviceScaleFactor: 1 });
        const page = await ctx.newPage();
        await guardBrowserPage(page).catch(() => {});
        try {
          const m = await qaHtml(html, vp, pg.slug === "home", page);
          // contrast / image / overlap rules apply at every size; hero rules were already media-scoped
          for (const r of m.rules) {
            const c = /^(.*)\{color:(#[0-9a-f]{6})!important\}$/.exec(r);
            if (c) {
              const known = colours.get(c[1]);
              if (known && known !== c[2]) {
                issues.push({ kind: "contrast", page: pg.slug, viewport: vp.name, detail: `"${c[1]}" needs different text colours on different pages — scope it to its section`, fixed: false });
                continue;
              }
              colours.set(c[1], c[2]);
            }
            rules.add(r);
          }
          m.issues.forEach((i) => issues.push({ ...i, page: pg.slug, viewport: vp.name }));
        } catch (e) {
          console.warn(`[site-craft-qa] ${pg.slug}/${vp.name} skipped`, String(e).slice(0, 120));
        } finally {
          await ctx.close().catch(() => {});
        }
      }
    }
  } catch (e) {
    console.warn("[site-craft-qa] no browser — skipped", String(e).slice(0, 120));
  } finally {
    await browser?.close().catch(() => {});
  }
  return { css: [...rules].join("\n"), issues };
}

/** Plain-language list of what is still wrong, for the repair call. */
export function remainingIssues(issues: QaIssue[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const i of issues) {
    if (i.fixed) continue;
    const line = `[${i.page} · ${i.viewport}] ${i.kind}: ${i.detail}`;
    if (!seen.has(line)) {
      seen.add(line);
      out.push(line);
    }
  }
  return out.slice(0, 14);
}
