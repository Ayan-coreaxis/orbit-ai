/**
 * Site-craft store builder — the simple way.
 *
 * No art-direction picker, no design-skill library, no planner rulebook. The designer gets ONE
 * skill (site-craft, bundled in lib/site-craft-skill.ts) as its system prompt, a short brief about
 * the store, and the platform's small technical contract (links, live product blocks, header
 * markers). Call 1 sets the design system (concept, tokens, stylesheet, header, footer); then every
 * page is built in parallel against that system.
 *
 * Switch back to the classic pipeline with ORBIT_STORE_BUILDER=classic.
 */
import type Anthropic from "@anthropic-ai/sdk";
import { prisma } from "@/lib/prisma";
import { anthropic, ensureModelConfigLoaded, MODEL } from "@/lib/anthropic";
import { estimateCostUsd } from "@/lib/pricing";
import { money } from "@/lib/money";
import { SITE_CRAFT_SKILL } from "@/lib/site-craft-skill";
import { defaultTokens, normalizeDoc, renderPageDocument, type DesignPage, type OrbitDesignDoc, type StorefrontProduct } from "@/lib/orbit-design";
import { renderDocShots } from "@/lib/screenshot";
import { resolveStockMedia } from "@/lib/stock-media";
import { remainingIssues, runStoreQa } from "@/lib/site-craft-qa";
import { splashFrom } from "@/lib/design-intake";
import { toStorefrontProducts } from "@/lib/storefront-products";
import {
  DESIGN_PRODUCT_SELECT,
  coerceToolInput,
  contentWithAnnounce,
  ensureCoreContentPages,
  honestAnnouncement,
  loadDoc,
  realReviewsNote,
  type DesignRef,
  safeShell,
  saveDoc,
  type TurnResult,
} from "@/lib/orbit-design-generate";

export function useSiteCraftBuilder(): boolean {
  return (process.env.ORBIT_STORE_BUILDER || "site-craft").toLowerCase() !== "classic";
}

const SYSTEM: Anthropic.TextBlockParam[] = [
  {
    type: "text",
    text: `You are the designer inside Orbit, a store builder for small online sellers. Follow the site-craft skill below — it is your whole design method.

You are running inside a builder, not a chat: do not ask the client questions (use the brief and sensible defaults), and skip the screenshot step (the platform reviews the result). Everything else in the skill applies — especially art direction first, the anti-pattern list, the e-commerce guide, real states, contrast and mobile-first.

${SITE_CRAFT_SKILL}`,
    cache_control: { type: "ephemeral" },
  },
];

/** The design-phase contract. The designer owns every pixel; these lines only say how the finished
 *  design is handed to the backend step (Handoff), which attaches the real catalogue, cart and
 *  checkout to the designer's own markup afterwards. */
const CONTRACT = `THIS IS THE DESIGN PHASE. You design the whole store freely — nothing on the page is pre-built by the platform. You design the header and its mobile menu, the product cards, the shop grid and its filters, the cart button, everything. After the seller is happy with the design, Orbit's backend step attaches the real catalogue, cart and checkout to YOUR markup, and the seller's dashboard is set up around what you designed. So:
- Products: design them as you would on any shop. Use the store's real products listed below when there are any (real name, price, id). With none (or too few for a rail), add realistic sample products for this niche and put data-od-sample on their cards. If the seller's brief is clearly about a different brand or kind of product than the catalogue below (they are trying a new idea), the BRIEF wins: ignore the catalogue and design with sample products that fit the brief, marked data-od-sample. Put data-od-product="<product name>" on every product card and data-od-buy="<product id, if known>" on its add-to-cart button, and link cards to href="#product:<id>" — that is how the backend finds them later.
- Images: never guess photo URLs. Describe the photo and the platform fills a real matching stock photo: <img class="sc-..." data-img-query="raw honey dripping from wooden dipper, warm light" alt="what it shows" loading="lazy"> — write the query like a photo search (subject, setting, light, mood), specific to this store. A real product photo from the list below always wins for that product (use src="<that url>" instead). Every product card needs a photo: a product marked "no photo" (or a sample product) gets <img data-img-query="..."> describing that product (e.g. "jar of dark raw honey with wooden dipper, studio light") — never a flat coloured box with the name written on it. Never draw products or people with SVG/CSS.
- Video: <video class="sc-..." data-video-query="beekeeper lifting a honeycomb frame, slow motion"></video> — the platform fills a real stock clip (muted, looping, inline) or a placeholder the seller replaces. Put it in a positioned container sized by your CSS.
- THE SELLER'S DESIGN DECISIONS in the brief (hero, header, product cards, home sections, feel) are binding — build exactly what they chose; your craft decides how it looks. REFERENCE IMAGES (attached, labelled in the brief): follow each for the part it is labelled for — layout, spacing, type and colour mood, never its text or logos. The SPLASH SCREEN is run by the platform: do NOT build one.
- Output: HTML + one stylesheet. No <script>, no <style> inside the HTML, no on* handlers (behaviour is added in the backend step). Build interactive parts with HTML + CSS (<details>/<summary>, :target, :has(), a checkbox toggle for the mobile menu, CSS scroll-snap for rails) or the hooks below.
- There is no wrapper element of yours around the page: put shared custom properties on :root, never on an invented wrapper class, and name your own ones --sc-* (the --od-* names belong to the tokens).
- Every class you write starts with "sc-" so it never clashes with the platform. All rules go in the stylesheet: media queries, :hover, :focus-visible, @keyframes, prefers-reduced-motion.
- Tokens: set tokens so the platform's own screens that you don't design yet (checkout, account) match — bg = page background, text = body text on bg, muted = secondary text, surface = panel near bg, border, accent + accentText = action colour and the text on it, fonts, radius. Any other brand colours go in tokens.palette and are used as var(--od-<name>).
- googleFonts: plain Google family names only (e.g. "Fraunces", "Manrope").
- Links: href="#page:home", "#page:shop", "#page:about", "#page:contact", "#page:faq"; cart href="#cart" (add data-od-cart-count to the element that should show the count); one product href="#product:<id>".
- Optional hooks if they suit the design: data-od-accordion > data-od-acc-item > (button data-od-acc-trigger + div data-od-acc-panel); data-od-carousel > data-od-track > data-od-slide (+ data-od-prev / data-od-next, data-od-dots); data-od-marquee="28"; data-od-reveal="up|fade|scale"; data-od-shrink on a sticky header; forms <form data-od-form="newsletter"> (input name="email") and <form data-od-form="contact"> (name, email, textarea name="message").
- Contact details and socials: {{contact.email}} {{contact.phone}} {{contact.address}} {{social.instagram}} {{social.facebook}} {{social.tiktok}} {{store.name}} {{store.year}} — nothing else between braces.
- MEASURED AFTER THE BUILD in a real browser (failures get patched, so get them right first time): (1) the hero — headline, one-line intro and the main button — fits inside ONE screen at 1440×900 AND 390×844: headline at most clamp(2.2rem,5.5vw,5rem) and at most 4 lines, hero padding at most ~12vh; (2) every piece of text has at least 4.5:1 contrast against what is behind it — any card, button, chip or panel with its own background sets its OWN text colour (never inherit it from the coloured section around it), and header links get an explicit colour for the header's background; (3) no image taller than 75% of the screen except the hero; (4) a section may overlap its neighbour only by padding that holds no text; (5) product grids: 4 columns from 1100px, 3 from 800px, 2 on phones, card image ratio 4/5, a card never taller than ~70% of the screen; (6) one consistent section spacing scale and one left edge for headings.
- CSS-only toggles (mobile menu, tabs, swatches): every toggle <input> gets its OWN unique id AND its own unique class (never share one class like "sc-menu-checkbox" between different toggles, never repeat an id on the page, header and footer included), and starts UNCHECKED unless the design really needs it open. A slide-in menu panel must be fully closed (off-screen, visibility:hidden) until its own checkbox is checked — a panel that is open on load blocks the entire page.
- Honesty: never invent reviews, customer names, ratings, stats, years, press, policies (returns, open-before-you-pay, money-back) or delivery times. Only what the brief and store facts say.`;

const DESIGN_TOOL: Anthropic.Tool = {
  name: "design_system",
  description: "The store's design system: concept, tokens, stylesheet, header and footer.",
  input_schema: {
    type: "object",
    properties: {
      concept: {
        type: "string",
        description:
          "Your art-direction brief from the skill: one-line concept, signature moment, image direction, type and palette reasoning, layout idea, voice, and the 3 template moves you will NOT make.",
      },
      tokens: {
        type: "object",
        properties: {
          bg: { type: "string" },
          surface: { type: "string" },
          text: { type: "string" },
          muted: { type: "string" },
          border: { type: "string" },
          accent: { type: "string" },
          accentText: { type: "string" },
          fontHeading: { type: "string", description: "CSS stack, e.g. 'Fraunces', Georgia, serif" },
          fontBody: { type: "string" },
          googleFonts: { type: "array", items: { type: "string" } },
          radius: { type: "number" },
          palette: {
            type: "array",
            items: { type: "object", properties: { name: { type: "string" }, value: { type: "string" } }, required: ["name", "value"] },
          },
        },
        required: ["bg", "surface", "text", "muted", "border", "accent", "accentText", "fontHeading", "fontBody", "googleFonts"],
      },
      css: {
        type: "string",
        description: "The shared stylesheet: type scale, buttons, links, header, footer, section rhythm and utilities every page reuses. All classes sc- prefixed.",
      },
      header: { type: "string" },
      footer: { type: "string" },
      announcement: { type: "string", description: "One-line announcement bar text, or empty for none. Only true facts." },
      tagline: { type: "string" },
      pages: {
        type: "array",
        description: "What each page is for, one line each — home, shop, about, contact, faq (add one more only if the brief needs it).",
        items: {
          type: "object",
          properties: { slug: { type: "string" }, title: { type: "string" }, purpose: { type: "string" } },
          required: ["slug", "title", "purpose"],
        },
      },
      reply: { type: "string", description: "Two short sentences to the seller: the concept and the signature moment." },
    },
    required: ["concept", "tokens", "css", "header", "footer", "pages", "reply"],
  },
};

const PAGE_TOOL: Anthropic.Tool = {
  name: "build_page",
  description: "One finished page of the store.",
  input_schema: {
    type: "object",
    properties: {
      sections: {
        type: "array",
        items: {
          type: "object",
          properties: {
            id: { type: "string", description: "short kebab id" },
            label: { type: "string", description: "name the seller sees, e.g. 'Hero'" },
            html: { type: "string", description: "one top-level <section>" },
          },
          required: ["id", "label", "html"],
        },
      },
      css: {
        type: "string",
        description: "Every rule this page needs beyond the shared stylesheet — EVERY class you use that the shared stylesheet doesn't define must be defined here (sc- prefixed, unique to this page).",
      },
    },
    required: ["sections", "css"],
  },
};

type DesignOut = {
  concept: string;
  tokens: Record<string, unknown>;
  css: string;
  header: string;
  footer: string;
  announcement?: string;
  tagline?: string;
  pages: { slug: string; title: string; purpose: string }[];
  reply: string;
};

type PageOut = { sections?: { id: string; label: string; html: string }[]; css?: string };

async function callTool<T>(businessId: string, tool: Anthropic.Tool, prompt: string, maxTokens: number, images: DesignRef[] = []): Promise<T | null> {
  const msg = await anthropic.messages
    .stream({
      model: MODEL,
      max_tokens: maxTokens,
      system: SYSTEM,
      tools: [tool],
      tool_choice: { type: "tool", name: tool.name },
      messages: [
        {
          role: "user",
          content: [
            ...images.map((im): Anthropic.ImageBlockParam => ({ type: "image", source: { type: "base64", media_type: im.mediaType, data: im.data } })),
            { type: "text", text: prompt },
          ],
        },
      ],
    })
    .finalMessage();
  prisma.agentUsage
    .create({
      data: {
        businessId,
        agentId: `orbit-design-sitecraft-${tool.name}`,
        model: MODEL,
        inputTokens: msg.usage.input_tokens,
        outputTokens: msg.usage.output_tokens,
        costUsd: estimateCostUsd(MODEL, msg.usage.input_tokens, msg.usage.output_tokens),
      },
    })
    .catch(() => {});
  const block = msg.content.find((b) => b.type === "tool_use");
  if (block && block.type === "tool_use") {
    const inp = block.input as Record<string, unknown>;
    console.warn(`[site-craft] ${tool.name}: stop=${msg.stop_reason} out=${msg.usage.output_tokens} keys=${Object.keys(inp).map((k) => `${k}:${Array.isArray(inp[k]) ? "array" : typeof inp[k]}`).join(",")}`);
  } else console.warn(`[site-craft] ${tool.name}: no tool call, stop=${msg.stop_reason}`);
  // long nested fields sometimes come back as a JSON string — parse them back
  return block && block.type === "tool_use" ? (coerceToolInput(block.input as Record<string, unknown>) as T) : null;
}

function pageBrief(slug: string): string {
  if (slug === "home")
    return "The home page of a store that sells: products visible early, then story and trust. Its first section is the hero with the page's only <h1>.";
  if (/^(shop|store|catalog)/.test(slug))
    return "The shop page: every product as a designed grid (2 columns on phones), with category filters you build in CSS/HTML, sort and a result count.";
  if (slug === "contact") return 'The contact page: how to reach the seller ({{contact.*}} tokens) and a <form data-od-form="contact">.';
  if (slug === "faq")
    return "The FAQ page: questions a shopper of this store really asks, answered only with facts from the brief and store facts.";
  return "";
}

/** Classes used in the markup that no rule in the stylesheet defines. */
export function undefinedClasses(html: string, css: string): string[] {
  const used = new Set<string>();
  for (const m of html.matchAll(/class="([^"]*)"/g)) for (const c of m[1].split(/\s+/)) if (c.startsWith("sc-")) used.add(c);
  const defined = new Set<string>();
  for (const m of css.matchAll(/\.(sc-[a-zA-Z0-9_-]+)/g)) defined.add(m[1]);
  return [...used].filter((c) => !defined.has(c));
}

const SYSTEM_FONTS = /^(georgia|times|times new roman|arial|helvetica|segoe ui|system-ui|-apple-system|sans-serif|serif|monospace|ui-sans-serif|ui-serif|cursive)$/i;
function cleanFonts(list: unknown): string[] {
  const out = new Set<string>();
  for (const f of Array.isArray(list) ? list : []) {
    const name = String(f).split(":")[0].replace(/['"]/g, "").trim();
    if (name && !SYSTEM_FONTS.test(name)) out.add(name);
  }
  return [...out].slice(0, 4);
}

/** Custom properties parked on a class nothing uses (an imagined wrapper like .sc-root) never apply —
 *  move those rules onto :root so the type scale and spacing actually reach the page. */
export function liftOrphanVarRules(css: string, html: string): string {
  return css.replace(/(^|[}\s])\.(sc-[a-zA-Z0-9_-]+)\s*\{([^{}]*)\}/g, (m, pre: string, cls: string, body: string) =>
    /--[a-z0-9-]+\s*:/i.test(body) && !new RegExp(`class="[^"]*\\b${cls}\\b`).test(html) ? `${pre}:root{${body}}` : m,
  );
}

const FIX_CSS_TOOL: Anthropic.Tool = {
  name: "page_css",
  description: "The missing stylesheet rules for a page.",
  input_schema: { type: "object", properties: { css: { type: "string" } }, required: ["css"] },
};

/** Swap every dummy photo URL that doesn't load for a seeded stand-in, so no card shows a broken image. */
export async function fixBrokenImages(texts: string[], keep: Set<string>): Promise<Map<string, string>> {
  const urls = new Set<string>();
  for (const t of texts) for (const m of t.matchAll(/(?:src|data-img-src)="(https:\/\/[^"]+)"/g)) if (!keep.has(m[1])) urls.add(m[1]);
  const swap = new Map<string, string>();
  await Promise.all(
    [...urls].slice(0, 60).map(async (u) => {
      const ok = await fetch(u, { method: "GET", redirect: "follow", signal: AbortSignal.timeout(6000) })
        .then((r) => r.ok && /^image\//.test(r.headers.get("content-type") || ""))
        .catch(() => false);
      if (!ok) {
        // a quiet tinted block — never a random landscape
        swap.set(u, "data:image/svg+xml;utf8,%3Csvg xmlns='http://www.w3.org/2000/svg' width='4' height='5'%3E%3Crect width='4' height='5' fill='%23d9d4cc'/%3E%3C/svg%3E");
      }
    }),
  );
  return swap;
}

const REVIEW_TOOL: Anthropic.Tool = {
  name: "fix_store",
  description: "Fixes after looking at the screenshots.",
  input_schema: {
    type: "object",
    properties: {
      verdict: { type: "string", description: "Honest one-paragraph critique: QA failures and the taste tests (AI-default look, logo-swap, template, describe-it)." },
      sections: {
        type: "array",
        description: "Only sections you changed: full replacement html.",
        items: {
          type: "object",
          properties: { page: { type: "string" }, id: { type: "string" }, html: { type: "string" } },
          required: ["page", "id", "html"],
        },
      },
      css: { type: "string", description: "Rules to ADD at the end of the stylesheet (overrides allowed)." },
    },
    required: ["verdict"],
  },
};

/** The skill's self-check: screenshot the store, critique it like the skill says, fix what fails. */
async function selfCheck(businessId: string, doc: OrbitDesignDoc, products: StorefrontProduct[], concept: string): Promise<{ doc: OrbitDesignDoc; verdict?: string }> {
  const slugs = ["home", ...doc.pages.filter((p) => /^(shop|store)$/.test(p.slug)).map((p) => p.slug)].slice(0, 2);
  const shots = await renderDocShots(slugs.map((slug) => ({ label: slug, html: renderPageDocument(doc, { products, businessId, pageSlug: slug }) }))).catch(() => []);
  if (!shots.length) return { doc };
  const markup = slugs
    .map((slug) => {
      const p = doc.pages.find((x) => x.slug === slug);
      return `PAGE /${slug}\n${(p?.sections ?? []).map((s) => `<!-- section id="${s.id}" -->\n${s.html}`).join("\n")}`;
    })
    .join("\n\n")
    .slice(0, 60000);
  const content: Anthropic.ContentBlockParam[] = [];
  for (const s of shots) {
    content.push({ type: "text", text: s.label });
    content.push({ type: "image", source: { type: "base64", media_type: s.mediaType, data: s.data } });
  }
  content.push({
    type: "text",
    text: `These are screenshots of the store you just designed (desktop 1440 and phone 390). Do the skill's step 4 now: run the QA checklist and the taste critique on what you SEE — broken or empty areas, overlaps, cramped or oversized type, weak contrast, unaligned edges, the phone layout, anything that looks AI-default or template. Then fix it.

ART DIRECTION: ${concept}

${CONTRACT}

CURRENT STYLESHEET:
${(doc.css ?? "").slice(0, 30000)}

CURRENT MARKUP:
${markup}`,
  });
  const msg = await anthropic.messages
    .stream({ model: MODEL, max_tokens: 24000, system: SYSTEM, tools: [REVIEW_TOOL], tool_choice: { type: "tool", name: "fix_store" }, messages: [{ role: "user", content }] })
    .finalMessage();
  prisma.agentUsage
    .create({ data: { businessId, agentId: "orbit-design-sitecraft-review", model: MODEL, inputTokens: msg.usage.input_tokens, outputTokens: msg.usage.output_tokens, costUsd: estimateCostUsd(MODEL, msg.usage.input_tokens, msg.usage.output_tokens) } })
    .catch(() => {});
  const block = msg.content.find((b) => b.type === "tool_use");
  if (!block || block.type !== "tool_use") return { doc };
  const out = coerceToolInput(block.input as Record<string, unknown>) as { verdict?: string; sections?: { page: string; id: string; html: string }[]; css?: string };
  const next: OrbitDesignDoc = { ...doc, pages: doc.pages.map((p) => ({ ...p, sections: p.sections.map((s) => ({ ...s })) })) };
  let changed = 0;
  for (const f of Array.isArray(out.sections) ? out.sections : []) {
    const sec = next.pages.find((p) => p.slug === String(f.page).replace(/^\//, ""))?.sections.find((s) => s.id === f.id);
    if (sec && typeof f.html === "string" && f.html.trim().length > 40) {
      sec.html = f.html;
      changed++;
    }
  }
  if (out.css) next.css = `${next.css ?? ""}\n/* self-check */\n${out.css}`;
  console.warn(`[site-craft] self-check: ${changed} sections changed, css +${out.css?.length ?? 0} — ${String(out.verdict ?? "").slice(0, 200)}`);
  return { doc: next, verdict: out.verdict };
}

/**
 * The QA step: measure the finished store in a real browser, patch what the measurements prove is
 * wrong (free), and — only if something measurable is still wrong — one text-only repair call.
 * `ORBIT_SITECRAFT_QA_AI=0` turns the repair call off; the free patches always run.
 */
export async function polishStore(businessId: string, doc: OrbitDesignDoc, products: StorefrontProduct[], concept: string): Promise<OrbitDesignDoc> {
  let cur: OrbitDesignDoc = { ...doc };
  const add = (css: string, label: string) => {
    if (css.trim()) cur = { ...cur, css: `${cur.css ?? ""}\n/* ${label} */\n${css}` };
  };
  const qa1 = await runStoreQa(cur, products, businessId);
  add(qa1.css, "qa");
  const fixedCount = qa1.issues.filter((i) => i.fixed).length;
  const left = remainingIssues(qa1.issues);
  console.warn(`[site-craft-qa] ${qa1.issues.length} finding(s), ${fixedCount} patched automatically, ${left.length} need the designer`);
  if (!left.length || process.env.ORBIT_SITECRAFT_QA_AI === "0") return cur;

  try {
    const fix = await callTool<{ css?: string }>(
      businessId,
      FIX_CSS_TOOL,
      `You built this store; it was opened in a real browser and MEASURED. These problems remain (the measurable ones were already patched):

${left.map((l) => `- ${l}`).join("\n")}

ART DIRECTION: ${concept}

CURRENT STYLESHEET (tail):
${(cur.css ?? "").slice(-24000)}

Write ONLY the extra CSS that fixes exactly these problems — it is appended after the stylesheet, so match the selectors' specificity or use !important. Keep the design's look; mobile-first with breakpoints; no new decoration.`,
      8000,
    );
    if (fix?.css) {
      add(fix.css, "qa-repair");
      const qa2 = await runStoreQa(cur, products, businessId);
      add(qa2.css, "qa-2");
      console.warn(`[site-craft-qa] after repair: ${remainingIssues(qa2.issues).length} still open`);
    }
  } catch (e) {
    console.warn("[site-craft-qa] repair skipped", String(e).slice(0, 120));
  }
  return cur;
}

export async function runSiteCraftBuild(businessId: string, message: string, refs: { images?: DesignRef[] } = {}): Promise<TurnResult> {
  await ensureModelConfigLoaded();
  const business = await prisma.business.findUnique({
    where: { id: businessId },
    select: { name: true, niche: true, storeCurrency: true, freeShippingOver: true, products: { select: DESIGN_PRODUCT_SELECT, take: 30 } },
  });
  const doc = await loadDoc(businessId);
  if (!business) return { reply: "", doc, error: "Business not found" };

  const products = toStorefrontProducts(business.products);
  const cur = business.storeCurrency || "pkr";
  const productList = products.length
    ? products
        .map(
          (p) =>
            `- id ${p.id} · ${p.name}${p.category ? ` · ${p.category}` : ""} · ${money(p.fromPrice ?? p.price, cur)}${p.stock <= 0 ? " · sold out" : ""}${
              p.imageUrl ? ` · photo ${p.imageUrl}` : " · no photo"
            }${p.description ? ` · ${p.description.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").slice(0, 140)}` : ""}`,
        )
        .join("\n")
    : "(no products yet — design with realistic sample products for this niche, marked data-od-sample)";
  const reviews = await realReviewsNote(businessId);
  const facts = [
    `Store: ${business.name} — ${business.niche}`,
    `Currency: ${cur.toUpperCase()}`,
    business.freeShippingOver ? `Free delivery over ${money(business.freeShippingOver, cur)}` : "No free-delivery offer",
    "Payment: cash on delivery is available",
  ].join("\n");

  const brief = `BRIEF FROM THE SELLER:
${message}

STORE FACTS:
${facts}

PRODUCTS:
${productList}

${reviews}`;

  const refImages = (refs.images ?? []).slice(0, 8);
  let design: DesignOut | null = null;
  try {
    design = await callTool<DesignOut>(
      businessId,
      DESIGN_TOOL,
      `${brief}

${CONTRACT}

Step 1 of 2: decide the art direction (the skill's "Choose direction" step) and build the design system — tokens, the shared stylesheet, header and footer — and list the pages. The pages are built next, against exactly this system.`,
      24000,
      refImages,
    );
  } catch (e) {
    console.warn("[site-craft] design call failed", e);
  }
  if (!design?.css || !design.header) return { reply: "The designer couldn't finish this build — please try again.", doc, error: "design failed" };
  const d = design;

  const wanted = (d.pages?.length ? d.pages : [{ slug: "home", title: "Home", purpose: "" }])
    .map((p) => ({ ...p, slug: String(p.slug || "").toLowerCase().replace(/[^a-z0-9-]/g, "") || "page" }))
    .filter((p, i, all) => all.findIndex((x) => x.slug === p.slug) === i)
    .slice(0, 6);
  if (!wanted.some((p) => p.slug === "home")) wanted.unshift({ slug: "home", title: "Home", purpose: "the home page" });

  const systemNote = `ART DIRECTION (yours, from step 1 — every section must express it):
${d.concept}

TOKENS: ${JSON.stringify(d.tokens)}

SHARED STYLESHEET (already on every page — reuse its classes, don't repeat it):
${d.css}

HEADER (already on every page, for reference): ${d.header.slice(0, 1500)}`;

  const built = await Promise.all(
    wanted.map(async (pg) => {
      for (let attempt = 0; attempt < 2; attempt++) try {
        const out = await callTool<PageOut>(
          businessId,
          PAGE_TOOL,
          `${brief}

${CONTRACT}

${systemNote}

Step 2: build the "${pg.title}" page (/${pg.slug}) — ${pg.purpose}. ${pageBrief(pg.slug)}
Finished sections only: real copy from the brief, every interactive thing with its states, mobile-first. The header and footer are already on the page — don't repeat them.`,
          20000,
          pg.slug === "home" || pg.slug === "shop" ? refImages : [],
        );
        if (!out || !Array.isArray(out.sections) || !out.sections.length) {
          console.warn(`[site-craft] page ${pg.slug} came back empty (attempt ${attempt + 1})`);
          continue;
        }
        // Repair pass: any class the markup uses but no stylesheet defines gets written now.
        const html = out.sections.map((x) => String(x?.html ?? "")).join("\n");
        const missing = undefinedClasses(html, `${d.css}
${out.css ?? ""}`);
        if (missing.length >= 3) {
          console.warn(`[site-craft] page ${pg.slug}: ${missing.length} undefined classes — writing them`);
          const fix = await callTool<{ css?: string }>(
            businessId,
            FIX_CSS_TOOL,
            `${systemNote}

This "${pg.title}" page's markup uses classes that no stylesheet defines yet: ${missing.join(" ")}

PAGE MARKUP:
${html.slice(0, 40000)}

${out.css ? `PAGE CSS SO FAR:
${out.css}

` : ""}Write the rules for exactly those classes, true to the art direction — mobile-first with breakpoints, hover/focus states, reduced motion. Only CSS.`,
            12000,
          ).catch(() => null);
          if (fix?.css) out.css = `${out.css ?? ""}
${fix.css}`;
        }
        return { pg, out };
      } catch (e) {
        console.warn(`[site-craft] page ${pg.slug} failed`, e);
      }
      return { pg, out: null as PageOut | null };
    }),
  );

  let css = d.css;
  const pages: DesignPage[] = [];
  for (const { pg, out } of built) {
    const sections = (Array.isArray(out?.sections) ? out.sections : []).filter((s) => s && typeof s.html === "string" && s.html.trim().length > 40);
    if (!sections.length) continue;
    if (out?.css) css += `\n/* ${pg.slug} */\n${out.css}`;
    pages.push({
      slug: pg.slug,
      title: String(pg.title || pg.slug).slice(0, 60),
      nav: pg.slug !== "home",
      sections: sections.map((s, i) => ({
        id: String(s.id || `s${i}`).replace(/[^a-z0-9-]/gi, "-").slice(0, 40),
        type: s.html.includes("data-od-product-grid") ? "product-grid" : i === 0 && pg.slug === "home" ? "hero" : "custom",
        label: String(s.label || s.id || "Section").slice(0, 60),
        html: s.html,
        visible: true,
      })),
    });
  }
  if (!pages.some((p) => p.slug === "home")) return { reply: "The home page didn't come back — please try again.", doc, error: "home failed" };

  const storeName = business.name;
  ensureCoreContentPages(pages, business, storeName, d.tagline || "");
  // keep the seller's own custom pages and the functional pages' frames
  for (const p of doc.pages) {
    if (!pages.some((x) => x.slug === p.slug) && (p.pageType === "custom" || ["product", "cart", "account", "login"].includes(p.slug))) pages.push(p);
  }

  const allHtml = [d.header, d.footer, ...pages.flatMap((p) => p.sections.map((x) => x.html))].join("\n");
  css = liftOrphanVarRules(css, allHtml);
  // the designer's :root rules must beat the platform's token block on #od-store
  css = css.replace(/(^|[}\s,]):root(?=\s*[{,])/g, "$1:root,#od-store");
  {
    // dummy media: every data-img-query / data-video-query becomes a real stock photo / clip
    const flat = pages.flatMap((p) => p.sections);
    const resolved = await resolveStockMedia([d.header, d.footer, ...flat.map((x) => x.html)]);
    d.header = resolved[0];
    d.footer = resolved[1];
    flat.forEach((x, i) => (x.html = resolved[i + 2]));
  }
  const realPhotos = new Set(products.map((p) => p.imageUrl).filter((u): u is string => !!u));
  const swap = await fixBrokenImages([d.header, d.footer, ...pages.flatMap((p) => p.sections.map((x) => x.html)), css], realPhotos);
  if (swap.size) {
    console.warn(`[site-craft] ${swap.size} dummy photos didn't load — swapped`);
    const apply = (t: string) => { for (const [a, b] of swap) t = t.split(a).join(b); return t; };
    for (const p of pages) for (const x of p.sections) x.html = apply(x.html);
    d.header = apply(d.header);
    d.footer = apply(d.footer);
    css = apply(css);
  }

  const announceText = honestAnnouncement(d.announcement || "", business.freeShippingOver);
  let next = normalizeDoc(
    {
      version: doc.version,
      storeName,
      tagline: d.tagline || doc.tagline,
      tokens: { ...defaultTokens(), ...(d.tokens as object), googleFonts: cleanFonts(d.tokens.googleFonts), radius: Number(d.tokens.radius ?? 12) },
      content: contentWithAnnounce(doc.content, { show: !!announceText, text: announceText }),
      components: {
        header: safeShell("header", d.header, storeName, business.niche),
        footer: safeShell("footer", d.footer, storeName, business.niche),
      },
      pages,
      tweaks: [{ key: "accent", label: "Accent colour", type: "color", cssVar: "--tw-accent", value: String(d.tokens.accent ?? "#1f3a2e") }],
      motion: splashFrom(message) && splashFrom(message) !== "none" ? { preloader: true, splash: splashFrom(message) as "fade" | "counter" | "curtain" } : undefined,
      direction: "site-craft",
      directionHistory: [...(doc.directionHistory ?? []), ...(doc.direction ? [doc.direction] : [])].slice(-6),
      css,
    } as OrbitDesignDoc,
    storeName,
    business.niche,
  );
  next = normalizeDoc(next, storeName, business.niche);
  await saveDoc(businessId, next);
  // QA in a real browser: measure, patch for free, one cheap text-only repair for what's left.
  try {
    next = normalizeDoc(await polishStore(businessId, next, products, d.concept), storeName, business.niche);
    await saveDoc(businessId, next);
  } catch (e) {
    console.warn("[site-craft-qa] skipped", e);
  }
  // The screenshot self-check is one more large vision call — opt in with ORBIT_SITECRAFT_SELFCHECK=1.
  if (process.env.ORBIT_SITECRAFT_SELFCHECK === "1") try {
    const checked = await selfCheck(businessId, next, products, d.concept);
    if (checked.doc !== next) {
      next = normalizeDoc(checked.doc, storeName, business.niche);
      await saveDoc(businessId, next);
    }
  } catch (e) {
    console.warn("[site-craft] self-check skipped", e);
  }
  await prisma.storeDesign
    .update({ where: { businessId }, data: { wired: null, wiredAt: null, backend: null, backendWiredAt: null } })
    .catch(() => {});
  const reply = (d.reply || `Built ${storeName}: ${pages.map((p) => p.title).join(", ")}.`).trim();
  await prisma.orbitDesignTurn.createMany({
    data: [
      { businessId, role: "user", content: message },
      { businessId, role: "assistant", content: reply, meta: JSON.stringify({ version: next.version, builder: "site-craft" }) },
    ],
  });
  console.warn(`[site-craft] built ${pages.length} pages, css ${css.length} chars — ${d.concept.slice(0, 160)}`);
  return { reply, doc: next };
}
