import { sanitizeHtml } from "@/lib/sanitize-html";
import { money } from "@/lib/money";
import { renderBlock, isOrbitKind } from "@/lib/orbit-sections";
import { defaultSpec, slugify as specSlugify, type StoreBackendSpec } from "@/lib/orbit-backend-spec";

/**
 * Orbit Design — the data model and renderer for a seller's whole storefront.
 *
 * A storefront is one `OrbitDesignDoc`:
 *   - `tokens`   — design tokens (colour, type, radius, spacing) surfaced as CSS custom properties
 *   - `components` — the shared announcement bar / header / footer, rendered on every page
 *   - `pages`    — an ordered list; the first (or the one slugged "home") is the storefront root,
 *                  the rest are reachable at /store/:id/p/:slug
 *
 * Each section and component is a self-contained block of inline-styled HTML the model wrote, so
 * the live studio preview and the real /store page render byte-identically from the same pure
 * function here — no framework, no Tailwind, nothing that can drift between the two.
 *
 * Everything styles itself through `var(--od-*)` tokens, so the adjustment knobs can retune the
 * entire store instantly without regenerating any HTML.
 */

export interface DesignTokens {
  accent: string; // primary brand / CTA colour
  accentText: string; // text that sits on top of `accent`
  bg: string; // page background
  surface: string; // cards, headers, footers
  text: string; // primary text
  muted: string; // secondary text
  border: string; // hairlines
  fontHeading: string; // CSS font-family stack
  fontBody: string; // CSS font-family stack
  googleFonts: string[]; // family names to load from Google Fonts
  radius: number; // px, 0–32
  density: number; // spacing multiplier, 0.7–1.6
  headingWeight: number; // 400–900
  /** named brand colours beyond the accent — e.g. [{name:"sage",value:"#b2c691"}]. Emitted as
   * --od-<name> and usable by any section for a rich multi-hue palette. */
  palette?: { name: string; value: string }[];
}

/** kebab-slug a palette colour name; drops anything unsafe for a CSS custom-property name. */
export function paletteSlug(name: string): string {
  return String(name).toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 24);
}

export function normalizePalette(raw: unknown): { name: string; value: string }[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const out: { name: string; value: string }[] = [];
  for (const p of raw) {
    const name = paletteSlug((p as { name?: string })?.name ?? "");
    const value = cssColor((p as { value?: string })?.value ?? "");
    if (!name || !/^#|^rgb|^hsl/i.test(value) || seen.has(name)) continue;
    seen.add(name);
    out.push({ name, value });
    if (out.length >= 8) break;
  }
  return out;
}

export type SectionType =
  | "hero"
  | "marquee"
  | "featured"
  | "product-grid"
  | "rich-text"
  | "gallery"
  | "newsletter"
  | "contact"
  | "custom";

export interface DesignSection {
  id: string;
  type: SectionType;
  label: string; // shown in the studio's section list
  html: string; // legacy: self-contained inline-styled HTML. Empty when `block` is set.
  block?: import("./orbit-sections").OrbitBlock; // preferred: a curated section component + props
  visible: boolean;
}

/** The semantic role of a page. The 8 core types come pre-wired; "custom" is a seller-made page. */
export type PageType =
  | "home"
  | "store"
  | "about"
  | "contact"
  | "cart"
  | "checkout"
  | "product"
  | "account"
  | "login"
  | "custom";

/** When the page's link shows in the auto nav. "afterLogin" = only once a customer is signed in. */
export type NavShow = "always" | "afterLogin" | "never";

export interface DesignPage {
  slug: string; // "home" is the root; product/cart/account/login are built-in functional pages; others live at /p/<slug>
  title: string;
  nav: boolean; // include in the auto-generated header nav (kept in sync with navShow)
  pageType?: PageType; // semantic role — set by the generator / inferred on migration
  navShow?: NavShow; // nav-visibility rule; when unset, falls back to the `nav` boolean
  /** true once the seller has hand-set navShow / hidden this page — the generator must not override it */
  navLocked?: boolean;
  sections: DesignSection[];
}

/** Infer a page's semantic type from its slug (migration for docs built before pageType existed). */
export function inferPageType(slug: string): PageType {
  if (slug === "home") return "home";
  if (slug === PRODUCT_PAGE) return "product";
  if (slug === CART_PAGE) return "cart";
  if (slug === ACCOUNT_PAGE) return "account";
  if (slug === LOGIN_PAGE) return "login";
  if (/^(shop|store|catalog(ue)?|products?|collections?|all|browse)$/.test(slug)) return "store";
  if (/^(about|about-us|our-story|story|the-story)$/.test(slug)) return "about";
  if (/^(contact|contact-us|get-in-touch|support)$/.test(slug)) return "contact";
  if (/^(checkout|check-out)$/.test(slug)) return "checkout";
  return "custom";
}

/** Default nav-visibility for a page type when the seller hasn't set one. */
export function defaultNavShow(pageType: PageType): NavShow {
  if (pageType === "account") return "afterLogin";
  // home is reached via the logo; login/checkout/cart/product are icons or flow steps
  if (["home", "login", "checkout", "cart", "product"].includes(pageType)) return "never";
  return "always";
}

export interface DesignComponents {
  header: string; // may contain the marker <!--OD_NAV--> which is replaced with real nav links
  footer: string;
}

/**
 * Structured content the seller edits directly (no AI) from the studio's Content panel, and that
 * the design references through {{...}} tokens so it stays in sync everywhere it appears.
 */
export interface DesignContent {
  announcement: { enabled: boolean; text: string };
  /** a brand logo image URL — when set it replaces the text wordmark in the header */
  logoUrl: string;
  contactEmail: string;
  contactPhone: string;
  contactAddress: string;
  socials: { instagram: string; tiktok: string; facebook: string; x: string; youtube: string };
}

/**
 * An AI-authored adjustment control, bound to a CSS custom property the model wired into the
 * design (`var(--tw-<key>, <fallback>)`). Changing it just re-emits that property — like a token,
 * but bespoke to this design. See Claude Design's "Tweaks".
 */
export interface DesignTweak {
  key: string; // kebab, unique
  label: string;
  type: "slider" | "select" | "color";
  cssVar: string; // "--tw-hero-img-h"
  value: string; // current value, e.g. "400px" / "#111" / "row"
  min?: number;
  max?: number;
  step?: number;
  unit?: string; // slider unit, e.g. "px"
  options?: { label: string; value: string }[]; // select
}

export interface OrbitDesignDoc {
  version: number;
  storeName: string;
  tagline: string;
  tokens: DesignTokens;
  content: DesignContent;
  components: DesignComponents;
  pages: DesignPage[];
  tweaks?: DesignTweak[];
  /** page-shell motion the generator opts into per brand */
  motion?: { preloader?: boolean };
}

export interface StorefrontProduct {
  id: string;
  name: string;
  /** the product's category name, for the shop-page filter pills */
  category?: string | null;
  price: number;
  imageUrl: string | null;
  description: string | null;
  stock: number;
  /** true when the product has option axes — the grid links to the product page to pick them */
  hasVariants?: boolean;
  /** lowest variant price, for a "from Rs X" grid label */
  fromPrice?: number;
  /** highest variant price — when it differs from fromPrice the grid says "From" */
  maxPrice?: number;
  /** option name → its values (e.g. { Size: ["S","M","L"], Colour: ["Black"] }) — powers the shop attribute filters */
  options?: Record<string, string[]>;
}

// ---------------------------------------------------------------------------
// Font pairings (a curated subset of the ui-ux-pro-max set, all Google Fonts)
// ---------------------------------------------------------------------------

export const FONT_PAIRS: { id: string; label: string; heading: string; body: string; families: string[] }[] = [
  { id: "jakarta", label: "Plus Jakarta Sans — clean & friendly", heading: "'Plus Jakarta Sans', sans-serif", body: "'Plus Jakarta Sans', sans-serif", families: ["Plus Jakarta Sans"] },
  { id: "fraunces", label: "Fraunces + Inter — editorial", heading: "'Fraunces', Georgia, serif", body: "'Inter', sans-serif", families: ["Fraunces", "Inter"] },
  { id: "playfair", label: "Playfair Display + Inter — luxe", heading: "'Playfair Display', Georgia, serif", body: "'Inter', sans-serif", families: ["Playfair Display", "Inter"] },
  { id: "space", label: "Space Grotesk + Inter — modern tech", heading: "'Space Grotesk', sans-serif", body: "'Inter', sans-serif", families: ["Space Grotesk", "Inter"] },
  { id: "dmserif", label: "DM Serif Display + DM Sans — warm retail", heading: "'DM Serif Display', Georgia, serif", body: "'DM Sans', sans-serif", families: ["DM Serif Display", "DM Sans"] },
  { id: "archivo", label: "Archivo — bold & confident", heading: "'Archivo', sans-serif", body: "'Archivo', sans-serif", families: ["Archivo"] },
  { id: "libre-caslon", label: "Libre Caslon Display + Public Sans — literary", heading: "'Libre Caslon Display', Georgia, serif", body: "'Public Sans', sans-serif", families: ["Libre Caslon Display", "Public Sans"] },
  { id: "bricolage", label: "Bricolage Grotesque — quirky editorial", heading: "'Bricolage Grotesque', sans-serif", body: "'Bricolage Grotesque', sans-serif", families: ["Bricolage Grotesque"] },
  { id: "spectral", label: "Spectral + Work Sans — calm & bookish", heading: "'Spectral', Georgia, serif", body: "'Work Sans', sans-serif", families: ["Spectral", "Work Sans"] },
  { id: "syne", label: "Syne + Manrope — contemporary art", heading: "'Syne', sans-serif", body: "'Manrope', sans-serif", families: ["Syne", "Manrope"] },
  { id: "instrument", label: "Instrument Serif + Geist — modern luxe", heading: "'Instrument Serif', Georgia, serif", body: "'Geist', sans-serif", families: ["Instrument Serif", "Geist"] },
  { id: "unbounded", label: "Unbounded + Inter Tight — loud display", heading: "'Unbounded', sans-serif", body: "'Inter Tight', sans-serif", families: ["Unbounded", "Inter Tight"] },
  { id: "sohne-ish", label: "Familjen Grotesk + Newsreader — quiet Swiss", heading: "'Familjen Grotesk', sans-serif", body: "'Newsreader', Georgia, serif", families: ["Familjen Grotesk", "Newsreader"] },
];

// ---------------------------------------------------------------------------
// Default document
// ---------------------------------------------------------------------------

export function defaultTokens(): DesignTokens {
  return {
    accent: "#2563eb",
    accentText: "#ffffff",
    bg: "#ffffff",
    surface: "#f8fafc",
    text: "#0f172a",
    muted: "#64748b",
    border: "#e2e8f0",
    fontHeading: "'Plus Jakarta Sans', sans-serif",
    fontBody: "'Plus Jakarta Sans', sans-serif",
    googleFonts: ["Plus Jakarta Sans"],
    radius: 14,
    density: 1,
    headingWeight: 700,
  };
}

/** The built-in functional pages. Sellers/AI design their frame freely; the {{product}}/{{cart}}
 * marker is where the platform injects the real working widget. */
export const PRODUCT_PAGE = "product";
export const CART_PAGE = "cart";
export const ACCOUNT_PAGE = "account";
export const LOGIN_PAGE = "login";
export const FUNCTIONAL_PAGES = [PRODUCT_PAGE, CART_PAGE, ACCOUNT_PAGE, LOGIN_PAGE];

/** Functional pages that live at a dedicated route instead of /p/<slug>. */
export const FUNCTIONAL_ROUTES: Record<string, string> = {
  [CART_PAGE]: "/cart",
  [ACCOUNT_PAGE]: "/account",
  [LOGIN_PAGE]: "/account/login",
};
/** The widget marker each functional page carries so the renderer mounts its working part. */
const FUNCTIONAL_MARKERS: Record<string, string> = {
  [PRODUCT_PAGE]: "{{product}}",
  [CART_PAGE]: "{{cart}}",
  [ACCOUNT_PAGE]: "{{account}}",
  [LOGIN_PAGE]: "{{auth}}",
};

export function defaultContent(): DesignContent {
  return {
    // Off by default: a promise like "free delivery over X" must come from the seller's real settings, never a template.
    announcement: { enabled: false, text: "" },
    logoUrl: "",
    contactEmail: "",
    contactPhone: "",
    contactAddress: "",
    socials: { instagram: "", tiktok: "", facebook: "", x: "", youtube: "" },
  };
}

export function defaultComponents(storeName: string, niche: string): DesignComponents {
  return {
    header: `<header style="display:flex;align-items:center;justify-content:space-between;padding:calc(18px*var(--od-density)) var(--od-gutter);border-bottom:1px solid var(--od-border);background:var(--od-bg);position:sticky;top:0;z-index:20">
  <a href="#page:home" style="font-family:var(--od-font-heading);font-weight:var(--od-heading-weight);font-size:20px;color:var(--od-text);text-decoration:none">${escapeHtml(storeName)}</a>
  <nav style="display:flex;gap:22px;font-size:14px;align-items:center">
    <!--OD_NAV-->
    <a href="#cart" style="color:var(--od-muted);text-decoration:none">Cart</a>
  </nav>
</header>`,
    footer: `<footer style="padding:calc(56px*var(--od-density)) var(--od-gutter);background:var(--od-surface);border-top:1px solid var(--od-border);text-align:center;color:var(--od-muted);font-size:14px">
  <div style="font-family:var(--od-font-heading);font-weight:var(--od-heading-weight);color:var(--od-text);font-size:18px">${escapeHtml(storeName)}</div>
  <p style="margin:10px 0 0">${escapeHtml(niche)}</p>
</footer>`,
  };
}

function defaultFunctionalPages(): DesignPage[] {
  const pageShell = (title: string, marker: string, maxW: number, pad = 48) =>
    `<section style="padding:calc(${pad}px*var(--od-density)) var(--od-gutter)"><div style="max-width:${maxW}px;margin:0 auto">
  <h1 style="font-family:var(--od-font-heading);font-weight:var(--od-heading-weight);font-size:clamp(26px,4vw,34px);color:var(--od-text);margin:0 0 20px">${escapeHtml(title)}</h1>
  ${marker}
</div></section>`;
  return [
    {
      slug: PRODUCT_PAGE,
      title: "Product page",
      nav: true,
      sections: [
        {
          id: "product-main",
          type: "custom",
          label: "Product details",
          visible: true,
          html: `<section style="padding:calc(48px*var(--od-density)) var(--od-gutter)"><div style="max-width:1100px;margin:0 auto">{{product}}</div></section>`,
        },
      ],
    },
    {
      slug: CART_PAGE,
      title: "Cart & checkout",
      nav: true,
      sections: [
        { id: "cart-main", type: "custom", label: "Cart & checkout", visible: true, html: pageShell("Your cart", "{{cart}}", 900, 40) },
      ],
    },
    {
      slug: ACCOUNT_PAGE,
      title: "My account",
      nav: true,
      sections: [{ id: "account-main", type: "custom", label: "Account", visible: true, html: pageShell("My account", "{{account}}", 920) }],
    },
    {
      slug: LOGIN_PAGE,
      title: "Sign in",
      nav: false,
      sections: [
        {
          id: "login-main",
          type: "custom",
          label: "Sign in",
          visible: true,
          html: `<section style="padding:calc(64px*var(--od-density)) var(--od-gutter)"><div style="max-width:420px;margin:0 auto">{{auth}}</div></section>`,
        },
      ],
    },
  ];
}

export function defaultDoc(storeName: string, niche: string): OrbitDesignDoc {
  return {
    version: 1,
    storeName,
    tagline: niche,
    tokens: defaultTokens(),
    content: defaultContent(),
    components: defaultComponents(storeName, niche),
    pages: [
      {
        slug: "home",
        title: "Home",
        nav: false,
        sections: [
          {
            id: "hero",
            type: "hero",
            label: "Hero",
            visible: true,
            html: `<section style="padding:calc(96px*var(--od-density)) var(--od-gutter);text-align:center;background:var(--od-surface)">
  <h1 style="font-family:var(--od-font-heading);font-weight:var(--od-heading-weight);font-size:clamp(32px,6vw,54px);line-height:1.05;margin:0 auto;max-width:16ch;color:var(--od-text)">${escapeHtml(storeName)}</h1>
  <p style="margin:18px auto 0;max-width:46ch;font-size:17px;color:var(--od-muted)">${escapeHtml(niche)} — made with care, delivered to your door.</p>
  <a href="#products" style="display:inline-block;margin-top:28px;background:var(--od-accent);color:var(--od-accent-text);padding:14px 28px;border-radius:var(--od-radius);font-weight:600;font-size:15px;text-decoration:none">Shop the collection</a>
</section>`,
          },
          {
            id: "products",
            type: "product-grid",
            label: "Product grid",
            visible: true,
            html: `<h2 style="font-family:var(--od-font-heading);font-weight:var(--od-heading-weight);font-size:28px;text-align:center;color:var(--od-text);margin:0">Shop all</h2>`,
          },
        ],
      },
      ...defaultFunctionalPages(),
    ],
  };
}

// ---------------------------------------------------------------------------
// Migration — accept the old single-`sections` shape and lift it into pages
// ---------------------------------------------------------------------------

interface LegacyDoc {
  version?: number;
  storeName?: string;
  tagline?: string;
  tokens?: DesignTokens;
  sections?: (DesignSection & { type: string })[];
  components?: { announcement?: string; header?: string; footer?: string };
}

export function migrateDoc(raw: unknown, storeName: string, niche: string): OrbitDesignDoc {
  const d = raw as Partial<OrbitDesignDoc> & LegacyDoc;
  if (d && Array.isArray(d.pages) && d.components) {
    return normalizeDoc(d as OrbitDesignDoc, storeName, niche);
  }
  // legacy: { tokens, sections: [...] } where header/footer/announcement were section types
  const legacySections = Array.isArray(d?.sections) ? d.sections : [];
  const pick = (t: string) => legacySections.find((s) => s.type === t)?.html;
  const base = defaultComponents(d?.storeName ?? storeName, d?.tagline ?? niche);
  const pageSections = legacySections
    .filter((s) => !["announcement", "header", "footer"].includes(s.type))
    .map((s) => normalizeSection(s));
  return normalizeDoc(
    {
      version: (d?.version ?? 1) + 1,
      storeName: d?.storeName ?? storeName,
      tagline: d?.tagline ?? niche,
      tokens: { ...defaultTokens(), ...(d?.tokens ?? {}) },
      content: defaultContent(),
      components: { header: injectNavMarker(pick("header") ?? base.header), footer: pick("footer") ?? base.footer },
      pages: [{ slug: "home", title: "Home", nav: false, sections: pageSections.length ? pageSections : defaultDoc(storeName, niche).pages[0].sections }],
    },
    storeName,
    niche,
  );
}

function normalizeContent(raw: Partial<DesignContent> | undefined): DesignContent {
  const c: Partial<DesignContent> = raw ?? {};
  const s: Partial<DesignContent["socials"]> = c.socials ?? {};
  return {
    announcement: (() => {
      const text = String(c.announcement?.text ?? defaultContent().announcement.text).slice(0, 200);
      // The old default ("Free delivery on orders over Rs 5,000") was never a real store rule —
      // a store that never edited it would promise shoppers something the checkout doesn't do.
      const legacyDefault = /^free delivery on orders over rs 5,000$/i.test(text.trim());
      return { enabled: c.announcement?.enabled !== false && !!text.trim() && !legacyDefault, text: legacyDefault ? "" : text };
    })(),
    logoUrl: String(c.logoUrl ?? "").slice(0, 500),
    contactEmail: String(c.contactEmail ?? "").slice(0, 160),
    contactPhone: String(c.contactPhone ?? "").slice(0, 60),
    contactAddress: String(c.contactAddress ?? "").slice(0, 300),
    socials: {
      instagram: String(s.instagram ?? "").slice(0, 200),
      tiktok: String(s.tiktok ?? "").slice(0, 200),
      facebook: String(s.facebook ?? "").slice(0, 200),
      x: String(s.x ?? "").slice(0, 200),
      youtube: String(s.youtube ?? "").slice(0, 200),
    },
  };
}

export function injectNavMarker(header: string): string {
  if (/OD_NAV/.test(header)) return header;
  if (/<\/nav>/i.test(header)) return header.replace(/<\/nav>/i, "<!--OD_NAV--></nav>");
  return header.replace(/<\/header>/i, `<nav style="display:flex;gap:22px;align-items:center;font-size:14px"><!--OD_NAV--></nav></header>`);
}

const VALID_SECTION_TYPES: SectionType[] = ["hero", "marquee", "featured", "product-grid", "rich-text", "gallery", "newsletter", "contact", "custom"];

function normalizeSection(s: Partial<DesignSection> & { type?: string }): DesignSection {
  const out: DesignSection = {
    id: String(s.id ?? cryptoId()).slice(0, 48),
    type: (VALID_SECTION_TYPES.includes(s.type as SectionType) ? s.type : "custom") as SectionType,
    label: String(s.label ?? s.type ?? "Section").slice(0, 60),
    html: String(s.html ?? ""),
    visible: s.visible !== false,
  };
  const b = s.block as import("./orbit-sections").OrbitBlock | undefined;
  if (b && typeof b.kind === "string" && isOrbitKind(b.kind)) {
    out.block = { kind: b.kind, variant: String(b.variant || ""), props: b.props && typeof b.props === "object" ? b.props : {} };
  }
  return out;
}

export function normalizeDoc(doc: OrbitDesignDoc, storeName: string, niche: string): OrbitDesignDoc {
  const tokens = { ...defaultTokens(), ...(doc.tokens ?? {}) };
  tokens.radius = clamp(Number(tokens.radius) || 14, 0, 32);
  tokens.density = clamp(Number(tokens.density) || 1, 0.7, 1.6);
  tokens.headingWeight = clamp(Number(tokens.headingWeight) || 700, 400, 900);
  if (!Array.isArray(tokens.googleFonts)) tokens.googleFonts = [];
  // The generator sets fontHeading / fontBody but often forgets to list those families in googleFonts,
  // so the page loads the wrong (default) fonts. Derive the families from the font stacks and merge.
  const GENERIC = /^(serif|sans-serif|monospace|system-ui|ui-serif|ui-sans-serif|cursive|fantasy|-apple-system|blinkmacsystemfont)$/i;
  const famsFromStack = (s: unknown): string[] =>
    typeof s === "string"
      ? s.split(",").map((f) => f.trim().replace(/^['"]|['"]$/g, "")).filter((f) => f && !GENERIC.test(f))
      : [];
  const wanted = new Set<string>(tokens.googleFonts.filter((f): f is string => typeof f === "string" && !!f.trim()));
  for (const f of [...famsFromStack(tokens.fontHeading), ...famsFromStack(tokens.fontBody)]) wanted.add(f);
  tokens.googleFonts = wanted.size ? [...wanted] : ["Plus Jakarta Sans"];
  const pal = normalizePalette(tokens.palette);
  tokens.palette = pal.length ? pal : undefined;
  ensureReadableTokens(tokens);

  const base = defaultComponents(doc.storeName ?? storeName, doc.tagline ?? niche);
  const legacyAnnouncement = (doc.components as { announcement?: string } | undefined)?.announcement;
  const components: DesignComponents = {
    header: injectNavMarker(typeof doc.components?.header === "string" && doc.components.header.trim() ? doc.components.header : base.header),
    footer: typeof doc.components?.footer === "string" && doc.components.footer.trim() ? doc.components.footer : base.footer,
  };

  // content: carry forward, and lift any legacy freeform announcement HTML into content.text
  const content = normalizeContent(doc.content);
  if (!doc.content && typeof legacyAnnouncement === "string") {
    const text = legacyAnnouncement.replace(/<[^>]+>/g, "").trim();
    if (text) content.announcement = { enabled: true, text: text.slice(0, 200) };
  }

  const NAV_SHOWS: NavShow[] = ["always", "afterLogin", "never"];
  let pages: DesignPage[] = (Array.isArray(doc.pages) ? doc.pages : []).map((p) => {
    const pp = p as Partial<DesignPage>;
    return {
      slug: slugify(pp.slug || pp.title || "page"),
      title: String(pp.title ?? pp.slug ?? "Page").slice(0, 60),
      nav: pp.nav !== false,
      pageType: pp.pageType,
      navShow: NAV_SHOWS.includes(pp.navShow as NavShow) ? pp.navShow : undefined,
      navLocked: pp.navLocked === true,
      sections: (Array.isArray(pp.sections) ? pp.sections : [])
        .map(normalizeSection)
        // a hand-written fake of a core widget ({{product.name}}…) never survives a save
        .filter((s) => !fakesCoreWidget(s.html))
        // two sections sharing an id make edits land on the wrong one — keep ids unique
        .map((s, i, all) => (all.findIndex((x) => x.id === s.id) === i ? s : { ...s, id: `${s.id}-${i}` })),
    };
  });
  if (!pages.length) pages = defaultDoc(storeName, niche).pages;
  if (!pages.some((p) => p.slug === "home")) pages[0].slug = "home";

  // guarantee the built-in functional pages exist, each carrying its widget marker
  for (const fp of defaultFunctionalPages()) {
    const existing = pages.find((p) => p.slug === fp.slug);
    if (!existing) {
      pages.push(fp);
    } else {
      const marker = FUNCTIONAL_MARKERS[fp.slug] ?? "";
      // A hand-designed widget (data-od-slot="checkout"/"account"/"auth"/"track") covers the same
      // job as the {{cart}}/{{account}}/{{auth}} marker — don't also backfill the platform's own
      // marker on top of it, or both would try to mount (a real duplicate-widget bug, not hypothetical).
      const ownSlotName = { [CART_PAGE]: "checkout", [ACCOUNT_PAGE]: "account", [LOGIN_PAGE]: "auth" }[fp.slug];
      const hasMarker = existing.sections.some(
        (s) =>
          (s.html || "").includes(marker) ||
          (ownSlotName && new RegExp(`data-od-slot=["']${ownSlotName}["']`, "i").test(s.html || "")),
      );
      if (marker && !hasMarker) existing.sections.push(fp.sections[0]);
      // built-in pages default into the nav (seller can still hide); the login page never does —
      // it's reached via the account person-icon.
      existing.nav = fp.slug === LOGIN_PAGE ? existing.nav === true : existing.nav !== false;
    }
  }

  pages.sort((a, b) => (a.slug === "home" ? -1 : b.slug === "home" ? 1 : 0));
  const seen = new Set<string>();
  pages = pages.map((p) => {
    let s = p.slug;
    while (seen.has(s)) s = `${s}-2`;
    seen.add(s);
    return { ...p, slug: s };
  });

  // semantic role + nav-visibility. Translate the old `nav` boolean straight across so every
  // existing seller choice is kept; only the brand-new account/login pages get a smarter default
  // (account → "afterLogin", login → "never") when they have no explicit rule yet.
  pages = pages.map((p) => {
    const pageType = p.pageType ?? inferPageType(p.slug);
    let navShow = p.navShow;
    if (!navShow) {
      if (pageType === "account") navShow = "afterLogin";
      else if (pageType === "login") navShow = "never";
      else navShow = p.nav ? "always" : "never";
    }
    return { ...p, pageType, navShow, nav: navShow !== "never" };
  });

  return {
    version: (doc.version ?? 1) + 1,
    storeName: (doc.storeName ?? storeName).slice(0, 80),
    tagline: (doc.tagline ?? niche).slice(0, 160),
    tokens,
    content,
    components,
    pages,
    tweaks: normalizeTweaks(doc.tweaks),
    motion: doc.motion?.preloader ? { preloader: true } : undefined,
  };
}

/** Keep only well-formed tweak controls (unique kebab key, valid --tw- var, sane value). */
function normalizeTweaks(raw: unknown): DesignTweak[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const out: DesignTweak[] = [];
  for (const t of raw as DesignTweak[]) {
    const key = String(t?.key ?? "").toLowerCase().replace(/[^a-z0-9-]/g, "").slice(0, 40);
    const cssVar = String(t?.cssVar ?? `--tw-${key}`);
    if (!key || seen.has(key) || !/^--tw-[a-z0-9-]+$/i.test(cssVar) || !safeCssValue(String(t?.value ?? ""))) continue;
    seen.add(key);
    const type = t.type === "select" || t.type === "color" ? t.type : "slider";
    out.push({
      key,
      cssVar,
      label: String(t.label ?? key).slice(0, 60),
      type,
      value: safeCssValue(String(t.value)),
      ...(type === "slider"
        ? { min: Number(t.min ?? 0), max: Number(t.max ?? 100), step: Number(t.step ?? 1), unit: String(t.unit ?? "").slice(0, 6) }
        : {}),
      ...(type === "select" && Array.isArray(t.options)
        ? { options: t.options.slice(0, 8).map((o) => ({ label: String(o.label ?? o.value).slice(0, 40), value: safeCssValue(String(o.value)) })) }
        : {}),
    });
    if (out.length >= 12) break;
  }
  return out;
}

export function slugify(s: string): string {
  return (
    String(s)
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 40) || "page"
  );
}

function cryptoId(): string {
  return "s" + Math.abs(hashStr(String(Date.now() ?? "") + Math.random())).toString(36).slice(0, 8);
}
function hashStr(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (h << 5) - h + s.charCodeAt(i);
    h |= 0;
  }
  return h;
}

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------

export function tokenCss(t: DesignTokens): string {
  const gutter = Math.round(24 * t.density);
  // Emit each brand colour both namespaced (--od-<name>) and bare (--<name>). Section builders,
  // following a brief that says "CSS variables on :root: --gold …", often write var(--gold) directly;
  // the bare alias makes those resolve instead of collapsing to an invisible transparent fill.
  const palette = normalizePalette(t.palette)
    .map((p) => `\n  --od-${p.name}:${cssColor(p.value)};\n  --${p.name}:${cssColor(p.value)};`)
    .join("");
  return `:root{
  --od-accent:${cssColor(t.accent)};
  /* Bare aliases — section builders follow a brief that names raw tokens (var(--paper), var(--ink),
     var(--bg)…). Map the common ones onto the real tokens so those declarations resolve instead of
     collapsing to an invisible/transparent value. The ${"${palette}"} block below comes last, so a
     brand colour with the same name always wins the cascade. */
  --paper:var(--od-bg); --page:var(--od-bg); --bg:var(--od-bg); --background:var(--od-bg);
  --ink:var(--od-text); --text:var(--od-text); --fg:var(--od-text); --foreground:var(--od-text);
  --surface:var(--od-surface); --card:var(--od-surface); --panel:var(--od-surface);
  --muted:var(--od-muted); --ink-2:var(--od-muted); --text-muted:var(--od-muted); --subtle:var(--od-muted);
  --line:var(--od-border); --border:var(--od-border); --border-color:var(--od-border); --rule:var(--od-border);
  --accent:var(--od-accent); --brand:var(--od-accent); --primary:var(--od-accent);
  --accent-text:var(--od-accent-text); --on-accent:var(--od-accent-text);${palette}
  --od-accent-text:${cssColor(t.accentText)};
  --od-bg:${cssColor(t.bg)};
  --od-surface:${cssColor(t.surface)};
  --od-text:${cssColor(t.text)};
  --od-muted:${cssColor(t.muted)};
  --od-border:${cssColor(t.border)};
  --od-font-heading:${fontStack(t.fontHeading)};
  --od-font-body:${fontStack(t.fontBody)};
  --od-radius:${clamp(t.radius, 0, 32)}px;
  --od-density:${clamp(t.density, 0.7, 1.6)};
  --od-heading-weight:${clamp(t.headingWeight, 400, 900)};
  --od-gutter:clamp(16px, 5vw, ${clamp(gutter * 2, 24, 80)}px);
  /* Design system — one scale for the whole storefront so every section coheres. */
  --od-s1:calc(4px*var(--od-density)); --od-s2:calc(8px*var(--od-density)); --od-s3:calc(12px*var(--od-density));
  --od-s4:calc(16px*var(--od-density)); --od-s5:calc(24px*var(--od-density)); --od-s6:calc(32px*var(--od-density));
  --od-s7:calc(48px*var(--od-density)); --od-s8:calc(64px*var(--od-density)); --od-s9:calc(96px*var(--od-density));
  --od-s10:calc(128px*var(--od-density));
  --od-section-y:clamp(calc(56px*var(--od-density)), 9vw, calc(128px*var(--od-density)));
  --od-container:1200px; --od-container-narrow:760px;
  --od-text-xs:clamp(11px, .25vw + 10px, 12px); --od-text-sm:clamp(13px, .3vw + 12px, 14px);
  --od-text-base:clamp(15px, .35vw + 14px, 17px); --od-text-lg:clamp(17px, .5vw + 15px, 19px);
  --od-text-xl:clamp(20px, 1vw + 17px, 24px); --od-text-2xl:clamp(24px, 1.7vw + 19px, 31px);
  --od-text-3xl:clamp(26px, 2.2vw + 19px, 37px); --od-text-4xl:clamp(30px, 3vw + 21px, 46px);
  --od-text-5xl:clamp(35px, 3.6vw + 23px, 58px); --od-text-6xl:clamp(40px, 4.6vw + 25px, 74px);
  --od-radius-sm:calc(var(--od-radius) * .5); --od-radius-md:var(--od-radius);
  --od-radius-lg:calc(var(--od-radius) * 1.7 + 2px); --od-radius-xl:calc(var(--od-radius) * 2.6 + 4px);
  --od-radius-full:999px;
  --od-shadow-sm:0 1px 2px rgba(15,23,42,.04), 0 1px 3px rgba(15,23,42,.06);
  --od-shadow-md:0 4px 14px rgba(15,23,42,.07), 0 2px 4px rgba(15,23,42,.04);
  --od-shadow-lg:0 14px 40px rgba(15,23,42,.09), 0 4px 10px rgba(15,23,42,.04);
  --od-shadow-xl:0 28px 70px rgba(15,23,42,.12), 0 10px 20px rgba(15,23,42,.05);
  --od-ease:cubic-bezier(.4,0,.2,1);
}`;
}

function fontStack(v: string): string {
  if (/[{}<>]|url\(|expression|@import/i.test(v)) return "system-ui, sans-serif";
  let s = v.slice(0, 120).trim();
  // The model often returns a bare family ("Manrope", "Public Sans", "Manrope:600") with no quotes
  // and no fallback — an unquoted multi-word family is invalid CSS and voids the whole declaration.
  if (!s.includes(",")) {
    const fam = s.split(":")[0].replace(/['"]/g, "").trim();
    const serif = /serif|playfair|fraunces|caslon|spectral|newsreader|instrument|garamond|lora|source serif/i.test(fam);
    s = `${/\s/.test(fam) ? `'${fam}'` : fam}, ${serif ? "Georgia, serif" : "system-ui, sans-serif"}`;
  }
  return s;
}

/** A CSS value safe to drop into a custom-property declaration. */
function safeCssValue(v: string): string {
  const s = String(v).trim().slice(0, 80);
  return /[;{}<>]|url\(|expression|@import|javascript:/i.test(s) ? "" : s;
}

/**
 * Tweak keys that map straight onto a built-in design token — dragging them retunes the whole
 * design with no per-section HTML rewiring needed. Value is the `--od-*` var they also drive.
 */
export const TWEAK_TOKEN_MAP: Record<string, string> = {
  "--tw-accent": "--od-accent",
  "--tw-radius": "--od-radius",
  "--tw-heading-weight": "--od-heading-weight",
  "--tw-density": "--od-density",
};

/** Re-emit the design's tweak controls as CSS custom properties (and any token they also drive). */
export function tweaksCss(tweaks: DesignTweak[] | undefined, selector = ":root"): string {
  const rows: string[] = [];
  for (const t of tweaks ?? []) {
    if (!/^--tw-[a-z0-9-]+$/i.test(t.cssVar || "") || !safeCssValue(t.value)) continue;
    const v = safeCssValue(t.value);
    rows.push(`  ${t.cssVar}: ${v};`);
    const mapped = TWEAK_TOKEN_MAP[t.cssVar];
    if (mapped) rows.push(`  ${mapped}: ${v};`);
  }
  return rows.length ? `${selector}{\n${rows.join("\n")}\n}` : "";
}

/** Google Fonts stylesheet URL for the doc's families, or "" if none are valid. */
export function googleFontHref(families: string[]): string {
  // The model sometimes appends weights to the family ("Manrope:500,600,700") or wraps it in quotes
  // — strip to the bare family name before validating so the whole request isn't voided.
  const clean = families
    .map((f) => String(f).split(":")[0].replace(/['"]/g, "").trim())
    .filter((f) => /^[a-z0-9 ]{2,40}$/i.test(f));
  if (!clean.length) return "";
  const q = clean.map((f) => `family=${encodeURIComponent(f).replace(/%20/g, "+")}:wght@400;500;600;700;800`).join("&");
  return `https://fonts.googleapis.com/css2?${q}&display=swap`;
}

function googleFontsLink(families: string[]): string {
  const href = googleFontHref(families);
  if (!href) return "";
  return `<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin><link href="${href}" rel="stylesheet">`;
}

const DUMMY_PRODUCTS: StorefrontProduct[] = [
  { id: "demo-1", name: "The Everyday", price: 4800, imageUrl: null, description: null, stock: 12 },
  { id: "demo-2", name: "Signature Piece", price: 7200, imageUrl: null, description: null, stock: 5 },
  { id: "demo-3", name: "The Classic", price: 3900, imageUrl: null, description: null, stock: 20 },
  { id: "demo-4", name: "Limited Edition", price: 9500, imageUrl: null, description: null, stock: 3 },
  { id: "demo-5", name: "New Arrival", price: 5600, imageUrl: null, description: null, stock: 8 },
  { id: "demo-6", name: "Bestseller", price: 4200, imageUrl: null, description: null, stock: 15 },
];

function productCardsHtml(
  products: StorefrontProduct[],
  businessId: string,
  preview: boolean,
  currency?: string,
  onlyCategory?: string,
): string {
  const base = `/store/${businessId}`;
  // In the studio preview, an empty catalogue would leave the design looking half-built — show
  // sample products so the seller can judge the layout. The live store never shows these.
  let list = products.length ? products : preview ? DUMMY_PRODUCTS : [];
  // A category-scoped grid on a custom page (e.g. a "Men's Wear" page) — only that category's items.
  if (onlyCategory) list = list.filter((p) => catSlug(p.category) === onlyCategory);
  if (!list.length) {
    return `<p style="text-align:center;color:var(--od-muted);font-size:14px;padding:40px 0">No products yet — add some in your dashboard and they'll appear here automatically.</p>`;
  }
  const cards = list
    .map((p) => {
      // A FIXED-HEIGHT image frame — never `aspect-ratio` directly on a grid descendant, which
      // makes CSS grid mis-size the row and squish the card (the jagged/uneven-card bug).
      const inner = p.imageUrl
        ? `<img src="${escapeAttr(p.imageUrl)}" alt="${escapeAttr(p.name)}" loading="lazy" style="width:100%;height:100%;object-fit:cover;display:block">`
        : imgSlot(`Product photo: ${p.name}`, "width:100%;height:100%;border-radius:0", false, preview);
      const img = `<div style="width:100%;height:clamp(180px, 22vw, 260px);overflow:hidden;border-radius:var(--od-radius);background:var(--od-surface)">${inner}</div>`;
      // A product with option axes is never "sold out" at the card — availability is per-variant on
      // the product page (and its `stock` is the summed variant stock, which can lag).
      const soldOut = !p.hasVariants && p.stock <= 0;
      const btnStyle = `margin-top:10px;width:100%;display:block;text-align:center;background:var(--od-accent);color:var(--od-accent-text);border:none;border-radius:calc(var(--od-radius)*.7);padding:9px 12px;font-size:13px;font-weight:600;cursor:pointer;text-decoration:none`;
      const link = preview ? `href="#" data-od-pblock="product"` : `href="${base}/product/${escapeAttr(p.id)}"`;
      const buy = soldOut
        ? `<span style="display:inline-block;margin-top:10px;font-size:12px;color:var(--od-muted)">Sold out</span>`
        : p.hasVariants
          ? `<a ${link} style="${btnStyle}">Choose options</a>`
          : `<button type="button"${preview ? "" : ` data-od-buy="${escapeAttr(p.id)}"`} style="${btnStyle}">Add to cart</button>`;
      const priceLabel = p.hasVariants && p.fromPrice != null && (p.fromPrice < p.price || (p.maxPrice ?? p.fromPrice) > p.fromPrice)
        ? `From ${money(p.fromPrice, currency)}`
        : money(p.price, currency);
      const optVals = Object.entries(p.options ?? {})
        .map(([name, vals]) => `${catSlug(name)}:${vals.map((v) => catSlug(v)).join(",")}`)
        .join(";");
      return `<div data-od-card data-od-category="${escapeAttr(catSlug(p.category))}" data-od-name="${escapeAttr(p.name.toLowerCase())}" data-od-price="${p.hasVariants && p.fromPrice != null ? p.fromPrice : p.price}"${optVals ? ` data-od-optvals="${escapeAttr(optVals)}"` : ""} style="display:flex;flex-direction:column;min-width:0">
  <a ${link} data-od-hover="zoom" style="text-decoration:none;color:inherit;display:block">
    ${img}
    <div style="margin-top:12px;font-size:15px;font-weight:500;color:var(--od-text)">${escapeHtml(p.name)}</div>
    <div style="margin-top:2px;font-size:14px;color:var(--od-muted)">${priceLabel}</div>
  </a>
  ${buy}
</div>`;
    })
    .join("");

  // Filter pills (category + attribute) + price range + search + sort — live store only.
  const cats = [...new Set(list.map((p) => (p.category || "").trim()).filter(Boolean))];
  const pill = (label: string, slug: string, active: boolean) =>
    `<button type="button" data-od-grid-cat="${escapeAttr(slug)}" aria-pressed="${active}" style="border:1px solid var(--od-border);background:${active ? "var(--od-text)" : "transparent"};color:${active ? "var(--od-bg)" : "var(--od-muted)"};border-radius:999px;padding:7px 15px;font-size:13px;cursor:pointer;transition:background .15s,color .15s">${escapeHtml(label)}</button>`;

  // Attribute groups: every option axis (Size, Colour, …) that has ≥2 distinct values across the catalogue.
  const groups = new Map<string, Set<string>>();
  for (const p of list) {
    for (const [name, vals] of Object.entries(p.options ?? {})) {
      const g = groups.get(name) ?? new Set<string>();
      vals.forEach((v) => g.add(v));
      groups.set(name, g);
    }
  }
  const attrPill = (group: string, value: string) =>
    `<button type="button" data-od-opt="${escapeAttr(catSlug(group))}:${escapeAttr(catSlug(value))}" aria-pressed="false" style="border:1px solid var(--od-border);background:transparent;color:var(--od-muted);border-radius:999px;padding:6px 13px;font-size:12.5px;cursor:pointer;transition:background .15s,color .15s">${escapeHtml(value)}</button>`;
  const attrBars = [...groups.entries()]
    .filter(([, vals]) => vals.size >= 2)
    .map(
      ([name, vals]) =>
        `<div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-top:12px"><span style="font-size:12px;font-weight:600;color:var(--od-muted);min-width:56px">${escapeHtml(name)}</span>${[...vals].map((v) => attrPill(name, v)).join("")}</div>`,
    )
    .join("");

  const prices = list.map((p) => (p.hasVariants && p.fromPrice != null ? p.fromPrice : p.price)).filter((n) => n > 0);
  const lo = prices.length ? Math.floor(Math.min(...prices)) : 0;
  const hi = prices.length ? Math.ceil(Math.max(...prices)) : 0;
  const priceBar =
    !preview && hi > lo
      ? `<div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-top:12px"><span style="font-size:12px;font-weight:600;color:var(--od-muted);min-width:56px">Price</span>
  <input data-od-grid-pmin type="number" inputmode="numeric" placeholder="${lo}" style="width:96px;border:1px solid var(--od-border);border-radius:calc(var(--od-radius)*.6);padding:7px 10px;font-size:13px;background:var(--od-bg);color:var(--od-text)">
  <span style="color:var(--od-muted)">–</span>
  <input data-od-grid-pmax type="number" inputmode="numeric" placeholder="${hi}" style="width:96px;border:1px solid var(--od-border);border-radius:calc(var(--od-radius)*.6);padding:7px 10px;font-size:13px;background:var(--od-bg);color:var(--od-text)">
</div>`
      : "";

  // a category-scoped grid is already one category — no category pills, keep attribute + price filters
  const catBar = !preview && !onlyCategory && cats.length >= 2 ? `<div style="display:flex;gap:8px;flex-wrap:wrap">${pill("All", "all", true)}${cats.map((c) => pill(c, catSlug(c), false)).join("")}</div>` : "";
  const clearBtn = `<button type="button" data-od-grid-clear hidden style="margin-top:14px;border:none;background:none;color:var(--od-muted);font-size:12.5px;text-decoration:underline;cursor:pointer;padding:0">Clear all filters</button>`;
  const filterBar =
    !preview && (catBar || attrBars || priceBar)
      ? `<div data-od-filters style="margin-top:28px">${catBar}${attrBars}${priceBar}${clearBtn}</div>`
      : "";

  const controls =
    !preview && list.length >= 4
      ? `<div style="display:flex;gap:12px;flex-wrap:wrap;align-items:center;margin-top:${filterBar ? "16px" : "28px"}">
  <input data-od-grid-search type="search" placeholder="Search products" style="flex:1;min-width:180px;border:1px solid var(--od-border);border-radius:calc(var(--od-radius)*.6);padding:9px 12px;font-size:14px;background:var(--od-bg);color:var(--od-text)">
  <select data-od-grid-sort style="border:1px solid var(--od-border);border-radius:calc(var(--od-radius)*.6);padding:9px 12px;font-size:14px;background:var(--od-bg);color:var(--od-text)">
    <option value="featured">Featured</option>
    <option value="price-asc">Price: low to high</option>
    <option value="price-desc">Price: high to low</option>
    <option value="name">Name A–Z</option>
  </select>
</div>
<p data-od-grid-empty hidden style="color:var(--od-muted);font-size:14px;padding:24px 0;margin:0">No products match.</p>`
      : "";

  return `${filterBar}${controls}<div data-od-grid style="display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:calc(28px*var(--od-density)) calc(24px*var(--od-density));align-items:start;margin-top:36px">${cards}</div>`;
}

/** kebab-ify a category name for the data-od-category attribute + filter pill. */
function catSlug(name?: string | null): string {
  return (name || "").toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

/**
 * A styled image placeholder that VARIES per slot (seeded off the brief) so a page of slots doesn't
 * read as one repeated broken image. Four background treatments, rotating hue, varied mark. Reads as
 * a deliberate editorial holding-graphic — clearly "a photo goes here" via the brief pill.
 */
function imgSlot(brief: string, sizing: string, bg = false, caption = true): string {
  const brf = escapeHtml(brief);
  let seed = 0;
  for (let i = 0; i < brief.length; i++) seed = (seed * 31 + brief.charCodeAt(i)) >>> 0;
  const variant = seed % 4;
  const angle = 90 + (seed % 5) * 27; // 90–198deg
  // Rotate the tint between accent and two palette-ish mixes so adjacent slots differ.
  const hues = [
    "var(--od-accent)",
    "color-mix(in srgb, var(--od-accent) 70%, var(--od-text))",
    "color-mix(in srgb, var(--od-accent) 55%, var(--od-surface))",
    "color-mix(in srgb, var(--od-text) 40%, var(--od-surface))",
  ];
  const c = hues[seed % hues.length];
  const c2 = hues[(seed + 2) % hues.length];
  const bgCss =
    variant === 0
      ? `linear-gradient(${angle}deg, ${c} 0%, ${c} 46%, color-mix(in srgb, ${c} 24%, var(--od-surface)) 46%, color-mix(in srgb, ${c} 12%, var(--od-surface)) 100%)`
      : variant === 1
        ? `radial-gradient(120% 90% at ${20 + (seed % 60)}% ${15 + (seed % 50)}%, ${c} 0%, color-mix(in srgb, ${c} 30%, var(--od-surface)) 60%, color-mix(in srgb, ${c} 10%, var(--od-surface)) 100%)`
        : variant === 2
          ? `linear-gradient(${angle}deg, ${c} 0 33%, ${c2} 33% 66%, color-mix(in srgb, ${c} 18%, var(--od-surface)) 66% 100%)`
          : `repeating-linear-gradient(${angle}deg, ${c} 0 14px, color-mix(in srgb, ${c} 45%, var(--od-surface)) 14px 28px)`;
  const mark =
    seed % 3 === 0
      ? `<svg viewBox="0 0 200 200" preserveAspectRatio="xMidYMid slice" style="position:absolute;inset:0;width:100%;height:100%;opacity:.14" aria-hidden="true"><circle cx="${140 - (seed % 40)}" cy="${50 + (seed % 40)}" r="78" fill="none" stroke="#fff" stroke-width="9"/><circle cx="${140 - (seed % 40)}" cy="${50 + (seed % 40)}" r="46" fill="none" stroke="#fff" stroke-width="9"/></svg>`
      : seed % 3 === 1
        ? `<svg viewBox="0 0 100 100" style="position:absolute;inset:0;width:100%;height:100%;opacity:.13" aria-hidden="true"><defs><pattern id="od-dot-${seed % 999}" width="16" height="16" patternUnits="userSpaceOnUse"><circle cx="3" cy="3" r="2.4" fill="#fff"/></pattern></defs><rect width="100" height="100" fill="url(#od-dot-${seed % 999})"/></svg>`
        : "";
  return `<div data-od-imgslot${caption ? ` title="${escapeAttr(brief)}"` : ` aria-hidden="true"`} style="${sizing};position:relative;overflow:hidden;border-radius:var(--od-radius-lg, var(--od-radius));background:${bgCss}">
  ${mark}
  ${
    bg || !caption
      ? ""
      : `<span style="position:absolute;left:12px;bottom:12px;max-width:calc(100% - 24px);font-size:10px;line-height:1.35;color:#fff;background:color-mix(in srgb, var(--od-text) 48%, transparent);backdrop-filter:blur(3px);padding:3px 9px;border-radius:999px">${brf}</span>`
  }
</div>`;
}

/**
 * Replace `<div data-img-slot="brief" style="..."></div>` markers with real placeholders. The brief
 * is shown on the placeholder only in the studio — shoppers on the live store never see "hero-cup".
 */
function fillImageSlots(html: string, preview = true): string {
  const decode = (s: string) =>
    s.replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">");
  return html
    // Background-video slot: a real <video> when the seller has uploaded one (data-video-src), else
    // the same art-directed placeholder as a bg image. Always muted/looping/inline so it's a safe hero bg.
    .replace(/<div\s+data-video-slot="([^"]*)"([^>]*)>\s*<\/div>/gi, (_m, brief: string, attrs: string) => {
      const sizing = /style="([^"]*)"/i.exec(attrs)?.[1] || "width:100%;height:100%";
      const src = /data-video-src="([^"]+)"/i.exec(attrs)?.[1];
      const poster = /data-video-poster="([^"]+)"/i.exec(attrs)?.[1];
      if (src) {
        return `<video autoplay muted loop playsinline${poster ? ` poster="${escapeAttr(poster)}"` : ""} style="${sizing};position:absolute;inset:0;object-fit:cover;z-index:0" data-od-videoslot><source src="${escapeAttr(src)}"></video>`;
      }
      return imgSlot(decode(brief), `${sizing};position:absolute;inset:0`, true).replace("data-od-imgslot", "data-od-imgslot data-od-videoslot");
    })
    .replace(/<div\s+data-img-slot="([^"]*)"([^>]*)>\s*<\/div>/gi, (_m, brief: string, attrs: string) => {
      const styleMatch = /style="([^"]*)"/i.exec(attrs);
      let sizing = styleMatch ? styleMatch[1] : "width:100%;aspect-ratio:16/10";
      // "height:100%" inside a parent with no set height collapses to nothing — the seller sees an
      // empty card. Give such a slot a real size.
      if (!/(^|;)\s*(aspect-ratio|min-height)\s*:|(^|;)\s*height\s*:\s*[\d.]+(px|rem|em|vh|svh)/i.test(sizing))
        sizing = `${sizing.replace(/;\s*$/, "")};min-height:280px`;
      // A real image the seller supplied (Content panel / click-to-edit) — else the art-directed placeholder.
      const src = /data-(?:od-)?img-src="([^"]+)"/i.exec(attrs)?.[1];
      if (src) {
        return `<div data-od-imgslot title="${escapeAttr(decode(brief))}" style="${sizing};overflow:hidden;border-radius:var(--od-radius)"><img src="${escapeAttr(src)}" alt="${escapeAttr(decode(brief))}" loading="lazy" style="width:100%;height:100%;object-fit:cover;display:block"></div>`;
      }
      return imgSlot(decode(brief), sizing, /\bdata-img-bg\b/i.test(attrs), preview);
    });
}

/**
 * Rewrite the model's portable links. On the live storefront they become real URLs; in the studio
 * preview they become inert hooks so clicking a nav link swaps the previewed page (via postMessage
 * to the parent) instead of navigating the iframe to a route that 404s while the store is a draft.
 */
function rewriteLinks(html: string, businessId: string, preview: boolean, doc?: OrbitDesignDoc): string {
  const b = `/store/${businessId}`;

  // The model often hand-writes footer / CTA links as bare paths ("/shop", "/about", "#shop") instead
  // of the #page:<slug> token. Map any bare link whose slug is a real page (or a catalogue alias) to
  // the right destination — otherwise it 404s on the live store.
  const slugs = new Set((doc?.pages ?? []).map((p) => p.slug));
  const catalogue = (doc?.pages ?? []).find((p) => p.slug !== PRODUCT_PAGE && /^(shop|store|catalog(ue)?|products?|collections?|all|browse)$/i.test(p.slug))?.slug;
  const resolveSlug = (raw: string): string | null => {
    const s = raw.toLowerCase().replace(/^\/+|\/+$/g, "").split(/[?#]/)[0];
    if (!s || s === "home" || s === "index") return "home";
    if (slugs.has(s)) return s;
    if (/^(shop|store|catalog(ue)?|products?|collections?|all|browse)$/.test(s) && catalogue) return catalogue;
    if (/^(about|about-us|our-story|story)$/.test(s) && slugs.has("about")) return "about";
    if (/^(contact|contact-us|get-in-touch|support)$/.test(s) && slugs.has("contact")) return "contact";
    return null;
  };
  const toHref = (slug: string): string => {
    if (preview) return slug === "home" ? `href="#" data-od-pnav="home"` : `href="#" data-od-pnav="${slug}"`;
    if (slug === "home") return `href="${b}"`;
    return `href="${b}${FUNCTIONAL_ROUTES[slug] ?? `/p/${slug}`}"`;
  };
  const withQuery = (hrefAttr: string, qs: string): string =>
    !qs || preview ? hrefAttr : hrefAttr.replace(/^href="([^"]*)"/, (_m, u: string) => `href="${u}${qs}"`);
  const fixBare = (s: string) =>
    s.replace(/href="([^"]+)"/gi, (full, href: string) => {
      if (/^(#page:|#product:|#cart|#account|#login|#home|mailto:|tel:|https?:\/\/(?!.*\/store\/))/i.test(href)) return full;
      const h = href.trim();
      const qm = h.match(/\?.*$/);
      const qs = qm ? qm[0] : "";
      const path = qs ? h.slice(0, h.length - qs.length) : h;
      // a bare "/" (a footer "Home") means this store's home, not the Orbit site root
      if (path === "/" || /^\/index\.html?$/i.test(path)) return withQuery(toHref("home"), qs);
      // "#about" — only rewrite when it's an EXACT page slug (a bare "#reviews" may be an in-page anchor)
      const hash = /^#([a-z][\w-]*)$/i.exec(path);
      if (hash) return slugs.has(hash[1].toLowerCase()) ? withQuery(toHref(hash[1].toLowerCase()), qs) : full;
      // "/shop", "shop", "/p/shop", "/store/<id>/p/shop" (+ optional ?query) — resolve aliases too
      const m = /^(?:\/(?:p\/)?|(?:https?:\/\/[^/]+)?\/store\/[^/]+\/(?:p\/)?)([a-z0-9-]+)\/?$/i.exec(path);
      if (m) {
        const slug = resolveSlug(m[1]);
        return slug ? withQuery(toHref(slug), qs) : full;
      }
      return full;
    });

  if (preview) {
    return fixBare(
      html
        .replace(/href="#page:home"/gi, `href="#" data-od-pnav="home"`)
        .replace(/href="#home"/gi, `href="#" data-od-pnav="home"`)
        // #page:<slug> with an optional ?query (deep-linked filtered shop) — query dropped in preview
        .replace(/href="#page:([a-z0-9-]+)(?:\?[^"]*)?"/gi, `href="#" data-od-pnav="$1"`)
        .replace(/href="#product:[a-z0-9]+"/gi, `href="#" data-od-pblock="product"`)
        .replace(/href="#cart"/gi, `href="#" data-od-pblock="cart"`),
    );
  }
  return fixBare(
    html
      .replace(/href="#page:home"/gi, `href="${b}"`)
      .replace(/href="#home"/gi, `href="${b}"`)
      .replace(/href="#page:([a-z0-9-]+)(\?[^"]*)?"/gi, (_m, slug: string, qs?: string) => `href="${b}${FUNCTIONAL_ROUTES[slug] ?? `/p/${slug}`}${qs || ""}"`)
      .replace(/href="#product:([a-z0-9]+)"/gi, `href="${b}/product/$1"`)
      .replace(/href="#cart"/gi, `href="${b}/cart"`)
      .replace(/href="#account"/gi, `href="${b}/account"`)
      .replace(/href="#login"/gi, `href="${b}/account/login"`),
  );
}

/**
 * Strip scripts / handlers / dangerous embeds, but keep the wiring hooks the Phase-2 agent adds:
 * `data-od-*` attributes and `<form data-od-form="newsletter|contact|checkout">` (with its action/method removed).
 */
function sanitizeBlock(html: string): string {
  let h = sanitizeHtml(html); // drops <script>, <style>, on* handlers, javascript: urls
  h = h.replace(/<(iframe|object|embed)\b/gi, "<div data-blocked-$1");
  h = h.replace(/<form\b([^>]*)>/gi, (_m, attrs: string) => {
    if (/data-od-form\s*=\s*["'](newsletter|contact|checkout|auth-login|auth-signup|track)["']/i.test(attrs)) {
      return `<form${attrs.replace(/\s(action|method|onsubmit)\s*=\s*("[^"]*"|'[^']*')/gi, "")}>`;
    }
    return `<div data-blocked-form${attrs}>`;
  });
  return h;
}

function navHrefFor(doc: OrbitDesignDoc, businessId: string, preview: boolean) {
  const catalogue = doc.pages.find((p) => p.slug !== PRODUCT_PAGE && /shop|product|catalog|collection|store|all/i.test(p.slug));
  return (slug: string): string => {
    if (preview) return `href="#" data-od-pnav="${slug}"`;
    if (slug === "home") return `href="/store/${businessId}"`;
    if (FUNCTIONAL_ROUTES[slug]) return `href="/store/${businessId}${FUNCTIONAL_ROUTES[slug]}"`;
    if (slug === PRODUCT_PAGE) return catalogue ? `href="/store/${businessId}/p/${catalogue.slug}"` : `href="/store/${businessId}"`;
    return `href="/store/${businessId}/p/${slug}"`;
  };
}

const isAccountSlugRe = /^(login|log-in|signin|sign-in|signup|sign-up|register|account|my-account|myaccount|profile|dashboard)$/;
function isAccountPageOf(p: DesignPage) {
  return p.pageType === "account" || p.pageType === "login" || (!p.pageType && isAccountSlugRe.test(p.slug));
}

/** The CSS-only hamburger toggle + button, standalone — for the explicit <!--OD_BURGER--> marker so
 *  the model can place it anywhere in the header (e.g. after the cart icon). Uses :has() (see
 *  navResponsiveCss) so it works wherever it sits, not just directly beside .od-nav-links. */
function navBurgerHtml(): string {
  return `<input type="checkbox" class="od-nav-toggle" id="od-nav-toggle">
    <label for="od-nav-toggle" class="od-nav-burger" aria-label="Menu">
      <svg class="od-burger-open" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M3 6h18M3 12h18M3 18h18"/></svg>
      <svg class="od-burger-close" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M18 6 6 18M6 6l12 12"/></svg>
    </label>`;
}

/** The page links, plus (when the header never placed a standalone <!--OD_BURGER-->) the bundled
 *  CSS-only hamburger toggle too, for backward compatibility with single-marker headers. */
function navLinksHtml(doc: OrbitDesignDoc, businessId: string, preview: boolean, loggedIn: boolean, includeBurger: boolean, sidebar = false): string {
  const hrefFor = navHrefFor(doc, businessId, preview);
  const navVisible = (p: DesignPage) => p.navShow !== "never" && (preview || p.navShow !== "afterLogin" || loggedIn);
  const pageLinks = doc.pages
    .filter((p) => {
      if (p.slug === CART_PAGE || !navVisible(p)) return false;
      if (isAccountPageOf(p)) return false;
      if (p.slug === PRODUCT_PAGE) return preview;
      return true;
    })
    .map((p) => `<a ${hrefFor(p.slug)} style="color:var(--od-muted);text-decoration:none">${escapeHtml(p.title)}</a>`)
    .join("\n      ");
  const links = `<div class="od-nav-links"${sidebar ? ' data-od-nav-style="sidebar"' : ""}>
      ${pageLinks}
    </div>`;
  if (!includeBurger) return links;
  return `<input type="checkbox" class="od-nav-toggle" id="od-nav-toggle">
    ${links}
    <label for="od-nav-toggle" class="od-nav-burger" aria-label="Menu">
      <svg class="od-burger-open" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M3 6h18M3 12h18M3 18h18"/></svg>
      <svg class="od-burger-close" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M18 6 6 18M6 6l12 12"/></svg>
    </label>`;
}

/** The account person-icon (or a "Sign in" link when navShow="afterLogin" and not signed in). "" when hidden. */
function navAccountHtml(doc: OrbitDesignDoc, businessId: string, preview: boolean, loggedIn: boolean): string {
  const hrefFor = navHrefFor(doc, businessId, preview);
  const accountTarget = doc.pages.find((p) => p.pageType === "account" || (!p.pageType && /account|profile|dashboard/.test(p.slug)));
  if (!accountTarget || accountTarget.navShow === "never") return "";
  const personIcon = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>`;
  if (preview || accountTarget.navShow !== "afterLogin" || loggedIn) {
    return `<a ${hrefFor(accountTarget.slug)} data-od-account aria-label="${escapeAttr(accountTarget.title || "Account")}" style="display:inline-flex;align-items:center;color:var(--od-text);text-decoration:none;flex-shrink:0">${personIcon}</a>`;
  }
  return `<a ${hrefFor(LOGIN_PAGE)} data-od-account style="color:var(--od-muted);text-decoration:none;flex-shrink:0">Sign in</a>`;
}

/** The cart link — the live-store runtime hangs a count badge off `a[href$="/cart"]`. */
function navCartHtml(doc: OrbitDesignDoc, businessId: string, preview: boolean): string {
  const cartLink = navHrefFor(doc, businessId, preview)(CART_PAGE);
  return `<a ${cartLink} aria-label="Cart" style="display:inline-flex;align-items:center;gap:6px;color:var(--od-text);text-decoration:none;flex-shrink:0"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"/><path d="M3 6h18"/><path d="M16 10a4 4 0 0 1-8 0"/></svg>Cart</a>`;
}

/** The full nav bundle (links + account + cart) — used where the header has only the single <!--OD_NAV--> marker. */
function navHtml(doc: OrbitDesignDoc, businessId: string, preview: boolean, loggedIn: boolean): string {
  return [
    navLinksHtml(doc, businessId, preview, loggedIn, true),
    navAccountHtml(doc, businessId, preview, loggedIn),
    navCartHtml(doc, businessId, preview),
  ]
    .filter(Boolean)
    .join("\n    ");
}

/** Substitute the seller-editable {{content}} / {{store}} tokens the design references. */
function substituteContent(html: string, doc: OrbitDesignDoc): string {
  const c = doc.content;
  const map: Record<string, string> = {
    "store.name": escapeHtml(doc.storeName),
    "store.logo": c.logoUrl
      ? `<img src="${escapeAttr(c.logoUrl)}" alt="${escapeAttr(doc.storeName)}" style="height:30px;width:auto;display:block">`
      : escapeHtml(doc.storeName),
    "store.tagline": escapeHtml(doc.tagline),
    "store.year": String(new Date().getFullYear()),
    "contact.email": escapeHtml(c.contactEmail),
    "contact.phone": escapeHtml(c.contactPhone),
    "contact.address": escapeHtml(c.contactAddress).replace(/\n/g, "<br>"),
    "social.instagram": escapeAttr(c.socials.instagram),
    "social.tiktok": escapeAttr(c.socials.tiktok),
    "social.facebook": escapeAttr(c.socials.facebook),
    "social.x": escapeAttr(c.socials.x),
    "social.youtube": escapeAttr(c.socials.youtube),
  };
  return (
    html
      // A social link whose account isn't set would point nowhere — drop the whole link, icon and all.
      .replace(/<a\b[^>]*href="\s*\{\{\s*(social\.[a-z]+)\s*\}\}\s*"[^>]*>[\s\S]*?<\/a>/gi, (m, key: string) => (map[key] ? m : ""))
      // A contact detail the seller hasn't filled in: drop its row (icon + blank value), or the
      // mailto:/tel: link, or the bare line — never a lonely ✉ with nothing next to it.
      .replace(
        /<div\b[^>]*>\s*(?:<(span|div|i)\b[^>]*>(?:[^<]{0,6}|\s*<svg\b[\s\S]*?<\/svg>\s*)<\/\1>\s*|<svg\b[\s\S]*?<\/svg>\s*)?<(span|p|a|div|strong)\b[^>]*>\s*\{\{\s*(contact\.[a-z]+)\s*\}\}\s*<\/\2>\s*<\/div>/gi,
        (m, _i: string, _t: string, key: string) => (map[key] ? m : ""),
      )
      .replace(/<a\b[^>]*href="\s*(?:mailto:|tel:)?\s*\{\{\s*(contact\.[a-z]+)\s*\}\}\s*"[^>]*>[\s\S]*?<\/a>/gi, (m, key: string) => (map[key] ? m : ""))
      .replace(/<(p|li|span)\b[^>]*>\s*\{\{\s*(contact\.[a-z]+)\s*\}\}\s*<\/\1>/gi, (m, _t: string, key: string) => (map[key] ? m : ""))
      // …and a column left with only its heading ("FOLLOW US" over an empty row) goes too.
      .replace(/<div\b[^>]*>\s*<(div|h[1-6]|p|span|strong)\b[^>]*>[^<]{1,40}<\/\1>\s*<(div|ul|nav|p)\b[^>]*>\s*<\/\2>\s*<\/div>/gi, "")
      // "© 2026 {{store.name}}." for a name that already ends in a full stop ("Chai Wala Co.").
      .replace(/\{\{\s*store\.name\s*\}\}\./gi, (m) => (doc.storeName.trim().endsWith(".") ? "{{store.name}}" : m))
      .replace(/\{\{\s*([a-z.]+)\s*\}\}/gi, (m, key: string) => (key in map ? map[key] : m))
  );
}

/**
 * Replace the functional-widget markers. On the live store → a mount point the React widget
 * portals into. In the studio preview → a realistic, token-styled MOCK of that widget (fake
 * gallery / cart lines / checkout form) so the seller sees a finished page to design around.
 */
function widgetMarkers(html: string, preview: boolean, currency?: string): string {
  // product, cart, account and login are always-present functional pages with dedicated routes and
  // pre-wired backends; {{checkout}} and every data-od-slot are handled by applySpec.
  return html.replace(/\{\{\s*(product|cart|account|auth|track)\s*\}\}/gi, (_m, raw: string) => {
    const kind = raw.toLowerCase();
    if (!preview) return `<div data-od-widget="${kind}"></div>`;
    const mock =
      kind === "product"
        ? mockProductWidget(currency)
        : kind === "cart"
          ? mockCartWidget(currency)
          : kind === "auth"
            ? mockAuthWidget()
            : mockAccountWidget(currency);
    return `<div data-od-mock style="position:relative">${mock}<div style="margin-top:10px;text-align:center;font-size:11px;color:var(--od-muted);opacity:.7">Preview — your live store fills this with the real working part</div></div>`;
  });
}

function mockAuthWidget(): string {
  return `<div style="max-width:380px">
  <div style="display:flex;gap:4px;margin-bottom:18px">
    <div style="flex:1;padding:9px 0;text-align:center;font-size:13.5px;font-weight:600;border-bottom:2px solid var(--od-accent);color:var(--od-text)">Sign in</div>
    <div style="flex:1;padding:9px 0;text-align:center;font-size:13.5px;font-weight:600;border-bottom:2px solid var(--od-border);color:var(--od-muted)">Create account</div>
  </div>
  <label style="display:block;font-size:12.5px;color:var(--od-muted);margin-bottom:4px">Phone number</label>
  <div style="${mockInput};margin:0 0 12px">03xx xxxxxxx</div>
  <div style="${mockBtn}">Send code</div>
</div>`;
}

function mockAccountWidget(currency?: string): string {
  const c = (currency || "PKR").toUpperCase();
  return `<div>
  <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:18px">
    <strong style="font-size:16px;color:var(--od-text)">Hi, Ayesha</strong>
    <span style="font-size:12.5px;color:var(--od-muted)">Sign out</span>
  </div>
  <div style="display:flex;gap:14px;border-bottom:1px solid var(--od-border);margin-bottom:16px;font-size:13.5px">
    <span style="padding:8px 0;border-bottom:2px solid var(--od-accent);color:var(--od-text);font-weight:600">Orders</span>
    <span style="padding:8px 0;color:var(--od-muted)">Addresses</span>
    <span style="padding:8px 0;color:var(--od-muted)">Profile</span>
  </div>
  <div style="border:1px solid var(--od-border);border-radius:var(--od-radius);padding:14px;display:flex;justify-content:space-between;font-size:13px">
    <span>#A1B2C3D4 · <span style="color:var(--od-muted)">Confirmed</span></span><strong>${c} 3,925</strong>
  </div>
</div>`;
}

const mockInput = "width:100%;padding:11px 13px;border:1px solid var(--od-border);border-radius:calc(var(--od-radius)*.6);background:var(--od-bg);color:var(--od-text);font-size:13.5px;margin-top:6px";
const mockBtn = "width:100%;background:var(--od-accent);color:var(--od-accent-text);border:none;border-radius:calc(var(--od-radius)*.7);padding:13px;font-size:14px;font-weight:600;cursor:pointer";

/** Scan forward from just after a `<tagName ...>` opening tag and return the index right after its
 *  matching close tag — depth-counted, so a slot containing its OWN nested same-named tags (a real
 *  designed checkout, not a one-liner stub) doesn't get truncated at the first nested close tag the
 *  way a naive non-greedy regex would. */
export function findMatchingTagEnd(html: string, tagName: string, fromIndex: number): number {
  let depth = 1;
  const tagRe = new RegExp(`<${tagName}\\b|<\\/${tagName}\\s*>`, "gi");
  tagRe.lastIndex = fromIndex;
  let m: RegExpExecArray | null;
  while ((m = tagRe.exec(html))) {
    if (m[0][1] === "/") depth--;
    else depth++;
    if (depth === 0) return tagRe.lastIndex;
  }
  return html.length;
}

/** @deprecated use findMatchingTagEnd(html, "div", fromIndex) — kept for callers matching only <div>. */
export function findMatchingDivEnd(html: string, fromIndex: number): number {
  return findMatchingTagEnd(html, "div", fromIndex);
}

/** A `data-od-slot="..."` can land on any of these container tags — the model picks whichever is
 *  semantically right (a <form> for a checkout, a <section> for a whole account page, a <div> for
 *  anything else). Scanners must check all of them, not just <div>. */
export const SLOT_CONTAINER_TAGS = ["div", "section", "form", "article", "main"] as const;

/** Find the next `data-od-slot="..."` opening tag (any container tag) at or after `fromIndex`,
 *  and return its tag name, the attribute text, the match start, and the index right after the
 *  opening tag. Returns null if there are none left. */
export function findNextSlotOpenTag(
  html: string,
  fromIndex: number,
): { tagName: string; attrs: string; start: number; openEnd: number; dq?: string; sq?: string } | null {
  let best: { tagName: string; attrs: string; start: number; openEnd: number; dq?: string; sq?: string } | null = null;
  for (const tag of SLOT_CONTAINER_TAGS) {
    const re = new RegExp(`<${tag}\\b([^>]*\\bdata-od-slot=("([^"]*)"|'([^']*)')[^>]*)>`, "i");
    re.lastIndex = 0;
    const rest = html.slice(fromIndex);
    const m = re.exec(rest);
    if (m && (best === null || m.index < best.start - fromIndex)) {
      best = {
        tagName: tag,
        attrs: m[1],
        start: fromIndex + m.index,
        openEnd: fromIndex + m.index + m[0].length,
        dq: m[3],
        sq: m[4],
      };
    }
  }
  return best;
}

/**
 * Turn the `data-od-slot` placeholders Orbit Design left on a page into real widget mount points,
 * per the store's StoreBackendSpec. Also handles the legacy `{{product|cart|checkout}}` markers.
 *
 *  - live + a spec that maps this slot   → `<div data-od-widget="KIND" …>` (the route mounts it)
 *  - preview, or no spec yet             → a labeled dashed card ("Orbit Code fills this: …")
 *
 * Every slot found is pushed onto `sink` so the route knows what components to mount.
 */
function applySpec(
  html: string,
  pageSlug: string,
  spec: StoreBackendSpec,
  preview: boolean,
  sink: PageWidget[],
): string {
  // legacy markers first
  html = html.replace(/\{\{\s*(product|cart|checkout)\s*\}\}/gi, (_m, raw: string) => {
    const kind = raw.toLowerCase() === "product" ? "product" : "checkout";
    if (kind === "product") return `<div data-od-widget="product"></div>`;
    sink.push({ kind: "checkout", page: pageSlug });
    return preview
      ? `<div data-od-mock style="position:relative">${mockCheckoutWidget()}<div style="margin-top:10px;text-align:center;font-size:11px;color:var(--od-muted);opacity:.7">Preview — your live store fills this with a working checkout</div></div>`
      : `<div data-od-widget="checkout"></div>`;
  });

  // data-od-slot placeholders — hand-scanned with real depth-counting (findMatchingDivEnd) instead
  // of a non-greedy regex, because a genuinely-designed slot (e.g. a freeform checkout) contains its
  // own nested <div>s; a naive `[\s\S]*?<\/div>` would truncate at the FIRST nested close tag.
  const pageWidget = spec.pageWidgets[pageSlug]; // checkout | auth | account | track
  {
    let out = "";
    let cursor = 0;
    let scanFrom = 0;
    let next: ReturnType<typeof findNextSlotOpenTag>;
    while ((next = findNextSlotOpenTag(html, scanFrom))) {
      const { tagName, attrs, start: openStart, openEnd, dq, sq } = next;
      scanFrom = openEnd;
      if (openStart < cursor) continue; // inside a block already emitted (e.g. a nested slot) — skip
      const closeEnd = findMatchingTagEnd(html, tagName, openEnd);
      const whole = html.slice(openStart, closeEnd);
      const slot = specSlugify(dq || sq || "");
      const purposeM = /data-od-purpose=("([^"]*)"|'([^']*)')/i.exec(attrs);
      const purpose = (purposeM?.[2] || purposeM?.[3] || "").slice(0, 200);

      let replacement: string;
      // 0. the seller's OWN designed widget (checkout/auth/account/track), validated field-complete
      // by Orbit Code — keep their real markup (data-od-field/data-od-form/data-od-* hooks) instead
      // of swapping in the platform's built-in widget for it. Checked by SLOT name, not by which
      // widget the whole page was classified as — e.g. a "track" slot nested inside an "account"
      // page (a common, deliberate design) still needs to preserve its own real markup.
      const freeformKind = (["checkout", "auth", "account", "track"] as const).find((k) => k === slot);
      if (freeformKind && (spec.freeformWidgets ?? []).includes(freeformKind) && !sink.some((x) => x.kind === freeformKind)) {
        sink.push({ kind: freeformKind, page: pageSlug });
        replacement = whole; // unchanged — the runtime's data-od-* hooks (see storefrontRuntimeJs) do the wiring
      } else {
        // 1. a form declared for exactly this slot
        const form = spec.forms.find((f) => f.slot === slot && (!f.page || f.page === pageSlug));
        if (form) {
          const w: PageWidget =
            typeof form.target === "string" && form.target.startsWith("collection:")
              ? { kind: "collection", collection: form.target.slice("collection:".length), page: pageSlug, slot }
              : { kind: "form", target: String(form.target), page: pageSlug, slot };
          sink.push(w);
          replacement = preview
            ? slotMock(slot, purpose || `form → ${form.target}`)
            : `<div data-od-widget="${w.kind}" data-od-slot="${escapeAttr(slot)}"${w.collection ? ` data-od-collection="${escapeAttr(w.collection)}"` : ""}${w.target ? ` data-od-target="${escapeAttr(w.target)}"` : ""}></div>`;
        } else if (pageWidget && !sink.some((x) => x.kind === pageWidget)) {
          // 2. this whole page is a functional widget (checkout / sign-in / account / tracking)
          sink.push({ kind: pageWidget, page: pageSlug });
          replacement = preview ? slotMock(slot, purpose || pageWidget) : `<div data-od-widget="${pageWidget}"></div>`;
        } else {
          // 3. a collection whose name is hinted by the slot / purpose (e.g. "reviews")
          const col = spec.collections.find((c) => slot.includes(c.name) || purpose.toLowerCase().includes(c.name));
          if (col) {
            sink.push({ kind: "collection", collection: col.name, page: pageSlug });
            replacement = preview
              ? slotMock(slot, purpose || col.label)
              : `<div data-od-widget="collection" data-od-collection="${escapeAttr(col.name)}"></div>`;
          } else {
            // 4. nothing wired yet — a labeled placeholder
            replacement = slotMock(slot, purpose);
          }
        }
      }

      out += html.slice(cursor, openStart) + replacement;
      cursor = closeEnd;
      scanFrom = cursor;
    }
    html = out + html.slice(cursor);
  }

  return html;
}

function slotMock(slot: string, purpose: string): string {
  return `<div style="border:1.5px dashed var(--od-border);border-radius:var(--od-radius);padding:28px;text-align:center;color:var(--od-muted)">
  <div style="font-size:12px;letter-spacing:.06em;text-transform:uppercase;color:var(--od-accent);font-weight:600">${escapeHtml(slot || "interactive")}</div>
  <p style="margin:8px 0 0;font-size:13.5px;line-height:1.5">${escapeHtml(purpose || "Orbit Code wires this working part when you hit Handoff.")}</p>
</div>`;
}

function mockProductWidget(currency?: string): string {
  const thumb = `<div style="flex:1;aspect-ratio:1;border-radius:calc(var(--od-radius)*.6);background:linear-gradient(135deg,color-mix(in srgb,var(--od-accent) 12%,var(--od-surface)),var(--od-surface))"></div>`;
  return `<div style="display:flex;flex-wrap:wrap;gap:36px;align-items:flex-start">
  <div style="flex:1 1 300px;min-width:260px;max-width:460px;display:grid;gap:12px">
    ${imgSlot("Main product photo", "width:100%;aspect-ratio:4/5")}
    <div style="display:flex;gap:10px">${thumb}${thumb}${thumb}${thumb}</div>
  </div>
  <div style="flex:1 1 300px;min-width:260px">
    <div style="font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:var(--od-accent);font-weight:600">Featured</div>
    <h2 style="margin:8px 0 0;font-family:var(--od-font-heading);font-weight:var(--od-heading-weight);font-size:clamp(24px,4vw,34px);color:var(--od-text)">The Signature</h2>
    <div style="margin-top:10px;font-size:20px;font-weight:600;color:var(--od-text)">${money(6800, currency)}</div>
    <p style="margin-top:14px;font-size:14px;line-height:1.6;color:var(--od-muted)">A short product description sits here — the details, materials and story that make this one worth buying.</p>
    <div style="margin-top:20px;display:flex;align-items:center;gap:14px">
      <div style="display:flex;align-items:center;border:1px solid var(--od-border);border-radius:calc(var(--od-radius)*.6)">
        <span style="padding:10px 14px;color:var(--od-muted)">&minus;</span>
        <span style="padding:10px 8px;color:var(--od-text);font-weight:600">1</span>
        <span style="padding:10px 14px;color:var(--od-muted)">+</span>
      </div>
      <span style="font-size:13px;color:var(--od-muted)">In stock</span>
    </div>
    <button type="button" style="${mockBtn};margin-top:16px">Add to cart</button>
  </div>
</div>`;
}

function mockLine(name: string, price: number, currency?: string): string {
  return `<div style="display:flex;gap:14px;padding:16px 0;border-bottom:1px solid var(--od-border)">
  <div style="width:64px;height:64px;flex:none;border-radius:calc(var(--od-radius)*.5);background:linear-gradient(135deg,color-mix(in srgb,var(--od-accent) 12%,var(--od-surface)),var(--od-surface))"></div>
  <div style="flex:1">
    <div style="font-size:14px;font-weight:500;color:var(--od-text)">${escapeHtml(name)}</div>
    <div style="margin-top:4px;font-size:13px;color:var(--od-muted)">Qty 1 &nbsp;·&nbsp; Remove</div>
  </div>
  <div style="font-size:14px;font-weight:600;color:var(--od-text)">${money(price, currency)}</div>
</div>`;
}

function mockTotals(currency?: string): string {
  const row = (l: string, v: string, strong = false) =>
    `<div style="display:flex;justify-content:space-between;padding:7px 0;font-size:${strong ? "16px;font-weight:700" : "13.5px"};color:var(--od-${strong ? "text" : "muted"})"><span>${l}</span><span>${v}</span></div>`;
  return `<div style="margin-top:8px">${row("Subtotal", money(11700, currency))}${row("Shipping", "Free")}<div style="border-top:1px solid var(--od-border);margin-top:6px;padding-top:6px">${row("Total", money(11700, currency), true)}</div></div>`;
}

function mockCartWidget(currency?: string): string {
  return `<div style="display:flex;flex-wrap:wrap;gap:32px;align-items:flex-start">
  <div style="flex:1 1 320px;min-width:280px">
    ${mockLine("The Signature", 6800, currency)}
    ${mockLine("Daily Essential", 4900, currency)}
  </div>
  <div style="flex:1 1 260px;min-width:240px;border:1px solid var(--od-border);border-radius:var(--od-radius);padding:20px;background:var(--od-surface)">
    ${mockTotals(currency)}
    <button type="button" style="${mockBtn};margin-top:14px">Proceed to checkout</button>
  </div>
</div>`;
}

function mockCheckoutWidget(currency?: string): string {
  const field = (label: string, ph: string) =>
    `<label style="display:block;margin-top:14px;font-size:12.5px;color:var(--od-muted)">${label}<input disabled placeholder="${escapeAttr(ph)}" style="${mockInput}"></label>`;
  return `<div style="display:flex;flex-wrap:wrap;gap:28px;align-items:flex-start">
  <div style="flex:1 1 320px;min-width:280px;border:1px solid var(--od-border);border-radius:var(--od-radius);padding:22px;background:var(--od-surface)">
    <h3 style="margin:0;font-family:var(--od-font-heading);font-weight:var(--od-heading-weight);font-size:18px;color:var(--od-text)">Delivery details</h3>
    ${field("Full name", "Alex Carter")}
    ${field("Phone", "+92 300 0000000")}
    ${field("Address", "House / street")}
    ${field("City", "Karachi")}
    <button type="button" style="${mockBtn};margin-top:18px">Place order</button>
  </div>
  <div style="flex:1 1 240px;min-width:220px;border:1px solid var(--od-border);border-radius:var(--od-radius);padding:20px;background:var(--od-surface)">
    <h3 style="margin:0 0 4px;font-family:var(--od-font-heading);font-weight:var(--od-heading-weight);font-size:16px;color:var(--od-text)">Your order</h3>
    ${mockLine("The Signature", 6800, currency)}
    ${mockLine("Daily Essential", 4900, currency)}
    ${mockTotals(currency)}
  </div>
</div>`;
}

export interface RenderOpts {
  products: StorefrontProduct[];
  businessId: string;
  pageSlug?: string;
  /** store's 3-letter currency (e.g. "usd"); defaults to PKR */
  currency?: string;
  /** studio preview: links become inert page-switch hooks instead of real navigation */
  preview?: boolean;
  /** the store's StoreBackendSpec (what "Orbit Code" produced on Handoff) — drives functional widgets */
  spec?: StoreBackendSpec;
  /** true when a storefront customer is signed in — gates "afterLogin" nav items server-side */
  loggedIn?: boolean;
}

/** One functional widget a page needs mounted, collected while rendering. */
export interface PageWidget {
  kind: "checkout" | "auth" | "account" | "track" | "bundles" | "rewards" | "collection" | "form";
  collection?: string;
  target?: string;
  slot?: string;
  page?: string;
}

export function resolvePage(doc: OrbitDesignDoc, slug?: string): DesignPage {
  if (slug) {
    const hit = doc.pages.find((p) => p.slug === slug);
    if (hit) return hit;
  }
  return doc.pages.find((p) => p.slug === "home") ?? doc.pages[0];
}

function announcementBar(doc: OrbitDesignDoc): string {
  const a = doc.content.announcement;
  if (!a.enabled || !a.text.trim()) return "";
  return `<div style="background:var(--od-text);color:var(--od-bg);text-align:center;font-size:13px;letter-spacing:.02em;padding:calc(9px*var(--od-density)) 16px">${escapeHtml(a.text)}</div>`;
}

/**
 * The header always gets its page nav from the auto-generated list. Strip any page/cart/home
 * links the model hand-wrote into the header (a common mistake that duplicates the nav), then
 * put the real nav where <!--OD_NAV--> is — or before </nav>/</header> if the marker is gone.
 */
function prepareHeader(doc: OrbitDesignDoc, businessId: string, preview: boolean, loggedIn: boolean): string {
  // Targets the auto nav already covers (page slugs + their titles slugified) — a hand-written
  // header link to any of these is the "duplicate nav" mistake and gets removed. CTAs pointing at
  // #contact / #products / #newsletter etc. are left alone.
  const navSlugs = new Set(
    doc.pages.filter((p) => p.nav && p.slug !== "home" && !FUNCTIONAL_PAGES.includes(p.slug)).map((p) => p.slug),
  );
  // A header <a> is a duplicate-nav mistake if its href resolves to a page the auto nav renders:
  //   #page:<slug>, #<navSlug>, /store/<id>/p/<navSlug>, or the title of a nav page.
  const titleToNav = new Map<string, boolean>();
  for (const p of doc.pages) {
    if (navSlugs.has(p.slug)) {
      titleToNav.set(p.title.toLowerCase().trim(), true);
    }
  }
  const storeName = doc.storeName.toLowerCase().trim();
  // The model sometimes overwrites the ENTIRE header with just the <!--OD_NAV--> marker (or an
  // empty string / a bare nav) via a comment or edit — leaving the storefront with no logo, no
  // sticky shell, no styling. If there's no real <header> element, rebuild the default shell
  // around whatever marker survived.
  let rawHeader = doc.components.header || "";
  // The model sometimes leaks XML/CDATA scaffolding ("<![CDATA[", "]]>") into the header markup,
  // which then renders as literal text next to the cart link. Strip it before anything else.
  rawHeader = rawHeader.replace(/<!\[CDATA\[|\]\]>/g, "");
  // The model sometimes references un-namespaced design vars (var(--border), var(--text)) that don't
  // exist — remap the common ones to their --od-* equivalents so the header styling actually lands.
  rawHeader = rawHeader.replace(/var\(--(border|text|bg|surface|accent|muted|accent-text)\b/g, "var(--od-$1");
  if (!/<header[\s>]/i.test(rawHeader)) rawHeader = defaultComponents(doc.storeName, "").header;
  // The model keeps baking a promo/announcement strip ("Free delivery over Rs 5,000") into the
  // header. The platform renders that itself from the seller's Content panel — a hand-written one
  // just stacks a second identical bar. Strip any element whose text is exactly the announcement.
  const annText = (doc.content.announcement?.text || "").replace(/\s+/g, " ").trim().toLowerCase();
  if (annText) {
    rawHeader = rawHeader.replace(/<(div|p|span|a)\b[^>]*>([\s\S]*?)<\/\1>/gi, (full, _tag, inner: string) =>
      inner.replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim().toLowerCase() === annText ? "" : full,
    );
  }
  const isDupeLink = (attrs: string, inner: string): boolean => {
    const href = /href="([^"]*)"/i.exec(attrs)?.[1] ?? "";
    const text = inner.replace(/<[^>]+>/g, "").replace(/\s+/g, " ").toLowerCase().trim();
    // navHtml owns the single canonical Cart link — strip any hand-written cart link first, even
    // one wrapped around a bag icon (checked before the logo guard so icon cart links still go).
    const hrefPath = href.split(/[?#]/)[0]; // strip query/hash suffix without eating a bare "#cart"
    if (/^#cart$/i.test(href) || /\/cart$/i.test(hrefPath) || /data-od-pnav="cart"/i.test(attrs) || /aria-label="cart"/i.test(attrs) || /^cart(\s*\d+)?$/i.test(text)) return true;
    // navHtml owns the account/person icon too — strip any hand-written login / sign-in / my-account
    // link (icon or text), checked before the logo/svg guard so an icon one still goes.
    const slug = /^(?:#page:|#|.*\/p\/)([a-z0-9-]+)$/i.exec(href.trim())?.[1] ?? hrefPath.split("/p/")[1]?.split(/[/?#]/)[0] ?? "";
    if (
      /^(login|log-in|signin|sign-in|signup|sign-up|register|account|my-account|myaccount|profile)$/i.test(slug) ||
      /data-od-account/i.test(attrs) ||
      /aria-label="(account|log ?in|sign ?in|my account)"/i.test(attrs) ||
      /^(log ?in|sign ?in|sign ?up|my account|account|register)$/i.test(text)
    )
      return true;
    // NEVER strip the logo: an <a> that holds an image / image-slot, or whose text is the store
    // name, is the brand mark (it usually links home) — keep it untouched. Compare with ALL
    // whitespace stripped (not just collapsed) on both sides — a wordmark styled as
    // "ATLAS<span>FOOTWORKS</span>" has no space in its rendered text at all, so a
    // single-space-normalized comparison against "atlas footworks" would still miss it and the
    // logo would get deleted as a false "duplicate home link" below.
    const textNoSpace = text.replace(/\s+/g, "");
    const storeNameNoSpace = storeName.replace(/\s+/g, "");
    if (/<(img|svg)\b|data-img-slot/i.test(inner) || (!!storeNameNoSpace && textNoSpace === storeNameNoSpace)) return false;
    const m = /^(?:#page:|#|.*\/p\/)([a-z0-9-]+)$/i.exec(href.trim());
    // A home link is only a duplicate when it reads "Home" (or a nav title) or is empty. Any other
    // text is the brand wordmark — often a shortened name ("Shifa" for "Shifa Herbals") that the
    // exact-name check above misses — and stripping it leaves the header with no store name at all.
    if (m && m[1] === "home") return !text || text === "home" || titleToNav.has(text);
    if (m && (navSlugs.has(m[1]) || m[1] === "cart")) return true;
    if (/\/p\//i.test(href) && navSlugs.has(href.split("/p/")[1]?.split(/[/?#]/)[0] ?? "")) return true;
    return !!text && titleToNav.has(text) && !/background:/i.test(attrs); // keep styled CTA buttons
  };
  // navHtml owns the ONE hamburger/menu toggle (CSS-only, positioned right before Cart). The model
  // keeps hand-rolling its own — a <button aria-label="Menu">, a stray ☰ icon, a .burger div —
  // which then shows on desktop too and duplicates on mobile. Strip every hand-authored one.
  const stripMenuToggles = (s: string): string =>
    s
      .replace(
        /<(button|label|a|div|span)\b[^>]*(?:aria-label\s*=\s*"(?:toggle\s*)?(?:menu|navigation|nav|hamburger)"|class\s*=\s*"[^"]*(?:hamburger|burger|menu-toggle|nav-toggle|mobile-menu)[^"]*")[^>]*>[\s\S]*?<\/\1>/gi,
        "",
      )
      // a bare three-line hamburger <svg> dropped straight into the header
      .replace(/<svg\b(?:(?!<\/svg>)[\s\S])*?(?:6h18(?:[\s\S]*?)12h18|6h16(?:[\s\S]*?)12h16|M4 6h16M4 12h16M4 18h16)(?:(?!<\/svg>)[\s\S])*?<\/svg>/gi, "")
      .replace(/<(button|a)\b[^>]*>\s*(?:menu|☰|≡)\s*<\/\1>/gi, "");
  const h = stripMenuToggles(rawHeader)
    .replace(/<a\b([^>]*)>([\s\S]*?)<\/a>/gi, (full, attrs: string, inner: string) => (isDupeLink(attrs, inner) ? "" : full))
    // The model sometimes hides the nav wrapper itself (e.g. `display:none` + a media query it
    // then loses to sanitization) trying to hand-roll a responsive menu. Our own CSS-only hamburger
    // (navResponsiveCss) already handles collapsing — so the <nav> that holds it must stay visible.
    .replace(/(<nav\b[^>]*style="[^"]*)\bdisplay\s*:\s*none\s*;?/gi, "$1");
  // PHASE 2.2 — granular slots let the model own the WHOLE header layout (sidebar, split, centered,
  // transparent-over-hero…) and just drop each semantic piece where it belongs. The platform fills
  // the pieces; the model owns everything around them.
  // Brand logo: when the seller set a logo image (Content panel), swap the FIRST bare store-name
  // text node in the header for the {{store.logo}} token (substituteContent turns it into an <img>).
  const logoize = (s: string): string => {
    if (!doc.content.logoUrl) return s;
    const nm = doc.storeName.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    if (/\{\{\s*store\.logo\s*\}\}/i.test(s)) return s;
    return s.replace(new RegExp(`>(\\s*)${nm}(\\s*)<`), ">$1{{store.logo}}$2<");
  };
  let hg = logoize(h);
  const hasGranular = /<!--\s*OD_(NAV_LINKS|CART|ACCOUNT|BURGER)\b/i.test(hg);
  if (hasGranular) {
    // The model may place <!--OD_BURGER--> anywhere (e.g. right after the cart icon, so it renders
    // last) to control icon order explicitly. If it didn't, keep the old bundled behaviour so an
    // existing single-marker header still gets a working mobile toggle without any changes.
    const hasBurgerMarker = /<!--\s*OD_BURGER\s*-->/i.test(hg);
    // <!--OD_NAV_LINKS:sidebar--> opts into the full-height slide-in drawer instead of the default dropdown.
    const sidebarNav = /<!--\s*OD_NAV_LINKS\s*:\s*sidebar\s*-->/i.test(hg);
    hg = hg
      // A bare <!--OD_NAV--> alongside the granular OD_ACCOUNT/OD_CART/OD_BURGER markers is the
      // model mixing the two conventions (it meant the nav-links slot but used the single-marker
      // spelling) — treat it exactly like OD_NAV_LINKS instead of leaving it as a dead comment,
      // which otherwise renders a header with no visible nav links at all.
      .replace(/<!--\s*OD_NAV_LINKS(?:\s*:\s*sidebar)?\s*-->|<!--\s*OD_NAV\s*-->/i, navLinksHtml(doc, businessId, preview, loggedIn, !hasBurgerMarker, sidebarNav))
      .replace(/<!--\s*OD_BURGER\s*-->/i, hasBurgerMarker ? navBurgerHtml() : "")
      .replace(/<!--\s*OD_ACCOUNT\s*-->/i, navAccountHtml(doc, businessId, preview, loggedIn))
      .replace(/<!--\s*OD_CART\s*-->/i, navCartHtml(doc, businessId, preview));
    // any granular marker the model forgot — make sure the piece still lands somewhere
    if (!/data-od-account|Sign in/.test(hg)) {
      const a = navAccountHtml(doc, businessId, preview, loggedIn);
      if (a) hg = hg.replace(/<\/nav>|<\/header>/i, (m) => `${a}${m}`);
    }
    if (!/aria-label="Cart"/i.test(hg)) hg = hg.replace(/<\/nav>|<\/header>/i, (m) => `${navCartHtml(doc, businessId, preview)}${m}`);
    // The model built a custom <nav> (mega-menu etc.) and never used <!--OD_NAV_LINKS--> or
    // <!--OD_BURGER-->, so it has no mobile menu. Inject the CSS-only burger right after the first
    // <nav> that holds real links — navResponsiveCss ("od-nav-scope") then collapses it on small
    // screens. Uses :has() (see navResponsiveCss) so it works regardless of exactly where it lands.
    if (!/od-nav-toggle/i.test(hg)) {
      hg = hg.replace(/<nav\b([^>]*)>/i, (m, attrs: string) => {
        if (!/<a\b/i.test(hg.slice(hg.indexOf(m)))) return m;
        const cls = /class\s*=\s*"([^"]*)"/i.test(attrs)
          ? attrs.replace(/class\s*=\s*"([^"]*)"/i, (_x, c: string) => `class="${c} od-nav-scope"`)
          : `${attrs} class="od-nav-scope"`;
        return `<nav${cls}><input type="checkbox" class="od-nav-toggle" id="od-nav-toggle"><label for="od-nav-toggle" class="od-nav-burger" aria-label="Menu"><svg class="od-burger-open" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M3 6h18M3 12h18M3 18h18"/></svg><svg class="od-burger-close" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M18 6 6 18M6 6l12 12"/></svg></label>`;
      });
    }
    return hg;
  }

  const nav = navHtml(doc, businessId, preview, loggedIn);
  // The nav bundle (links + burger + cart) must sit inside ONE flex <nav> so it groups on the right
  // of the header instead of each piece becoming a stray space-between flex child.
  const navWrapped = `<nav style="display:flex;align-items:center;gap:var(--od-s5);font-size:14px">${nav}</nav>`;
  if (/<!--\s*OD_NAV\s*-->/i.test(hg)) return hg.replace(/<!--\s*OD_NAV\s*-->/i, /<nav\b/i.test(hg) ? nav : navWrapped);
  if (/<\/nav>/i.test(hg)) return hg.replace(/<\/nav>/i, `\n    ${nav}\n  </nav>`);
  return hg.replace(/<\/header>/i, `${navWrapped}</header>`);
}

/**
 * The footer, like the header nav, is now built deterministically from the doc's own data — brand +
 * tagline, the real nav pages, the seller's Content-panel contact details and socials, copyright.
 * The model used to hand-write this HTML and it was the last surface still leaking raw junk
 * (`]]>`, stray tags, a second announcement bar) into every build. `doc.components.footer` is
 * ignored on purpose.
 */
function prepareFooter(doc: OrbitDesignDoc, businessId: string, preview: boolean): string {
  const c = doc.content;
  const hrefFor = (slug: string): string => {
    if (preview) return `href="#" data-od-pnav="${slug}"`;
    if (slug === "home") return `href="/store/${businessId}"`;
    if (FUNCTIONAL_ROUTES[slug]) return `href="/store/${businessId}${FUNCTIONAL_ROUTES[slug]}"`;
    return `href="/store/${businessId}/p/${slug}"`;
  };
  const pages = doc.pages.filter(
    (p) => p.nav !== false && p.slug !== CART_PAGE && p.slug !== PRODUCT_PAGE && !FUNCTIONAL_PAGES.includes(p.slug),
  );
  const navLinks = pages
    .map((p) => `<a ${hrefFor(p.slug)} style="color:var(--od-muted);text-decoration:none">${escapeHtml(p.title)}</a>`)
    .join("\n        ");
  const navCol = navLinks ? `<nav style="display:flex;flex-direction:column;gap:10px;font-size:14px">\n        ${navLinks}\n      </nav>` : "";

  // PHASE 2.2 — if the generator authored a real <footer>, use it. Substitute the page nav where
  // <!--OD_FOOTER_NAV--> is, and make sure a copyright line survives. Bad/empty ones fall through.
  const authored = (doc.components.footer || "").replace(/var\(--(border|text|bg|surface|accent|muted|accent-text)\b/g, "var(--od-$1");
  if (/<footer[\s>]/i.test(authored) && authored.replace(/<[^>]+>/g, "").trim().length > 24) {
    let f = authored.replace(/<!--\s*OD_FOOTER_NAV\s*-->/i, navLinks || "");
    if (!/©|&copy;|all rights reserved/i.test(f)) {
      f = f.replace(
        /<\/footer>/i,
        `<div style="margin-top:var(--od-s6);padding-top:var(--od-s4);border-top:1px solid var(--od-border);color:var(--od-muted);font-size:13px">&copy; ${new Date().getFullYear()} ${escapeHtml(doc.storeName.trim().replace(/\.+$/, ""))}. All rights reserved.</div></footer>`,
      );
    }
    return f;
  }
  const contactRows = [
    c.contactEmail && `<a href="mailto:${escapeAttr(c.contactEmail)}" style="color:var(--od-muted);text-decoration:none">${escapeHtml(c.contactEmail)}</a>`,
    c.contactPhone && `<a href="tel:${escapeAttr(c.contactPhone.replace(/[^\d+]/g, ""))}" style="color:var(--od-muted);text-decoration:none">${escapeHtml(c.contactPhone)}</a>`,
    c.contactAddress && `<span style="color:var(--od-muted)">${escapeHtml(c.contactAddress)}</span>`,
  ].filter(Boolean);
  const contactCol = contactRows.length
    ? `<div style="display:flex;flex-direction:column;gap:10px;font-size:14px">${contactRows.join("\n        ")}</div>`
    : "";
  const socialDefs: [keyof DesignContent["socials"], string][] = [
    ["instagram", "Instagram"],
    ["tiktok", "TikTok"],
    ["facebook", "Facebook"],
    ["x", "X"],
    ["youtube", "YouTube"],
  ];
  const socials = socialDefs
    .filter(([k]) => c.socials?.[k])
    .map(([k, label]) => `<a href="${escapeAttr(c.socials[k])}" target="_blank" rel="noopener" style="color:var(--od-muted);text-decoration:none;font-size:13px">${label}</a>`)
    .join("\n        ");
  const cols = [
    `<div style="max-width:22rem">
        <div style="font-family:var(--od-font-heading);font-weight:var(--od-heading-weight);color:var(--od-text);font-size:18px">${escapeHtml(doc.storeName)}</div>
        ${doc.tagline ? `<p style="margin:10px 0 0;color:var(--od-muted);font-size:14px;line-height:1.6">${escapeHtml(doc.tagline)}</p>` : ""}
        ${socials ? `<div style="display:flex;flex-wrap:wrap;gap:16px;margin-top:16px">${socials}</div>` : ""}
      </div>`,
    navCol,
    contactCol,
  ].filter(Boolean);
  return `<footer style="padding:calc(64px * var(--od-density)) var(--od-gutter) calc(32px * var(--od-density));background:var(--od-surface);border-top:1px solid var(--od-border)">
  <div style="max-width:var(--od-container);margin:0 auto;display:flex;flex-wrap:wrap;gap:48px;justify-content:space-between">
      ${cols.join("\n      ")}
  </div>
  <div style="max-width:var(--od-container);margin:40px auto 0;padding-top:24px;border-top:1px solid var(--od-border);color:var(--od-muted);font-size:13px">
    &copy; ${new Date().getFullYear()} ${escapeHtml(doc.storeName.trim().replace(/\.+$/, ""))}. All rights reserved.
  </div>
</footer>`;
}

/**
 * Repair the two CSS mistakes the model makes constantly in inline styles:
 *  1. `clamp(...)*var(--od-density)` or `24px*var(--od-density)` — a bare `*` between a length and a
 *     var is invalid CSS (needs calc()), which silently voids the WHOLE declaration (usually a
 *     padding/margin → the section then has none and jams against the screen edge on mobile).
 *  2. leftover `onmouseover=` / `onmouseout=` handlers — stripped later for safety anyway, so their
 *     hover effect is dead; nothing to fix, just noted.
 */
function fixInlineCss(html: string): string {
  return (
    html
      // XML/CDATA scaffolding, markdown code fences, and stray document tags the model sometimes
      // leaks into section/header/footer markup — they render as literal junk text ("]]>", "```").
      .replace(/<!\[CDATA\[|\]\]>|```[a-z]*\n?|<\/?(?:html|body|head|!doctype)(?=[\s/>])[^>]*>/gi, "")
      // The model sometimes drops a raw `@media (...){ ... }` block straight into section markup
      // (trying to hand-roll responsiveness) — it renders as literal junk text. Strip it; the kit
      // + mobileSafetyCss already handle responsive.
      .replace(/@media[^{]*\{[^{}]*\}/gi, "")
      .replace(/(clamp\([^()]*\)|-?[\d.]+(?:px|rem|em|vw|vh|%))\s*\*\s*(var\(--od-[a-z-]+\))/gi, "calc($1 * $2)")
      .replace(/(var\(--od-[a-z-]+\))\s*\*\s*(clamp\([^()]*\)|-?[\d.]+(?:px|rem|em|vw|vh|%))/gi, "calc($1 * $2)")
  );
}

/**
 * Pull just the heading + lead out of a legacy product-grid section's HTML. Everything else (the
 * <section> wrapper, the model's own grid attempt, an empty data-od-product-grid placeholder,
 * category pills) is discarded — the renderer builds the grid itself.
 */
function legacyGridIntro(html: string): string {
  if (!html) return "";
  const h = /<(h1|h2|h3)\b[^>]*>([\s\S]*?)<\/\1>/i.exec(html);
  const p = /<p\b[^>]*>([\s\S]*?)<\/p>/i.exec(html);
  const eyebrow = /<[^>]*class="[^"]*od-eyebrow[^"]*"[^>]*>([\s\S]*?)<\/[a-z]+>/i.exec(html);
  const heading = h ? h[2].replace(/<[^>]+>/g, "").trim() : "";
  const lead = p ? p[1].replace(/<[^>]+>/g, "").trim() : "";
  if (!heading && !lead) return "";
  return `<div style="max-width:38rem">
    ${eyebrow ? `<p class="od-eyebrow">${escapeHtml(eyebrow[1].replace(/<[^>]+>/g, "").trim())}</p>` : ""}
    ${heading ? `<h2 class="od-h2">${escapeHtml(heading)}</h2>` : ""}
    ${lead ? `<p class="od-lead">${escapeHtml(lead)}</p>` : ""}
  </div>`;
}

/** The <body> markup for one page + the functional widgets it needs mounted. */
/**
 * A section that hand-writes a core page with made-up field tokens ({{product.name}},
 * {{product.price}}, {{cart.total}}…). Only the bare {{product}} / {{cart}} / {{account}} /
 * {{auth}} / {{track}} markers exist — the dotted ones print literally, with a dead "Add to cart"
 * and no size picker. Such a section is never rendered; the real widget section is.
 */
export function fakesCoreWidget(html: string | undefined): boolean {
  if (!html) return false;
  // Made-up widget tokens, or a hand-drawn sign-in form: only the real {{auth}} / {{account}} widget
  // ever asks for a password — a password box anywhere else is dead and would strand the shopper.
  return /\{\{\s*(product|cart|account|auth|track|checkout)\.[a-z_]+\s*\}\}/i.test(html) || /<input\b[^>]*type\s*=\s*["']?password/i.test(html);
}

export function renderPageBody(doc: OrbitDesignDoc, opts: RenderOpts): { html: string; widgets: PageWidget[] } {
  const page = resolvePage(doc, opts.pageSlug);
  const preview = !!opts.preview;
  const spec = opts.spec ?? defaultSpec();
  const widgets: PageWidget[] = [];
  const block = (html: string) =>
    applySpec(
      widgetMarkers(rewriteLinks(fillImageSlots(sanitizeBlock(fixInlineCss(substituteContent(html, doc))), preview), opts.businessId, preview, doc), preview, opts.currency),
      page.slug,
      spec,
      preview,
      widgets,
    );

  const wrap = (id: string, inner: string) => (preview ? `<div data-od-block="${escapeAttr(id)}">${inner}</div>` : inner);
  const header = wrap("header", block(prepareHeader(doc, opts.businessId, preview, !!opts.loggedIn)));
  const footer = wrap("footer", block(prepareFooter(doc, opts.businessId, preview)));

  const rctx = {
    preview,
    shopHref: "#page:shop",
    content: {
      email: doc.content.contactEmail || undefined,
      phone: doc.content.contactPhone || undefined,
      address: doc.content.contactAddress || undefined,
    },
  };
  const sections = page.sections
    .filter((s) => s.visible && !fakesCoreWidget(s.html))
    .map((s, idx) => {
      // A curated component block takes precedence over legacy html.
      const raw = s.block ? renderBlock(s.block, rctx, idx) : s.html;
      const isGrid = s.type === "product-grid" || s.block?.kind === "product-grid";
      // An explicit "scope this grid to one category" marker — makes ANY section a scoped grid, and
      // also picks the category for a product-grid section that names one.
      const explicit = /(?:data-od-grid-only=["']|<!--\s*grid-only:)\s*([a-z0-9][a-z0-9 -]*)/i.exec(s.html || "")?.[1];
      const named = isGrid ? /category\s*[=:]\s*["']?([a-z0-9][a-z0-9 -]*)/i.exec(s.html || "")?.[1] : undefined;
      const gridOnly = (explicit || named) ? catSlug((explicit || named)!.trim()) : undefined;
      if (isGrid || explicit) {
        // The renderer OWNS the grid markup — the real cards are injected here, once. A legacy
        // section may carry a whole <section id="products"> with its own (empty / placeholder)
        // grid; keep ONLY its heading + lead so we never nest sections or double the grid.
        const introHtml = s.block ? raw : legacyGridIntro(s.html);
        const intro = introHtml.trim() ? block(introHtml) : "";
        const grid = `<section id="products" style="padding:calc(72px*var(--od-density)) var(--od-gutter);background:var(--od-bg)"><div style="max-width:1200px;margin:0 auto">${intro}${productCardsHtml(opts.products, opts.businessId, preview, opts.currency, gridOnly)}</div></section>`;
        return preview ? `<div data-od-block="s:${escapeAttr(s.id)}">${grid}</div>` : grid;
      }
      return `<div data-od-section="${escapeAttr(s.id)}"${preview ? ` data-od-block="s:${escapeAttr(s.id)}"` : ""}>${block(raw)}</div>`;
    })
    .join("\n");

  return { html: `${announcementBar(doc)}\n${header}\n${sections}\n${footer}`, widgets };
}

/**
 * Preview-only bridge. Normally nav links switch the previewed page and cart/product links show a
 * note. Parent can also put the preview in a picking mode via postMessage {__od:'mode', mode}:
 *   mode='edit'    — click a [data-od-block] → posts {__odPreview:'select', block}
 *   mode='comment' — click ANY element → posts {__odPreview:'comment', block, tag, role, text, rect}
 * {__od:'select', block} highlights the current edit selection.
 */
function previewBridgeJs(): string {
  return `(function(){
var MODE='',SEL=null,PICK=null;
function toast(m){var t=document.createElement('div');t.textContent=m;t.style.cssText='position:fixed;left:50%;bottom:22px;transform:translateX(-50%);background:#111;color:#fff;padding:9px 16px;border-radius:999px;font-size:12.5px;z-index:99999;box-shadow:0 8px 24px rgba(0,0,0,.25)';document.body.appendChild(t);setTimeout(function(){t.remove()},2000)}
function roleOf(el){var t=el.tagName.toLowerCase();if(/^h[1-6]$/.test(t))return'heading';if(t==='button'||(t==='a'&&el.getAttribute('href')))return'button / link';if(t==='img'||el.hasAttribute('data-od-imgslot')||el.hasAttribute('data-img-slot'))return'image';if(t==='p'||t==='li')return'text';if(t==='span')return'text';if(t==='input'||t==='textarea'||t==='select')return'form field';if(t==='svg'||el.closest('svg'))return'icon';if(t==='ul'||t==='ol')return'list';return'container';}
// nth-child path from the [data-od-block] wrapper down to el (array of child indices)
function pathTo(el){var blk=el.closest('[data-od-block]');if(!blk)return null;var p=[],n=el;while(n&&n!==blk){var par=n.parentElement;if(!par)return null;p.unshift(Array.prototype.indexOf.call(par.children,n));n=par;}return{block:blk.getAttribute('data-od-block'),path:p};}
function elAt(blockId,path){var blk=document.querySelector('[data-od-block="'+CSS.escape(blockId)+'"]');if(!blk)return null;var n=blk;for(var i=0;i<path.length;i++){n=n&&n.children[path[i]];}return n||null;}
function hi(el){document.querySelectorAll('[data-od-hl]').forEach(function(x){x.style.outline='';x.removeAttribute('data-od-hl')});if(el){el.setAttribute('data-od-hl','');el.style.outline='2px solid #d946ef';el.style.outlineOffset='-1px';}}
window.addEventListener('message',function(ev){var d=ev.data||{};
if(d.__od==='mode'){MODE=d.mode||'';SEL=null;PICK=null;hi(null);document.body.style.cursor=(MODE==='comment'||MODE==='edit')?'crosshair':'';}
if(d.__od==='editMode'){MODE=d.on?'edit':'';SEL=null;PICK=null;hi(null);}
if(d.__od==='select'){SEL=d.block;}
if(d.__od==='setStyle'&&d.block&&d.path){var t=elAt(d.block,d.path);if(t){t.style.cssText=d.style||'';hi(t);}}
if(d.__od==='setText'&&d.block&&d.path){var tt=elAt(d.block,d.path);if(tt&&!tt.querySelector('*')){tt.textContent=d.text==null?'':d.text;hi(tt);}}
if(d.__od==='clearPick'){PICK=null;hi(null);}
});
document.addEventListener('mouseover',function(ev){if(MODE!=='edit'&&MODE!=='comment')return;var el=ev.target;if(!el||el.hasAttribute('data-od-hl'))return;if(MODE==='edit'&&!el.closest('[data-od-block]'))return;el.setAttribute('data-od-hov','');el.style.outline='1px dashed rgba(217,70,239,.55)';el.style.outlineOffset='-1px';},true);
document.addEventListener('mouseout',function(ev){var el=ev.target;if(el&&el.hasAttribute('data-od-hov')){el.removeAttribute('data-od-hov');if(!el.hasAttribute('data-od-hl'))el.style.outline='';}},true);
document.addEventListener('click',function(ev){
var el=ev.target;
if(MODE==='comment'){ev.preventDefault();ev.stopPropagation();var blk=el.closest('[data-od-block]');hi(el);
parent.postMessage({__odPreview:'comment',block:blk?blk.getAttribute('data-od-block'):null,tag:el.tagName.toLowerCase(),role:roleOf(el),text:(el.textContent||el.getAttribute('data-img-slot')||el.getAttribute('data-od-imgslot')||'').replace(/\\s+/g,' ').trim().slice(0,120)},'*');return;}
if(MODE==='edit'){var imgslot=el.closest('[data-od-imgslot]');if(imgslot)el=imgslot;
var pt=pathTo(el);if(pt){ev.preventDefault();ev.stopPropagation();PICK=pt;hi(el);
var leaf=!el.querySelector('*');
var isVid=el.hasAttribute('data-od-videoslot');
var curSrc='';try{var mm=el.querySelector('img,video source,video');if(mm)curSrc=mm.getAttribute('src')||mm.getAttribute('data-video-src')||'';}catch(e){}
parent.postMessage({__odPreview:'pick',block:pt.block,path:pt.path,tag:el.tagName.toLowerCase(),role:roleOf(el),style:el.getAttribute('style')||'',text:(el.textContent||'').replace(/\\s+/g,' ').trim().slice(0,80),fullText:leaf?(el.textContent||''):'',videoSlot:isVid?(el.getAttribute('title')||'video'):'',imgSlot:(!isVid&&el.hasAttribute('data-od-imgslot'))?(el.getAttribute('title')||'image'):'',curSrc:curSrc},'*');return;}}
var n=el.closest('[data-od-pnav]');
if(n){ev.preventDefault();parent.postMessage({__odPreview:'nav',slug:n.getAttribute('data-od-pnav')},'*');return}
var b=el.closest('[data-od-pblock]');
if(b){ev.preventDefault();var k=b.getAttribute('data-od-pblock');toast(k==='cart'?'The cart opens on your published store':'Product pages open on your published store');return}
var a=el.closest('a[href]');
if(a){var h=a.getAttribute('href')||'';
// a pure in-page anchor to an element that exists — let it scroll
if(/^#[A-Za-z][\\w-]*$/.test(h)&&document.getElementById(h.slice(1)))return;
// everything else: never let the preview iframe actually navigate (that lands on a 404 page)
ev.preventDefault();ev.stopPropagation();
var pm=h.match(/(?:#page:|\\/p\\/)([a-z0-9-]+)/i);
if(pm){parent.postMessage({__odPreview:'nav',slug:pm[1]},'*');return}
if(/^(#page:home|#home|\\/)$/i.test(h)||new RegExp('^/store/[^/]+/?$').test(h)){parent.postMessage({__odPreview:'nav',slug:'home'},'*');return}
if(h==='#cart'||/\\/cart(\\/|$)/.test(h)){toast('The cart opens on your published store');return}
if(/\\/(account|login)(\\/|$)/.test(h)||h==='#account'||h==='#login'){toast('The account area opens on your published store');return}
if(h&&h!=='#')toast('Links open on your published store');
}
},true);
})();`;
}

/**
 * The storefront runtime — a self-contained script that makes the Phase-2 wiring hooks work:
 *   [data-od-buy="<productId>"]      → add that product to the guest cart (same localStorage the
 *                                      /cart page and StoreCartBar read)
 *   [data-od-filter="<category>"]    → filter the product grid by [data-od-card][data-od-category]
 *   form[data-od-form="newsletter"]  → POST /api/store/:id/newsletter
 *   form[data-od-form="contact"]     → POST /api/store/:id/contact
 *   [data-od-cart-count]             → live cart-count badge (auto-added next to the Cart link)
 */
export function storefrontRuntimeJs(businessId: string, products: StorefrontProduct[]): string {
  const map: Record<string, { n: string; p: number; i: string | null }> = {};
  for (const p of products) map[p.id] = { n: p.name, p: p.price, i: p.imageUrl };
  return `(function(){
var BID=${JSON.stringify(businessId)},P=${JSON.stringify(map)},K='od_cart_'+BID;
function rd(){try{return JSON.parse(localStorage.getItem(K))||[]}catch(e){return[]}}
function wr(l){try{localStorage.setItem(K,JSON.stringify(l));window.dispatchEvent(new CustomEvent('od-cart-change'))}catch(e){}}
function ct(){return rd().reduce(function(s,x){return s+(x.qty||0)},0)}
function badges(){var c=ct();var q=document.querySelectorAll('[data-od-cart-count]');if(!q.length){var cl=document.querySelector('a[href$="/cart"]');if(cl){var b=document.createElement('span');b.setAttribute('data-od-cart-count','');b.style.cssText='margin-left:6px;background:var(--od-accent);color:var(--od-accent-text);border-radius:999px;font-size:11px;padding:1px 6px;font-weight:700';cl.appendChild(b);q=[b]}}q.forEach(function(el){el.textContent=c;el.style.display=c>0?'':'none'})}
function ev(t,pid){try{window.__odPx&&window.__odPx(t,{content_ids:pid?[pid]:undefined})}catch(e){}try{fetch('/api/store/'+BID+'/event',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({type:t,productId:pid,referrer:document.referrer||undefined}),keepalive:true}).catch(function(){})}catch(e){}}
function add(id,qty){var p=P[id];if(!p)return;var l=rd(),e=l.filter(function(x){return x.productId===id})[0];if(e)e.qty+=qty;else l.push({productId:id,name:p.n,price:p.p,imageUrl:p.i||null,qty:qty});wr(l);badges();toast('Added to cart');ev('add_to_cart',id)}
function toast(m){var t=document.createElement('div');t.textContent=m;t.style.cssText='position:fixed;left:50%;bottom:22px;transform:translateX(-50%);background:var(--od-text,#111);color:var(--od-bg,#fff);padding:10px 18px;border-radius:999px;font-size:13px;z-index:99999;box-shadow:0 10px 30px rgba(0,0,0,.22)';document.body.appendChild(t);setTimeout(function(){t.style.opacity='0';t.style.transition='opacity .3s';setTimeout(function(){t.remove()},300)},1500)}
function lineKeyOf(l){return (l.productId||('bundle:'+l.bundleId))+'::'+(l.variantId||'')}
function money2(n){return (Math.round(n)).toLocaleString()}
function renderCartLines(){
var list=document.querySelector('[data-od-cart-list]');if(!list)return;
if(!list.__odTemplate){var t=list.querySelector('[data-od-cart-line]');if(!t)return;list.__odTemplate=t.cloneNode(true)}
var lines=rd();
list.innerHTML='';
var empty=document.querySelector('[data-od-cart-empty]');
if(!lines.length){if(empty)empty.style.display='';var tot0=document.querySelector('[data-od-cart-total]');if(tot0)tot0.textContent=money2(0);return}
if(empty)empty.style.display='none';
var subtotal=0;
lines.forEach(function(l){
subtotal+=l.price*l.qty;
var row=list.__odTemplate.cloneNode(true);
row.setAttribute('data-od-cart-line',lineKeyOf(l));
var nameEl=row.querySelector('[data-od-cart-name]');if(nameEl)nameEl.textContent=l.name+(l.variantLabel?' — '+l.variantLabel:'');
var priceEl=row.querySelector('[data-od-cart-price]');if(priceEl)priceEl.textContent=money2(l.price*l.qty);
var qtyEl=row.querySelector('[data-od-cart-qty]');if(qtyEl)qtyEl.textContent=l.qty;
var img=row.querySelector('[data-od-cart-image]');if(img&&l.imageUrl)img.src=l.imageUrl;
list.appendChild(row);
});
document.querySelectorAll('[data-od-cart-total]').forEach(function(el){el.textContent=money2(subtotal)});
document.querySelectorAll('[data-od-cart-subtotal]').forEach(function(el){el.textContent=money2(subtotal)});
}
window.addEventListener('od-cart-change',renderCartLines);
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',renderCartLines);else renderCartLines();
function fieldVal(scope,name){var el=scope.querySelector('[data-od-field="'+name+'"]');if(!el)return '';return el.type==='checkbox'?(el.checked?'yes':''):(el.value||'')}
function submitCheckout(f){
var scope=f.closest('[data-od-slot="checkout"]')||f;
var btn=f.querySelector('[type=submit],button[type=submit],button:not([type])');if(btn)btn.disabled=true;
var items=rd().map(function(l){return l.bundleId?{bundleId:l.bundleId,qty:l.qty}:{productId:l.productId,variantId:l.variantId||undefined,qty:l.qty}});
if(!items.length){if(btn)btn.disabled=false;toast('Your cart is empty.');return}
var body={
customerName:fieldVal(scope,'customerName'),customerPhone:fieldVal(scope,'customerPhone'),customerEmail:fieldVal(scope,'customerEmail'),
shipping:{line1:fieldVal(scope,'line1'),city:fieldVal(scope,'city'),area:fieldVal(scope,'area'),postalCode:fieldVal(scope,'postalCode')},
items:items,
payment:(scope.querySelector('[data-od-payment]:checked')||{}).value||'cod',
clientToken:(window.__odClientToken||(window.__odClientToken=(Date.now()+'-'+Math.random().toString(36).slice(2))))
};
var appliedCoupon=scope.querySelector('[data-od-coupon-applied]');if(appliedCoupon&&appliedCoupon.value)body.couponCode=appliedCoupon.value;
var appliedGift=scope.querySelector('[data-od-giftcard-applied]');if(appliedGift&&appliedGift.value)body.giftCardCode=appliedGift.value;
fetch('/api/store/'+BID+'/checkout',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)})
.then(function(r){return r.json().then(function(d){return {ok:r.ok,d:d}})})
.then(function(res){
if(!res.ok){if(btn)btn.disabled=false;toast((res.d&&res.d.error)||'Something went wrong — please try again.');return}
if(res.d.redirect){window.location.href=res.d.redirect;return}
wr([]);badges();
var okEl=scope.querySelector('[data-od-checkout-success]');
if(okEl){
f.style.display='none';okEl.style.display='';
var onEl=okEl.querySelector('[data-od-order-number]');if(onEl)onEl.textContent=res.d.orderId;
var linkEl=okEl.querySelector('[data-od-order-link],a');if(linkEl)linkEl.setAttribute('href','/store/'+BID+'/order/'+res.d.orderId);
// A seller-designed success moment IS the confirmation — stay on it instead of yanking the
// shopper to the platform's plain generic /order/:id page a second later. That page still exists
// for later tracking (a link into it is wired above when the design provides one).
}else{
window.location.href='/store/'+BID+'/order/'+res.d.orderId;
}
}).catch(function(){if(btn)btn.disabled=false;toast('Network error — please try again.')});
}
document.addEventListener('click',function(ev){
var buy=ev.target.closest&&ev.target.closest('[data-od-buy]');
if(buy){ev.preventDefault();var box=buy.closest('[data-od-product],[data-od-card]');var qi=box&&box.querySelector('[data-od-qty],input[type=number]');var q=qi?Math.max(1,parseInt(qi.value,10)||1):1;add(buy.getAttribute('data-od-buy'),q);return}
var qBtn=ev.target.closest&&ev.target.closest('[data-od-qty-inc],[data-od-qty-dec],[data-od-cart-remove]');
if(qBtn){ev.preventDefault();var row=qBtn.closest('[data-od-cart-line]');if(!row)return;var key=row.getAttribute('data-od-cart-line');var lines=rd();
if(qBtn.hasAttribute('data-od-cart-remove')){lines=lines.filter(function(x){return lineKeyOf(x)!==key})}
else{var line=lines.filter(function(x){return lineKeyOf(x)===key})[0];if(line){line.qty+=qBtn.hasAttribute('data-od-qty-inc')?1:-1;if(line.qty<=0)lines=lines.filter(function(x){return lineKeyOf(x)!==key})}}
wr(lines);badges();return}
var capply=ev.target.closest&&(ev.target.closest('[data-od-coupon-apply]')||ev.target.closest('[data-od-giftcard-apply]'));
if(capply){ev.preventDefault();var isGift=capply.hasAttribute('data-od-giftcard-apply');var scope2=capply.closest('[data-od-slot="checkout"]')||document;
var inp=scope2.querySelector(isGift?'[data-od-giftcard-input]':'[data-od-coupon-input]');var code=((inp&&inp.value)||'').trim();if(!code)return;
fetch('/api/store/'+BID+'/coupon',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(isGift?{items:rd(),giftCardCode:code}:{items:rd(),code:code})})
.then(function(r){return r.json()}).then(function(d){
if(d&&d.ok){var attr=isGift?'data-od-giftcard-applied':'data-od-coupon-applied';var hid=scope2.querySelector('['+attr+']');if(!hid){hid=document.createElement('input');hid.type='hidden';hid.setAttribute(attr,'');scope2.appendChild(hid)}hid.value=code;toast(isGift?'Gift card applied':'Coupon applied')}
else toast((d&&d.error)||'That code isn\\u2019t valid.')
});return}
});
function submitAuth(f,kind){
var scope=f;
var btn=f.querySelector('[type=submit],button');if(btn)btn.disabled=true;
var body=kind==='auth-signup'
?{name:fieldVal(scope,'authName'),email:fieldVal(scope,'authEmail'),password:fieldVal(scope,'authPassword')}
:{email:fieldVal(scope,'authEmail'),password:fieldVal(scope,'authPassword')};
fetch('/api/store/'+BID+'/auth/'+(kind==='auth-signup'?'signup':'login'),{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)})
.then(function(r){return r.json().then(function(d){return {ok:r.ok,d:d}})})
.then(function(res){if(!res.ok){if(btn)btn.disabled=false;toast((res.d&&res.d.error)||'Something went wrong.');return}location.reload()})
.catch(function(){if(btn)btn.disabled=false;toast('Network error — try again.')});
}
function submitTrack(f){
var scope=f.closest('[data-od-slot="track"]')||f;
var btn=f.querySelector('[type=submit],button');if(btn)btn.disabled=true;
fetch('/api/store/'+BID+'/orders/lookup',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({orderId:fieldVal(scope,'trackOrderNumber'),phone:fieldVal(scope,'trackPhone')})})
.then(function(r){return r.json().then(function(d){return {ok:r.ok,d:d}})})
.then(function(res){if(btn)btn.disabled=false;
if(!res.ok){toast((res.d&&res.d.error)||'No order found.');return}
var result=scope.querySelector('[data-od-track-result]');if(!result)return;
var o=res.d.order||res.d;
var setText=function(sel,val){var el=result.querySelector(sel);if(el)el.textContent=val};
setText('[data-od-track-status]',o.status||'');
setText('[data-od-track-total]',money2(o.total||0));
setText('[data-od-track-courier]',o.courierName||'');
setText('[data-od-track-number]',o.trackingNumber||'');
result.style.display=''
}).catch(function(){if(btn)btn.disabled=false;toast('Network error — try again.')});
}
document.addEventListener('submit',function(ev){
var f=ev.target.closest&&ev.target.closest('form[data-od-form]');if(!f)return;ev.preventDefault();
var kind=f.getAttribute('data-od-form');
if(kind==='checkout'){submitCheckout(f);return}
if(kind==='auth-login'||kind==='auth-signup'){submitAuth(f,kind);return}
if(kind==='track'){submitTrack(f);return}
var fd=new FormData(f),body={};fd.forEach(function(v,k){body[k]=v});
var btn=f.querySelector('[type=submit],button');if(btn)btn.disabled=true;
fetch('/api/store/'+BID+'/'+(kind==='contact'?'contact':'newsletter'),{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}).then(function(r){return r.json()}).then(function(d){
f.innerHTML='<p style="color:var(--od-muted);font-size:14px;padding:14px 0;margin:0">'+(d&&d.ok?(kind==='contact'?'Thanks — we\\u2019ll be in touch soon.':'You\\u2019re subscribed. Thank you!'):((d&&d.error)||'Something went wrong. Please try again.'))+'</p>';
}).catch(function(){if(btn)btn.disabled=false});
});
// account: sign-out + real order list (template-clone, same pattern as the cart)
(function(){
var acct=document.querySelector('[data-od-slot="account"]');if(!acct)return;
fetch('/api/store/'+BID+'/auth/me').then(function(r){return r.json()}).then(function(me){
var signedIn=!!(me&&me.customer);
var inEl=acct.querySelector('[data-od-account-signedin]'),outEl=acct.querySelector('[data-od-account-signedout]');
if(inEl)inEl.style.display=signedIn?'':'none';
if(outEl)outEl.style.display=signedIn?'none':'';
if(!signedIn)return;
var list=acct.querySelector('[data-od-order-list]');if(!list)return;
var tmpl=list.querySelector('[data-od-order-row]');if(!tmpl)return;
var rowTmpl=tmpl.cloneNode(true);
fetch('/api/store/'+BID+'/orders').then(function(r){return r.json()}).then(function(d){
var orders=Array.isArray(d.orders)?d.orders:[];
list.innerHTML='';
if(!orders.length){var empty=acct.querySelector('[data-od-order-empty]');if(empty)empty.style.display='';return}
orders.forEach(function(o){
var row=rowTmpl.cloneNode(true);
var setText=function(sel,val){var el=row.querySelector(sel);if(el)el.textContent=val};
setText('[data-od-order-number]','#'+String(o.id).slice(-6).toUpperCase());
setText('[data-od-order-status]',o.status||'');
setText('[data-od-order-total]',money2(o.total||0));
list.appendChild(row);
});
});
});
acct.addEventListener('click',function(ev){
var so=ev.target.closest&&ev.target.closest('[data-od-signout]');if(!so)return;ev.preventDefault();
fetch('/api/store/'+BID+'/auth/logout',{method:'POST'}).then(function(){location.reload()});
});
})();
// product grid: live category + attribute + price filters, search, sort (no reload)
(function(){
var grid=document.querySelector('[data-od-grid]');if(!grid)return;
var search=document.querySelector('[data-od-grid-search]'),sort=document.querySelector('[data-od-grid-sort]'),empty=document.querySelector('[data-od-grid-empty]');
var pills=Array.prototype.slice.call(document.querySelectorAll('[data-od-grid-cat],[data-od-filter]'));
var attrPills=Array.prototype.slice.call(document.querySelectorAll('[data-od-opt]'));
var pmin=document.querySelector('[data-od-grid-pmin]'),pmax=document.querySelector('[data-od-grid-pmax]');
var clear=document.querySelector('[data-od-grid-clear]');
var order=Array.prototype.slice.call(grid.querySelectorAll('[data-od-card]'));
var activeCat='all';
var activeOpts={}; // groupSlug -> {valSlug:true}
var groupSet={};attrPills.forEach(function(p){var g=(p.getAttribute('data-od-opt')||'').split(':')[0];if(g)groupSet[g]=1});
function parseVals(c){var raw=c.getAttribute('data-od-optvals')||'';var o={};raw.split(';').forEach(function(pr){var i=pr.indexOf(':');if(i<0)return;o[pr.slice(0,i)]=pr.slice(i+1).split(',')});return o}
// deep-linkable filters: /p/shop?cat=socks&colour=black,white&size=m&pmin=1000&pmax=5000&q=&sort=price-asc
function readUrl(){try{var u=new URLSearchParams(location.search);
if(u.get('cat'))activeCat=u.get('cat').toLowerCase();
for(var g in groupSet){var v=u.get(g);if(v){activeOpts[g]={};v.split(',').forEach(function(x){if(x)activeOpts[g][x.toLowerCase()]=true})}}
if(pmin&&u.get('pmin'))pmin.value=u.get('pmin');if(pmax&&u.get('pmax'))pmax.value=u.get('pmax');
if(search&&u.get('q'))search.value=u.get('q');if(sort&&u.get('sort'))sort.value=u.get('sort');
}catch(e){}}
function writeUrl(){try{var u=new URLSearchParams();
if(activeCat&&activeCat!=='all')u.set('cat',activeCat);
for(var g in activeOpts){var on=[];for(var k in activeOpts[g])if(activeOpts[g][k])on.push(k);if(on.length)u.set(g,on.join(','))}
if(pmin&&pmin.value)u.set('pmin',pmin.value);if(pmax&&pmax.value)u.set('pmax',pmax.value);
if(search&&search.value.trim())u.set('q',search.value.trim());if(sort&&sort.value&&sort.value!=='featured')u.set('sort',sort.value);
var qs=u.toString();history.replaceState(null,'',location.pathname+(qs?'?'+qs:''));}catch(e){}}
function syncUI(){
pills.forEach(function(x){var slug=(x.getAttribute('data-od-grid-cat')||x.getAttribute('data-od-filter')||'').toLowerCase();var on=slug===activeCat||(activeCat==='all'&&slug==='all');x.setAttribute('aria-pressed',String(on));if(x.hasAttribute('data-od-grid-cat')){x.style.background=on?'var(--od-text)':'transparent';x.style.color=on?'var(--od-bg)':'var(--od-muted)'}});
attrPills.forEach(function(x){var kv=(x.getAttribute('data-od-opt')||'').split(':');var on=!!(activeOpts[kv[0]]&&activeOpts[kv[0]][kv[1]]);x.setAttribute('aria-pressed',String(on));x.style.background=on?'var(--od-text)':'transparent';x.style.color=on?'var(--od-bg)':'var(--od-muted)'});
}
function optOk(c){var have=parseVals(c);for(var g in activeOpts){var sel=activeOpts[g];var any=false;for(var k in sel){if(sel[k])any=true}if(!any)continue;var hv=have[g]||[];var hit=false;for(var k2 in sel){if(sel[k2]&&hv.indexOf(k2)>=0)hit=true}if(!hit)return false}return true}
function priceOk(c){var p=+c.getAttribute('data-od-price');var mn=pmin&&parseFloat(pmin.value),mx=pmax&&parseFloat(pmax.value);if(mn&&p<mn)return false;if(mx&&p>mx)return false;return true}
function apply(){
var q=(search&&search.value||'').trim().toLowerCase();
var s=sort&&sort.value||'featured';
var arr=order.slice();
if(s==='price-asc')arr.sort(function(a,b){return (+a.getAttribute('data-od-price'))-(+b.getAttribute('data-od-price'))});
else if(s==='price-desc')arr.sort(function(a,b){return (+b.getAttribute('data-od-price'))-(+a.getAttribute('data-od-price'))});
else if(s==='name')arr.sort(function(a,b){return (a.getAttribute('data-od-name')||'').localeCompare(b.getAttribute('data-od-name')||'')});
var shown=0;
arr.forEach(function(c){grid.appendChild(c);
var cc=(c.getAttribute('data-od-category')||'').toLowerCase();
var catOk=activeCat==='all'||!activeCat||cc===activeCat;
var qOk=!q||(c.getAttribute('data-od-name')||'').indexOf(q)>=0;
var m=catOk&&qOk&&optOk(c)&&priceOk(c);c.style.display=m?'':'none';if(m)shown++;});
if(empty)empty.hidden=shown>0;
if(clear){var anyOpt=false;for(var g in activeOpts){for(var k in activeOpts[g])if(activeOpts[g][k])anyOpt=true}
clear.hidden=!(activeCat!=='all'||anyOpt||q||(pmin&&pmin.value)||(pmax&&pmax.value)||(sort&&sort.value!=='featured'));}
writeUrl();
}
pills.forEach(function(pill){pill.addEventListener('click',function(){
activeCat=(pill.getAttribute('data-od-grid-cat')||pill.getAttribute('data-od-filter')||'all').toLowerCase();
pills.forEach(function(x){var on=x===pill;x.setAttribute('aria-pressed',String(on));if(x.hasAttribute('data-od-grid-cat')){x.style.background=on?'var(--od-text)':'transparent';x.style.color=on?'var(--od-bg)':'var(--od-muted)'}});
apply();
})});
attrPills.forEach(function(pill){pill.addEventListener('click',function(){
var kv=(pill.getAttribute('data-od-opt')||'').split(':'),g=kv[0],v=kv[1];if(!g||!v)return;
activeOpts[g]=activeOpts[g]||{};activeOpts[g][v]=!activeOpts[g][v];
var on=activeOpts[g][v];pill.setAttribute('aria-pressed',String(on));
pill.style.background=on?'var(--od-text)':'transparent';pill.style.color=on?'var(--od-bg)':'var(--od-muted)';
apply();
})});
if(pmin)pmin.addEventListener('input',apply);
if(pmax)pmax.addEventListener('input',apply);
if(search)search.addEventListener('input',apply);
if(sort)sort.addEventListener('change',apply);
if(clear)clear.addEventListener('click',function(){
activeCat='all';activeOpts={};
if(pmin)pmin.value='';if(pmax)pmax.value='';if(search)search.value='';if(sort)sort.value='featured';
pills.forEach(function(x){var on=(x.getAttribute('data-od-grid-cat')||'')==='all';x.setAttribute('aria-pressed',String(on));if(x.hasAttribute('data-od-grid-cat')){x.style.background=on?'var(--od-text)':'transparent';x.style.color=on?'var(--od-bg)':'var(--od-muted)'}});
attrPills.forEach(function(x){x.setAttribute('aria-pressed','false');x.style.background='transparent';x.style.color='var(--od-muted)'});
apply();
});
readUrl();syncUI();apply();
window.addEventListener('popstate',function(){activeCat='all';activeOpts={};if(pmin)pmin.value='';if(pmax)pmax.value='';if(search)search.value='';if(sort)sort.value='featured';readUrl();syncUI();apply();});
})();
// let React finish hydrating the server HTML before we touch the DOM (add the cart badge)
setTimeout(badges,80);
window.addEventListener('od-cart-change',badges);
${interactionRuntimeJs()}
})();`;
}

/**
 * The safe interaction layer — the model writes plain markup with data-attributes and this wires
 * the behaviour. No arbitrary JS in section HTML (still stripped for security); these run
 * identically in the studio preview and on the published store.
 *
 *   [data-od-accordion] > [data-od-acc-item] > [data-od-acc-trigger] + [data-od-acc-panel]
 *   [data-od-tabs] with [data-od-tab="k"] buttons and [data-od-panel="k"] panels
 *   [data-od-carousel] > [data-od-track] > [data-od-slide]…  + [data-od-prev] [data-od-next]  (opt data-od-autoplay="ms")
 *   [data-od-reveal] / [data-od-reveal="up|fade|scale|left|right"]  — fades in on scroll
 *   [data-od-count="1234"]  — counts up when scrolled into view
 *   [data-od-marquee]  — seamless auto-scrolling row
 *   [data-od-shrink] on the header — gets [data-od-scrolled] after 24px of scroll
 */
function interactionRuntimeJs(): string {
  return `try{
var RM=window.matchMedia&&window.matchMedia('(prefers-reduced-motion:reduce)').matches;
// accordion
document.addEventListener('click',function(ev){
var t=ev.target.closest&&ev.target.closest('[data-od-acc-trigger]');if(!t)return;
var item=t.closest('[data-od-acc-item]'),acc=t.closest('[data-od-accordion]');if(!item)return;
var open=item.hasAttribute('data-od-open');
if(acc&&!acc.hasAttribute('data-od-multi'))acc.querySelectorAll('[data-od-acc-item][data-od-open]').forEach(function(i){if(i!==item){i.removeAttribute('data-od-open');var p=i.querySelector('[data-od-acc-panel]');if(p)p.style.maxHeight='0px'}});
var panel=item.querySelector('[data-od-acc-panel]');
if(open){item.removeAttribute('data-od-open');if(panel)panel.style.maxHeight='0px'}
else{item.setAttribute('data-od-open','');if(panel)panel.style.maxHeight=panel.scrollHeight+'px'}
});
// tabs
document.addEventListener('click',function(ev){
var tb=ev.target.closest&&ev.target.closest('[data-od-tab]');if(!tb)return;
var wrap=tb.closest('[data-od-tabs]');if(!wrap)return;var k=tb.getAttribute('data-od-tab');
wrap.querySelectorAll('[data-od-tab]').forEach(function(b){b.setAttribute('aria-selected',String(b===tb))});
wrap.querySelectorAll('[data-od-panel]').forEach(function(p){p.style.display=p.getAttribute('data-od-panel')===k?'':'none'});
});
document.querySelectorAll('[data-od-tabs]').forEach(function(w){var first=w.querySelector('[data-od-tab]');if(first){var k=first.getAttribute('data-od-tab');w.querySelectorAll('[data-od-panel]').forEach(function(p){p.style.display=p.getAttribute('data-od-panel')===k?'':'none'});first.setAttribute('aria-selected','true')}});
// carousel — arrows, swipe, keyboard, dots ([data-od-dots] gets one button per slide), autoplay that pauses on hover / hidden tab
document.querySelectorAll('[data-od-carousel]').forEach(function(c){
var track=c.querySelector('[data-od-track]');if(!track)return;var slides=track.querySelectorAll('[data-od-slide]');if(!slides.length)return;
var i=0,n=slides.length;track.style.display='flex';track.style.flexWrap='nowrap';track.style.transition=RM?'none':'transform .45s cubic-bezier(.4,0,.2,1)';slides.forEach(function(s,k){s.style.flex='0 0 100%';s.style.minWidth='0';s.setAttribute('aria-roledescription','slide');s.setAttribute('aria-label',(k+1)+' of '+n)});
c.setAttribute('aria-roledescription','carousel');if(!c.hasAttribute('tabindex'))c.setAttribute('tabindex','0');
var dotsWrap=c.querySelector('[data-od-dots]'),dots=[];
if(dotsWrap&&n>1){dotsWrap.innerHTML='';for(var d=0;d<n;d++){(function(k){var b=document.createElement('button');b.type='button';b.setAttribute('aria-label','Go to slide '+(k+1));b.addEventListener('click',function(){go(k);restart()});dotsWrap.appendChild(b);dots.push(b)})(d)}}
function go(m){i=(m+n)%n;track.style.transform='translateX(-'+(i*100)+'%)';dots.forEach(function(b,k){if(k===i)b.setAttribute('aria-current','true');else b.removeAttribute('aria-current')});slides.forEach(function(s,k){s.setAttribute('aria-hidden',String(k!==i))})}
var p=c.querySelector('[data-od-prev]'),nx=c.querySelector('[data-od-next]');
if(p)p.addEventListener('click',function(){go(i-1);restart()});if(nx)nx.addEventListener('click',function(){go(i+1);restart()});
c.addEventListener('keydown',function(e){if(e.key==='ArrowLeft'){go(i-1);restart()}else if(e.key==='ArrowRight'){go(i+1);restart()}});
var sx=null,sy=0;
c.addEventListener('touchstart',function(e){sx=e.touches[0].clientX;sy=e.touches[0].clientY;stop()},{passive:true});
c.addEventListener('touchend',function(e){if(sx===null)return;var dx=e.changedTouches[0].clientX-sx,dy=e.changedTouches[0].clientY-sy;sx=null;if(Math.abs(dx)>40&&Math.abs(dx)>Math.abs(dy))go(dx<0?i+1:i-1);start()},{passive:true});
var ap=parseInt(c.getAttribute('data-od-autoplay'),10),iv=null;
function start(){if(ap>0&&!RM&&n>1&&!iv)iv=setInterval(function(){if(!document.hidden)go(i+1)},ap)}
function stop(){if(iv){clearInterval(iv);iv=null}}
function restart(){stop();start()}
c.addEventListener('mouseenter',stop);c.addEventListener('mouseleave',start);c.addEventListener('focusin',stop);c.addEventListener('focusout',start);
go(0);start();
});
// scroll reveal + count-up
var REV='[data-od-reveal],[data-od-reveal-stagger]';
// Anything already on-screen at load must show INSTANTLY (no fade-from-nothing flash for the hero).
document.querySelectorAll(REV).forEach(function(el){var r=el.getBoundingClientRect();if(r.top<(window.innerHeight||800)*0.9){el.setAttribute('data-od-innow','');el.setAttribute('data-od-in','')}});
if('IntersectionObserver' in window){
var io=new IntersectionObserver(function(es){es.forEach(function(e){if(!e.isIntersecting)return;var el=e.target;
if(el.hasAttribute('data-od-reveal')||el.hasAttribute('data-od-reveal-stagger'))el.setAttribute('data-od-in','');
if(el.hasAttribute('data-od-count')){var to=parseFloat(el.getAttribute('data-od-count'))||0,d=RM?0:1100,st=null;function tick(ts){if(!st)st=ts;var pr=Math.min(1,(ts-st)/d);el.textContent=Math.round(to*(0.5-Math.cos(pr*Math.PI)/2)).toLocaleString();if(pr<1)requestAnimationFrame(tick)}requestAnimationFrame(tick)}
io.unobserve(el)})},{threshold:.12});
document.querySelectorAll(REV+',[data-od-count]').forEach(function(el){io.observe(el)});
}else{document.querySelectorAll(REV).forEach(function(el){el.setAttribute('data-od-in','')})}
// Safety net: content must NEVER stay invisible. If the observer hasn't revealed something within
// 2.2s (odd scroll containers, the studio preview, a slow load), force it visible.
setTimeout(function(){document.querySelectorAll(REV).forEach(function(el){if(!el.hasAttribute('data-od-in'))el.setAttribute('data-od-in','')})},2200);
// marquee
document.querySelectorAll('[data-od-marquee]').forEach(function(m){if(RM)return;var inner=m.firstElementChild;if(!inner)return;inner.style.display='inline-flex';var clone=inner.cloneNode(true);m.appendChild(clone);m.style.overflow='hidden';m.style.whiteSpace='nowrap';var sp=parseFloat(m.getAttribute('data-od-marquee'))||30;[inner,clone].forEach(function(n){n.style.animation='od-marquee '+sp+'s linear infinite'});});
// header shrink — the runtime applies a subtle compact style itself (no CSS needed from the model)
var sh=document.querySelector('header[data-od-shrink]');if(sh){var bp=sh.style.paddingTop,bpb=sh.style.paddingBottom;sh.style.transition='padding .25s ease,box-shadow .25s ease';var onsc=function(){var on=window.scrollY>24;sh.style.boxShadow=on?'0 2px 16px rgba(0,0,0,.08)':'';if(on){sh.style.paddingTop='10px';sh.style.paddingBottom='10px'}else{sh.style.paddingTop=bp;sh.style.paddingBottom=bpb}};onsc();window.addEventListener('scroll',onsc,{passive:true})}
// self-drawing SVG — [data-od-draw] on an <svg> or a group: its stroked paths draw themselves on scroll-in
(function(){var dr=[].slice.call(document.querySelectorAll('[data-od-draw]'));if(!dr.length)return;
// the model sometimes puts data-od-draw directly ON the shape (a lone <circle data-od-draw>) instead
// of on a wrapping <svg>/<g> — draw the host itself too when it IS a shape, not only its descendants.
var shapesOf=function(host){var self=host.matches&&host.matches('path,line,polyline,circle,ellipse,rect')?[host]:[];return self.concat([].slice.call(host.querySelectorAll('path,line,polyline,circle,ellipse,rect')))};
var prep=function(host){var sh=shapesOf(host);[].forEach.call(sh,function(p){var L;try{L=p.getTotalLength?p.getTotalLength():0}catch(e){L=0}if(!L)return;p.style.strokeDasharray=L;p.style.strokeDashoffset=RM?0:L;p.style.transition='stroke-dashoffset '+(1.1+Math.random()*0.4).toFixed(2)+'s cubic-bezier(.6,0,.2,1) '+(0.05).toFixed(2)+'s'});};
var go=function(host){var sh=shapesOf(host);[].forEach.call(sh,function(p,i){setTimeout(function(){p.style.strokeDashoffset=0},i*90)})};
dr.forEach(prep);
if('IntersectionObserver' in window){var dio=new IntersectionObserver(function(es){es.forEach(function(e){if(e.isIntersecting){go(e.target);dio.unobserve(e.target)}})},{threshold:.2});dr.forEach(function(h){dio.observe(h)})}else dr.forEach(go);
setTimeout(function(){dr.forEach(go)},2500);})();
// parallax — [data-od-parallax] (opt "0.15".."0.6" strength) drifts as it scrolls through the viewport
var px=[].slice.call(document.querySelectorAll('[data-od-parallax]'));
if(px.length&&!RM){px.forEach(function(el){el.style.willChange='transform'});var pt=false;var ppump=function(){pt=false;var vh=window.innerHeight||800;if((window.innerWidth||1024)<768){px.forEach(function(el){el.style.transform=''});return}px.forEach(function(el){var r=el.getBoundingClientRect();var mid=r.top+r.height/2;var prog=(mid-vh/2)/(vh);var str=parseFloat(el.getAttribute('data-od-parallax'))||0.22;el.style.transform='translate3d(0,'+(-prog*str*vh).toFixed(1)+'px,0)'})};var pon=function(){if(!pt){pt=true;requestAnimationFrame(ppump)}};ppump();window.addEventListener('scroll',pon,{passive:true});window.addEventListener('resize',pon)}
// Material-style ripple — one shared handler for every .od-btn/.odw-btn so clickable surfaces
// give real tactile feedback, colour-matched to the element's own text colour (currentColor).
document.addEventListener('pointerdown',function(ev){
var el=ev.target.closest&&ev.target.closest('.od-btn,.odw-btn,.odw-btn-ghost,[data-od-ripple]');if(!el||RM)return;
if(getComputedStyle(el).position==='static')el.style.position='relative';
if(getComputedStyle(el).overflow!=='hidden')el.style.overflow='hidden';
var r=el.getBoundingClientRect();var d=Math.max(r.width,r.height)*1.6;
var span=document.createElement('span');span.className='od-ripple';
span.style.width=span.style.height=d+'px';
span.style.left=(ev.clientX-r.left-d/2)+'px';span.style.top=(ev.clientY-r.top-d/2)+'px';
el.appendChild(span);span.addEventListener('animationend',function(){span.remove()});
},{passive:true});
}catch(e){}`;
}

/**
 * The design-kit classes every generated section composes from — one button, one card, one type
 * ramp, one spacing/elevation language. Sections that reference these read as one designed system
 * instead of N hand-rolled blobs. All token-driven, so the knobs + Tweaks still retune everything.
 */
function designKitCss(scope: string): string {
  // Form fields a section draws itself (a contact form, a newsletter box) — the site-wide reset
  // strips their border, so they'd show as blank space under their label. Zero specificity: any
  // class or inline style the design gives a field (and every widget's own fields) still wins.
  return `:where(${scope}) :where(input:not([type=checkbox]):not([type=radio]):not([type=range]):not([type=hidden]),textarea,select){font:inherit;color:var(--od-text);background:var(--od-bg);border:1px solid var(--od-border);border-radius:var(--od-radius-md);padding:10px 12px;min-height:44px;box-sizing:border-box}
:where(${scope}) :where(textarea){min-height:110px}
:where(${scope}) :where([data-od-form] label){display:block;margin-bottom:6px;font-size:var(--od-text-sm);color:var(--od-muted)}
${scope} .od-section{padding:var(--od-section-y) var(--od-gutter)}
${scope} .od-section-sm{padding:var(--od-s8) var(--od-gutter)}
${scope} .od-section:first-of-type{padding-top:var(--od-s7)}
${scope} .od-section--hero{padding-top:var(--od-s7);padding-bottom:var(--od-s8)}
${scope} .od-section--invert{background:var(--od-accent);color:var(--od-accent-text)}
${scope} .od-section--invert .od-h1,${scope} .od-section--invert .od-h2,${scope} .od-section--invert .od-h3,${scope} .od-section--invert .od-lead,${scope} .od-section--invert .od-body,${scope} .od-section--invert p,${scope} .od-section--invert li,${scope} .od-section--invert h1,${scope} .od-section--invert h2,${scope} .od-section--invert h3{color:var(--od-accent-text)}
${scope} .od-section--invert .od-eyebrow{color:color-mix(in srgb, var(--od-accent-text) 72%, var(--od-accent))}
${scope} .od-section--invert .od-btn-primary{background:var(--od-accent-text);color:var(--od-accent);box-shadow:none}
${scope} .od-section--invert .od-btn-ghost{background:transparent;color:var(--od-accent-text);border-color:color-mix(in srgb, var(--od-accent-text) 45%, transparent)}
${scope} .od-section--invert input,${scope} .od-section--invert textarea{background:color-mix(in srgb, var(--od-accent-text) 12%, var(--od-accent));border-color:color-mix(in srgb, var(--od-accent-text) 30%, transparent);color:var(--od-accent-text)}
${scope} .od-section--invert input::placeholder{color:color-mix(in srgb, var(--od-accent-text) 55%, transparent)}
${scope} .od-section--invert .od-card{background:color-mix(in srgb, var(--od-accent-text) 8%, var(--od-accent));border-color:color-mix(in srgb, var(--od-accent-text) 16%, transparent)}
${scope} .od-container{max-width:var(--od-container);margin-inline:auto;width:100%}
${scope} .od-container-narrow{max-width:var(--od-container-narrow);margin-inline:auto;width:100%}
${scope} .od-bleed{width:100vw;margin-left:calc(50% - 50vw);margin-right:calc(50% - 50vw);max-width:100vw}
${scope} .od-stack{display:flex;flex-direction:column}
${scope} .od-grid{display:grid;gap:var(--od-s6);grid-template-columns:repeat(auto-fit,minmax(min(100%,var(--od-col-min,260px)),1fr))}
${scope} .od-eyebrow{display:inline-block;font:600 var(--od-text-xs)/1.4 var(--od-font-body);letter-spacing:.14em;text-transform:uppercase;color:var(--od-accent);margin:0 0 var(--od-s4)}
${scope} .od-h1{font-family:var(--od-font-heading);font-weight:var(--od-heading-weight);font-size:var(--od-text-5xl);line-height:1.04;letter-spacing:-.021em;color:var(--od-text);margin:0}
${scope} .od-h2{font-family:var(--od-font-heading);font-weight:var(--od-heading-weight);font-size:var(--od-text-3xl);line-height:1.12;letter-spacing:-.014em;color:var(--od-text);margin:0}
${scope} .od-h3{font-family:var(--od-font-heading);font-weight:var(--od-heading-weight);font-size:var(--od-text-xl);line-height:1.25;color:var(--od-text);margin:0}
${scope} .od-lead{font:400 var(--od-text-lg)/1.6 var(--od-font-body);color:var(--od-muted);margin:var(--od-s4) 0 0;max-width:46ch}
${scope} .od-body{font:400 var(--od-text-base)/1.68 var(--od-font-body);color:var(--od-text)}
${scope} .od-btn{display:inline-flex;align-items:center;justify-content:center;gap:var(--od-s2);min-height:46px;padding:0 var(--od-s6);border-radius:var(--od-radius-md);border:1px solid transparent;font:600 var(--od-text-sm)/1 var(--od-font-body);text-decoration:none;cursor:pointer;transition:transform .16s var(--od-ease),box-shadow .16s var(--od-ease),background .16s,opacity .16s;white-space:nowrap;position:relative;overflow:hidden}
${scope} .od-ripple{position:absolute;border-radius:50%;background:currentColor;opacity:.28;transform:scale(0);animation:od-ripple .55s ease-out forwards;pointer-events:none}
@keyframes od-ripple{to{transform:scale(1);opacity:0}}
${scope} .od-btn-primary{background:var(--od-accent);color:var(--od-accent-text);box-shadow:var(--od-shadow-sm)}
${scope} .od-btn-primary:hover{transform:translateY(-1px);box-shadow:var(--od-shadow-md);opacity:1}
${scope} .od-btn-ghost{background:transparent;color:var(--od-text);border-color:var(--od-border)}
${scope} .od-btn-ghost:hover{background:var(--od-surface);transform:translateY(-1px);opacity:1}
${scope} .od-card{background:var(--od-bg);border:1px solid var(--od-border);border-radius:var(--od-radius-lg);padding:var(--od-s6);box-shadow:var(--od-shadow-sm)}
${scope} .od-card--soft{background:var(--od-surface);border-color:transparent}
${scope} .od-card--lift{transition:transform .22s var(--od-ease),box-shadow .22s var(--od-ease)}
${scope} .od-card--lift:hover{transform:translateY(-4px);box-shadow:var(--od-shadow-lg)}
${scope} [data-od-reveal-stagger]>*{opacity:0;transform:translateY(20px);transition:opacity .55s var(--od-ease),transform .55s var(--od-ease)}
${scope} [data-od-reveal-stagger][data-od-in]>*{opacity:1;transform:none}
${scope} [data-od-reveal-stagger][data-od-in]>*:nth-child(2){transition-delay:.08s}
${scope} [data-od-reveal-stagger][data-od-in]>*:nth-child(3){transition-delay:.16s}
${scope} [data-od-reveal-stagger][data-od-in]>*:nth-child(4){transition-delay:.24s}
${scope} [data-od-reveal-stagger][data-od-in]>*:nth-child(5){transition-delay:.32s}
${scope} [data-od-reveal-stagger][data-od-in]>*:nth-child(n+6){transition-delay:.4s}`;
}

function shellCss(scope: string): string {
  return `${scope} *,${scope} *::before,${scope} *::after{box-sizing:border-box}
${scope}{font-family:var(--od-font-body);color:var(--od-text);background:var(--od-bg);line-height:1.6;min-height:100dvh;overflow-x:hidden}
${scope} img{max-width:100%;display:block;height:auto}
${scope} *{overflow-wrap:break-word}
${scope} a{color:inherit;text-decoration:none;transition:opacity .15s ease}${scope} a:hover{opacity:.82}
@media (prefers-reduced-motion:reduce){${scope} *{animation:none!important;transition:none!important}}
${designKitCss(scope)}
${navResponsiveCss(scope)}
${mobileSafetyCss(scope)}
${interactionCss(scope)}`;
}

/** Base styling for the safe interaction hooks (see interactionRuntimeJs). */
function interactionCss(scope: string): string {
  return `${scope} [data-od-acc-panel]{max-height:0;overflow:hidden;transition:max-height .32s cubic-bezier(.4,0,.2,1)}
${scope} [data-od-acc-trigger]{cursor:pointer;width:100%;text-align:left;background:none;border:0;color:inherit;font:inherit}
${scope} [data-od-tab]{cursor:pointer}
${scope} [data-od-prev],${scope} [data-od-next]{cursor:pointer;user-select:none}
${scope} [data-od-carousel]{overflow:hidden}
${scope} [data-od-track]{flex-wrap:nowrap!important}
${scope} [data-od-dots]{display:flex;gap:8px;justify-content:center}
${scope} [data-od-dots] button{width:8px;height:8px;padding:0;border:0;border-radius:99px;background:currentColor;opacity:.35;cursor:pointer;transition:opacity .2s,width .25s}
${scope} [data-od-dots] button[aria-current]{opacity:1;width:22px}
${scope} [data-od-reveal]{opacity:0;transform:translateY(24px);transition:opacity .6s ease,transform .6s cubic-bezier(.4,0,.2,1)}
${scope} [data-od-reveal="fade"]{transform:none}
${scope} [data-od-reveal="scale"]{transform:scale(.94)}
${scope} [data-od-reveal="left"]{transform:translateX(-28px)}
${scope} [data-od-reveal="right"]{transform:translateX(28px)}
${scope} [data-od-reveal][data-od-in]{opacity:1;transform:none}
${scope} [data-od-reveal][data-od-innow],${scope} [data-od-reveal-stagger][data-od-innow],${scope} [data-od-reveal-stagger][data-od-innow]>*{transition:none!important}
${scope} [data-od-marquee]{overflow:hidden;white-space:nowrap}
@keyframes od-marquee{from{transform:translateX(0)}to{transform:translateX(-100%)}}
${scope} [data-od-parallax]{will-change:transform}
${scope} [data-od-hover]{transition:transform .3s var(--od-ease),box-shadow .3s var(--od-ease),opacity .3s}
${scope} [data-od-hover="lift"]:hover{transform:translateY(-4px);box-shadow:var(--od-shadow-lg)}
${scope} [data-od-hover="zoom"]{overflow:hidden}
${scope} [data-od-hover="zoom"] img,${scope} [data-od-hover="zoom"] [data-od-imgslot]{transition:transform .5s var(--od-ease)}
${scope} [data-od-hover="zoom"]:hover img,${scope} [data-od-hover="zoom"]:hover [data-od-imgslot]{transform:scale(1.05)}
${scope} [data-od-hover="glow"]:hover{box-shadow:0 0 0 1px var(--od-accent),0 8px 30px color-mix(in srgb,var(--od-accent) 35%,transparent)}
${scope} [data-od-hover="underline"]{background-image:linear-gradient(var(--od-accent),var(--od-accent));background-size:0% 2px;background-position:0 100%;background-repeat:no-repeat;transition:background-size .3s var(--od-ease)}
${scope} [data-od-hover="underline"]:hover{background-size:100% 2px}
${scope} [data-od-dash]{stroke-dasharray:8 6;animation:od-dash 1.1s linear infinite}
@keyframes od-dash{to{stroke-dashoffset:-14}}
${scope} [data-od-spin]{transform-box:fill-box;transform-origin:center;animation:od-spin 14s linear infinite}
@keyframes od-spin{to{transform:rotate(360deg)}}
@media (prefers-reduced-motion:reduce){${scope} [data-od-reveal]{opacity:1;transform:none}${scope} [data-od-parallax]{transform:none!important}${scope} [data-od-dash],${scope} [data-od-spin]{animation:none}}`;
}

/**
 * A last-resort responsive safety net for the model's section HTML. The model is told to use
 * clamp()/flex-wrap/auto-fit, but it still ships fixed 2-column grids and wide flex rows that jam
 * on a phone. Below 720px this forces every explicit multi-column grid to a single column and lets
 * flex rows wrap — enough to keep any generated page usable at 375px even when the HTML isn't.
 */
function mobileSafetyCss(scope: string): string {
  return `${scope} [style*="display:flex"]:not(header):not(header *),${scope} [style*="display: flex"]:not(header):not(header *){flex-wrap:wrap}
${scope} h1,${scope} h2,${scope} .od-h1,${scope} .od-h2{overflow-wrap:break-word;max-width:100%}
@media (max-width:900px){
${scope} h1,${scope} .od-h1{font-size:clamp(30px,6.2vw,46px)!important;line-height:1.08!important}
}
@media (max-width:720px){
${scope} [style*="grid-template-columns"]{grid-template-columns:1fr!important}
${scope} [style*="grid-template-columns"] > *{grid-column:1!important;grid-row:auto!important}
${scope} h1,${scope} .od-h1{font-size:clamp(28px,8vw,40px)!important;line-height:1.1!important}
${scope} h2,${scope} .od-h2{font-size:clamp(23px,6.5vw,34px)!important;line-height:1.15!important}
}`;
}

/**
 * CSS-only (no JS) mobile menu for the auto-generated header nav — navHtml() wraps its links in a
 * checkbox + label + container using these classes; below the breakpoint the links collapse behind
 * a hamburger toggle so a header with many pages (Home/Product/etc.) never overflows on phones.
 */
function navResponsiveCss(scope: string): string {
  return `${scope} .od-nav-toggle{display:none}
${scope} .od-nav-burger{display:none;align-items:center;justify-content:center;cursor:pointer;width:32px;height:32px;color:var(--od-text)}
${scope} .od-nav-links{display:flex;gap:22px;align-items:center;flex-wrap:wrap}
${scope} .od-nav-links a{transition:padding-left .2s ease,color .2s ease}
${scope} .od-nav-links a:hover{padding-left:5px;color:var(--od-accent)}
@media (max-width:900px){
${scope} header{position:relative}
${scope} .od-nav-burger{display:inline-flex}
/* :has() (not the old :checked ~ sibling selector) — the toggle and the links it opens can now sit
   ANYWHERE in the header (different flex groups, before or after the icons, wherever the layout
   calls for), not just as direct siblings. This is what makes icon order (e.g. "cart, then burger,
   burger last") and a header built as logo + centered nav + a separate icon cluster both actually
   work: nothing has to stay physically adjacent for the toggle to work. */
${scope} header:has(.od-nav-toggle:checked) .od-nav-burger .od-burger-open{display:none}
${scope} header:has(.od-nav-toggle:not(:checked)) .od-nav-burger .od-burger-close{display:none}
/* DEFAULT drawer: drops out of the header's own flex flow (position:absolute, anchored to the
   nearest positioned ancestor — header) instead of stacking inline, so an expanding menu never
   pushes icons that come after it down the page. */
${scope} .od-nav-links:not([data-od-nav-style="sidebar"]){display:none;flex-direction:column;align-items:flex-start;gap:16px;position:absolute;top:100%;left:0;right:0;width:auto;margin-top:0;padding:16px var(--od-gutter,20px) 20px;border-top:1px solid var(--od-border);background:var(--od-bg);z-index:80;box-shadow:var(--od-shadow-lg)}
${scope} header:has(.od-nav-toggle:checked) .od-nav-links:not([data-od-nav-style="sidebar"]){display:flex}
/* SIDEBAR variant — set data-od-nav-style="sidebar" on .od-nav-links (or pass it wherever
   <!--OD_NAV_LINKS--> is placed) for a full-height slide-in drawer instead of a dropdown. Put
   <!--OD_ACCOUNT-->/<!--OD_CART-->/a search control INSIDE it (after the links) to have them live in
   the drawer on mobile instead of the header bar. */
${scope} .od-nav-links[data-od-nav-style="sidebar"]{position:fixed;top:0;right:0;bottom:0;height:100dvh;width:min(84vw,340px);display:flex;flex-direction:column;align-items:flex-start;gap:4px;margin:0;padding:88px 28px 28px;border:0;border-left:1px solid var(--od-border);background:color-mix(in srgb, var(--od-bg) 94%, transparent);backdrop-filter:blur(18px);box-shadow:-24px 0 60px -10px rgba(0,0,0,.35);z-index:90;overflow-y:auto;transform:translateX(105%);transition:transform .4s cubic-bezier(.3,0.9,.3,1);visibility:hidden}
${scope} header:has(.od-nav-toggle:checked) .od-nav-links[data-od-nav-style="sidebar"]{transform:translateX(0);visibility:visible}
${scope} .od-nav-links[data-od-nav-style="sidebar"] a{width:100%;padding:13px 0;border-bottom:1px solid var(--od-border)}
/* soft blurred scrim behind whichever drawer variant is open */
${scope} header:has(.od-nav-toggle:checked)::after{content:"";position:fixed;inset:0;background:rgba(8,8,10,.42);backdrop-filter:blur(3px);z-index:70;animation:od-scrim-in .3s ease both}
@keyframes od-scrim-in{from{opacity:0}to{opacity:1}}
/* custom nav (mega-menu): burger is injected as the first child of <nav.od-nav-scope>, links + dropdowns are its next siblings */
${scope} nav.od-nav-scope{flex-wrap:wrap;row-gap:12px}
${scope} nav.od-nav-scope > a,${scope} nav.od-nav-scope > [data-od-dropdown]{display:none;width:100%}
${scope} nav.od-nav-scope:has(.od-nav-toggle:checked) > a,${scope} nav.od-nav-scope:has(.od-nav-toggle:checked) > [data-od-dropdown]{display:block}
${scope} [data-od-dropdown] [data-od-panel]{position:static!important;opacity:1;visibility:visible;transform:none;box-shadow:none;border:0;padding:4px 0 4px 12px;margin-top:6px;flex-direction:column}
}
/* CSS-only mega-menu: [data-od-dropdown] wraps a trigger + [data-od-panel]; panel fades/slides on hover or keyboard focus */
${scope} [data-od-dropdown]{position:relative}
${scope} [data-od-dropdown] [data-od-panel]{position:absolute;top:100%;left:0;opacity:0;visibility:hidden;transform:translateY(8px);transition:opacity .2s var(--od-ease),transform .2s var(--od-ease),visibility .2s;z-index:60;background:var(--od-bg);border:1px solid var(--od-border);border-radius:var(--od-radius);box-shadow:var(--od-shadow-lg);padding:var(--od-s5)}
${scope} [data-od-dropdown]:hover [data-od-panel],${scope} [data-od-dropdown]:focus-within [data-od-panel]{opacity:1;visibility:visible;transform:none}
@media (prefers-reduced-motion:reduce){${scope} [data-od-dropdown] [data-od-panel]{transition:none}}`;
}

const STORE_WRAPPER = "od-store";

/**
 * Everything the real /store route needs, split so the React page can render `<link>` / `<style>`
 * as proper JSX elements (which React 19 hoists to <head> without a hydration mismatch) and keep
 * only the body markup in a `dangerouslySetInnerHTML` div.
 */
export function renderPageParts(
  doc: OrbitDesignDoc,
  opts: RenderOpts,
): { fontHref: string; css: string; bodyHtml: string; widgets: PageWidget[] } {
  const scoped = tokenCss(doc.tokens).replace(":root{", `#${STORE_WRAPPER}{`);
  const { html, widgets } = renderPageBody(doc, opts);
  const preloader = doc.motion?.preloader && !opts.preview ? preloaderHtml(doc) : "";
  return {
    fontHref: googleFontHref(doc.tokens.googleFonts),
    css: `${scoped}
${tweaksCss(doc.tweaks, `#${STORE_WRAPPER}`)}
html,body{background:${cssColor(doc.tokens.bg)}}
${shellCss(`#${STORE_WRAPPER}`)}
${preloader ? preloaderCss() : ""}`,
    bodyHtml: `${preloader}<div id="${STORE_WRAPPER}">${html}</div>`,
    widgets,
  };
}

/** A full-screen intro veil that fades away once the page has loaded (or after 1.4s max). Renders
 *  OUTSIDE #od-store so it must carry its own colour/type values inline. */
function preloaderHtml(doc: OrbitDesignDoc): string {
  const t = doc.tokens;
  const style = `background:${cssColor(t.bg)};--od-mark:${cssColor(t.text)};--od-mark-font:${escapeAttr(t.fontHeading)};--od-mark-weight:${Number(t.headingWeight) || 600}`;
  return `<div id="od-preload" aria-hidden="true" style="${style}"><span class="od-preload-mark">${escapeHtml(doc.storeName)}</span></div>
<script>(function(){var el=document.getElementById('od-preload');if(!el)return;var done=function(){el.setAttribute('data-od-gone','');setTimeout(function(){el.remove()},650)};if(window.matchMedia&&window.matchMedia('(prefers-reduced-motion:reduce)').matches){el.remove();return}window.addEventListener('load',function(){setTimeout(done,220)});setTimeout(done,1400)})();</script>`;
}
function preloaderCss(): string {
  return `#od-preload{position:fixed;inset:0;z-index:9999;display:flex;align-items:center;justify-content:center;transition:opacity .5s ease,visibility .5s}
#od-preload .od-preload-mark{font-family:var(--od-mark-font,var(--od-font-heading));font-weight:var(--od-mark-weight,600);font-size:clamp(20px,4vw,30px);letter-spacing:.02em;color:var(--od-mark,#111);opacity:0;animation:od-preload-in .5s ease forwards}
#od-preload[data-od-gone]{opacity:0;visibility:hidden;pointer-events:none}
@keyframes od-preload-in{to{opacity:.9}}`;
}

/** Full standalone HTML document — the studio preview iframe and the "Download HTML" export. */
export function renderPageDocument(doc: OrbitDesignDoc, opts: RenderOpts): string {
  const page = resolvePage(doc, opts.pageSlug);
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(doc.storeName)}${page.slug !== "home" ? ` — ${escapeHtml(page.title)}` : ""}</title>
${googleFontsLink(doc.tokens.googleFonts)}
<style>${tokenCss(doc.tokens)}
${tweaksCss(doc.tweaks)}
${shellCss("body")}
body{margin:0}</style>
</head>
<body>
${renderPageBody(doc, opts).html}
<script>${storefrontRuntimeJs(opts.businessId, opts.products)}</script>
${opts.preview ? `<script>${previewBridgeJs()}</script>` : ""}
</body>
</html>`;
}

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

export function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n));
}

function cssColor(v: string): string {
  if (typeof v !== "string" || /[{}();]|url\(|expression/i.test(v)) return "#000";
  return v.trim().slice(0, 40) || "#000";
}

function parseHexColor(v: unknown): [number, number, number] | null {
  if (typeof v !== "string") return null;
  const m = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(v.trim());
  if (!m) return null;
  let h = m[1];
  if (h.length === 3) h = h.split("").map((c) => c + c).join("");
  const n = parseInt(h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
function relLuminance([r, g, b]: [number, number, number]): number {
  const f = (v: number) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}
function contrastRatio(a: [number, number, number], b: [number, number, number]): number {
  const [hi, lo] = [relLuminance(a), relLuminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}
function mixHex(rgb: [number, number, number], target: [number, number, number], amt: number): string {
  const c = rgb.map((v, i) => Math.round(v + (target[i] - v) * amt));
  return `#${c.map((v) => clamp(v, 0, 255).toString(16).padStart(2, "0")).join("")}`;
}

/**
 * Deterministic safety net for the one failure mode the generator can't be prompted out of reliably:
 * a dark theme whose `text`/`muted` token comes back dark too (near-identical to `bg`), which renders
 * as invisible dark-on-dark text across most of the store. Prompt wording alone doesn't catch this
 * consistently, so enforce WCAG contrast in code — same rule regardless of what aesthetic the model
 * chose (dark, light, colourful, monochrome all pass through unchanged as long as they're readable).
 */
function ensureReadableTokens(tokens: DesignTokens): void {
  const bg = parseHexColor(tokens.bg);
  if (bg) {
    const bgLum = relLuminance(bg);
    const safeInk = bgLum > 0.5 ? "#12141a" : "#f5f6f8"; // dark ink for light bg, light ink for dark bg
    const fix = (key: "text" | "muted" | "border", min: number) => {
      const rgb = parseHexColor(tokens[key]);
      if (!rgb || contrastRatio(rgb, bg!) < min) tokens[key] = key === "border" ? mixHex(bg!, bgLum > 0.5 ? [0, 0, 0] : [255, 255, 255], 0.18) : safeInk;
    };
    fix("text", 7);
    fix("muted", 3);
    fix("border", 1.15);
    // A light `surface` (card/panel) on a dark bg, or a dark surface on a light bg, reads as a jarring
    // flash instead of a subtle panel — nudge it onto the same side of the bg's luminance.
    const surface = parseHexColor(tokens.surface);
    if (surface) {
      const surfLum = relLuminance(surface);
      const wrongSide = bgLum < 0.5 ? surfLum > 0.62 : surfLum < 0.38;
      if (wrongSide) tokens.surface = mixHex(bg, bgLum < 0.5 ? [255, 255, 255] : [0, 0, 0], 0.07);
    }
  }
  const accent = parseHexColor(tokens.accent);
  if (accent) {
    const rgb = parseHexColor(tokens.accentText);
    if (!rgb || contrastRatio(rgb, accent) < 4.5) tokens.accentText = relLuminance(accent) > 0.5 ? "#12141a" : "#ffffff";
  }
}

export function escapeHtml(s: string): string {
  return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

function escapeAttr(s: string): string {
  return escapeHtml(s);
}
