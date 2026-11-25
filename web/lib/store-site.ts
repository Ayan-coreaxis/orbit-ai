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
import { WIDGETS_CSS, WIDGETS_JS } from "@/lib/store-site-widgets";

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
  /** the header menu, in order: href is "#page:slug", "#product:id" or a web address */
  menu: MenuItem[];
  /** this store's own knobs, declared by the designer, changed by the seller without AI */
  settings: SiteSetting[];
  lists: SiteList[];
}
export interface MenuItem {
  label: string;
  href: string;
}
export interface SiteSetting {
  key: string;
  label: string;
  type: "text" | "number" | "select" | "color" | "toggle" | "image";
  value: string | number | boolean;
  min?: number;
  max?: number;
  options?: string[];
}
export interface SiteList {
  key: string;
  label: string;
  fields: { key: string; label: string; type: "text" | "textarea" | "image" | "link" }[];
  items: Record<string, string>[];
  min?: number;
  max?: number;
}

/** A change the seller made by clicking, kept apart from the design so a redesign can't lose it. */
export type SiteEdit =
  | { kind: "text"; page: string; from: string; to: string }
  | { kind: "image"; from: string; to: string }
  | { kind: "link"; page: string; from: string; text: string; to: string }
  | { kind: "hide"; page: string; from: string };

export function siteEdits(site: StoreSite): SiteEdit[] {
  try {
    const v = JSON.parse(site.files["edits.json"] ?? "[]") as SiteEdit[];
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

export interface SiteBuild {
  id: string;
  kind: "build" | "edit";
  status: "running" | "done" | "failed" | "stopped";
  log: string[];
  startedAt: string;
  beatAt: string;
  costUsd: number;
  /** what was asked, so an interrupted build can be continued */
  brief?: string;
  refs?: string[];
  stop?: boolean;
  summary?: string;
}

export const FILE_RE = /^(site\.(css|js|json)|pages\/[a-z0-9][a-z0-9-]{0,40}\.html)$/;
export const MAX_FILE = 200_000;
/** Screens the platform runs itself — a page file with one of these names would never be shown. */
export const RESERVED = ["order", "track"];
/** Pages every store has. The design is the store's own; the working part inside is ours. */
export const SYSTEM_PAGES: SitePage[] = [
  { slug: "cart", title: "Cart", nav: false },
  { slug: "checkout", title: "Checkout", nav: false },
  { slug: "login", title: "Login", nav: false },
  { slug: "account", title: "Account", nav: false },
  { slug: "thanks", title: "Thank you", nav: false },
];
export const isSystemPage = (slug: string) => SYSTEM_PAGES.some((p) => p.slug === slug);

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
    .filter((x): x is string => !!x && !isSystemPage(x));
  const listed = (Array.isArray(m.pages) ? m.pages : []).filter((p) => p && typeof p.slug === "string" && have.includes(p.slug));
  const pages: SitePage[] = [...new Map(listed.map((p) => [p.slug, { slug: p.slug, title: String(p.title || cap(p.slug)).slice(0, 60), nav: p.nav !== false && p.slug !== "product" }])).values()];
  for (const slug of have) if (!pages.some((p) => p.slug === slug)) pages.push({ slug, title: cap(slug), nav: slug !== "product" });
  pages.sort((a, b) => Number(b.slug === "home") - Number(a.slug === "home"));
  const slugs = new Set(pages.map((p) => p.slug));
  const href = (h: unknown): h is string => typeof h === "string" && (/^#page:([a-z0-9-]+)$/.test(h) ? slugs.has(h.slice(6)) : /^(#product:[A-Za-z0-9_-]+|https:\/\/|mailto:|tel:)/.test(h));
  const menu = (Array.isArray(m.menu) ? m.menu : [])
    .filter((x) => x && typeof x.label === "string" && href(x.href))
    .slice(0, 14)
    .map((x) => ({ label: x.label.slice(0, 40), href: x.href.slice(0, 300) }));
  const key = (k: unknown) => typeof k === "string" && /^[A-Za-z][A-Za-z0-9_]{0,40}$/.test(k);
  const settings = (Array.isArray(m.settings) ? m.settings : []).filter((x) => x && key(x.key) && typeof x.label === "string" && ["text", "number", "select", "color", "toggle", "image"].includes(x.type)).slice(0, 40);
  const lists = (Array.isArray(m.lists) ? m.lists : []).filter((x) => x && key(x.key) && typeof x.label === "string" && Array.isArray(x.fields) && Array.isArray(x.items)).slice(0, 20);
  return { pages, menu: menu.length ? menu : pages.filter((p) => p.nav).map((p) => ({ label: p.title, href: `#page:${p.slug}` })), settings, lists, theme: m.theme && typeof m.theme === "object" ? m.theme : {}, tagline: typeof m.tagline === "string" ? m.tagline.slice(0, 200) : undefined };
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
  /** the seller's uploaded photos, for the designer (never sent to the page) */
  media?: { url: string; name: string }[];
  /** the seller's own extra checkout questions */
  checkoutFields?: { key: string; label: string; type: string; required: boolean }[];
}
/** What a shopper sees of their own order on the thank-you page. */
export interface SiteOrder {
  id: string;
  number: string;
  status: string;
  firstName: string;
  phone: string;
  address: string;
  items: { productId?: string; name: string; variantLabel?: string | null; price: number; qty: number }[];
  subtotal: number;
  shipping: number;
  discount: number;
  tax: number;
  total: number;
  payment: string;
  tracking?: string;
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
const RUNTIME = String.raw`(function(){
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
 checkout:function(){O.go("checkout")}
};
if(!embedded&&O.seedCart)lines=O.products.filter(function(p){return p.stock>0}).slice(0,2).map(function(p){var l=line(p.id,p.variants[0]&&p.variants[0].id);l.qty=1;return l});
O.go=function(to,id){if(embedded)send({t:"go",to:to,id:id||null});else location.href="/"+(to==="order"?"thanks":to)+(id?"?product="+encodeURIComponent(id):"")};
function ask(t,data){if(!embedded)return Promise.resolve({ok:true});var n=++seq;return new Promise(function(r){waits[n]=r;send({t:t,n:n,data:data});setTimeout(function(){if(waits[n]){delete waits[n];r({ok:false,error:"No answer. Please try again."})}},20000)})}
O._ask=ask;
O.contact=function(d){return ask("contact",d)};
O.newsletter=function(email){return ask("newsletter",{email:email})};
var pick=false,hot=null;
addEventListener("message",function(e){if(e.source!==parent)return;var d=e.data||{};if(!d.__orbit)return;
 if(d.t==="cart"){lines=Array.isArray(d.lines)?d.lines:[];tell()}
 else if(d.t==="reply"&&waits[d.n]){waits[d.n](d.result);delete waits[d.n]}
 else if(d.t==="pick"){pick=!!d.on;document.documentElement.style.cursor=pick?"crosshair":"";if(!pick&&hot){hot.style.outline="";hot=null}}
});
addEventListener("mouseover",function(e){if(!pick)return;if(hot)hot.style.outline="";hot=e.target;hot.style.outline="2px solid #7c5cff"},true);
addEventListener("submit",function(e){if(pick){e.preventDefault();e.stopImmediatePropagation()}},true);
addEventListener("click",function(e){
 if(pick){e.preventDefault();e.stopImmediatePropagation();send(describe(e.target));return}
 var a=e.target.closest&&e.target.closest("a[href]");if(!a||e.defaultPrevented)return;var h=a.getAttribute("href")||"",m;
 if(m=/^#page:([a-z0-9-]+)/.exec(h)){e.preventDefault();O.go(m[1])}
 else if(m=/^#product:(.+)/.exec(h)){e.preventDefault();O.go("product",m[1])}
 else if(m=/^#order:(.+)/.exec(h)){e.preventDefault();O.go("order",m[1])}
 else if(m=/^#(cart|checkout|account|login)(?::([a-z]+))?$/.exec(h)){e.preventDefault();O.go(m[1],m[2])}
 else if(embedded&&/^(https?:|mailto:|tel:)/.test(h)){e.preventDefault();window.open(h,"_blank","noopener")}
 else if(embedded&&!/^#/.test(h)&&!/^javascript:/i.test(h)){e.preventDefault()}
},false);
/* ---- the seller's own click edits ---- */
var E=O.edits||[],orig=new WeakMap(),kept=new WeakMap();
var norm=function(t){return String(t||"").replace(/\s+/g," ").trim()};
function mine(x){return x.page==="*"||x.page===O.page.slug}
var TX=new Map(),HD=new Set(),LK=[];E.forEach(function(x){if(x.kind==="text"&&mine(x))TX.set(x.from,x.to);if(x.kind==="hide"&&mine(x))HD.add(x.from);if(x.kind==="link"&&mine(x))LK.push(x)});
function textNodes(el){var w=document.createTreeWalker(el,4),n,out=[];while(n=w.nextNode()){if(norm(n.nodeValue)&&!/^(SCRIPT|STYLE|NOSCRIPT)$/.test(n.parentNode.nodeName))out.push(n)}return out}
function fix(root){if(!root||root.nodeType!==1)return;
 if(TX.size||HD.size)textNodes(root).forEach(function(n){var f=norm(n.nodeValue);if(TX.has(f)&&!orig.has(n)){orig.set(n,f);n.nodeValue=n.nodeValue.replace(n.nodeValue.trim(),function(){return TX.get(f)})}if(HD.has(f))(n.parentElement.closest("a,button,li")||n.parentElement).style.setProperty("display","none","important")});
 if(HD.size)[].concat(root.matches("img")?[root]:[],[].slice.call(root.querySelectorAll("img"))).forEach(function(i){if(HD.has(i.getAttribute("src")))i.style.setProperty("display","none","important")});
 if(LK.length)[].concat(root.matches("a")?[root]:[],[].slice.call(root.querySelectorAll("a[href]"))).forEach(function(a){if(a.__lk)return;var t=norm(textNodes(a).map(function(n){return orig.get(n)||n.nodeValue}).join(" ")),x=LK.find(function(l){return l.from===a.getAttribute("href")&&l.text===t});if(x){a.__lk=x.from;a.setAttribute("href",x.to)}})
}
/* remembered before any animation library splits a heading into letters */
O._edits=function(){document.querySelectorAll("h1,h2,h3,h4,h5,h6,p,a,button,li,blockquote,figcaption,label").forEach(function(el){if(!kept.has(el))kept.set(el,textNodes(el).map(function(n){return{from:orig.get(n)||norm(n.nodeValue),now:norm(n.nodeValue)}}))});fix(document.body);
 document.querySelectorAll("h1,h2,h3,h4,h5,h6,p,a,button,li,blockquote,figcaption,label").forEach(function(el){kept.set(el,textNodes(el).map(function(n){return{from:orig.get(n)||norm(n.nodeValue),now:norm(n.nodeValue)}}))});
 new MutationObserver(function(ms){ms.forEach(function(m){m.addedNodes.forEach(function(n){if(n.nodeType===1)fix(n);else if(n.nodeType===3&&n.parentElement)fix(n.parentElement)})})}).observe(document.body,{childList:true,subtree:true})};
function describe(t){
 var s=t.closest("section,header,footer,main,[id]"),c=t.className,blk=t.closest("h1,h2,h3,h4,h5,h6,p,a,button,li,blockquote,figcaption,label"),list=null;
 var live=textNodes(t).map(function(n){return{from:orig.get(n)||norm(n.nodeValue),now:norm(n.nodeValue)}});
 if(blk&&kept.has(blk)&&live.some(function(x){return x.from.length<2})||!live.length&&blk)list=kept.get(blk)||live;else list=live;
 if(list.length>6)list=list.slice(0,6);
 var names={};O.products.forEach(function(p){names[norm(p.name)]=1;names[O.money(p.price)]=1;if(p.fromPrice)names[O.money(p.fromPrice)]=1});
 list=list.map(function(x){return{from:x.from.slice(0,600),now:x.now.slice(0,600),product:!!names[x.from]}});
 var im=t.tagName==="IMG"?t.getAttribute("src"):null,p=t,k=0;if(!im&&t.querySelectorAll){var one=t.querySelectorAll("img");if(one.length===1)im=one[0].getAttribute("src")}
 while(!im&&p&&p!==document.documentElement&&k++<4){var g=/url\(["']?((?:https?:\/\/|\/uploads\/)[^"')]+)/.exec(getComputedStyle(p).backgroundImage);if(g)im=g[1];else if(p!==t){var ci=p.querySelectorAll(":scope > img, :scope > picture > img");if(ci.length===1&&ci[0].getBoundingClientRect().width>120)im=ci[0].getAttribute("src")}p=p.parentElement}
 var a=t.closest("a[href]"),ph=im&&O.products.some(function(q){return q.images.indexOf(im)>=0});
 return{t:"picked",tag:t.tagName.toLowerCase(),cls:String(c&&c.baseVal!==undefined?c.baseVal:c||"").slice(0,80),text:(t.innerText||t.alt||"").trim().slice(0,120),where:s?(s.tagName.toLowerCase()+(s.id?"#"+s.id:"")+(s.classList[0]?"."+s.classList[0]:"")):"",texts:list,image:im&&/^(https?:\/\/|\/uploads\/)/.test(im)?im:null,imageIsProduct:!!ph,
  link:a?{href:a.getAttribute("href"),from:a.__lk||a.getAttribute("href"),text:norm(textNodes(a).map(function(n){return orig.get(n)||n.nodeValue}).join(" "))}:null};
}
addEventListener("DOMContentLoaded",function(){tell();if(embedded)send({t:"ready"})});
})();`;

export interface ComposeOpts {
  slug: string;
  productId?: string | null;
  order?: SiteOrder | null;
  data: SiteData;
  /** absolute origin the browser libraries and uploads are served from */
  origin: string;
  preview?: boolean;
  /** where uploaded media is served from, when it isn't `origin` */
  mediaOrigin?: string;
  /** where to go after signing in */
  next?: string | null;
  /** false after the first page of a visit — a splash plays once */
  firstVisit?: boolean;
  /** put two products in the bag (the automatic test) */
  seedCart?: boolean;
}

const widgetRe = (slug: string) => new RegExp(`data-orbit-widget=["']${slug}["']`);

/** The HTML of one page file. A cart / checkout / login / account / thank-you page that the store
 *  didn't design (or broke) is made from one of its own simple pages, so it always keeps the store's
 *  header, footer and look. */
export function pageSource(site: StoreSite, slug: string): string | null {
  const own = Object.hasOwn(site.files, `pages/${slug}.html`) ? site.files[`pages/${slug}.html`] : null;
  const sys = SYSTEM_PAGES.find((p) => p.slug === slug);
  if (!sys) return own;
  if (own && widgetRe(slug).test(own) && /<\/html>\s*$/i.test(own)) return own;
  const slugs = manifest(site).pages.map((p) => p.slug);
  const base = ["contact", ...slugs.filter((x) => x !== "home" && x !== "product" && x !== "shop"), "shop", "home"].find((x) => slugs.includes(x));
  const src = base ? site.files[`pages/${base}.html`] : null;
  if (!src) return null;
  const main = `<main class="ob-page"><h1>${sys.title}</h1><div data-orbit-widget="${slug}"></div></main>`;
  const titled = src.replace(/<title>[\s\S]*?<\/title>/i, () => `<title>${sys.title}</title>`);
  if (/<main\b/i.test(titled)) return titled.replace(/<main\b[\s\S]*<\/main>/i, () => main);
  const keep = (re: RegExp) => (titled.match(re) ?? []).join("");
  return titled.replace(/(<body[^>]*>)[\s\S]*<\/body>/i, (_m, open: string) => `${open}${keep(/<header\b[\s\S]*?<\/header>/gi)}${main}${keep(/<footer\b[\s\S]*?<\/footer>/gi)}${keep(/<script\b[^>]*src=["']\/?site\.js["'][^>]*>\s*<\/script>/gi)}</body>`);
}

const SAFE_CSS = /^[#A-Za-z0-9 ,.%()"'-]{1,60}$/;
function themeVars(t: Partial<SiteTheme>): string {
  const v = (x: unknown, or: string) => (typeof x === "string" && SAFE_CSS.test(x) ? x : or);
  return `:root{--ob-t-bg:${v(t.bg, "#fff")};--ob-t-surface:${v(t.surface, "#fff")};--ob-t-text:${v(t.text, "#111")};--ob-t-muted:${v(t.muted, "#666")};--ob-t-border:${v(t.border, "#ddd")};--ob-t-accent:${v(t.accent, "#111")};--ob-t-accent-text:${v(t.accentText, "#fff")};--ob-t-radius:${Math.max(0, Math.min(40, Number(t.radius) || 0))}px}`;
}

const IMG_URL = /^(https:\/\/|\/uploads\/)[^\s"'<>`\\]{3,500}$/;

/** One page as the complete HTML document that is served. Null when the page doesn't exist. */
export function composePage(site: StoreSite, o: ComposeOpts): string | null {
  const src = pageSource(site, o.slug);
  if (!src) return null;
  const m = manifest(site);
  const code = o.data.store.currency;
  const edits = siteEdits(site);
  const orbit = {
    store: o.data.store,
    currency: { code, prefix: money(0, code).replace(/[\d.,]+/g, ""), decimals: money(1.5, code).includes(".5") ? 2 : 0 },
    products: o.data.products,
    pages: m.pages,
    menu: m.menu,
    settings: Object.fromEntries(m.settings.map((x) => [x.key, x.value])),
    lists: Object.fromEntries(m.lists.map((x) => [x.key, x.items])),
    checkout: { fields: o.data.checkoutFields ?? [] },
    order: o.order ?? null,
    page: { slug: o.slug, productId: o.productId ?? null, next: o.next === "checkout" ? "checkout" : null },
    hasPage: Object.fromEntries(m.pages.map((p) => [p.slug, true])),
    preview: !!o.preview,
    firstVisit: o.firstVisit !== false && !isSystemPage(o.slug),
    seedCart: !!o.seedCart,
    edits: edits.filter((e) => e.kind !== "image"),
  };
  const imports = { three: `${o.origin}/vendor/three/three.module.js`, "three/addons/": `${o.origin}/vendor/three/addons/` };
  const sys = isSystemPage(o.slug);
  const head = `<meta http-equiv="Content-Security-Policy" content="${pageCsp(o.origin, o.mediaOrigin).join("; ")}"><script type="importmap">${scriptJson({ imports })}</script><style>${themeVars(m.theme)}${sys ? WIDGETS_CSS : ""}</style><script>window.ORBIT=${scriptJson(orbit)};${RUNTIME}${sys ? WIDGETS_JS : ""}</script>`;
  // replacement functions, never strings: the store's own code is full of "$&" and "$1"
  const css = (site.files["site.css"] ?? "").replace(/<\/style/gi, "<\\/style");
  const js = (site.files["site.js"] ?? "").replace(/<\/script/gi, "<\\/script");
  let html = src
    .replace(/<link\b[^>]*href=["']\/?site\.css["'][^>]*>/i, () => `<style>${css}</style>`)
    .replace(/<script\b[^>]*src=["']\/?site\.js["'][^>]*>\s*<\/script>/i, () => `<script>ORBIT._edits()</script><script type="module">${js}</script>`);
  if (!html.includes("ORBIT._edits()")) html = html.replace(/<\/body>/i, () => "<script>ORBIT._edits()</script></body>");
  // a swapped picture is replaced everywhere the design uses it (HTML, CSS background, 3D texture)
  for (const e of edits) if (e.kind === "image" && IMG_URL.test(e.from) && IMG_URL.test(e.to)) html = html.split(e.from).join(e.to).split(e.from.replace(/&/g, "&amp;")).join(e.to);
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
  const html = Object.entries(f).filter(([n]) => n.endsWith(".html")).map(([, b]) => b).join("\n");
  const css = f["site.css"] ?? "";
  const accents = (html.match(/<h[12][^>]*>[^<]{0,80}<(em|i)\b/gi) ?? []).length + (f["site.js"]?.match(/<h[12][^>]*>[^<]{0,80}<(em|i)\b/gi) ?? []).length;
  if (accents > 1) out.push(`AI-made look: ${accents} headings put one word in italics. Use plain headings.`);
  if (/-webkit-text-stroke/.test(css)) out.push("AI-made look: outlined text (-webkit-text-stroke). Remove it.");
  const eyebrows = (html.match(/class="[^"]*\b(eyebrow|kicker|overline)\b/gi) ?? []).length;
  if (eyebrows > 3) out.push(`AI-made look: ${eyebrows} small labels above headings. Keep two at most.`);
  for (const r of RESERVED) if (f[`pages/${r}.html`]) out.push(`pages/${r}.html is a platform address; use another name.`);
  for (const p of SYSTEM_PAGES) {
    const own = f[`pages/${p.slug}.html`];
    if (!own) out.push(`pages/${p.slug}.html is missing: design it in this store's style with <div data-orbit-widget="${p.slug}"></div> in <main>.`);
    else if (!widgetRe(p.slug).test(own)) out.push(`pages/${p.slug}.html has no <div data-orbit-widget="${p.slug}"></div>.`);
  }
  const all = Object.entries(f).filter(([n]) => n.endsWith(".html") || n === "site.js").map(([, b]) => b).join("\n");
  if (!/["'`]#account["'`]/.test(all)) out.push('The header has no login link (href="#account").');
  if (!/["'`]#cart["'`]|ORBIT\.cart\./.test(all)) out.push('The header has no bag / cart link (href="#cart").');
  if (f["site.js"] && !/\.menu\b/.test(all)) out.push("The header menu must be rendered from ORBIT.menu so the seller can edit it.");
  return [...new Set(out)];
}
