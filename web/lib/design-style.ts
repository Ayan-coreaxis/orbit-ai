/**
 * Shape language — the part of a store's look that lives in the platform-drawn pieces (product
 * cards, buttons, filter pills, the cart/checkout/account widgets). Sections are hand-authored per
 * store, but these pieces are drawn by the platform, so without this every store shared one card
 * and one button. A store's `tokens.style` picks a variant of each; old stores (no style) keep the
 * original look.
 */

export const STYLE_OPTIONS = {
  button: ["soft", "pill", "sharp", "outline", "brutal"],
  card: ["plain", "framed", "tile", "overlay", "line", "brutal", "polaroid"],
  imageRatio: ["square", "portrait", "tall", "landscape"],
  imageShape: ["rounded", "sharp", "arch"],
  align: ["left", "center"],
  buy: ["button", "outline", "link", "hover"],
  grid: ["airy", "standard", "dense"],
} as const;

export interface DesignStyle {
  /** CTA shape everywhere: section buttons, card buttons, cart/checkout buttons */
  button: (typeof STYLE_OPTIONS.button)[number];
  /** how a product card is built */
  card: (typeof STYLE_OPTIONS.card)[number];
  imageRatio: (typeof STYLE_OPTIONS.imageRatio)[number];
  imageShape: (typeof STYLE_OPTIONS.imageShape)[number];
  /** product name/price alignment */
  align: (typeof STYLE_OPTIONS.align)[number];
  /** the card's buy control */
  buy: (typeof STYLE_OPTIONS.buy)[number];
  /** product-grid density */
  grid: (typeof STYLE_OPTIONS.grid)[number];
  /** small uppercase tracked labels for product names + buttons */
  caps: boolean;
}

export function defaultStyle(): DesignStyle {
  return { button: "soft", card: "plain", imageRatio: "square", imageShape: "rounded", align: "left", buy: "button", grid: "standard", caps: false };
}

/** Validate a (possibly partial / model-written) style. Returns undefined when nothing usable was given. */
export function normalizeStyle(raw: unknown): DesignStyle | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const r = raw as Record<string, unknown>;
  const d = defaultStyle();
  let any = false;
  const pick = <K extends keyof typeof STYLE_OPTIONS>(k: K): (typeof STYLE_OPTIONS)[K][number] => {
    const v = String(r[k] ?? "").toLowerCase().trim();
    if ((STYLE_OPTIONS[k] as readonly string[]).includes(v)) {
      any = true;
      return v as (typeof STYLE_OPTIONS)[K][number];
    }
    return d[k] as (typeof STYLE_OPTIONS)[K][number];
  };
  const out: DesignStyle = {
    button: pick("button"),
    card: pick("card"),
    imageRatio: pick("imageRatio"),
    imageShape: pick("imageShape"),
    align: pick("align"),
    buy: pick("buy"),
    grid: pick("grid"),
    caps: r.caps === true || r.caps === "true",
  };
  if (out.caps) any = true;
  return any ? out : undefined;
}

/** Merge a partial style edit onto the current one (so "make the buttons pill" keeps the card). */
export function mergeStyle(prev: DesignStyle | undefined, patch: unknown): DesignStyle | undefined {
  if (!patch || typeof patch !== "object") return prev;
  return normalizeStyle({ ...(prev ?? {}), ...(patch as Record<string, unknown>) }) ?? prev;
}

/** One plain sentence for prompts, so hand-authored sections match the platform-drawn pieces. */
export function describeStyle(s: DesignStyle | undefined): string {
  if (!s) return "";
  const btn = {
    soft: "softly rounded solid buttons",
    pill: "fully rounded pill buttons",
    sharp: "square-cornered solid buttons",
    outline: "outlined buttons (transparent fill, 1.5px text-colour border, fill on hover)",
    brutal: "square buttons with a 2px text-colour border and a hard offset shadow (4px 4px 0), no blur",
  }[s.button];
  const card = {
    plain: "product cards are bare image + text, no box",
    framed: "product cards sit in a thin bordered frame",
    tile: "product cards are soft filled tiles",
    overlay: "product cards print the name and price over the bottom of the photo",
    line: "product cards are editorial rows under a top rule, name and price on one line above the photo",
    brutal: "product cards have a 2px border and a hard offset shadow",
    polaroid: "product cards are white photo-print frames, slightly tilted",
  }[s.card];
  const shape = { rounded: "rounded image corners", sharp: "square image corners", arch: "arched image tops" }[s.imageShape];
  return `${btn}; ${card}; ${s.imageRatio} photos with ${shape}; ${s.align}-aligned product text${s.caps ? "; small uppercase tracked labels" : ""}`;
}

const GRID_MIN = { airy: 300, standard: 220, dense: 164 } as const;
const GRID_COL = { airy: 340, standard: 255, dense: 190 } as const;
const RATIO = { landscape: 0.72, square: 1, portrait: 1.25, tall: 1.45 } as const;

/** Custom properties the product grid + widgets read. Emitted with the rest of the tokens. */
export function styleVars(s: DesignStyle | undefined): string {
  if (!s) return "";
  const max = Math.round(GRID_COL[s.grid] * RATIO[s.imageRatio]);
  const min = Math.round(max * 0.7);
  const vw = (max / 11.8).toFixed(1);
  const btnRadius = { soft: "calc(var(--od-radius)*.7)", pill: "999px", sharp: "0px", outline: "calc(var(--od-radius)*.7)", brutal: "0px" }[s.button];
  return `
  --od-pc-min:${GRID_MIN[s.grid]}px;
  --od-pc-h:clamp(${min}px, ${vw}vw, ${max}px);
  --od-btn-radius:${btnRadius};`;
}

/**
 * CSS for the platform-drawn pieces. `scope` is the store wrapper selector. Base rules reproduce the
 * original card exactly; the variant rules are only emitted for a store that has a style.
 */
export function styleCss(scope: string, s: DesignStyle | undefined): string {
  const S = scope;
  const st = s ?? defaultStyle();
  const imgRadius = { rounded: "var(--od-radius)", sharp: "0px", arch: "999px 999px var(--od-radius) var(--od-radius)" }[st.imageShape];
  const out: string[] = [];
  // ---- base (identical to the original inline-styled card) ----
  out.push(`${S} .od-pc{display:flex;flex-direction:column;min-width:0;position:relative}
${S} .od-pc-link{text-decoration:none;color:inherit;display:block;position:relative}
${S} .od-pc-media{width:100%;height:var(--od-pc-h,clamp(180px, 22vw, 260px));overflow:hidden;border-radius:${imgRadius};background:var(--od-surface)}
${S} .od-pc-name{margin-top:12px;font-size:15px;font-weight:500;color:var(--od-text)}
${S} .od-pc-price{margin-top:2px;font-size:14px;color:var(--od-muted)}
${S} .od-pc-buy{margin-top:10px;width:100%;display:block;text-align:center;background:var(--od-accent);color:var(--od-accent-text);border:none;border-radius:var(--od-btn-radius,calc(var(--od-radius)*.7));padding:9px 12px;font:inherit;font-size:13px;font-weight:600;line-height:1.5;cursor:pointer;text-decoration:none;transition:background .15s,color .15s,transform .15s,box-shadow .15s,opacity .2s}
${S} .od-pc-sold{display:inline-block;margin-top:10px;font-size:12px;color:var(--od-muted)}
${S} .od-pill{border-radius:999px}`);
  if (!s) return out.join("\n");

  // ---- card variants ----
  if (st.card === "framed") {
    out.push(`${S} .od-pc{border:1px solid var(--od-border);border-radius:var(--od-radius);padding:12px 12px 14px;background:var(--od-bg);transition:border-color .2s}
${S} .od-pc:hover{border-color:var(--od-text)}
${S} .od-pc-media{border-radius:${st.imageShape === "arch" ? imgRadius : st.imageShape === "sharp" ? "0px" : "calc(var(--od-radius)*.6)"}}`);
  } else if (st.card === "tile") {
    out.push(`${S} .od-pc{background:var(--od-surface);border-radius:var(--od-radius-lg);padding:10px 10px 16px;transition:transform .22s var(--od-ease),box-shadow .22s var(--od-ease)}
${S} .od-pc:hover{transform:translateY(-4px);box-shadow:var(--od-shadow-lg)}
${S} .od-pc-media{background:color-mix(in srgb,var(--od-bg) 70%,var(--od-surface))}
${S} .od-pc-info{padding:0 6px}
${S} .od-pc-buy{margin-left:6px;margin-right:6px;width:calc(100% - 12px)}`);
  } else if (st.card === "overlay") {
    out.push(`${S} .od-pc-link{overflow:hidden;border-radius:${imgRadius}}
${S} .od-pc-info{position:absolute;left:0;right:0;bottom:0;padding:48px 14px 14px;background:linear-gradient(to top,rgba(0,0,0,.78),rgba(0,0,0,0));pointer-events:none}
${S} .od-pc-name{margin-top:0;color:#fff}
${S} .od-pc-price{color:rgba(255,255,255,.82)}`);
  } else if (st.card === "line") {
    out.push(`${S} .od-pc{border-top:1px solid var(--od-text);padding-top:12px}
${S} .od-pc-link{display:flex;flex-direction:column}
${S} .od-pc-info{order:-1;display:flex;justify-content:space-between;align-items:baseline;gap:12px;margin-bottom:12px;text-align:left}
${S} .od-pc-name{margin-top:0}
${S} .od-pc-price{margin-top:0;white-space:nowrap;color:var(--od-text)}`);
  } else if (st.card === "brutal") {
    out.push(`${S} .od-pc{border:2px solid var(--od-text);background:var(--od-bg);box-shadow:6px 6px 0 var(--od-text);transition:transform .15s,box-shadow .15s}
${S} .od-pc:hover{transform:translate(-2px,-2px);box-shadow:8px 8px 0 var(--od-text)}
${S} .od-pc-media{border-radius:0;border-bottom:2px solid var(--od-text)}
${S} .od-pc-info{padding:0 12px}
${S} .od-pc-name{font-weight:700}
${S} .od-pc-buy{margin:12px;width:calc(100% - 24px)}
${S} .od-pc-sold{margin:10px 12px 12px}`);
  } else if (st.card === "polaroid") {
    out.push(`${S} .od-pc{background:#fff;padding:10px 10px 14px;box-shadow:0 6px 18px rgba(0,0,0,.14);transition:transform .25s var(--od-ease),box-shadow .25s var(--od-ease)}
${S} .od-pc:nth-child(odd){transform:rotate(-1.2deg)}
${S} .od-pc:nth-child(even){transform:rotate(1deg)}
${S} .od-pc:hover{transform:rotate(0deg) translateY(-4px);box-shadow:0 14px 32px rgba(0,0,0,.2)}
${S} .od-pc-media{border-radius:0;background:#eee}
${S} .od-pc-name{color:#1b1b1b}
${S} .od-pc-price{color:#5c5c5c}`);
  }
  if (st.align === "center" && st.card !== "line") out.push(`${S} .od-pc{text-align:center}`);
  if (st.caps) {
    out.push(`${S} .od-pc-name{text-transform:uppercase;letter-spacing:.09em;font-size:12.5px;font-weight:600}
${S} .od-pc-buy,${S} .od-btn,${S} .odw-btn,${S} [data-od-cta]{text-transform:uppercase;letter-spacing:.09em;font-size:12.5px}`);
  }

  // ---- the card's buy control ----
  if (st.buy === "outline") {
    out.push(`${S} .od-pc-buy{background:transparent;color:var(--od-text);border:1.5px solid var(--od-text)}
${S} .od-pc-buy:hover{background:var(--od-text);color:var(--od-bg)}`);
  } else if (st.buy === "link") {
    out.push(`${S} .od-pc-buy{background:none;color:var(--od-text);border:none;border-radius:0;box-shadow:none;padding:0;margin-left:0;margin-right:0;width:auto;display:inline-block;align-self:${st.align === "center" && st.card !== "line" ? "center" : "flex-start"};text-decoration:underline;text-underline-offset:5px;text-decoration-thickness:1px}
${S} .od-pc-buy:hover{color:var(--od-accent)}`);
  } else if (st.buy === "hover") {
    out.push(`@media (hover:hover) and (pointer:fine){
${S} .od-pc-buy{opacity:0;transform:translateY(6px)}
${S} .od-pc:hover .od-pc-buy,${S} .od-pc:focus-within .od-pc-buy{opacity:1;transform:none}
}`);
  }
  if (st.card === "polaroid" && (st.buy === "outline" || st.buy === "link")) {
    out.push(`${S} .od-pc-buy{color:#1b1b1b;border-color:#1b1b1b}`);
  }
  if (st.card === "brutal" && st.buy === "link") out.push(`${S} .od-pc-buy{margin:10px 12px 12px}`);
  if (st.card === "tile" && st.buy === "link") out.push(`${S} .od-pc-buy{margin-left:6px;margin-right:6px}`);

  // ---- CTA shape, everywhere the platform draws a button ----
  out.push(`${S} .od-btn,${S} .odw-btn,${S} [data-od-cta]{border-radius:var(--od-btn-radius)!important}`);
  const cardBtn = st.buy === "button" || st.buy === "hover";
  if (st.button === "outline") {
    out.push(`${S} .od-btn-primary{background:transparent;color:var(--od-text);border:1.5px solid var(--od-text);box-shadow:none}
${S} .od-btn-primary:hover{background:var(--od-text);color:var(--od-bg);box-shadow:none}
${S} .od-section--invert .od-btn-primary{background:transparent;color:var(--od-accent-text);border-color:var(--od-accent-text)}`);
  } else if (st.button === "brutal") {
    out.push(`${S} .od-btn,${S} .odw-btn,${S} [data-od-cta]${cardBtn ? `,${S} .od-pc-buy` : ""}{border:2px solid var(--od-text)!important;box-shadow:4px 4px 0 var(--od-text)!important;transition:transform .12s,box-shadow .12s}
${S} .od-btn:hover,${S} .odw-btn:hover,${S} [data-od-cta]:hover${cardBtn ? `,${S} .od-pc-buy:hover` : ""}{transform:translate(2px,2px)!important;box-shadow:2px 2px 0 var(--od-text)!important}
${S} .odw-card{border:2px solid var(--od-text);box-shadow:6px 6px 0 var(--od-text)}
${S} .odw-input{border:2px solid var(--od-text);border-radius:0}`);
  }
  if (st.button === "sharp" || st.button === "brutal") {
    out.push(`${S} .od-pill,${S} .od-opt{border-radius:0!important}`);
  } else if (st.button === "pill") {
    out.push(`${S} .od-opt{border-radius:999px!important}`);
  }
  return out.join("\n");
}
