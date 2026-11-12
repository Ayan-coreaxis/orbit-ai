/**
 * Commerce blocks — store sections that are drawn from the REAL catalogue, so a home page reads
 * like a shop (rails of products, collections, a featured product, shop by price) instead of a
 * brochure. The designer only places a marker element and styles its container; the platform
 * fills it with live products every time the page renders, styled by the store's shape language
 * (`tokens.style`, lib/design-style.ts). Markers:
 *
 *   <div data-od-products="new|bestsellers|in-stock|category:<name>|under:<price>" data-od-limit="8" data-od-layout="rail|grid"></div>
 *   <div data-od-collections data-od-layout="circles|tiles"></div>
 *   <div data-od-featured-product="bestseller|newest|<productId>"></div>
 *   <div data-od-price-bands></div>
 *
 * Nothing is invented: a block with no matching products renders nothing (the live store) or the
 * studio's sample products (preview only, so the seller can judge the layout).
 */

export interface CommerceProduct {
  id: string;
  name: string;
  category?: string | null;
  price: number;
  imageUrl: string | null;
  description: string | null;
  stock: number;
  hasVariants?: boolean;
  fromPrice?: number;
  maxPrice?: number;
  /** units sold in the last 90 days (real orders), when the page loaded it */
  sold?: number;
}

export interface CommerceCtx {
  products: CommerceProduct[];
  sample: CommerceProduct[]; // preview-only stand-ins for an empty catalogue
  preview: boolean;
  /** slug of the catalogue page, for "#page:<slug>?cat=…" links */
  shopSlug: string;
  money: (n: number) => string;
  /** the platform product card (same as the shop grid) */
  card: (p: CommerceProduct) => string;
  esc: (s: string) => string;
  escAttr: (s: string) => string;
}

export const catSlug = (name?: string | null): string =>
  String(name ?? "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

const OPEN = /<div\b([^>]*\bdata-od-(products|collections|featured-product|price-bands)\b[^>]*)>/gi;

/** Index just past the `</div>` that closes the div opened at `from` (the "<" of its open tag). */
function closeOf(html: string, from: number): number {
  const re = /<div\b[^>]*>|<\/div\s*>/gi;
  re.lastIndex = from;
  let depth = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    if (m[0][1] === "/") {
      depth--;
      if (depth === 0) return m.index + m[0].length;
    } else if (!/\/>$/.test(m[0])) depth++;
  }
  return -1;
}

const attr = (attrs: string, name: string): string | undefined => {
  const m = new RegExp(`\\b${name}\\s*=\\s*("([^"]*)"|'([^']*)')`, "i").exec(attrs);
  return m ? (m[2] ?? m[3] ?? "") : undefined;
};

/** Replace every commerce marker's contents with live markup. The marker's own tag (its class /
 *  style / spacing) is kept, so the designer still controls how the block sits on the page. */
export function renderCommerceBlocks(html: string, ctx: CommerceCtx): string {
  if (!/data-od-(products|collections|featured-product|price-bands)\b/i.test(html)) return html;
  let out = "";
  let at = 0;
  OPEN.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = OPEN.exec(html))) {
    const start = m.index;
    if (start < at) continue;
    const end = closeOf(html, start);
    if (end < 0) break;
    const attrs = m[1];
    const kind = m[2].toLowerCase();
    const inner = renderOne(kind, attrs, ctx);
    out += html.slice(at, start);
    // An empty result removes the whole block, so a store never shows an empty "Bestsellers" shelf.
    out += inner ? `<div${attrs}>${inner}</div>` : "";
    at = end;
    OPEN.lastIndex = end;
  }
  return out + html.slice(at);
}

function pool(ctx: CommerceCtx): CommerceProduct[] {
  return ctx.products.length ? ctx.products : ctx.preview ? ctx.sample : [];
}

const priceOf = (p: CommerceProduct) => (p.hasVariants && p.fromPrice != null ? p.fromPrice : p.price);

export function pickProducts(list: CommerceProduct[], query: string, limit: number): CommerceProduct[] {
  const q = query.trim().toLowerCase();
  let picked = [...list];
  if (q === "bestsellers" || q === "featured" || q === "popular") {
    const anySales = picked.some((p) => (p.sold ?? 0) > 0);
    // Without real sales data, "bestsellers" honestly falls back to the newest, in-stock first.
    // Real sellers first (most sold on top); the shelf is then topped up with in-stock newest
    // items so one early sale never leaves a one-product "bestsellers" row.
    const inStockFirst = (a: CommerceProduct, b: CommerceProduct) => Number(b.stock > 0 || !!b.hasVariants) - Number(a.stock > 0 || !!a.hasVariants);
    picked = anySales
      ? [
          ...picked.filter((p) => (p.sold ?? 0) > 0).sort((a, b) => (b.sold ?? 0) - (a.sold ?? 0)),
          ...picked.filter((p) => !(p.sold ?? 0)).sort(inStockFirst),
        ]
      : picked.sort(inStockFirst);
  } else if (q === "in-stock") {
    picked = picked.filter((p) => p.stock > 0 || p.hasVariants);
  } else if (q.startsWith("category:")) {
    const c = catSlug(q.slice(9));
    picked = picked.filter((p) => catSlug(p.category) === c);
  } else if (q.startsWith("under:")) {
    const max = parseFloat(q.slice(6).replace(/[^\d.]/g, ""));
    picked = Number.isFinite(max) ? picked.filter((p) => priceOf(p) <= max).sort((a, b) => priceOf(a) - priceOf(b)) : [];
  }
  // "new" (and anything unknown) keeps the catalogue order, which is newest first.
  return picked.slice(0, Math.max(1, Math.min(24, limit)));
}

function renderOne(kind: string, attrs: string, ctx: CommerceCtx): string {
  const list = pool(ctx);
  if (!list.length) return "";
  const layout = (attr(attrs, "data-od-layout") || "").toLowerCase();

  if (kind === "products") {
    const q = attr(attrs, "data-od-products") || "new";
    const limit = parseInt(attr(attrs, "data-od-limit") || "8", 10) || 8;
    const picked = pickProducts(list, q, limit);
    if (!picked.length) return "";
    const cards = picked.map(ctx.card).join("");
    return layout === "grid"
      ? `<div class="od-cgrid">${cards}</div>`
      : `<div class="od-rail" role="list">${cards}</div>`;
  }

  if (kind === "collections") {
    const groups = new Map<string, CommerceProduct[]>();
    for (const p of list) {
      const c = (p.category || "").trim();
      if (!c) continue;
      groups.set(c, [...(groups.get(c) ?? []), p]);
    }
    if (groups.size < 2) return "";
    const items = [...groups.entries()].slice(0, 12).map(([name, ps]) => {
      const img = ps.find((p) => p.imageUrl)?.imageUrl;
      const href = `#page:${ctx.shopSlug}?cat=${encodeURIComponent(catSlug(name))}`;
      const pic = img
        ? `<img src="${ctx.escAttr(img)}" alt="${ctx.escAttr(name)}" loading="lazy">`
        : `<span class="od-coll-ph">${ctx.esc(name.slice(0, 1).toUpperCase())}</span>`;
      return `<a class="od-coll" href="${href}"><span class="od-coll-media">${pic}</span><span class="od-coll-name">${ctx.esc(name)}</span><span class="od-coll-count">${ps.length} ${ps.length === 1 ? "item" : "items"}</span></a>`;
    });
    return `<div class="od-colls od-colls--${layout === "tiles" ? "tiles" : "circles"}">${items.join("")}</div>`;
  }

  if (kind === "featured-product") {
    const want = (attr(attrs, "data-od-featured-product") || "bestseller").trim();
    // An exact id, or the product's name (what the section is about), else the newest / bestseller.
    const key = want.toLowerCase();
    const byName =
      key.length > 2 && !["bestseller", "bestsellers", "newest", "new", "featured"].includes(key)
        ? list.find((x) => x.name.toLowerCase() === key) ?? list.find((x) => x.name.toLowerCase().includes(key) || key.includes(x.name.toLowerCase()))
        : undefined;
    const p =
      list.find((x) => x.id === want) ??
      byName ??
      (key === "newest" || key === "new" ? list[0] : pickProducts(list, "bestsellers", 1)[0]);
    if (!p) return "";
    const price = p.hasVariants && p.fromPrice != null && (p.maxPrice ?? p.fromPrice) > p.fromPrice ? `From ${ctx.money(p.fromPrice)}` : ctx.money(priceOf(p));
    const desc = (p.description || "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 220);
    const link = ctx.preview ? `href="#" data-od-pblock="product"` : `href="#product:${ctx.escAttr(p.id)}"`;
    const soldOut = !p.hasVariants && p.stock <= 0;
    const buy = soldOut
      ? `<span class="od-pc-sold">Sold out</span>`
      : p.hasVariants
        ? `<a ${link} class="od-btn od-btn-primary" data-od-cta>Choose options</a>`
        : `<button type="button"${ctx.preview ? "" : ` data-od-buy="${ctx.escAttr(p.id)}"`} class="od-btn od-btn-primary" data-od-cta>Add to cart</button>`;
    const img = p.imageUrl ? `<img src="${ctx.escAttr(p.imageUrl)}" alt="${ctx.escAttr(p.name)}" loading="lazy">` : "";
    return `<div class="od-feat" data-od-product>
  <a ${link} class="od-feat-media od-pc-media">${img}</a>
  <div class="od-feat-body">
    <h3 class="od-feat-name">${ctx.esc(p.name)}</h3>
    <div class="od-feat-price">${price}</div>
    ${desc ? `<p class="od-feat-desc">${ctx.esc(desc)}${(p.description || "").length > 220 ? "…" : ""}</p>` : ""}
    <div class="od-feat-actions">${buy}<a ${link} class="od-feat-more">View product →</a></div>
  </div>
</div>`;
  }

  if (kind === "price-bands") {
    const prices = list.map(priceOf).filter((n) => n > 0).sort((a, b) => a - b);
    if (prices.length < 4) return "";
    const nice = (n: number) => {
      const mag = Math.pow(10, Math.max(0, Math.floor(Math.log10(n)) - 1));
      return Math.ceil(n / (mag * 5)) * mag * 5;
    };
    const cuts = [...new Set([0.34, 0.67].map((q) => nice(prices[Math.min(prices.length - 1, Math.floor(prices.length * q))])))].filter((c) => c < prices[prices.length - 1]);
    if (!cuts.length) return "";
    const bands: { label: string; qs: string; n: number }[] = [];
    let lo = 0;
    for (const c of cuts) {
      bands.push({ label: `Under ${ctx.money(c)}`, qs: `pmax=${c}${lo ? `&pmin=${lo}` : ""}`, n: prices.filter((p) => p <= c && p >= lo).length });
      lo = c;
    }
    bands.push({ label: `${ctx.money(lo)} and above`, qs: `pmin=${lo}`, n: prices.filter((p) => p >= lo).length });
    return `<div class="od-bands">${bands
      .filter((b) => b.n > 0)
      .map((b) => `<a class="od-band" href="#page:${ctx.shopSlug}?${b.qs}"><span class="od-band-label">${ctx.esc(b.label)}</span><span class="od-band-n">${b.n} ${b.n === 1 ? "item" : "items"}</span></a>`)
      .join("")}</div>`;
  }
  return "";
}

/** Styling for the blocks — token-driven, and it follows the store's shape language. */
export function commerceCss(scope: string): string {
  const S = scope;
  return `${S} .od-rail{display:grid;grid-auto-flow:column;grid-auto-columns:clamp(168px, calc((100% - 3 * var(--od-s5)) / 4), 300px);gap:var(--od-s5);overflow-x:auto;overscroll-behavior-x:contain;scroll-snap-type:x mandatory;padding-bottom:var(--od-s3);scrollbar-width:thin}
${S} .od-rail>*{scroll-snap-align:start}
@media (max-width:720px){${S} .od-rail{grid-auto-columns:62%}}
${S} .od-cgrid{display:grid;grid-template-columns:repeat(auto-fill,minmax(var(--od-pc-min,220px),1fr));gap:calc(28px*var(--od-density)) calc(24px*var(--od-density));align-items:start}
${S} .od-colls{display:grid;gap:var(--od-s5)}
${S} .od-colls--circles{grid-template-columns:repeat(auto-fill,minmax(110px,1fr));text-align:center}
${S} .od-colls--tiles{grid-template-columns:repeat(auto-fill,minmax(200px,1fr))}
${S} .od-coll{display:flex;flex-direction:column;align-items:center;gap:8px;text-decoration:none;color:var(--od-text)}
${S} .od-coll-media{display:block;width:100%;overflow:hidden;background:var(--od-surface);position:relative}
${S} .od-colls--circles .od-coll-media{aspect-ratio:1;border-radius:999px;max-width:132px;border:1px solid var(--od-border);transition:transform .25s var(--od-ease)}
${S} .od-colls--circles .od-coll:hover .od-coll-media{transform:scale(1.04)}
${S} .od-colls--tiles .od-coll{position:relative;align-items:flex-start}
${S} .od-colls--tiles .od-coll-media{aspect-ratio:4/5;border-radius:var(--od-radius)}
${S} .od-colls--tiles .od-coll-name{position:absolute;left:14px;bottom:30px;color:#fff;font-family:var(--od-font-heading);font-weight:var(--od-heading-weight);font-size:var(--od-text-xl);text-shadow:0 1px 12px rgba(0,0,0,.45)}
${S} .od-colls--tiles .od-coll-count{position:absolute;left:14px;bottom:12px;color:rgba(255,255,255,.85);font-size:12px}
${S} .od-colls--tiles .od-coll-media::after{content:"";position:absolute;inset:0;background:linear-gradient(to top,rgba(0,0,0,.55),rgba(0,0,0,0) 55%)}
${S} .od-coll-media img{width:100%;height:100%;object-fit:cover;display:block}
${S} .od-coll-ph{display:flex;align-items:center;justify-content:center;width:100%;height:100%;font-family:var(--od-font-heading);font-size:32px;color:var(--od-muted)}
${S} .od-coll-name{font-size:14px;font-weight:600}
${S} .od-coll-count{font-size:12px;color:var(--od-muted)}
${S} .od-feat{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,300px),1fr));gap:clamp(24px,5vw,64px);align-items:center}
${S} .od-feat .od-feat-media{display:block;height:auto;aspect-ratio:1;max-height:560px}
${S} .od-feat-media img{width:100%;height:100%;object-fit:cover;display:block}
${S} .od-feat-name{font-family:var(--od-font-heading);font-weight:var(--od-heading-weight);font-size:var(--od-text-4xl);line-height:1.08;margin:0;color:var(--od-text)}
${S} .od-feat-price{margin-top:var(--od-s3);font-size:var(--od-text-xl);color:var(--od-text)}
${S} .od-feat-desc{margin:var(--od-s4) 0 0;color:var(--od-muted);line-height:1.65;max-width:52ch}
${S} .od-feat-actions{display:flex;flex-wrap:wrap;align-items:center;gap:var(--od-s5);margin-top:var(--od-s6)}
${S} .od-feat-more{font-size:13px;letter-spacing:.06em;text-transform:uppercase;text-decoration:underline;text-underline-offset:5px;color:var(--od-text)}
${S} .od-bands{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:var(--od-s4)}
${S} .od-band{display:flex;flex-direction:column;gap:4px;padding:var(--od-s6) var(--od-s5);border:1px solid var(--od-border);border-radius:var(--od-radius-lg);background:var(--od-surface);text-decoration:none;color:var(--od-text);transition:border-color .2s,transform .2s var(--od-ease)}
${S} .od-band:hover{border-color:var(--od-text);transform:translateY(-2px)}
${S} .od-band-label{font-family:var(--od-font-heading);font-weight:var(--od-heading-weight);font-size:var(--od-text-xl)}
${S} .od-band-n{font-size:12px;color:var(--od-muted)}`;
}
