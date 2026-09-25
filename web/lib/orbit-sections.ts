/**
 * Orbit section library — a curated set of production-quality, token-driven section components.
 *
 * The generator no longer writes raw section HTML. Instead it picks a `kind`, a `variant`, and
 * fills simple `props` (copy, items). Every component here was composed once by hand to be
 * balanced, dense, responsive and accessible — so the output can't come back sparse or broken.
 *
 * Variety comes from: which sections, in what order, which variant, the palette/fonts, and the
 * copy. A bakery and a plant shop built from this kit look genuinely different, and both look done.
 *
 * All markup uses the `.od-*` design-kit classes + `var(--od-*)` tokens defined in orbit-design.ts,
 * so the Adjust knobs and Tweaks retune everything.
 */

export interface OrbitBlock {
  kind: OrbitKind;
  variant: string;
  props: Record<string, unknown>;
}

export type OrbitKind =
  | "hero"
  | "feature"
  | "stat"
  | "story"
  | "steps"
  | "testimonial"
  | "logos"
  | "faq"
  | "cta"
  | "gallery"
  | "values"
  | "collections"
  | "trust"
  | "pricing"
  | "compare"
  | "editorial"
  | "product-grid"
  | "contact"
  | "slot";

export interface RenderCtx {
  preview: boolean;
  /** `#page:home` in authored markup; the renderer's rewriteLinks turns it into the real href. */
  shopHref: string;
  /** the seller's Content-panel values, so contact/footer stay in sync. */
  content?: { email?: string; phone?: string; address?: string };
}

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

const esc = (v: unknown): string =>
  String(v ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

const attr = (v: unknown): string => esc(v).replace(/'/g, "&#39;");

function arr<T = Record<string, unknown>>(v: unknown): T[] {
  return Array.isArray(v) ? (v as T[]) : [];
}

/** First present value among keys — the model drifts on prop names ({q|question}, {a|answer}, …). */
function pick(o: unknown, ...keys: string[]): string {
  if (!o || typeof o !== "object") return "";
  for (const k of keys) {
    const v = (o as Record<string, unknown>)[k];
    if (v != null && v !== "") return String(v);
  }
  return "";
}

/** A styled image placeholder marker the renderer swaps for the real `imgSlot`. */
function img(brief: string, sizing: string): string {
  return `<div data-img-slot="${attr(brief || "photo")}" style="${sizing}"></div>`;
}
/** A background image slot — no visible caption (something is layered on top of it). */
function bgImg(brief: string, sizing: string): string {
  return `<div data-img-slot="${attr(brief || "photo")}" data-img-bg style="${sizing}"></div>`;
}

function icon(path: string): string {
  return `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">${path}</svg>`;
}
const ICONS = [
  '<circle cx="12" cy="12" r="9"/><path d="M12 7v10M7 12h10"/>',
  '<path d="M20 6 9 17l-5-5"/>',
  '<path d="M12 2 2 7l10 5 10-5-10-5ZM2 17l10 5 10-5M2 12l10 5 10-5"/>',
  '<circle cx="12" cy="12" r="9"/><path d="m9 12 2 2 4-4"/>',
  '<path d="M3 12h18M12 3v18"/>',
  '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z"/>',
  '<path d="M4 4h16v16H4zM4 9h16M9 20V9"/>',
  '<circle cx="12" cy="12" r="4"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3"/>',
];

function eyebrow(text: unknown): string {
  return text ? `<p class="od-eyebrow">${esc(text)}</p>` : "";
}

/** heading + optional lead, left-aligned by default */
function head(props: Record<string, unknown>, opts: { center?: boolean; h1?: boolean } = {}): string {
  const tag = opts.h1 ? "od-h1" : "od-h2";
  const al = opts.center ? "text-align:center;margin-inline:auto;" : "";
  const heading = pick(props, "heading", "title");
  const bodyRaw = pick(props, "body", "lead", "subheading", "intro");
  // The model sometimes copies the heading into body (or subheading) — don't print it twice.
  const norm = (s: string) => s.replace(/\s+/g, " ").trim().toLowerCase();
  const body = bodyRaw && norm(bodyRaw) !== norm(heading) ? bodyRaw : "";
  return `<div style="max-width:${opts.center ? "42rem" : "38rem"};${al}">
    ${eyebrow(props.eyebrow)}
    ${heading ? `<h${opts.h1 ? 1 : 2} class="${tag}">${esc(heading)}</h${opts.h1 ? 1 : 2}>` : ""}
    ${body ? `<p class="od-lead"${opts.center ? ' style="margin-inline:auto"' : ""}>${esc(body)}</p>` : ""}
  </div>`;
}

function ctaRow(props: Record<string, unknown>, ctx: RenderCtx, opts: { fallback?: string } = {}): string {
  // The model drifts wildly on CTA prop shape: {cta:{label,href}}, {cta1Text,cta1Link}, {ctaText,ctaLink},
  // {ctaLabel}, a bare string. Normalise all of them.
  const obj = (v: unknown) => (v && typeof v === "object" ? (v as { label?: string; text?: string; href?: string; link?: string; url?: string }) : {});
  const c1 = obj(props.cta);
  const c2 = obj(props.cta2);
  const pLabel = c1.label || c1.text || pick(props, "cta1Text", "ctaText", "ctaLabel", "primaryCta") || (typeof props.cta === "string" ? props.cta : "") || opts.fallback || "";
  const pHref = c1.href || c1.link || c1.url || pick(props, "cta1Link", "ctaLink", "ctaHref");
  const sLabel = c2.label || c2.text || pick(props, "cta2Text", "secondaryCta");
  const sHref = c2.href || c2.link || c2.url || pick(props, "cta2Link");
  if (!pLabel && !sLabel) return "";
  const href = (h?: string) => attr(h || ctx.shopHref);
  return `<div style="display:flex;flex-wrap:wrap;gap:var(--od-s3);margin-top:var(--od-s6)">
    ${pLabel ? `<a href="${href(pHref)}" class="od-btn od-btn-primary">${esc(pLabel)}</a>` : ""}
    ${sLabel ? `<a href="${href(sHref)}" class="od-btn od-btn-ghost">${esc(sLabel)}</a>` : ""}
  </div>`;
}

const band = (i: number) => (i % 2 === 1 ? ' style="background:var(--od-surface)"' : "");

// ---------------------------------------------------------------------------
// HERO
// ---------------------------------------------------------------------------

const hero = {
  /** oversized headline hard-left in a 12-col grid, compact support column lower-right */
  editorial(p: Record<string, unknown>, ctx: RenderCtx): string {
    const hasFig = !!p.figure;
    return `<section class="od-section od-section--hero"><div class="od-container" style="display:grid;grid-template-columns:repeat(12,1fr);gap:var(--od-s6) var(--od-s5);align-items:end">
      <div style="grid-column:1/-1;min-width:0">
        ${eyebrow(p.eyebrow)}
        <h1 class="od-h1" style="font-size:var(--od-text-5xl);line-height:1.02;letter-spacing:-.02em;max-width:16ch;overflow-wrap:break-word">${esc(p.heading)}</h1>
      </div>
      <div style="grid-column:1/span ${hasFig ? "7" : "12"};min-width:0"><p class="od-lead" style="max-width:${hasFig ? "38ch" : "54ch"};margin:0">${esc(p.body)}</p>${ctaRow(p, ctx, { fallback: "Shop the collection" })}</div>
      ${hasFig ? `<div style="grid-column:8/-1;min-width:0">${img(String(p.figure), "width:100%;aspect-ratio:4/3;border-radius:var(--od-radius-lg)")}</div>` : ""}
    </div></section>`;
  },
  /** one monumental centred statement, generous air, single CTA — for quiet/luxury concepts */
  centered(p: Record<string, unknown>, ctx: RenderCtx): string {
    return `<section class="od-section od-section--hero" style="text-align:center"><div class="od-container-narrow">
      ${eyebrow(p.eyebrow)}
      <h1 class="od-h1" style="font-size:var(--od-text-5xl);max-width:20ch;margin-inline:auto">${esc(p.heading)}</h1>
      ${p.body ? `<p class="od-lead" style="margin:var(--od-s5) auto 0;max-width:52ch">${esc(p.body)}</p>` : ""}
      <div style="display:flex;justify-content:center;margin-top:var(--od-s7)">${ctaRow({ ...p }, ctx, { fallback: "Shop the collection" }).replace('margin-top:var(--od-s6)"', 'margin-top:0"')}</div>
    </div></section>`;
  },
  /** classic split: copy left, product visual right — the reliable workhorse, tuned to feel full */
  showcase(p: Record<string, unknown>, ctx: RenderCtx): string {
    return `<section class="od-section od-section--hero"><div class="od-container" style="display:grid;grid-template-columns:1.05fr .95fr;gap:var(--od-s8);align-items:center">
      <div>${eyebrow(p.eyebrow)}<h1 class="od-h1">${esc(p.heading)}</h1>
        ${p.body ? `<p class="od-lead">${esc(p.body)}</p>` : ""}${ctaRow(p, ctx, { fallback: "Shop the collection" })}
        ${arr(p.stats).length ? `<div style="display:flex;gap:var(--od-s7);margin-top:var(--od-s7);flex-wrap:wrap">${arr(p.stats).map((s) => ({ value: pick(s, "value", "stat", "number"), label: pick(s, "label", "title", "name") })).filter((s) => s.value).slice(0, 3).map((s) => `<div><div style="font-family:var(--od-font-heading);font-weight:var(--od-heading-weight);font-size:var(--od-text-2xl);color:var(--od-text)">${esc(s.value)}</div><div style="font-size:var(--od-text-sm);color:var(--od-muted);margin-top:2px">${esc(s.label)}</div></div>`).join("")}</div>` : ""}
      </div>
      <div>${img(String(p.figure || `${p.heading} hero image`), "width:100%;aspect-ratio:4/3;max-height:460px;border-radius:var(--od-radius-lg);box-shadow:var(--od-shadow-lg)")}</div>
    </div></section>`;
  },
  /** big visual LEFT, copy right — mirror of showcase, for variety */
  media(p: Record<string, unknown>, ctx: RenderCtx): string {
    return `<section class="od-section od-section--hero"><div class="od-container" style="display:grid;grid-template-columns:.95fr 1.05fr;gap:var(--od-s8);align-items:center">
      <div>${img(String(p.figure || `${p.heading} hero image`), "width:100%;aspect-ratio:4/3;max-height:460px;border-radius:var(--od-radius-lg);box-shadow:var(--od-shadow-lg)")}</div>
      <div>${eyebrow(p.eyebrow)}<h1 class="od-h1">${esc(p.heading)}</h1>
        ${p.body ? `<p class="od-lead">${esc(p.body)}</p>` : ""}${ctaRow(p, ctx, { fallback: "Shop the collection" })}</div>
    </div></section>`;
  },
  /** full-bleed image with the headline + CTA over a dark scrim, bottom-left. Text is always white
   *  here (it sits on a dark gradient, not on the accent) — accentText would be wrong. */
  overlay(p: Record<string, unknown>, ctx: RenderCtx): string {
    return `<section class="od-section" style="padding:0"><div class="od-bleed" style="position:relative;min-height:76vh;display:flex;align-items:flex-end;color:#fff">
      ${bgImg(String(p.figure || `${p.heading} full-bleed hero`), "position:absolute;inset:0;width:100%;height:100%;border-radius:0")}
      <div style="position:absolute;inset:0;background:linear-gradient(to top, rgba(0,0,0,.72), rgba(0,0,0,.28) 55%, rgba(0,0,0,.12))"></div>
      <div class="od-container" style="position:relative;padding:var(--od-s9) var(--od-gutter)">
        ${p.eyebrow ? `<p class="od-eyebrow" style="color:var(--od-accent)">${esc(p.eyebrow)}</p>` : ""}
        <h1 class="od-h1" style="color:#fff;max-width:16ch">${esc(p.heading)}</h1>
        ${p.body ? `<p class="od-lead" style="color:rgba(255,255,255,.88);max-width:44ch">${esc(p.body)}</p>` : ""}
        ${ctaRow(p, ctx)}
      </div>
    </div></section>`;
  },
};

// ---------------------------------------------------------------------------
// FEATURE
// ---------------------------------------------------------------------------

function featureItems(p: Record<string, unknown>) {
  return arr(p.items)
    .map((it) => ({
      title: pick(it, "title", "heading", "name", "label", "q"),
      body: pick(it, "body", "description", "text", "copy", "a"),
      figure: pick(it, "figure", "image", "photo", "img"),
      icon: typeof (it as Record<string, unknown>).icon === "number" ? ((it as Record<string, unknown>).icon as number) : undefined,
    }))
    .filter((it) => it.title || it.body)
    .slice(0, 6);
}

const feature = {
  /** 3–4 up grid, small icon tile, staggered reveal */
  cards(p: Record<string, unknown>, _c: RenderCtx, i: number): string {
    const items = featureItems(p);
    return `<section class="od-section"${band(i)}><div class="od-container">
      ${head(p)}
      <div class="od-grid" style="--od-col-min:240px;margin-top:var(--od-s8)" data-od-reveal-stagger>
        ${items.map((it, k) => `<div>
          <div style="display:inline-flex;align-items:center;justify-content:center;width:44px;height:44px;border-radius:var(--od-radius-md);background:color-mix(in srgb, var(--od-accent) 12%, transparent);color:var(--od-accent)">${icon(ICONS[(it.icon ?? k) % ICONS.length])}</div>
          <h3 class="od-h3" style="margin-top:var(--od-s4)">${esc(it.title)}</h3>
          <p class="od-body" style="color:var(--od-muted);margin-top:var(--od-s2);max-width:36ch">${esc(it.body)}</p>
        </div>`).join("")}
      </div>
    </div></section>`;
  },
  /** alternating image + text rows, big faint numeral per row */
  alternating(p: Record<string, unknown>, _c: RenderCtx, i: number): string {
    const items = featureItems(p).slice(0, 3);
    return `<section class="od-section"${band(i)}><div class="od-container">
      ${head(p)}
      <div style="display:flex;flex-direction:column;gap:var(--od-s6);margin-top:var(--od-s7)">
        ${items.map((it, k) => `<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,300px),1fr));gap:var(--od-s6);align-items:center">
          <div style="order:${k % 2 ? 2 : 1};height:clamp(200px, 24vw, 280px);border-radius:var(--od-radius-lg);overflow:hidden">${bgImg(String(it.figure || it.title), "width:100%;height:100%;border-radius:0")}</div>
          <div style="order:${k % 2 ? 1 : 2}">
            <div style="font-family:var(--od-font-heading);font-weight:var(--od-heading-weight);font-size:var(--od-text-2xl);color:color-mix(in srgb, var(--od-accent) 34%, transparent);line-height:1">${String(k + 1).padStart(2, "0")}</div>
            <h3 class="od-h3" style="margin-top:var(--od-s2)">${esc(it.title)}</h3>
            <p class="od-body" style="color:var(--od-muted);margin-top:var(--od-s3);max-width:52ch">${esc(it.body)}</p>
          </div>
        </div>`).join("")}
      </div>
    </div></section>`;
  },
  /** compact checklist beside a heading — good for "what's included" */
  checklist(p: Record<string, unknown>, _ctx: RenderCtx, i: number): string {
    const items = featureItems(p);
    return `<section class="od-section"${band(i)}><div class="od-container" style="display:grid;grid-template-columns:minmax(0,4fr) minmax(0,6fr);gap:var(--od-s7) var(--od-s9);align-items:start">
      <div style="position:sticky;top:2rem">${head(p)}</div>
      <div style="display:flex;flex-direction:column;gap:var(--od-s5)">
        ${items.map((it, k) => `<div style="display:flex;gap:var(--od-s4);${k ? "border-top:1px solid var(--od-border);padding-top:var(--od-s5)" : ""}">
          <span style="flex-shrink:0;color:var(--od-accent);margin-top:3px">${icon('<path d="M20 6 9 17l-5-5"/>')}</span>
          <div><h3 style="font-family:var(--od-font-heading);font-weight:var(--od-heading-weight);font-size:var(--od-text-lg);color:var(--od-text)">${esc(it.title)}</h3>
          <p class="od-body" style="color:var(--od-muted);margin-top:4px">${esc(it.body)}</p></div>
        </div>`).join("")}
      </div>
    </div></section>`;
  },
};

// ---------------------------------------------------------------------------
// STAT
// ---------------------------------------------------------------------------

const stat = {
  /** inline row of counters on a plain band */
  inline(p: Record<string, unknown>, _c: RenderCtx, i: number): string {
    const items = arr(p.items).map((it) => ({ value: pick(it, "value", "stat", "number", "figure"), label: pick(it, "label", "title", "name", "caption") })).filter((s) => s.value).slice(0, 4);
    return `<section class="od-section-sm"${band(i)}><div class="od-container" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:var(--od-s6);text-align:left">
      ${items.map((s) => statCell(s)).join("")}
    </div></section>`;
  },
  /** full-bleed accent band: one statement + counters, text auto-flips readable */
  band(p: Record<string, unknown>, _c: RenderCtx): string {
    const items = arr(p.items).map((it) => ({ value: pick(it, "value", "stat", "number", "figure"), label: pick(it, "label", "title", "name", "caption") })).filter((s) => s.value).slice(0, 4);
    return `<section class="od-section od-section--invert"><div class="od-container">
      ${p.heading ? `<h2 class="od-h2" style="max-width:24ch">${esc(p.heading)}</h2>` : ""}
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:var(--od-s6);margin-top:${p.heading ? "var(--od-s8)" : "0"}">
        ${items.map((s) => statCell(s, true)).join("")}
      </div>
    </div></section>`;
  },
};
function statCell(s: { value: string; label: string }, invert = false): string {
  const raw = String(s.value).trim();
  // Animate only clean numbers ("1,830", "98%", "12+"). Anything with a letter unit ("10K+", "2.4M")
  // stays static — counting to "10" and slapping "K+" on reads as a bug mid-animation.
  const clean = /^([\d.,]+)(\s*[%+]?)$/.exec(raw);
  const val = clean
    ? `<span data-od-count="${attr(clean[1].replace(/[.,]/g, ""))}">${esc(clean[1])}</span>${esc(clean[2])}`
    : esc(raw);
  return `<div><div style="font-family:var(--od-font-heading);font-weight:var(--od-heading-weight);font-size:var(--od-text-4xl);line-height:1;color:${invert ? "var(--od-accent-text)" : "var(--od-text)"}">${val}</div>
    <div style="font-size:var(--od-text-sm);margin-top:var(--od-s2);color:${invert ? "color-mix(in srgb,var(--od-accent-text) 75%,transparent)" : "var(--od-muted)"}">${esc(s.label)}</div></div>`;
}

// ---------------------------------------------------------------------------
// STORY
// ---------------------------------------------------------------------------

const story = {
  /** heading left, prose right */
  split(p: Record<string, unknown>, ctx: RenderCtx, i: number): string {
    return `<section class="od-section"${band(i)}><div class="od-container" style="display:grid;grid-template-columns:minmax(0,4fr) minmax(0,6fr);gap:var(--od-s7) var(--od-s9);align-items:start">
      <div style="position:sticky;top:2rem">${eyebrow(p.eyebrow)}<h2 class="od-h2" style="max-width:14ch">${esc(p.heading)}</h2>${
        pick(p, "cta1Text", "ctaText") || (p.cta as { label?: string })?.label ? ctaRow(p, ctx) : ""
      }</div>
      <div style="display:flex;flex-direction:column;gap:var(--od-s4)">
        ${bodyParas(p.body).map((t, k) => `<p class="${k === 0 ? "od-lead" : "od-body"}" style="color:var(--od-${k === 0 ? "text" : "muted"})">${esc(t)}</p>`).join("")}
      </div>
    </div></section>`;
  },
  /** image + text, a lift of prominence to the image */
  columns(p: Record<string, unknown>, _c: RenderCtx, i: number): string {
    return `<section class="od-section"${band(i)}><div class="od-container" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,320px),1fr));gap:var(--od-s8);align-items:center">
      <div>${img(String(p.figure || p.heading), "width:100%;aspect-ratio:1/1;border-radius:var(--od-radius-lg)")}</div>
      <div>${eyebrow(p.eyebrow)}<h2 class="od-h2">${esc(p.heading)}</h2>
        ${bodyParas(p.body).map((t) => `<p class="od-body" style="color:var(--od-muted);margin-top:var(--od-s4)">${esc(t)}</p>`).join("")}
      </div>
    </div></section>`;
  },
  /** a large pull-quote framed by a giant mark */
  quote(p: Record<string, unknown>, _c: RenderCtx, i: number): string {
    return `<section class="od-section"${band(i)}><div class="od-container-narrow" style="position:relative">
      <span aria-hidden="true" style="position:absolute;top:-.4em;left:-.1em;font-family:var(--od-font-heading);font-size:var(--od-text-6xl);color:color-mix(in srgb,var(--od-accent) 22%,transparent);line-height:1">&ldquo;</span>
      <blockquote style="font-family:var(--od-font-heading);font-weight:var(--od-heading-weight);font-size:var(--od-text-3xl);line-height:1.25;color:var(--od-text);position:relative;margin:0">${esc(p.heading)}</blockquote>
      ${p.body ? `<p class="od-body" style="color:var(--od-muted);margin-top:var(--od-s5)">— ${esc(p.body)}</p>` : ""}
    </div></section>`;
  },
};
function bodyParas(v: unknown): string[] {
  const t = String(v ?? "").trim();
  if (!t) return [];
  return t.split(/\n\n+|(?<=\.)\s{2,}/).map((s) => s.trim()).filter(Boolean).slice(0, 4);
}

// ---------------------------------------------------------------------------
// STEPS
// ---------------------------------------------------------------------------

const steps = {
  /** numbered rows with big accent numerals, hairline rules */
  rows(p: Record<string, unknown>, _c: RenderCtx, i: number): string {
    const items = featureItems(p).slice(0, 6);
    return `<section class="od-section"${band(i)}><div class="od-container">
      ${head(p)}
      <ol style="list-style:none;margin:var(--od-s8) 0 0;padding:0">
        ${items.map((it, k) => `<li style="display:grid;grid-template-columns:auto 1fr;gap:var(--od-s6);padding:var(--od-s6) 0;border-top:1px solid var(--od-border)">
          <span style="font-family:var(--od-font-heading);font-weight:var(--od-heading-weight);font-size:var(--od-text-4xl);color:var(--od-accent);line-height:1">${String(k + 1).padStart(2, "0")}</span>
          <div><h3 class="od-h3">${esc(it.title)}</h3><p class="od-body" style="color:var(--od-muted);margin-top:var(--od-s2);max-width:52ch">${esc(it.body)}</p></div>
        </li>`).join("")}
      </ol>
    </div></section>`;
  },
  /** horizontal 3–4 up with connectors */
  horizontal(p: Record<string, unknown>, _c: RenderCtx, i: number): string {
    const items = featureItems(p).slice(0, 4);
    return `<section class="od-section"${band(i)}><div class="od-container">
      ${head(p)}
      <div class="od-grid" style="--od-col-min:200px;margin-top:var(--od-s8)">
        ${items.map((it, k) => `<div>
          <div style="display:flex;align-items:center;gap:var(--od-s3);color:var(--od-accent)"><span style="font-family:var(--od-font-heading);font-weight:var(--od-heading-weight);font-size:var(--od-text-xl)">${k + 1}</span><span style="flex:1;height:1px;background:var(--od-border)"></span></div>
          <h3 class="od-h3" style="margin-top:var(--od-s3)">${esc(it.title)}</h3>
          <p class="od-body" style="color:var(--od-muted);margin-top:var(--od-s2)">${esc(it.body)}</p>
        </div>`).join("")}
      </div>
    </div></section>`;
  },
};

// ---------------------------------------------------------------------------
// TESTIMONIAL
// ---------------------------------------------------------------------------

function quotes(p: Record<string, unknown>) {
  return arr(p.items)
    .map((it) => ({ quote: pick(it, "quote", "text", "body", "testimonial"), name: pick(it, "name", "author", "customer", "by"), role: pick(it, "role", "title", "location", "detail") }))
    .filter((q) => q.quote)
    .slice(0, 6);
}
/** "Name · role", "Name", or "role" — never a stray leading "·" when one side is missing. */
function attribution(q: { name: string; role?: string }): string {
  const name = q.name ? `<strong style="color:var(--od-text)">${esc(q.name)}</strong>` : "";
  const role = q.role && q.role !== q.name ? esc(q.role) : "";
  if (name && role) return `${name} · ${role}`;
  return name || `<strong style="color:var(--od-text)">${role}</strong>` || "";
}
const testimonial = {
  carousel(p: Record<string, unknown>, _c: RenderCtx, i: number): string {
    const qs = quotes(p);
    return `<section class="od-section"${band(i)}><div class="od-container">
      ${head(p)}
      <div data-od-carousel data-od-autoplay="6000" style="margin-top:var(--od-s8);position:relative">
        <div data-od-track>${qs.map((q) => `<div data-od-slide style="padding:0 var(--od-s2)">
          <p style="font-family:var(--od-font-heading);font-weight:var(--od-heading-weight);font-size:var(--od-text-2xl);line-height:1.3;color:var(--od-text);max-width:44ch">&ldquo;${esc(q.quote)}&rdquo;</p>
          ${attribution(q) ? `<p class="od-body" style="margin-top:var(--od-s4);color:var(--od-muted)">${attribution(q)}</p>` : ""}
        </div>`).join("")}</div>
        <div style="display:flex;gap:var(--od-s2);margin-top:var(--od-s6)">
          <button type="button" data-od-prev aria-label="Previous" class="od-btn od-btn-ghost" style="width:44px;padding:0">&lsaquo;</button>
          <button type="button" data-od-next aria-label="Next" class="od-btn od-btn-ghost" style="width:44px;padding:0">&rsaquo;</button>
        </div>
      </div>
    </div></section>`;
  },
  grid(p: Record<string, unknown>, _c: RenderCtx, i: number): string {
    const qs = quotes(p);
    return `<section class="od-section"${band(i)}><div class="od-container">
      ${head(p)}
      <div class="od-grid" style="--od-col-min:280px;margin-top:var(--od-s8)">
        ${qs.map((q) => `<figure class="od-card od-card--soft" style="margin:0">
          <blockquote style="margin:0;color:var(--od-text)">&ldquo;${esc(q.quote)}&rdquo;</blockquote>
          ${attribution(q) ? `<figcaption class="od-body" style="margin-top:var(--od-s4);color:var(--od-muted)">${attribution(q)}</figcaption>` : ""}
        </figure>`).join("")}
      </div>
    </div></section>`;
  },
  single(p: Record<string, unknown>, _c: RenderCtx, i: number): string {
    const q = quotes(p)[0] || { quote: String(p.heading || ""), name: String(p.body || ""), role: "" };
    return `<section class="od-section"${band(i)}><div class="od-container-narrow" style="text-align:center">
      <p style="font-family:var(--od-font-heading);font-weight:var(--od-heading-weight);font-size:var(--od-text-3xl);line-height:1.28;color:var(--od-text)">&ldquo;${esc(q.quote)}&rdquo;</p>
      ${attribution(q) ? `<p class="od-body" style="margin-top:var(--od-s5);color:var(--od-muted)">${attribution(q)}</p>` : ""}
    </div></section>`;
  },
};

// ---------------------------------------------------------------------------
// LOGOS
// ---------------------------------------------------------------------------

const logos = {
  marquee(p: Record<string, unknown>, _c: RenderCtx, i: number): string {
    const names = arr<string>(p.items).slice(0, 10);
    return `<section class="od-section-sm"${band(i)}><div class="od-container">
      ${p.heading ? `<p class="od-eyebrow" style="text-align:center;display:block">${esc(p.heading)}</p>` : ""}
      <div data-od-marquee="34" style="margin-top:var(--od-s5)"><div style="display:inline-flex;gap:var(--od-s9);align-items:center">
        ${names.map((n) => `<span style="font-family:var(--od-font-heading);font-size:var(--od-text-xl);color:var(--od-muted);white-space:nowrap">${esc(n)}</span>`).join("")}
      </div></div>
    </div></section>`;
  },
  row(p: Record<string, unknown>, _c: RenderCtx, i: number): string {
    const names = arr<string>(p.items).slice(0, 6);
    return `<section class="od-section-sm"${band(i)}><div class="od-container" style="display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:var(--od-s6)">
      ${p.heading ? `<span class="od-eyebrow">${esc(p.heading)}</span>` : ""}
      ${names.map((n) => `<span style="font-family:var(--od-font-heading);font-size:var(--od-text-lg);color:var(--od-muted)">${esc(n)}</span>`).join("")}
    </div></section>`;
  },
};

// ---------------------------------------------------------------------------
// FAQ
// ---------------------------------------------------------------------------

function faqItems(p: Record<string, unknown>) {
  return arr(p.items).map((it) => ({ q: pick(it, "q", "question", "title"), a: pick(it, "a", "answer", "body") })).filter((it) => it.q);
}
const faq = {
  accordion(p: Record<string, unknown>, _c: RenderCtx, i: number): string {
    const items = faqItems(p).slice(0, 10);
    return `<section class="od-section"${band(i)}><div class="od-container-narrow">
      ${head(p)}
      <div data-od-accordion style="margin-top:var(--od-s7)">
        ${items.map((it) => `<div data-od-acc-item style="border-top:1px solid var(--od-border)">
          <button type="button" data-od-acc-trigger style="display:flex;justify-content:space-between;align-items:center;gap:var(--od-s4);padding:var(--od-s5) 0;font-family:var(--od-font-heading);font-weight:var(--od-heading-weight);font-size:var(--od-text-lg);color:var(--od-text)">
            <span>${esc(it.q)}</span><span aria-hidden="true" style="color:var(--od-accent);flex-shrink:0">+</span>
          </button>
          <div data-od-acc-panel><p class="od-body" style="color:var(--od-muted);padding-bottom:var(--od-s5);max-width:56ch">${esc(it.a)}</p></div>
        </div>`).join("")}
      </div>
    </div></section>`;
  },
  twocol(p: Record<string, unknown>, _c: RenderCtx, i: number): string {
    const items = faqItems(p).slice(0, 8);
    return `<section class="od-section"${band(i)}><div class="od-container">
      ${head(p)}
      <div class="od-grid" style="--od-col-min:320px;margin-top:var(--od-s8)">
        ${items.map((it) => `<div><h3 style="font-family:var(--od-font-heading);font-weight:var(--od-heading-weight);font-size:var(--od-text-lg);color:var(--od-text)">${esc(it.q)}</h3><p class="od-body" style="color:var(--od-muted);margin-top:var(--od-s2)">${esc(it.a)}</p></div>`).join("")}
      </div>
    </div></section>`;
  },
};

// ---------------------------------------------------------------------------
// CTA / NEWSLETTER
// ---------------------------------------------------------------------------

const cta = {
  banner(p: Record<string, unknown>, ctx: RenderCtx, i: number): string {
    return `<section class="od-section od-section--invert"${band(i)}><div class="od-container-narrow" style="text-align:center">
      <h2 class="od-h2" style="margin-inline:auto;max-width:20ch">${esc(p.heading)}</h2>
      ${p.body ? `<p class="od-lead" style="margin:var(--od-s4) auto 0;max-width:46ch;color:inherit;opacity:.9">${esc(p.body)}</p>` : ""}
      <div style="display:flex;justify-content:center;margin-top:var(--od-s7)">${newsletterForm(p, ctx)}</div>
    </div></section>`;
  },
  split(p: Record<string, unknown>, ctx: RenderCtx, i: number): string {
    const form = newsletterForm(p, ctx);
    const isForm = form.includes("<form");
    // With a real newsletter form the two-column split reads well; with just a button the right
    // column is nearly empty — fall back to a single centred block.
    if (!isForm) {
      return `<section class="od-section od-section--invert"${band(i)}><div class="od-container-narrow" style="text-align:center">
        ${eyebrow(p.eyebrow)}<h2 class="od-h2" style="margin-inline:auto;max-width:22ch">${esc(p.heading)}</h2>
        ${p.body ? `<p class="od-lead" style="margin:var(--od-s4) auto 0;max-width:48ch;color:inherit;opacity:.9">${esc(p.body)}</p>` : ""}
        <div style="display:flex;justify-content:center;margin-top:var(--od-s7)">${form}</div>
      </div></section>`;
    }
    return `<section class="od-section"${band(i)}><div class="od-container" style="display:grid;grid-template-columns:minmax(0,5fr) minmax(0,5fr);gap:var(--od-s8);align-items:center">
      <div>${eyebrow(p.eyebrow)}<h2 class="od-h2">${esc(p.heading)}</h2>${p.body ? `<p class="od-lead">${esc(p.body)}</p>` : ""}</div>
      <div>${form}</div>
    </div></section>`;
  },
  invert(p: Record<string, unknown>, ctx: RenderCtx): string {
    return `<section class="od-section od-section--invert" style="text-align:center"><div class="od-container-narrow">
      <h2 class="od-h2" style="margin-inline:auto;max-width:22ch">${esc(p.heading)}</h2>
      ${p.body ? `<p class="od-lead" style="margin:var(--od-s4) auto 0;max-width:48ch;color:inherit;opacity:.9">${esc(p.body)}</p>` : ""}
      <div style="display:flex;justify-content:center;margin-top:var(--od-s7)">${newsletterForm(p, ctx)}</div>
    </div></section>`;
  },
};
function newsletterForm(p: Record<string, unknown>, ctx: RenderCtx): string {
  if ((p.cta as { label?: string })?.label && !p.newsletter) return ctaRow(p, ctx).replace('margin-top:var(--od-s6)"', 'margin-top:0"');
  return `<form data-od-form="newsletter" style="display:flex;flex-wrap:wrap;gap:var(--od-s2);max-width:420px">
    <input type="email" name="email" required placeholder="${attr(p.placeholder || "you@email.com")}" style="flex:1 1 200px;min-height:46px;padding:0 var(--od-s4);border:1px solid var(--od-border);border-radius:var(--od-radius-md);background:var(--od-bg);color:var(--od-text);font:inherit">
    <button type="submit" class="od-btn od-btn-primary">${esc((p.cta as { label?: string })?.label || "Subscribe")}</button>
  </form>`;
}

// ---------------------------------------------------------------------------
// GALLERY / VALUES / PRODUCT-GRID / CONTACT
// ---------------------------------------------------------------------------

const gallery = {
  strip(p: Record<string, unknown>, _c: RenderCtx, i: number): string {
    const items = arr<string>(p.items).slice(0, 6);
    return `<section class="od-section"${band(i)}><div class="od-container">${p.heading ? head(p) : ""}
      <div class="od-grid" style="--od-col-min:200px;margin-top:${p.heading ? "var(--od-s7)" : "0"}">
        ${(items.length ? items : ["", "", ""]).map((b) => img(String(b || p.heading || "gallery image"), "width:100%;aspect-ratio:1/1;border-radius:var(--od-radius-lg)")).join("")}
      </div></div></section>`;
  },
  feature(p: Record<string, unknown>, _c: RenderCtx, i: number): string {
    const items = arr<string>(p.items).slice(0, 3);
    return `<section class="od-section"${band(i)}><div class="od-container" style="display:grid;grid-template-columns:2fr 1fr 1fr;gap:var(--od-s4)">
      ${(items.length ? items : ["", "", ""]).map((b, k) => img(String(b || "image"), `width:100%;aspect-ratio:${k === 0 ? "1/1" : "3/4"};border-radius:var(--od-radius-lg);${k > 0 ? "" : "grid-row:span 2"}`)).join("")}
    </div></section>`;
  },
};

const values = {
  grid(p: Record<string, unknown>, _c: RenderCtx, i: number): string {
    const items = featureItems(p);
    return `<section class="od-section"${band(i)}><div class="od-container">${head(p)}
      <div class="od-grid" style="--od-col-min:240px;margin-top:var(--od-s8)">
        ${items.map((it) => `<div style="border-top:2px solid var(--od-accent);padding-top:var(--od-s4)"><h3 class="od-h3">${esc(it.title)}</h3><p class="od-body" style="color:var(--od-muted);margin-top:var(--od-s2)">${esc(it.body)}</p></div>`).join("")}
      </div></div></section>`;
  },
  list(p: Record<string, unknown>, _c: RenderCtx, i: number): string {
    const items = featureItems(p);
    return `<section class="od-section"${band(i)}><div class="od-container">${head(p)}
      <dl style="margin:var(--od-s8) 0 0;display:flex;flex-direction:column">
        ${items.map((it) => `<div style="display:grid;grid-template-columns:minmax(120px,1fr) 2fr;gap:var(--od-s6);padding:var(--od-s5) 0;border-top:1px solid var(--od-border)">
          <dt style="font-family:var(--od-font-heading);font-weight:var(--od-heading-weight);font-size:var(--od-text-lg);color:var(--od-text)">${esc(it.title)}</dt>
          <dd style="margin:0"><p class="od-body" style="color:var(--od-muted)">${esc(it.body)}</p></dd>
        </div>`).join("")}
      </dl></div></section>`;
  },
};

function productGrid(p: Record<string, unknown>): string {
  // The real product cards are injected by the page renderer right after this intro.
  return `${p.heading ? `<h2 class="od-h2">${esc(p.heading)}</h2>` : ""}${p.body ? `<p class="od-lead">${esc(p.body)}</p>` : ""}`;
}

// ---------------------------------------------------------------------------
// COLLECTIONS — category / shop-by tiles
// ---------------------------------------------------------------------------

function collItems(p: Record<string, unknown>) {
  return arr(p.items)
    .map((it) => ({ label: pick(it, "label", "title", "name", "heading"), href: pick(it, "href", "url", "link"), figure: pick(it, "figure", "image", "photo", "img") }))
    .filter((it) => it.label && !/^(shop |view |browse |see )?all\b|^everything$|^all (styles|products|collections?|items)$/i.test(it.label.trim()))
    .slice(0, 6);
}
const collections = {
  /** even grid of image tiles, label overlaid bottom-left */
  tiles(p: Record<string, unknown>, ctx: RenderCtx, i: number): string {
    const items = collItems(p);
    return `<section class="od-section"${band(i)}><div class="od-container">
      ${p.heading ? head(p) : ""}
      <div class="od-grid" style="--od-col-min:240px;margin-top:${p.heading ? "var(--od-s8)" : "0"}">
        ${items.map((it) => `<a href="${attr(it.href || ctx.shopHref)}" style="position:relative;display:block;border-radius:var(--od-radius-lg);overflow:hidden;color:#fff;aspect-ratio:${items.length <= 3 ? "4/5" : "1/1"}">
          ${bgImg(it.figure || `${it.label} collection`, "position:absolute;inset:0;width:100%;height:100%;border-radius:0")}
          <span style="position:absolute;inset:0;background:linear-gradient(to top, rgba(0,0,0,.62), transparent 55%)"></span>
          <span style="position:absolute;left:var(--od-s4);bottom:var(--od-s4);font-family:var(--od-font-heading);font-weight:var(--od-heading-weight);font-size:var(--od-text-lg)">${esc(it.label)}</span>
        </a>`).join("")}
      </div>
    </div></section>`;
  },
  /** one hero tile + a stacked list of the rest */
  split(p: Record<string, unknown>, ctx: RenderCtx, i: number): string {
    const items = collItems(p);
    const [first, ...rest] = items;
    if (!first) return "";
    return `<section class="od-section"${band(i)}><div class="od-container" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,300px),1fr));gap:var(--od-s5)">
      <a href="${attr(first.href || ctx.shopHref)}" style="position:relative;display:block;border-radius:var(--od-radius-lg);overflow:hidden;color:#fff;min-height:420px">
        ${bgImg(first.figure || `${first.label} collection`, "position:absolute;inset:0;width:100%;height:100%;border-radius:0")}
        <span style="position:absolute;inset:0;background:linear-gradient(to top, rgba(0,0,0,.55), transparent 60%)"></span>
        <span style="position:absolute;left:var(--od-s5);bottom:var(--od-s5);font-family:var(--od-font-heading);font-weight:var(--od-heading-weight);font-size:var(--od-text-2xl)">${esc(first.label)}</span>
      </a>
      <div style="display:flex;flex-direction:column">
        ${rest.slice(0, 5).map((it) => `<a href="${attr(it.href || ctx.shopHref)}" style="display:flex;justify-content:space-between;align-items:center;padding:var(--od-s5) 0;border-top:1px solid var(--od-border);font-family:var(--od-font-heading);font-weight:var(--od-heading-weight);font-size:var(--od-text-lg);color:var(--od-text)">
          <span>${esc(it.label)}</span><span aria-hidden="true" style="color:var(--od-accent)">&rarr;</span></a>`).join("")}
      </div>
    </div></section>`;
  },
};

// ---------------------------------------------------------------------------
// TRUST — a compact row of guarantees
// ---------------------------------------------------------------------------

function trustRow(p: Record<string, unknown>, _c: RenderCtx, i: number): string {
  const items = arr(p.items).map((it) => ({ title: pick(it, "title", "label", "name", "heading"), body: pick(it, "body", "detail", "description", "text"), icon: typeof (it as Record<string, unknown>).icon === "number" ? ((it as Record<string, unknown>).icon as number) : undefined })).filter((it) => it.title).slice(0, 4);
  return `<section class="od-section-sm"${band(i)}><div class="od-container" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:var(--od-s6)">
    ${items.map((it, k) => `<div style="display:flex;gap:var(--od-s3);align-items:flex-start">
      <span style="color:var(--od-accent);flex-shrink:0">${icon(ICONS[(it.icon ?? k) % ICONS.length])}</span>
      <div><div style="font-family:var(--od-font-heading);font-weight:var(--od-heading-weight);font-size:var(--od-text-base);color:var(--od-text)">${esc(it.title)}</div>${it.body ? `<div style="font-size:var(--od-text-sm);color:var(--od-muted);margin-top:2px">${esc(it.body)}</div>` : ""}</div>
    </div>`).join("")}
  </div></section>`;
}

// ---------------------------------------------------------------------------
// PRICING — plan cards
// ---------------------------------------------------------------------------

function pricingTiers(p: Record<string, unknown>, ctx: RenderCtx, i: number): string {
  const plans = arr(p.items).map((it) => ({
    name: pick(it, "name", "title", "label", "heading"),
    price: pick(it, "price", "cost", "amount"),
    cadence: pick(it, "cadence", "period", "per"),
    body: pick(it, "body", "description", "tagline"),
    features: arr<string>((it as Record<string, unknown>).features).map(String),
    featured: !!(it as Record<string, unknown>).featured,
    cta: pick(it, "cta", "button") || "Choose",
  })).filter((pl) => pl.name).slice(0, 4);
  return `<section class="od-section"${band(i)}><div class="od-container">
    ${head(p, { center: true })}
    <div class="od-grid" style="--od-col-min:260px;margin-top:var(--od-s8)">
      ${plans.map((pl) => `<div class="od-card${pl.featured ? "" : " od-card--soft"}" style="display:flex;flex-direction:column;gap:var(--od-s4)${pl.featured ? ";border-color:var(--od-accent);box-shadow:var(--od-shadow-lg)" : ""}">
        <div><div class="od-eyebrow" style="margin:0">${esc(pl.name)}</div>
          <div style="font-family:var(--od-font-heading);font-weight:var(--od-heading-weight);font-size:var(--od-text-4xl);color:var(--od-text);margin-top:var(--od-s2)">${esc(pl.price)}<span style="font-size:var(--od-text-sm);color:var(--od-muted);font-weight:400"> ${esc(pl.cadence)}</span></div>
          ${pl.body ? `<p class="od-body" style="color:var(--od-muted);margin-top:var(--od-s2)">${esc(pl.body)}</p>` : ""}
        </div>
        <ul style="list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:var(--od-s2);flex:1">
          ${pl.features.slice(0, 8).map((f) => `<li style="display:flex;gap:var(--od-s2);font-size:var(--od-text-sm);color:var(--od-text)"><span style="color:var(--od-accent);flex-shrink:0">${icon('<path d="M20 6 9 17l-5-5"/>')}</span>${esc(f)}</li>`).join("")}
        </ul>
        <a href="${attr(ctx.shopHref)}" class="od-btn ${pl.featured ? "od-btn-primary" : "od-btn-ghost"}" style="width:100%">${esc(pl.cta)}</a>
      </div>`).join("")}
    </div>
  </div></section>`;
}

// ---------------------------------------------------------------------------
// COMPARE — us vs. the rest
// ---------------------------------------------------------------------------

function compareTable(p: Record<string, unknown>, _c: RenderCtx, i: number): string {
  const rows = arr(p.items).map((it) => ({ label: pick(it, "label", "feature", "title", "heading"), us: pick(it, "us", "ours", "yes"), them: pick(it, "them", "others", "no") })).filter((r) => r.label).slice(0, 8);
  const usName = pick(p, "usLabel", "brand") || "Us";
  const themName = pick(p, "themLabel") || "Others";
  return `<section class="od-section"${band(i)}><div class="od-container-narrow">
    ${head(p)}
    <div style="overflow-x:auto;margin-top:var(--od-s8)"><table style="width:100%;border-collapse:collapse;min-width:420px">
      <thead><tr>
        <th style="text-align:left;padding:var(--od-s3) var(--od-s3) var(--od-s3) 0"></th>
        <th style="padding:var(--od-s3);font-family:var(--od-font-heading);font-weight:var(--od-heading-weight);color:var(--od-accent);font-size:var(--od-text-base)">${esc(usName)}</th>
        <th style="padding:var(--od-s3);font-family:var(--od-font-heading);font-weight:var(--od-heading-weight);color:var(--od-muted);font-size:var(--od-text-base)">${esc(themName)}</th>
      </tr></thead>
      <tbody>${rows.map((r) => `<tr style="border-top:1px solid var(--od-border)">
        <td style="padding:var(--od-s4) var(--od-s3) var(--od-s4) 0;color:var(--od-text);font-size:var(--od-text-sm)">${esc(r.label)}</td>
        <td style="padding:var(--od-s4) var(--od-s3);text-align:center;color:var(--od-text)">${cmpCell(r.us)}</td>
        <td style="padding:var(--od-s4) var(--od-s3);text-align:center;color:var(--od-muted)">${cmpCell(r.them)}</td>
      </tr>`).join("")}</tbody>
    </table></div>
  </div></section>`;
}
function cmpCell(v: string): string {
  if (/^(yes|true|✓|✔)$/i.test(v.trim())) return `<span style="color:var(--od-accent)">${icon('<path d="M20 6 9 17l-5-5"/>')}</span>`;
  if (/^(no|false|✗|✕|-|—)?$/i.test(v.trim())) return `<span style="color:var(--od-muted)">${icon('<path d="M18 6 6 18M6 6l12 12"/>')}</span>`;
  return `<span style="font-size:var(--od-text-sm)">${esc(v)}</span>`;
}

// ---------------------------------------------------------------------------
// EDITORIAL — a magazine spread: oversized image, offset text block
// ---------------------------------------------------------------------------

function editorialSpread(p: Record<string, unknown>, ctx: RenderCtx, i: number): string {
  return `<section class="od-section"${band(i)}><div class="od-container" style="display:grid;grid-template-columns:repeat(12,1fr);gap:var(--od-s5);align-items:center">
    <div style="grid-column:1/span 8;grid-row:1;min-width:0">${img(String(p.figure || p.heading), "width:100%;aspect-ratio:16/9;border-radius:var(--od-radius-lg)")}</div>
    <div style="grid-column:7/span 6;grid-row:1;align-self:center;min-width:0;background:var(--od-bg);border:1px solid var(--od-border);border-radius:var(--od-radius-lg);padding:var(--od-s6);box-shadow:var(--od-shadow-md);position:relative;z-index:1">
      ${eyebrow(p.eyebrow)}<h2 class="od-h2">${esc(p.heading)}</h2>
      ${p.body ? `<p class="od-body" style="color:var(--od-muted);margin-top:var(--od-s3)">${esc(p.body)}</p>` : ""}
      ${(p.cta as { label?: string })?.label ? `<a href="${attr((p.cta as { href?: string })?.href || ctx.shopHref)}" class="od-btn od-btn-ghost" style="margin-top:var(--od-s5)">${esc((p.cta as { label?: string }).label)}</a>` : ""}
    </div>
  </div></section>`;
}

function contact(p: Record<string, unknown>, ctx: RenderCtx, i: number): string {
  return `<section class="od-section"${band(i)}><div class="od-container" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,300px),1fr));gap:var(--od-s8)">
    <div>${head(p)}
      <form data-od-form="contact" style="display:flex;flex-direction:column;gap:var(--od-s3);margin-top:var(--od-s6);max-width:460px">
        <input name="name" required placeholder="Your name" style="min-height:46px;padding:0 var(--od-s4);border:1px solid var(--od-border);border-radius:var(--od-radius-md);background:var(--od-bg);color:var(--od-text);font:inherit">
        <input type="email" name="email" required placeholder="Email" style="min-height:46px;padding:0 var(--od-s4);border:1px solid var(--od-border);border-radius:var(--od-radius-md);background:var(--od-bg);color:var(--od-text);font:inherit">
        <textarea name="message" required rows="4" placeholder="How can we help?" style="padding:var(--od-s3) var(--od-s4);border:1px solid var(--od-border);border-radius:var(--od-radius-md);background:var(--od-bg);color:var(--od-text);font:inherit"></textarea>
        <button type="submit" class="od-btn od-btn-primary" style="align-self:flex-start">${esc((p.cta as { label?: string })?.label || "Send message")}</button>
      </form>
    </div>
    <div style="display:flex;flex-direction:column;gap:var(--od-s5)">
      ${contactItems(p, ctx).map((it) => `<div><div class="od-eyebrow">${esc(it.label)}</div><p class="od-body" style="color:var(--od-text);margin-top:var(--od-s2);white-space:pre-line">${esc(it.value)}</p></div>`).join("")}
    </div>
  </div></section>`;
}
/**
 * Contact details: what the model wrote, merged with the seller's Content-panel values for any
 * standard field it left blank (so editing them in the Content panel stays in sync).
 */
function contactItems(p: Record<string, unknown>, ctx: RenderCtx): { label: string; value: string }[] {
  const given = arr(p.items)
    .map((raw) => ({ label: pick(raw, "label", "title", "name"), value: pick(raw, "value", "text", "detail", "body") }))
    .filter((it) => it.label || it.value);
  const has = (re: RegExp) => given.some((it) => re.test(it.label));
  const out = [...given];
  if (ctx.content?.email && !has(/mail/i)) out.unshift({ label: "Email", value: ctx.content.email });
  if (ctx.content?.phone && !has(/phone|call|tel/i)) out.push({ label: "Phone", value: ctx.content.phone });
  if (ctx.content?.address && !has(/visit|address|studio|store|find/i)) out.push({ label: "Visit", value: ctx.content.address });
  return out.length ? out : [{ label: "Email", value: "hello@example.com" }];
}

/**
 * A functional-zone placeholder. Orbit Design uses this on checkout / sign-in / account /
 * order-tracking / reviews / complaint pages — it designs the frame, this marks where the working
 * part goes. The renderer's applySpec() swaps it for the real widget once "Orbit Code" (Handoff)
 * has produced a StoreBackendSpec; until then it shows as a labeled dashed card.
 */
function slotSection(p: Record<string, unknown>, _ctx: RenderCtx, i: number): string {
  const name = pick(p, "name", "slot", "heading", "label") || "interactive";
  const purpose = pick(p, "purpose", "body", "description") || "";
  const heading = pick(p, "heading", "title");
  return `<section class="od-section"${band(i)}><div class="od-container-narrow">
    ${heading ? `<h2 class="od-h2" style="text-align:center;margin-bottom:var(--od-s6)">${esc(heading)}</h2>` : ""}
    <div class="od-card" data-od-slot="${attr(name)}" data-od-purpose="${attr(purpose)}" style="padding:var(--od-s8);text-align:center;border:1.5px dashed var(--od-border);border-radius:var(--od-radius-lg)"></div>
  </div></section>`;
}

// ---------------------------------------------------------------------------
// registry + dispatch
// ---------------------------------------------------------------------------

type Renderer = (p: Record<string, unknown>, ctx: RenderCtx, index: number) => string;

const REGISTRY: Record<OrbitKind, Record<string, Renderer>> = {
  hero: { editorial: hero.editorial, centered: hero.centered, showcase: hero.showcase, media: hero.media, overlay: hero.overlay },
  feature: { cards: feature.cards, alternating: feature.alternating, checklist: feature.checklist },
  stat: { inline: stat.inline, band: stat.band },
  story: { split: story.split, columns: story.columns, quote: story.quote },
  steps: { rows: steps.rows, horizontal: steps.horizontal },
  testimonial: { carousel: testimonial.carousel, grid: testimonial.grid, single: testimonial.single },
  logos: { marquee: logos.marquee, row: logos.row },
  faq: { accordion: faq.accordion, twocol: faq.twocol },
  cta: { banner: cta.banner, split: cta.split, invert: cta.invert },
  gallery: { strip: gallery.strip, feature: gallery.feature },
  values: { grid: values.grid, list: values.list },
  collections: { tiles: collections.tiles, split: collections.split },
  trust: { row: trustRow },
  pricing: { tiers: pricingTiers },
  compare: { table: compareTable },
  editorial: { spread: editorialSpread },
  "product-grid": { standard: productGrid },
  contact: { standard: contact },
  slot: { standard: slotSection },
};

/** Every kind → its variant keys, for the planner's schema + validation. */
export const SECTION_KINDS: Record<OrbitKind, string[]> = Object.fromEntries(
  (Object.keys(REGISTRY) as OrbitKind[]).map((k) => [k, Object.keys(REGISTRY[k])]),
) as Record<OrbitKind, string[]>;

export function isOrbitKind(k: string): k is OrbitKind {
  return k in REGISTRY;
}

/** Render one block to section HTML. Falls back to the first variant if an unknown one is asked. */
export function renderBlock(block: OrbitBlock, ctx: RenderCtx, index: number): string {
  const variants = REGISTRY[block.kind];
  if (!variants) return "";
  const fn = variants[block.variant] || variants[Object.keys(variants)[0]];
  try {
    return fn(block.props || {}, ctx, index);
  } catch {
    return "";
  }
}

/** A safe default block for a kind — used when the planner leaves props thin. */
export function defaultVariant(kind: OrbitKind): string {
  return SECTION_KINDS[kind]?.[0] || "";
}
