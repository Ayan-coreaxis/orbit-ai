/**
 * Agent-built store: a small website of plain files (shared stylesheet + script + one HTML file per
 * page, whichever pages the seller wants) that the store agent writes freely — any layout, motion or
 * 3D. The platform owns two things only: how the files are served (sandboxed, so the store's own
 * JavaScript can never reach a dashboard session) and `window.ORBIT`, the bridge to the real
 * catalogue, cart, checkout and forms.
 *
 * Pure module — no server imports (the studio and tests use it too).
 */
import { money } from "@/lib/money";

export interface SitePage {
  slug: string;
  title: string;
  /** shown in the platform's own header on the checkout / account screens */
  nav?: boolean;
}
export interface SiteTheme {
  bg: string;
  surface: string;
  text: string;
  muted: string;
  border: string;
  accent: string;
  accentText: string;
  radius: number;
  headingFont: string;
  bodyFont: string;
}
export interface StoreSite {
  files: Record<string, string>;
}
export interface SiteManifest {
  pages: SitePage[];
  theme: Partial<SiteTheme>;
  tagline?: string;
}

export interface SiteBuild {
  id: string;
  kind: "build" | "edit";
  status: "running" | "done" | "failed" | "stopped";
  log: string[];
  startedAt: string;
  beatAt: string;
  costUsd: number;
  stop?: boolean;
  summary?: string;
}

export const FILE_RE = /^(site\.(css|js|json)|pages\/[a-z0-9][a-z0-9-]{0,40}\.html)$/;
export const MAX_FILE = 200_000;
/** Screens the platform runs itself — a page file with one of these names would never be shown. */
export const RESERVED = ["cart", "checkout", "account", "order", "track", "login"];

export function parseSite(raw: string | null | undefined): StoreSite | null {
  if (!raw) return null;
  try {
    const s = JSON.parse(raw) as StoreSite;
    return s && s.files && typeof s.files === "object" ? s : null;
  } catch {
    return null;
  }
}

/** The builder new stores get. ORBIT_STORE_BUILDER=site-craft | classic goes back to an older one. */
export function agentBuilderOn(): boolean {
  return (process.env.ORBIT_STORE_BUILDER || "agent").toLowerCase() === "agent";
}

export function parseBuild(raw: string | null | undefined): SiteBuild | null {
  try {
    return raw ? (JSON.parse(raw) as SiteBuild) : null;
  } catch {
    return null;
  }
}

/** No heartbeat for this long = the server restarted under it. */
export const BUILD_STALE_MS = 10 * 60_000;
export function buildRunning(b: SiteBuild | null, now = Date.now()): boolean {
  return !!b && b.status === "running" && now - new Date(b.beatAt).getTime() < BUILD_STALE_MS;
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1).replace(/-/g, " ");

/** The manifest, repaired: every page file is listed, nothing listed is missing. Home first. */
export function manifest(site: StoreSite): SiteManifest {
  let m: Partial<SiteManifest> = {};
  try {
    m = JSON.parse(site.files["site.json"] ?? "{}") as Partial<SiteManifest>;
  } catch {
    /* repaired below */
  }
  const have = Object.keys(site.files)
    .map((f) => /^pages\/(.+)\.html$/.exec(f)?.[1])
    .filter((x): x is string => !!x);
  const listed = (Array.isArray(m.pages) ? m.pages : []).filter((p) => p && typeof p.slug === "string" && have.includes(p.slug));
  const pages: SitePage[] = [...new Map(listed.map((p) => [p.slug, { slug: p.slug, title: String(p.title || cap(p.slug)).slice(0, 60), nav: p.nav !== false && p.slug !== "product" }])).values()];
  for (const slug of have) if (!pages.some((p) => p.slug === slug)) pages.push({ slug, title: cap(slug), nav: slug !== "product" });
  pages.sort((a, b) => Number(b.slug === "home") - Number(a.slug === "home"));
  return { pages, theme: m.theme && typeof m.theme === "object" ? m.theme : {}, tagline: typeof m.tagline === "string" ? m.tagline.slice(0, 200) : undefined };
}

export interface SiteProduct {
  id: string;
  name: string;
  price: number;
  fromPrice?: number;
  image: string | null;
  images: string[];
  /** sanitized HTML */
  description: string;
  category: string | null;
  stock: number;
  options: { name: string; values: string[] }[];
  variants: { id: string; label: string; options: Record<string, string>; price: number; stock: number; image: string | null }[];
  sold?: number;
  rating?: { average: number; count: number };
  reviews?: { rating: number; body?: string; name?: string; date?: string }[];
}
export interface SiteData {
  store: { id: string; name: string; currency: string; email: string; phone: string; address: string; socials: Record<string, string>; announcement: string };
  products: SiteProduct[];
}
export interface SiteLine {
  key: string;
  productId: string;
  variantId: string | null;
  variantLabel: string | null;
  name: string;
  price: number;
  qty: number;
  image: string | null;
}

/** JSON safe to sit inside a <script>. */
const scriptJson = (v: unknown) => JSON.stringify(v).replace(/</g, "\\u003c");

/** Price for a chosen variant, or null when the choice isn't a real one. */
export function priceLine(products: SiteProduct[], productId: unknown, variantId: unknown): Omit<SiteLine, "qty"> | null {
  const p = products.find((x) => x.id === productId);
  if (!p) return null;
  if (p.variants.length) {
    const v = p.variants.find((x) => x.id === variantId);
    return v ? { key: `${p.id}::${v.id}`, productId: p.id, variantId: v.id, variantLabel: v.label, name: p.name, price: v.price, image: v.image ?? p.image } : null;
  }
  return { key: `${p.id}::`, productId: p.id, variantId: null, variantLabel: null, name: p.name, price: p.price, image: p.image };
}

/**
 * window.ORBIT. Inside Orbit it talks to the page around it (which owns the cart and the network);
 * opened on its own (the agent's screenshots) it keeps a cart in memory.
 */
const RUNTIME = `(function(){
var O=window.ORBIT, embedded=parent!==window, lines=[], subs=[], seq=0, waits={};
function send(m){m.__orbit=1;parent.postMessage(m,"*")}
function count(){return lines.reduce(function(s,l){return s+l.qty},0)}
function tell(){document.querySelectorAll("[data-cart-count]").forEach(function(e){e.textContent=count()});subs.forEach(function(f){try{f(lines.slice())}catch(e){console.error(e)}})}
O.money=function(n){n=Number(n)||0;var c=O.currency;return c.prefix+n.toLocaleString("en-US",{minimumFractionDigits:c.decimals,maximumFractionDigits:c.decimals})};
O.product=function(id){return O.products.find(function(p){return p.id===id})||null};
function line(id,vid){var p=O.product(id);if(!p)return null;if(p.variants.length){var v=p.variants.find(function(x){return x.id===vid});if(!v)return null;return{key:p.id+"::"+v.id,productId:p.id,variantId:v.id,variantLabel:v.label,name:p.name,price:v.price,image:v.image||p.image}}return{key:p.id+"::",productId:p.id,variantId:null,variantLabel:null,name:p.name,price:p.price,image:p.image}}
O.cart={
 lines:function(){return lines.slice()},count:count,total:function(){return lines.reduce(function(s,l){return s+l.price*l.qty},0)},
 add:function(id,opts){opts=opts||{};var l=line(id,opts.variantId);if(!l)return false;var q=Math.max(1,Math.min(99,opts.qty|0||1));
  if(embedded)send({t:"add",productId:id,variantId:l.variantId,qty:q});
  else{var e=lines.find(function(x){return x.key===l.key});if(e)e.qty+=q;else{l.qty=q;lines.push(l)}tell()}
  return true},
 setQty:function(key,q){q=Math.max(0,Math.min(99,q|0));if(embedded)send({t:"qty",key:key,qty:q});else{lines=lines.map(function(l){return l.key===key?Object.assign({},l,{qty:q}):l}).filter(function(l){return l.qty>0});tell()}},
 remove:function(key){O.cart.setQty(key,0)},
 onChange:function(f){subs.push(f);try{f(lines.slice())}catch(e){console.error(e)}},
 checkout:function(){if(embedded)send({t:"go",to:"cart"})}
};
O.go=function(to,id){if(embedded)send({t:"go",to:to,id:id||null});else location.href="/"+to+(id?"?product="+encodeURIComponent(id):"")};
function ask(t,data){if(!embedded)return Promise.resolve({ok:true});var n=++seq;return new Promise(function(r){waits[n]=r;send({t:t,n:n,data:data});setTimeout(function(){if(waits[n]){delete waits[n];r({ok:false,error:"No answer. Please try again."})}},20000)})}
O.contact=function(d){return ask("contact",d)};
O.newsletter=function(email){return ask("newsletter",{email:email})};
var pick=false,hot=null;
addEventListener("message",function(e){if(e.source!==parent)return;var d=e.data||{};if(!d.__orbit)return;
 if(d.t==="cart"){lines=Array.isArray(d.lines)?d.lines:[];tell()}
 else if(d.t==="reply"&&waits[d.n]){waits[d.n](d.result);delete waits[d.n]}
 else if(d.t==="pick"){pick=!!d.on;document.documentElement.style.cursor=pick?"crosshair":"";if(!pick&&hot){hot.style.outline="";hot=null}}
});
addEventListener("mouseover",function(e){if(!pick)return;if(hot)hot.style.outline="";hot=e.target;hot.style.outline="2px solid #7c5cff"},true);
addEventListener("click",function(e){
 if(pick){e.preventDefault();e.stopImmediatePropagation();var t=e.target,s=t.closest("section,header,footer,main,[id]"),c=t.className;
  send({t:"picked",tag:t.tagName.toLowerCase(),cls:String(c&&c.baseVal!==undefined?c.baseVal:c||"").slice(0,80),text:(t.innerText||t.alt||"").trim().slice(0,120),where:s?(s.tagName.toLowerCase()+(s.id?"#"+s.id:"")+(s.classList[0]?"."+s.classList[0]:"")):""});return}
 var a=e.target.closest&&e.target.closest("a[href]");if(!a||e.defaultPrevented)return;var h=a.getAttribute("href")||"",m;
 if(m=/^#page:([a-z0-9-]+)/.exec(h)){e.preventDefault();O.go(m[1])}
 else if(m=/^#product:(.+)/.exec(h)){e.preventDefault();O.go("product",m[1])}
 else if(/^#(cart|checkout)$/.test(h)){e.preventDefault();O.cart.checkout()}
 else if(h==="#account"){e.preventDefault();O.go("account")}
 else if(embedded&&/^(https?:|mailto:|tel:)/.test(h)){e.preventDefault();window.open(h,"_blank","noopener")}
 else if(embedded&&!/^#/.test(h)&&!/^javascript:/i.test(h)){e.preventDefault()}
},false);
addEventListener("DOMContentLoaded",function(){tell();if(embedded)send({t:"ready"})});
})();`;

export interface ComposeOpts {
  slug: string;
  productId?: string | null;
  data: SiteData;
  /** absolute origin the browser libraries and uploads are served from */
  origin: string;
  preview?: boolean;
  /** where uploaded media is served from, when it isn't `origin` */
  mediaOrigin?: string;
  /** false after the first page of a visit — a splash plays once */
  firstVisit?: boolean;
}

/** One page as the complete HTML document that is served. Null when the page doesn't exist. */
export function composePage(site: StoreSite, o: ComposeOpts): string | null {
  const src = Object.hasOwn(site.files, `pages/${o.slug}.html`) ? site.files[`pages/${o.slug}.html`] : null;
  if (!src) return null;
  const m = manifest(site);
  const code = o.data.store.currency;
  const orbit = {
    store: o.data.store,
    currency: { code, prefix: money(0, code).replace(/[\d.,]+/g, ""), decimals: money(1.5, code).includes(".5") ? 2 : 0 },
    products: o.data.products,
    pages: m.pages,
    page: { slug: o.slug, productId: o.productId ?? null },
    hasPage: Object.fromEntries(m.pages.map((p) => [p.slug, true])),
    preview: !!o.preview,
    firstVisit: o.firstVisit !== false,
  };
  const imports = { three: `${o.origin}/vendor/three/three.module.js`, "three/addons/": `${o.origin}/vendor/three/addons/` };
  const head = `<meta http-equiv="Content-Security-Policy" content="${pageCsp(o.origin, o.mediaOrigin).join("; ")}"><script type="importmap">${scriptJson({ imports })}</script><script>window.ORBIT=${scriptJson(orbit)};${RUNTIME}</script>`;
  // replacement functions, never strings: the store's own code is full of "$&" and "$1"
  const css = (site.files["site.css"] ?? "").replace(/<\/style/gi, "<\\/style");
  const js = (site.files["site.js"] ?? "").replace(/<\/script/gi, "<\\/script");
  let html = src
    .replace(/<link\b[^>]*href=["']\/?site\.css["'][^>]*>/i, () => `<style>${css}</style>`)
    .replace(/<script\b[^>]*src=["']\/?site\.js["'][^>]*>\s*<\/script>/i, () => `<script type="module">${js}</script>`);
  if (!/<meta[^>]+name=["']viewport/i.test(html)) html = html.replace(/<head[^>]*>/i, (h) => `${h}<meta name="viewport" content="width=device-width,initial-scale=1">`);
  return html.replace(/<head[^>]*>/i, (h) => `${h}<meta charset="utf-8">${head}`);
}

/** What a store page may load. Also written into the page itself, because Orbit shows it as srcdoc. */
function pageCsp(origin: string, mediaOrigin = ""): string[] {
  const own = [origin, mediaOrigin].filter(Boolean).join(" ");
  return [
    "default-src 'none'",
    `script-src 'unsafe-inline' 'wasm-unsafe-eval' blob: ${origin}/vendor/`,
    "worker-src blob:",
    "style-src 'unsafe-inline' https://fonts.googleapis.com",
    "font-src https://fonts.gstatic.com data:",
    `img-src data: blob: https: ${own}`,
    `media-src data: blob: https: ${own}`,
    `connect-src data: blob: ${origin}/vendor/ ${origin}/uploads/ ${mediaOrigin}`.trim(),
    "form-action 'none'",
    "base-uri 'none'",
  ];
}

/** Headers for a served store page: an opaque origin even if somebody opens the URL directly. */
export function siteHeaders(origin: string, mediaOrigin = ""): Record<string, string> {
  return {
    "Content-Type": "text/html; charset=utf-8",
    "Cache-Control": "no-store",
    "X-Robots-Tag": "noindex",
    "Content-Security-Policy": ["sandbox allow-scripts allow-popups allow-popups-to-escape-sandbox allow-forms", ...pageCsp(origin, mediaOrigin), "frame-ancestors 'self'"].join("; "),
  };
}

/** Problems that can be found without a browser. */
export function lintSite(site: StoreSite, productIds: string[] = []): string[] {
  const out: string[] = [];
  const f = site.files;
  const slugs = new Set(manifest(site).pages.map((p) => p.slug));
  if (!f["pages/home.html"]) out.push("pages/home.html is missing.");
  if (!f["site.css"]) out.push("site.css is missing.");
  try {
    const raw = JSON.parse(f["site.json"] ?? "") as Partial<SiteManifest>;
    if (!raw.theme?.bg || !raw.theme?.accent) out.push("site.json has no theme (bg, text, accent …); the checkout screen uses it.");
    for (const p of raw.pages ?? []) if (!slugs.has(p.slug)) out.push(`site.json lists "${p.slug}" but pages/${p.slug}.html doesn't exist.`);
  } catch {
    out.push("site.json is missing or not valid JSON.");
  }
  for (const [name, body] of Object.entries(f)) {
    if (!name.endsWith(".html") && name !== "site.js") continue;
    if (name.endsWith(".html")) {
      if (!/<\/html>\s*$/i.test(body)) out.push(`${name} is cut off (no closing </html>).`);
      if (f["site.css"] && !/<link\b[^>]*href=["']\/?site\.css/i.test(body)) out.push(`${name} doesn't link site.css.`);
      if (f["site.js"] && !/<script\b[^>]*src=["']\/?site\.js/i.test(body)) out.push(`${name} doesn't load site.js.`);
    }
    for (const x of body.matchAll(/["'`]#page:([a-z0-9-]+)["'`]/g)) if (!slugs.has(x[1])) out.push(`${name} links to #page:${x[1]}, which doesn't exist.`);
    for (const x of body.matchAll(/["']#product:([A-Za-z0-9]+)["']/g)) if (productIds.length && !productIds.includes(x[1])) out.push(`${name} links to a product that doesn't exist (${x[1]}).`);
    for (const x of body.matchAll(/<script\b[^>]*src=["'](https?:[^"']+)/gi)) out.push(`${name} loads a script from ${x[1].slice(0, 60)}; only /vendor/ libraries are allowed.`);
    if (/\b(localStorage|sessionStorage|document\.cookie)\b/.test(body)) out.push(`${name} uses browser storage, which is blocked; use ORBIT.cart / ORBIT.firstVisit.`);
  }
  for (const r of RESERVED) if (f[`pages/${r}.html`]) out.push(`pages/${r}.html: the platform runs its own ${r} screen. Remove it and link to #cart / #account.`);
  return [...new Set(out)];
}
