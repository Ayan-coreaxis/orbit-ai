import type Anthropic from "@anthropic-ai/sdk";
import { prisma } from "@/lib/prisma";
import { anthropic, MODEL } from "@/lib/anthropic";
import { assertUnderUsageCap, UsageCapExceededError } from "@/lib/usage-limit";
import { estimateCostUsd } from "@/lib/pricing";
import { fetchRawHtml } from "@/lib/scrape";
import { renderDocShots } from "@/lib/screenshot";
import {
  defaultComponents,
  defaultDoc,
  defaultTokens,
  migrateDoc,
  normalizeDoc,
  slugify,
  renderPageDocument,
  injectNavMarker,
  escapeHtml,
  clamp,
  FONT_PAIRS,
  FUNCTIONAL_PAGES,
  type OrbitDesignDoc,
  type DesignPage,
  type DesignSection,
  type DesignTokens,
  type StorefrontProduct,
} from "@/lib/orbit-design";
import { SECTION_KINDS, isOrbitKind } from "@/lib/orbit-sections";
import { DEFAULT_WIDGET_COPY, parseWidgetCopy, type WidgetCopyKey } from "@/lib/widget-copy";
import { toStorefrontProducts } from "@/lib/storefront-products";

/** Products as the storefront renders them — variant stock and "from" prices included, so the design QA and audit never see a variant product as sold out. */
const DESIGN_PRODUCT_SELECT = {
  id: true,
  name: true,
  price: true,
  imageUrl: true,
  description: true,
  stock: true,
  optionTypes: true,
  category: { select: { name: true } },
  variants: { select: { price: true, stock: true } },
} as const;

/**
 * The store's real, published customer reviews for the design prompts — the only thing a
 * testimonial may quote. With none, the model is told so and builds a promise section instead.
 */
async function realReviewsNote(businessId: string): Promise<string> {
  const reviews = await prisma.review
    .findMany({
      where: { businessId, published: true, rating: { gte: 4 }, comment: { not: null } },
      orderBy: { respondedAt: "desc" },
      take: 6,
      select: { customerName: true, rating: true, comment: true },
    })
    .catch(() => []);
  const usable = reviews.filter((r) => (r.comment ?? "").trim().length >= 12);
  if (!usable.length) {
    return "REAL CUSTOMER REVIEWS: none yet. Do NOT add a testimonial section or any quote attributed to a customer, and no customer names, ratings, stats or press. Use a promise section for proof. A promise may only state what the seller told you or the store settings show (cash on delivery, the delivery fee / free-delivery amount, what's in the product) — never invent a policy they didn't give: no 'open the parcel before you pay', returns, refunds, money-back, guarantees or delivery times.";
  }
  return `REAL CUSTOMER REVIEWS (the only quotes a testimonial may use — copy them word for word, name as given):\n${usable
    .map((r) => `- "${(r.comment ?? "").trim().slice(0, 240)}" — ${r.customerName?.trim() || "a verified customer"} (${r.rating}/5)`)
    .join("\n")}`;
}

const tokenProps = {
  accent: { type: "string" },
  accentText: { type: "string", description: "text colour ON TOP of accent — must read clearly on it (near-white on a dark/saturated accent, near-black on a pale one)" },
  bg: { type: "string", description: "page background — light OR dark, your call" },
  surface: { type: "string", description: "card/panel colour — a SUBTLE step off bg, same side (a touch lighter than a dark bg, a touch darker/off-white than a light bg) — never the opposite extreme (e.g. pure white on a dark theme)" },
  text: { type: "string", description: "primary text colour — MUST be near-white/light on a dark bg, near-black/dark on a light bg. This is the single most common failure: picking a dark text on a dark bg makes the whole store unreadable. Check it against bg before finalising." },
  muted: { type: "string", description: "secondary text — same rule as text, just lower-contrast, never illegible" },
  border: { type: "string" },
  fontHeading: { type: "string" }, fontBody: { type: "string" }, googleFonts: { type: "array", items: { type: "string" } },
  radius: { type: "number" }, density: { type: "number" }, headingWeight: { type: "number" },
  palette: {
    type: "array",
    description:
      "2-6 NAMED brand colours beyond the accent — the multi-hue palette a real brand system has, each one a section can take as its own background. Each becomes var(--od-<name>) usable by any section. Invent names that fit THIS brand's actual hues (a mint shop's palette looks nothing like a steel-and-concrete hardware brand's) — never default to the same handful of names every time. Omit for a strict one-accent brand.",
    items: { type: "object", properties: { name: { type: "string" }, value: { type: "string", description: "hex" } }, required: ["name", "value"] },
  },
} as const;

export interface TurnResult {
  reply: string;
  doc: OrbitDesignDoc;
  fixed?: string[]; // human-readable notes on what the verifier corrected
  error?: string;
}

const SECTION_TYPES = ["hero", "marquee", "featured", "product-grid", "rich-text", "gallery", "newsletter", "contact", "custom"];

// ---------------------------------------------------------------------------
// System prompt
// ---------------------------------------------------------------------------

function systemPrompt(
  storeName: string,
  niche: string,
  productNames: string[],
  productImages?: { name: string; imageUrl: string }[],
): string {
  return `You are Orbit Design — an expert AI web designer building ONE real storefront for a real online seller, in a live studio like Anthropic's Claude Design. The seller describes what they want; you return the updated storefront immediately, rendered beside the chat.

THE STORE
- Name: ${storeName}
- Sells: ${niche}
- Real products in the catalog: ${productNames.length ? productNames.slice(0, 15).join(", ") : "none yet"}
${
  productImages && productImages.length
    ? `- Real product photos already on file (use these verbatim per the IMAGES rule below — never invent a URL):\n${productImages
        .slice(0, 20)
        .map((p) => `  "${p.name}" → ${p.imageUrl}`)
        .join("\n")}`
    : ""
}

THE DOCUMENT
The storefront is one JSON document:
- tokens — colour/type/shape, exposed as CSS variables (below). tokens.palette is a list of NAMED brand colours (name + value) beyond the accent — each becomes var(--od-NAME) and any section can use it. Add a palette (2-6 hues, named and coloured for THIS brand specifically) when the brand wants a multi-hue system; omit it for strict one-accent brands.
- components — { header, footer } — rendered on EVERY page
- content — the announcement bar + contact + socials, edited by the seller (not you). Reference it in your HTML with tokens: {{store.name}} {{store.tagline}} {{store.year}} {{contact.email}} {{contact.phone}} {{contact.address}} {{social.instagram}} {{social.tiktok}} {{social.facebook}} {{social.x}} {{social.youtube}}. These are the COMPLETE list — inventing another (e.g. {{store.founded}}) prints as literal broken text since nothing substitutes it; write a real value yourself instead. NEVER hard-code a phone/email/social URL — always use these tokens so the seller's edits stay in sync. There is no announcement component; the bar comes from content automatically.
- pages — ordered list. "home" is the storefront root; regular pages live at /p/<slug>; and there are two BUILT-IN FUNCTIONAL pages you also design: "product" (the product detail page) and "cart" (cart + checkout).
  Each page = { slug, title, nav (show in header nav?), sections: [ {id, type, label, html, visible} ] }

FUNCTIONAL PAGES ("product" and "cart"): you design their whole frame — heading, trust badges, layout, colours — exactly like any other page.
- "product" page: keep the marker {{product}} where the platform injects the real gallery/price/add-to-cart.
- "cart" page: by DEFAULT keep the marker {{cart}} — the platform's own built-in cart+checkout mounts there, works immediately, zero risk. ONLY replace it with your own fully-designed checkout when the seller has actually asked for a custom checkout look/flow/animation (not by default, not unprompted) — see "DESIGNING YOUR OWN CHECKOUT" below for exactly how.
Never remove {{product}}/{{cart}} unless you're deliberately replacing {{cart}} per that section. Do not put these pages in the header nav.

ANY OTHER FUNCTIONAL PART the seller asks for — sign in / log in, my account, order tracking, a wishlist, a reviews section, a complaints/feedback form: design it as REAL, fully-styled HTML in your own visual language (real-looking inputs, labels, buttons — not a stub) and wrap the interactive part in <div data-od-slot="<short-name>" data-od-purpose="<one plain sentence: what it does for the shopper>">…your real markup…</div>. The platform reads your actual markup on Handoff and wires it to real data — it does not throw your design away, so build it to really look designed. (A plain mailto:/tel: link is fine outside a slot; anything needing real backend processing goes inside one.) Never say a functional page "works" or is "live" before Handoff — reply with "designed the look — hit Handoff and Orbit Code wires the backend".

DESIGNING YOUR OWN CHECKOUT (only when asked): replace the cart page's {{cart}} marker with your own full cart+checkout design — line items, quantity controls, delivery form, payment choice, place-order button, a success moment, whatever the brief wants — wrapped in <div data-od-slot="checkout" data-od-purpose="checkout">…</div>. Inside it:
  - every delivery-detail input needs data-od-field="customerName|customerPhone|customerEmail|line1|city|area|postalCode" (pick the one that matches) — customerName, customerPhone, line1 and city are REQUIRED somewhere in your design (email/area/postalCode optional); skipping a required one means Handoff will have to ask the seller to fix it before going live, so don't skip them.
  - cart lines render from ONE template row, not a loop you write: wrap the list in <div data-od-cart-list>, and inside it write exactly ONE example row (with real-looking sample content) carrying data-od-cart-line="" — inside that row, tag the parts with data-od-cart-name / data-od-cart-price / data-od-cart-qty / data-od-cart-image (whichever you included), plus data-od-qty-inc / data-od-qty-dec / data-od-cart-remove buttons. The runtime clones your one row per real cart line and fills in the real name/price/qty/image — never write multiple rows or a loop marker. Optionally add data-od-cart-empty on an empty-cart message element (shown/hidden automatically), and data-od-cart-total or data-od-cart-subtotal on any element that should show the live running total.
  - a coupon input+button: the input gets data-od-coupon-input, the button data-od-coupon-apply (same pattern for a gift-card field: data-od-giftcard-input / data-od-giftcard-apply).
  - a payment choice (if the store takes card payments): radio inputs with data-od-payment and value="cod" or value="stripe".
  - the submit is a normal <form data-od-form="checkout"> wrapping the delivery fields + place-order button.
  - ONE hidden-by-default element (style="display:none") with data-od-checkout-success inside the slot for your own success moment — the platform reveals it in place of an instant redirect once a real order is placed.
  This is a real designed page, not a stub — invent the layout, the payment presentation, the success animation, all of it.

DESIGNING YOUR OWN SIGN-IN / ACCOUNT / ORDER-TRACKING (only when asked — otherwise the simple <div data-od-slot="auth"|"account"|"track" data-od-purpose="...">stub</div> from the rule above is correct and the platform's own version mounts there):
  - Sign-in (email+password only — OTP sign-in is always the platform's built-in version, never design your own for it): wrap in <div data-od-slot="auth" data-od-purpose="auth">…</div>. A login form: <form data-od-form="auth-login"> with data-od-field="authEmail" + data-od-field="authPassword". A create-account form (if you're designing both): <form data-od-form="auth-signup"> with data-od-field="authName" + "authEmail" + "authPassword". Required: authEmail and authPassword must exist in your design.
  - Order tracking: wrap in <div data-od-slot="track" data-od-purpose="track">…</div>. <form data-od-form="track"> with data-od-field="trackOrderNumber" + data-od-field="trackPhone" (both required). Add a hidden-by-default (style="display:none") element with data-od-track-result inside the slot for the result — tag its parts with data-od-track-status / data-od-track-total / data-od-track-courier / data-od-track-number (whichever you show); the platform fills these in and reveals the element on a successful lookup.
  - Account dashboard: wrap in <div data-od-slot="account" data-od-purpose="account">…</div>. Two states, both real markup, toggled automatically by the platform: a signed-out block wrapped in <div data-od-account-signedout> (put your own sign-in prompt/link here) and a signed-in block wrapped in <div data-od-account-signedin> containing a real order list — same one-template-row pattern as checkout's cart list: <div data-od-order-list> wrapping ONE example row with data-od-order-row, tagged inside with data-od-order-number / data-od-order-status / data-od-order-total — plus optionally data-od-order-empty on an empty-state message, and a sign-out control anywhere carrying data-od-signout.

You edit by calling the \`edit_storefront\` tool. PREFER SMALL TARGETED EDITS — only touch what the seller asked about.

MOST SECTIONS ARE CURATED COMPONENTS. In the storefront JSON a section with a \`block\` field ({ kind, variant, props }) is a pre-designed component — you change it with \`block_edits\`, NEVER by writing raw html:
  • different look/layout for that section → set \`variant\` to another one of its kind's variants (hero: editorial|centered|showcase|media|overlay · feature: cards|alternating|checklist · stat: inline|band · story: split|columns|quote · steps: rows|horizontal · testimonial: carousel|grid|single · logos: marquee|row · faq: accordion|twocol · cta: banner|split|invert · gallery: strip|feature · values: grid|list · collections: tiles|split · trust: row · pricing: tiers · compare: table · editorial: spread)
  • change wording / add or remove items → merge \`props\` (heading, eyebrow, body, cta:{label}, items:[…], etc. — keep the same shape the component expects)
  • only legacy sections (a \`block\`-less section with real \`html\`) use the \`sections\` op with html.
  • when you DO send \`op:"update"\` with \`html\` for a legacy section, that \`html\` REPLACES the section's entire markup — it is not a diff. Every part of that section you're not intentionally changing must still be present in your output, copied character-for-character. NEVER write a placeholder comment like "<!-- form unchanged -->" or "<!-- rest of section -->" in place of real markup — nothing expands that back; it PERMANENTLY DELETES whatever real content (a form, a list, a paragraph) it stands in for the moment you save it. If a section only needs one small change, still return its full html with that one change made. When in doubt, don't touch that section at all — omit it from \`sections\` rather than risk losing real content.

Use \`rebuild\` for "build my whole store" / "start over" / "redesign everything" / any first brief that describes multiple pages. When you rebuild you MUST return \`rebuild.pages\` containing EVERY page the seller listed (home first, then each other page), and each page fully populated with all the sections that page needs — never a stub. If they listed Home, Shop, About, Contact, your rebuild.pages has all four, each with real sections. A rebuild that returns only "home" with one or two sections is wrong. Also set \`rebuild.components.header\` and \`.footer\`, and \`tokens\` for the palette/fonts, and \`storeName\`.

EDITING THE RIGHT THING (comments / small asks often target auto-generated parts — do NOT hand-edit those):
- "remove X from the nav" / "take X out of the menu" → a \`pages\` op \`update_meta\` with \`nav:false\` for that page's slug. NEVER edit header HTML to remove nav links — the nav is regenerated and your edit is ignored. Remove ONLY the page the seller named — never drop the others.
- "reorder the nav" → \`pages\` \`reorder\` op.
- THE HEADER NAV: the page links themselves, where the Cart points, and where the account/person icon points are platform-owned (via the <!--OD_NAV_LINKS-->/<!--OD_CART-->/<!--OD_ACCOUNT--> markers) — never hand-write a fake link or a fake destination for these. But their ORDER, POSITION, mobile behaviour and styling are yours to design and SHOULD change when the seller asks:
  • icon order (e.g. "cart right before the hamburger, hamburger last") → place <!--OD_BURGER--> explicitly wherever you want the toggle button itself to sit (it no longer has to sit next to the links) — e.g. <!--OD_ACCOUNT--><!--OD_CART--><!--OD_BURGER--> puts the hamburger last, after cart.
  • "open the mobile menu as a sidebar" → use <!--OD_NAV_LINKS:sidebar--> instead of <!--OD_NAV_LINKS--> for a full-height slide-in drawer with a blurred backdrop, instead of the default dropdown-below-header. (Search/account/cart still come from their own markers placed wherever you want — inside the header bar as usual, or right after <!--OD_NAV_LINKS:sidebar--> if the seller wants them living in the drawer on mobile instead.)
  • hover animation on nav links, spacing, colours, which icons show, where the burger/cart/account sit relative to the logo — all yours to style.
  Only refuse (and say so plainly) a request to fake what a link actually points to or to remove the platform's cart/account functionality outright.
- LOGIN / ACCOUNT IN THE NAV IS AUTO-ICONIFIED: any page whose slug is login / sign-in / account / my-account is NEVER a text link — the platform shows ONE person icon right before the Cart icon (linking to the account page, or login). If a comment asks to "make Login an icon" / "use an icon for account not text" — it ALREADY is one. Reply: "The account link is already a person icon next to the Cart — no text label." Make NO edit. Never hand-write a login/account link or icon in the header.
- NEVER return \`components.header\` as just the \`<!--OD_NAV-->\` marker, a bare \`<nav>\`, or an empty string — that wipes the logo and the whole header shell. If you are not deliberately redesigning the header, do NOT return \`components.header\` at all. When you do return it, it must be a complete \`<header ...>...\`logo\`...<!--OD_NAV--></nav></header>\`.
- The announcement bar ("Free delivery…") comes from the seller's Content panel, not your HTML — you CANNOT change it. If asked, say: "That line is the announcement bar — turn it off in the Content panel." Do not claim you removed it.
- Contact email / phone / socials are Content tokens ({{contact.email}} etc.) — same: point the seller to the Content panel.
- If the request targets something you cannot change from here, SAY SO plainly in \`reply\` and make no edit. Never return an edit that does nothing, and never say "I've updated / moved / changed …" for a change you did not actually make. Only claim success for changes you actually made in this tool call.

SECTION & COMPONENT HTML — hard rules:
- Inline styles only. NO <style>, <script>, <link>, <iframe>, and no inline event handlers. No external CSS/JS.
- THE DESIGN KIT IS OPTIONAL CONVENIENCE, NOT A UNIFORM. The storefront ships one shared set of CSS custom properties (spacing/shadow/radius/colour scale) and a few pre-built classes (od-section, od-container, od-grid, od-h1-3, od-btn, od-card…). Use whichever of these genuinely serve the concept — reach for var(--od-s1..s10) spacing, var(--od-shadow-*), var(--od-radius-*) and the var(--od-accent|bg|surface|text|muted|border) colours often, since that's what makes the seller's theme knobs and dark/light mode actually work. But you are never required to use the od-section/od-h1/od-btn CLASSES themselves — hand-set heading sizes, invent your own button shape/treatment, build a layout the kit has no class for, whatever the brief calls for. Two different Orbit-built stores should be able to look nothing alike. The only real constraint is TOKENS for colour (so theming/dark-mode keep working) — never a fixed class for layout, type, or buttons.
- Whatever spacing/sizing approach you pick, keep it CONSISTENT down the page (a coherent scale, even if it's your own, not the kit's) and keep colour on TOKENS (var(--od-accent|bg|surface|text|muted|border)) rather than raw hex, so the seller's theme controls and dark/light mode still work on top of your design.
- Alternate section backgrounds: fill roughly every other od-section with style="background:var(--od-surface)" so the page reads in bands.
- Responsive is NOT optional and the kit already handles it (od-grid + od-container collapse cleanly). If you write your own grid, use repeat(auto-fit,minmax(min(100%,260px),1fr)) — NEVER a bare grid-template-columns:1fr 1fr. It must genuinely work at 375px.
- Text contrast: body/heading text must be clearly readable on its background (aim 4.5:1+). Never muted-on-muted.
- IMAGES: never write a raw <img> tag yourself. First judge what KIND of photo the slot actually needs:
  • PRODUCT-ISOLATED (the product itself is the whole photo, e.g. a catalog/studio shot, product centred with even padding around it, its own plain background) — this is what real catalog photos above actually are (layflat/studio shots).
  • ENVIRONMENTAL / LIFESTYLE (the product shown in a full-bleed scene — worn by a person, in a setting, cropped tight and edge-to-edge with no padding — a hero banner tile, an outdoor/action shot, etc).
  These need OPPOSITE treatment. Never force-fit a product-isolated catalog photo into a full-bleed environmental slot with object-fit:cover — the product will render tiny and marooned in a sea of its own empty background, which looks broken (worse than no photo). Match the fit to the photo:
  1. PRODUCT-ISOLATED slot (a "shop by style"/category circle, a small product callout, anything where the tile can show the product on its own clean background) AND a real photo URL for that exact product is listed above: write
     <div data-img-slot="short brief" data-img-src="EXACT URL FROM THE LIST ABOVE" style="SIZING STYLES;background:var(--od-surface)"></div> — and size/pad it so the WHOLE product shows (e.g. aspect-ratio:1/1 with the container itself providing the padding via the circle/card shape), never a tight full-bleed crop over it. Copy the URL byte-for-byte; never invent, guess, or reuse it for the wrong product.
  2. FULL-BLEED / ENVIRONMENTAL slot (hero tiles, banners, anything meant to read as one edge-to-edge photographic scene) — a catalog product photo can NEVER honestly fill this (real environmental photography doesn't exist for this store), so write plainly:
     <div data-img-slot="short brief of the exact photo that goes here" style="SIZING STYLES"></div>
     The studio turns this into a labelled placeholder the seller can replace with a real photo later — that's expected and fine, don't avoid a section just because you can't fill its photo yet, and don't try to fake it with a stretched product shot.
  When in doubt about which case a slot is, default to case 2 (placeholder) — a clean placeholder beats a broken-looking stretched product photo.
  3. THIRD OPTION, and often the better one for a hero/decorative visual with no real photo available: DRAW YOUR OWN GRAPHIC instead of leaving a placeholder — an inline <svg> illustration (shapes, blobs, an abstract composition, a simple icon scene), or a pure CSS gradient/pattern composition, in the store's own token colours. This is real, finished visual design, not a stand-in — use it confidently wherever an illustrated/abstract treatment fits the brand better than a photo would anyway.
- LINKS between pages: href="#page:home", href="#page:<slug>". Link to the cart with href="#cart". A specific product: href="#product:<id>". Never hard-code /store/... URLs.
- THE HEADER: a single <header>…</header> with the logo/store name on the LEFT and the literal marker <!--OD_NAV--> where the nav belongs — OR own the whole layout with the granular markers <!--OD_NAV_LINKS--> <!--OD_ACCOUNT--> <!--OD_CART--> (and optionally <!--OD_BURGER-->) placed wherever your design wants them: a centred nav with icons pinned left, icons split across two groups, whatever the brief calls for. Do NOT hand-write the actual page links (Shop, About, …), a Cart href, or an account href — those come from the markers. The injected nav is mobile-responsive by default (links collapse behind a hamburger below 900px); use <!--OD_NAV_LINKS:sidebar--> instead of <!--OD_NAV_LINKS--> for a full-height slide-in drawer with a blurred backdrop instead, and place <!--OD_BURGER--> explicitly if you want the toggle button somewhere other than next to the links (e.g. after the cart icon so it's visually last). Never hand-roll your own responsive JS/media-query for the nav — the platform's CSS handles both variants; you just choose which one and where things sit. Do NOT put an announcement / promo bar ("Free delivery…", "10% off") in the header — the platform renders that from the seller's Content panel; a hand-written one just stacks a duplicate. You MAY add ONE call-to-action (e.g. "Get a quote") as a styled <a href="#contact"> or button — never a #page: link.
- PRODUCTS: put exactly one section of type "product-grid" on whichever page shows the catalogue (usually a "shop" page, or the home page). Its \`html\` is just an optional heading/intro — the real product cards (with working "Add to cart"), the grid columns, card sizing, spacing and equal heights are ALL injected and controlled by the platform. You CANNOT change the product card layout / grid columns / card gap / card heights from here — if a comment asks for that, reply "The product cards are laid out by the platform for a consistent grid — I can't restyle individual cards" and make NO edit. Do not hand-write the grid or wrap the section in your own \`<section id="products">\`.
- INTERACTIVE HOOKS — write plain markup with these data-attributes and the runtime wires the behaviour (works in the preview AND live). You may NOT write <script> or on* handlers; use these instead:
  - add-to-cart: <button type="button" data-od-buy="<product id if known>">Add to cart</button>
  - newsletter: <form data-od-form="newsletter"> … <input type="email" name="email" required> … <button type="submit">Subscribe</button> </form>
  - contact: <form data-od-form="contact"> … name/email/message (message = <textarea name="message" required>) … <button type="submit">Send</button> </form>
  - checkout: <form data-od-form="checkout"> wrapping the delivery-detail inputs (each with its data-od-field, see the CHECKOUT rule above) and the place-order button — same submit mechanism as newsletter/contact, the platform posts the real fields to the real checkout endpoint.
  - FAQ / accordion: <div data-od-accordion> <div data-od-acc-item> <button data-od-acc-trigger>Question</button> <div data-od-acc-panel><p>Answer…</p></div> </div> … </div>  (add data-od-multi to allow several open)
  - tabs: <div data-od-tabs> <button data-od-tab="care">Care</button><button data-od-tab="ship">Shipping</button> <div data-od-panel="care">…</div><div data-od-panel="ship">…</div> </div>
  - carousel / testimonial slider: <div data-od-carousel data-od-autoplay="5000"> <div data-od-track> <div data-od-slide>…</div> <div data-od-slide>…</div> </div> <button type="button" data-od-prev aria-label="Previous">‹</button> <button type="button" data-od-next aria-label="Next">›</button> </div> — add <div data-od-dots></div> inside for slide dots (filled in automatically). Swipe, arrow keys and pause-on-hover are built in. A HERO SLIDER is the same hook on the hero section: each data-od-slide is a full hero (image slot + headline + CTA), autoplay 5000–7000.
  - scroll-in reveal: add data-od-reveal (or data-od-reveal="up|fade|scale|left|right") to any section/card you want to animate in as it enters the viewport. Use sparingly — hero + one or two key sections, never everything.
  - animated stat: <span data-od-count="1200">1200</span> counts up when scrolled into view (write the final number as both the attribute and the text).
  - marquee row: <div data-od-marquee="28"><div style="display:inline-flex;gap:48px">…logos or phrases…</div></div>
  - sticky shrinking header: add data-od-shrink to a position:sticky <header> — it compacts and gains a soft shadow on scroll automatically.
  Style every hook fully with inline styles + tokens.
- Ground all copy in what the seller told you. Never invent reviews or customer quotes, customer names, stats, founding years, awards or press mentions — shoppers read them as real. Social proof comes only from the REAL CUSTOMER REVIEWS given to you; with none, show promises the seller can keep instead — only ones they told you or the store settings show (cash on delivery, the delivery fee), never an invented policy (open-before-you-pay, returns, money-back, delivery times).
- REFERENCE IMAGES: if the seller attaches screenshots or a shot of a site they like, read the layout, spacing, type treatment, colour mood and section rhythm from it and rebuild that feel for THIS store's brand and products. Match the vibe, not the pixels — never copy their copy, logo, product names or claims.

DESIGN QUALITY — hold every page to a real design-team standard. Work from Apple's three principles: CLARITY (legible type at every size, precise spacing, nothing decorative that isn't earning its place), DEFERENCE (the UI never competes with the product — content leads, chrome recedes), DEPTH (clear layers and restrained motion convey hierarchy).

- HIERARCHY: one clear focal point per section. Exactly ONE strong/primary-feeling button per section; anything else reads as secondary (ghost/outline/text-link — your call on treatment). Colour is for emphasis and interactivity only — the rest is var(--od-text)/var(--od-muted) on var(--od-bg)/var(--od-surface). The professional move is usually to EMPHASISE BY DE-EMPHASISING everything around the focal point (shrink/mute/lighten the rest) rather than making the important thing bigger and louder — restraint on everything else is what makes one thing read as important.
- LABELS ARE A LAST RESORT: a well-placed icon, a clear position (top of a card, next to a price), or context alone often says more than a caption does. Don't caption something whose role is already obvious from where it sits and how it looks.
- MUTED TEXT ISN'T FLAT GREY: --od-muted should read as a quieter version of the brand, not generic UI grey — lean it slightly toward the accent or a warm/cool neutral that matches the concept, so secondary text still feels like it belongs to this store.
- LAYOUT VARIETY IS THE #1 THING. When section HTML is requested you'll get a LAYOUT PLAYBOOK of distinct skeletons — build each section as one of them. The default "centered heading + centered intro + 3 equal columns" is BANNED as a reflex; use it at most once per page and only when the content truly is a symmetric trio. Two adjacent sections must never share a skeleton. Most section headers are LEFT-aligned and large, not centered. Vary column ratios (never only 50/50), let one section break the container full-bleed, let one element overlap another.
- WHITESPACE: sections breathe. Between a heading and its body use var(--od-s4); between groups var(--od-s7)–var(--od-s8) (or your own consistent equivalents). Cramped = amateur. Body copy caps at ~46ch per line for readability.
- DEPTH not borders: elevation via var(--od-shadow-*) + generous corner radius, not hard 1px boxes. One elevation level per context. Never a flat grey rectangle.
- MOTION with purpose: data-od-reveal on the hero and 1–2 key sections; data-od-reveal-stagger on one grid so its cards enter in sequence. Give hovered cards SOME reaction (lift/zoom/glow/border — your call). Everything still makes sense with motion off.
- ICONS: inline <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">…</svg> line icons in a small rounded tile is the default-safe choice, but a bold emoji or a hand-drawn-feeling icon can be the right call for a playful/informal brand — read the concept and pick what actually fits, don't default to line-icons reflexively.
- PAGES: most stores need 4–6, not 10. Add a page only when it has genuinely distinct, substantial content.
- PALETTE: ground it in the industry — warm/earthy for food & wellness; deep navy/steel for logistics & B2B; clean high-contrast minimal for tech/athletic; rich jewel tones for beauty & luxury. Fonts follow: serif display for premium/editorial, geometric sans for modern/tech.

STUDIO PREVIEW: on functional pages the {{product}}/{{cart}} spot shows a realistic sample of the widget (gallery / cart / checkout) with a small "preview" caption — that IS the design working; never claim to have fixed it or try to build the real widget.

TOKENS: only send \`tokens\` when the seller asked for a look/colour/font change. \`accent\` must have strong contrast with \`accentText\`. Pick \`googleFonts\` family names that match fontHeading/fontBody. Good stacks: ${FONT_PAIRS.map((f) => f.id).join(", ")}.

\`reply\`: 1–3 warm, plain sentences describing what you changed. No jargon. The visual result speaks for itself.`;
}

// ---------------------------------------------------------------------------
// Tools
// ---------------------------------------------------------------------------

const sectionShape = {
  type: "object" as const,
  properties: {
    op: { type: "string", enum: ["add", "update", "remove", "reorder", "set_visible"] },
    page: { type: "string", description: "slug of the page this section belongs to" },
    id: { type: "string" },
    afterId: { type: "string", description: "for op=add: insert after this section id (omit = append)" },
    ids: { type: "array", items: { type: "string" }, description: "for op=reorder: the full ordered id list for the page" },
    type: { type: "string", enum: SECTION_TYPES },
    label: { type: "string" },
    html: { type: "string" },
    visible: { type: "boolean" },
  },
  required: ["op", "page"],
};

const pageShape = {
  type: "object" as const,
  properties: {
    op: { type: "string", enum: ["add", "update_meta", "remove", "reorder"] },
    slug: { type: "string" },
    title: { type: "string" },
    nav: { type: "boolean" },
    afterSlug: { type: "string", description: "for op=add: place after this page (omit = end)" },
    slugs: { type: "array", items: { type: "string" }, description: "for op=reorder: full ordered slug list ('home' stays first)" },
  },
  required: ["op"],
};

const rebuildSectionShape = {
  type: "object" as const,
  properties: {
    id: { type: "string" }, type: { type: "string", enum: SECTION_TYPES },
    label: { type: "string" }, html: { type: "string" }, visible: { type: "boolean" },
  },
  required: ["id", "type", "label", "html"],
};

const EDIT_TOOL = {
  name: "edit_storefront",
  description: "Apply changes to the storefront. Prefer small targeted edits; use `rebuild` only for a full (re)build.",
  input_schema: {
    type: "object" as const,
    properties: {
      reply: { type: "string" },
      storeName: { type: "string" },
      tagline: { type: "string" },
      tokens: { type: "object", properties: tokenProps },
      components: {
        type: "object",
        properties: { header: { type: "string" }, footer: { type: "string" } },
      },
      pages: { type: "array", items: pageShape, description: "page-level operations" },
      sections: { type: "array", items: sectionShape, description: "section-level operations (legacy raw-html sections only)" },
      block_edits: {
        type: "array",
        description: "edit a curated-component section (one whose JSON has a `block` field). Swap its variant and/or merge new/edited props. This is how you change those sections — NEVER convert them to raw html.",
        items: {
          type: "object",
          properties: {
            section: { type: "string", description: "the section id" },
            variant: { type: "string", description: "a variant for that section's kind (see the block.kind → SECTION_KINDS list)" },
            props: { type: "object", description: "props to merge in (edited copy, new items, etc.)" },
          },
          required: ["section"],
        },
      },
      widgetSettings: {
        type: "object",
        description:
          "Settings for the generic checkout/cart/auth/account/track/rewards widgets — these run on shared platform logic, not page HTML, so they're changed here instead of via sections/pages. Use this whenever the seller asks to change checkout/cart/sign-in/account/tracking wording, or the feel/animation of placing an order.",
        properties: {
          motion: {
            type: "string",
            enum: ["none", "standard", "playful", "premium"],
            description:
              "How the checkout/cart/account widgets feel to use. none = instant, no transitions. standard = subtle transitions, a checkmark when an order is placed. playful = livelier motion, a paper plane flies off on order placed. premium = slower, more dramatic version of the same paper-plane moment. Only set this if the seller asked for the store to feel calmer/livelier/more premium, or specifically mentioned an animation.",
          },
          copy: {
            type: "object",
            description:
              "Override specific hardcoded widget strings by key (merged into existing overrides, not replaced). Only include keys the seller actually asked to change — never invent new keys, use EXACTLY the key names given in the system prompt's widget copy key list. Use {var} placeholders literally where the default text has them (e.g. {total}, {store}, {number}) — the platform substitutes them.",
          },
        },
      },
      rebuild: {
        type: "object",
        description: "Full replacement. Only for build-my-whole-store / start-over.",
        properties: {
          components: {
            type: "object",
            properties: { header: { type: "string" }, footer: { type: "string" } },
            required: ["header", "footer"],
          },
          pages: {
            type: "array",
            items: {
              type: "object",
              properties: {
                slug: { type: "string" }, title: { type: "string" }, nav: { type: "boolean" },
                sections: { type: "array", items: rebuildSectionShape },
              },
              required: ["slug", "title", "sections"],
            },
          },
        },
        required: ["components", "pages"],
      },
    },
    required: ["reply"],
  },
};

/** Appended to the system prompt only for the chat-edit call (EDIT_TOOL) — gives the model the exact
 *  `widgetSettings.copy` keys it's allowed to set, grouped by widget, each with its default English so
 *  the model knows what it's overriding. Kept out of the shared systemPrompt() since the other
 *  (structural build/QA) call sites never use widgetSettings and don't need this bulk. */
const WIDGET_SETTINGS_PROMPT = `

WIDGET SETTINGS (checkout/cart/auth/account/track/rewards wording + motion):
These widgets are shared platform logic, not page HTML — never try to change their copy or animation via sections/pages/rebuild. Use the \`widgetSettings\` tool field instead, only when the seller actually asked for it.
- \`widgetSettings.motion\`: set only if the seller asked the store to feel calmer/livelier/more premium, or mentioned an animation on checkout/add-to-cart.
- \`widgetSettings.copy\`: an object of EXACT keys below → the seller's new text. Only include keys they actually asked to change. Keep any {var} placeholder in the default literally in your replacement (the platform fills it in).
Available keys (key: default text):
${Object.entries(DEFAULT_WIDGET_COPY)
  .map(([k, v]) => `${k}: "${v}"`)
  .join("\n")}`;

const QA_TOOL = {
  name: "report_qa",
  description: "Report storefront defects and, where confident, the corrected HTML.",
  input_schema: {
    type: "object" as const,
    properties: {
      ok: { type: "boolean", description: "true if the storefront is solid and needs no changes" },
      notes: { type: "string", description: "one line per defect found" },
      section_fixes: {
        type: "array",
        items: { type: "object", properties: { page: { type: "string" }, id: { type: "string" }, html: { type: "string" } }, required: ["page", "id", "html"] },
      },
      component_fixes: {
        type: "object",
        properties: { header: { type: "string" }, footer: { type: "string" } },
      },
      token_fixes: {
        type: "object",
        properties: {
          accent: { type: "string" }, accentText: { type: "string" }, bg: { type: "string" }, surface: { type: "string" },
          text: { type: "string" }, muted: { type: "string" }, border: { type: "string" },
        },
      },
    },
    required: ["ok", "notes"],
  },
};

const PLAN_TOOL = {
  name: "propose_plan",
  description: "Restate what you understood and ask the few highest-leverage clarifying questions before building.",
  input_schema: {
    type: "object" as const,
    properties: {
      summary: { type: "string", description: "one or two sentences: the store you're about to build, in your words" },
      questions: {
        type: "array",
        description: "0 to 4 short questions whose answers would most change the design. Return an EMPTY array when the brief already specifies the pages, the visual direction (palette/fonts/mood) and the key content — a detailed brief needs no questions. Otherwise ask only what's genuinely missing.",
        items: {
          type: "object",
          properties: {
            key: { type: "string", description: "short snake_case id" },
            question: { type: "string", description: "the question, short" },
            why: { type: "string", description: "one short line: what this answer changes about the build (e.g. 'Sets the logo wordmark and product copy')" },
            type: {
              type: "string",
              enum: ["select", "toggle", "multi", "text"],
              description: "select = pick one named option; toggle = exactly 2 options shown side by side; multi = pick any number; text = free text (use only for names/specifics). Prefer select/toggle.",
            },
            suggestions: {
              type: "array",
              items: { type: "string" },
              description: "the options. For select/multi: 3-5 concrete named choices, each fitting THIS business's actual niche — a brand-name anchor is fine when it genuinely sharpens the choice, but pick one that suits the niche (never default to the same handful of famous brands for every business) and don't force an anchor where none fits. For toggle: exactly 2. For text: 0-2 example answers.",
            },
          },
          required: ["key", "question", "type", "suggestions"],
        },
      },
    },
    required: ["summary", "questions"],
  },
};

export interface DesignPlan {
  summary: string;
  questions: { key: string; question: string; why?: string; type?: "select" | "toggle" | "multi" | "text"; suggestions: string[] }[];
  error?: string;
}

/**
 * The "ask before building" step. Given the seller's opening brief (and any attached reference
 * images), the model restates what it understood and asks the 2-4 questions that would most change
 * the result — brand name to display, exact pages, visual direction, colours to keep, hero products.
 * No screenshots here (a linked URL is rendered later, at build time) so this stays fast and cheap.
 */
export async function runDesignPlan(
  businessId: string,
  brief: string,
  images: DesignRef[] = [],
): Promise<DesignPlan> {
  const empty: DesignPlan = { summary: "", questions: [] };
  if (!process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_API_KEY === "paste_your_key_here") return { ...empty, error: "no api key" };
  try {
    await assertUnderUsageCap(businessId);
  } catch {
    return { ...empty, error: "cap" };
  }

  const business = await prisma.business.findUnique({ where: { id: businessId }, select: { name: true, niche: true } });
  const hasUrl = /https?:\/\//.test(brief);
  const content: Anthropic.ContentBlockParam[] = [
    {
      type: "text",
      text: `THE SELLER'S BRIEF (this is the source of truth for what to build):\n${brief}${
        images.length ? `\n\nThey attached ${images.length} reference image(s) — shown below.` : ""
      }${hasUrl ? `\n\nThey linked a site — it will be screenshotted and matched at build time.` : ""}\n\nFor context only, the name currently on their account is "${business?.name ?? "(unset)"}" (${business?.niche ?? "products"}) — but the brief above overrides this. If the brief clearly describes a different kind of brand, just ask what name/wordmark to put on the new storefront; don't dwell on the old one.`,
    },
    ...images.map((im): Anthropic.ContentBlockParam => ({ type: "image", source: { type: "base64", media_type: im.mediaType, data: im.data } })),
  ];

  try {
    const msg = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 2000,
      system: `You are Orbit Design, about to build a real seller's whole storefront. BEFORE building, ask ONLY the clarifying questions whose answers would genuinely change the design. If the brief already gives the pages, the visual direction (palette/fonts/mood) and the key content, return an EMPTY questions array — do not invent questions for a complete brief. When the brief IS vague, good candidates: brand wordmark, copy tone, catalogue size, visual direction / dark mode, imagery approach, what to prioritise for a first pass.

Make the questions feel like a sharp designer's intake form, not a quiz:
- Each question gets a short 'why' line saying what the answer changes ("Sets the logo wordmark and product copy").
- Prefer type 'select' or 'toggle' with concrete, named options. A brand-name anchor can sharpen a choice ("Minimal & quiet, Allbirds-style") but pick one that actually fits THIS business's niche and price point — never default to the same couple of famous brands (Allbirds, Nike…) regardless of what's being sold; a jewellery seller, a hardware brand and a bakery each call for entirely different reference points, and plenty of good options need no brand anchor at all ("Warm & artisanal", "Bold & maximalist").
- Use 'toggle' for binary choices (dark mode yes/no, tight 4-6 vs fuller 8-12 catalogue).
- Use 'multi' for "what matters most for a first pass" (homepage, shop/filtering, product page, cart flow, about, mobile nav).
- Use 'text' only for names/specifics (brand wordmark, exact colours).

Never lecture about the seller's previous/existing brand; the brief is what matters. At most 5 questions. Always give a one or two sentence plain summary of the store you're about to build. Call propose_plan.`,
      tools: [PLAN_TOOL],
      tool_choice: { type: "tool", name: "propose_plan" },
      messages: [{ role: "user", content }],
    });
    const tool = msg.content.find((b) => b.type === "tool_use");
    if (!tool || tool.type !== "tool_use") return { ...empty, error: "no plan" };
    const input = tool.input as {
      summary?: string;
      questions?: { key: string; question: string; why?: string; type?: string; suggestions?: string[] }[];
    };
    const questions = Array.isArray(input.questions)
      ? input.questions
          .filter((q) => q && q.question && q.key)
          .slice(0, 5)
          .map((q) => {
            const type = (["select", "toggle", "multi", "text"] as const).includes(q.type as never)
              ? (q.type as "select" | "toggle" | "multi" | "text")
              : (q.suggestions?.length ? "select" : "text");
            let suggestions = (q.suggestions ?? []).map(String).slice(0, type === "toggle" ? 2 : 6);
            if (type === "toggle" && suggestions.length < 2) suggestions = [];
            return { key: String(q.key), question: String(q.question), why: q.why ? String(q.why) : undefined, type, suggestions };
          })
      : [];
    return { summary: String(input.summary ?? ""), questions };
  } catch (e) {
    return { ...empty, error: String(e).slice(0, 120) };
  }
}

// ---------------------------------------------------------------------------
// Applying the model's ops to the current doc
// ---------------------------------------------------------------------------

/**
 * Defense-in-depth against the model "diffing" instead of returning full HTML for a section it's
 * updating — e.g. writing `<!-- form unchanged -->` in place of real content it was supposed to
 * copy verbatim into `html`. The platform renders exactly what's in `html`; a comment like that
 * doesn't get "expanded" back to the original, it PERMANENTLY DELETES whatever it stands in for
 * (a whole form, a whole list) the moment this update is saved. Reject the update and keep the
 * section as it was rather than publish one that silently lost real content.
 */
function isDestructiveSectionEdit(originalHtml: string | undefined, patchedHtml: string): boolean {
  const commentPattern = /<!--([^>]*)-->/g;
  let m: RegExpExecArray | null;
  while ((m = commentPattern.exec(patchedHtml))) {
    if (/unchanged|rest of|remains? the same|same as (above|before)|omitted|truncated|no changes?|as before|see above/i.test(m[1])) return true;
  }
  if (originalHtml && originalHtml.length > 200 && patchedHtml.length < originalHtml.length * 0.5) return true;
  return false;
}

function cleanTokens(t: Record<string, unknown> | undefined): Partial<DesignTokens> {
  if (!t) return {};
  return Object.fromEntries(Object.entries(t).filter(([, v]) => v !== undefined && v !== null && v !== "")) as Partial<DesignTokens>;
}

/** A header the model returns is only usable if it's an actual <header> shell — the model often
 *  "edits the nav" by replacing the whole header with just the <!--OD_NAV--> marker, which wipes
 *  the logo + sticky styling. Reject those; keep the previous header. */
const usableHeader = (s: unknown): s is string => typeof s === "string" && /<header[\s>]/i.test(s);
const usableFooter = (s: unknown): s is string => typeof s === "string" && /<footer[\s>]/i.test(s);

/**
 * The model sometimes returns an object/array field of the edit tool as a JSON *string*
 * ("rebuild": "{\"pages\": …}") — applyOps would then silently skip it. Parse those back.
 */
export function coerceToolInput(input: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = { ...input };
  for (const key of ["rebuild", "tokens", "components", "pages", "sections", "block_edits", "widgetSettings"]) {
    const v = out[key];
    if (typeof v !== "string") continue;
    try {
      const parsed = JSON.parse(v);
      if (parsed && typeof parsed === "object") out[key] = parsed;
    } catch {
      /* not JSON — applyOps ignores what it can't use */
    }
  }
  return out;
}
function applyOps(prev: OrbitDesignDoc, input: Record<string, unknown>, storeName: string, niche: string): OrbitDesignDoc {
  // Full rebuild
  const rb = input.rebuild as { components?: Record<string, string>; pages?: DesignPage[] } | undefined;
  if (rb && Array.isArray(rb.pages) && rb.pages.length) {
    return normalizeDoc(
      {
        version: prev.version,
        storeName: (input.storeName as string) || prev.storeName || storeName,
        tagline: (input.tagline as string) || prev.tagline || niche,
        tokens: { ...prev.tokens, ...cleanTokens(input.tokens as Record<string, unknown>) } as DesignTokens,
        content: prev.content,
        components: {
          header: usableHeader(rb.components?.header) ? rb.components!.header : prev.components.header,
          footer: usableFooter(rb.components?.footer) ? rb.components!.footer : prev.components.footer,
        },
        pages: rb.pages,
      } as OrbitDesignDoc,
      storeName,
      niche,
    );
  }

  const doc: OrbitDesignDoc = JSON.parse(JSON.stringify(prev));
  if (typeof input.storeName === "string" && input.storeName.trim()) doc.storeName = input.storeName.trim();
  if (typeof input.tagline === "string" && input.tagline.trim()) doc.tagline = input.tagline.trim();
  Object.assign(doc.tokens, cleanTokens(input.tokens as Record<string, unknown>));

  const comp = input.components as Partial<typeof doc.components> | undefined;
  if (comp) {
    if (usableHeader(comp.header)) doc.components.header = comp.header;
    if (usableFooter(comp.footer)) doc.components.footer = comp.footer;
  }

  // curated-component section edits (variant swap / prop merge)
  for (const e of (Array.isArray(input.block_edits) ? input.block_edits : []) as { section?: string; variant?: string; props?: Record<string, unknown> }[]) {
    if (!e?.section) continue;
    const s = doc.pages.flatMap((p) => p.sections).find((x) => x.id === e.section);
    if (!s?.block) continue;
    if (typeof e.variant === "string" && SECTION_KINDS[s.block.kind]?.includes(e.variant)) s.block.variant = e.variant;
    if (e.props && typeof e.props === "object") s.block.props = { ...s.block.props, ...e.props };
  }

  // page ops
  for (const raw of (Array.isArray(input.pages) ? input.pages : []) as Record<string, unknown>[]) {
    const op = String(raw.op);
    if (op === "add") {
      const slug = slugify(String(raw.slug || raw.title || "page"));
      if (slug === "home" || doc.pages.some((p) => p.slug === slug)) continue;
      const page: DesignPage = { slug, title: String(raw.title ?? slug).slice(0, 60), nav: raw.nav !== false, sections: [] };
      const idx = raw.afterSlug ? doc.pages.findIndex((p) => p.slug === raw.afterSlug) : -1;
      if (idx >= 0) doc.pages.splice(idx + 1, 0, page);
      else doc.pages.push(page);
    } else if (op === "update_meta") {
      const p = doc.pages.find((x) => x.slug === raw.slug);
      if (p && p.slug !== "home") {
        if (typeof raw.title === "string") p.title = raw.title.slice(0, 60);
        if (typeof raw.nav === "boolean") p.nav = raw.nav;
      } else if (p && typeof raw.title === "string") p.title = raw.title.slice(0, 60);
    } else if (op === "remove") {
      if (raw.slug !== "home") doc.pages = doc.pages.filter((p) => p.slug !== raw.slug);
    } else if (op === "reorder" && Array.isArray(raw.slugs)) {
      const rank = new Map((raw.slugs as string[]).map((s, i) => [s, i]));
      doc.pages.sort((a, b) => (a.slug === "home" ? -1 : b.slug === "home" ? 1 : (rank.get(a.slug) ?? 99) - (rank.get(b.slug) ?? 99)));
    }
  }

  // section ops
  for (const raw of (Array.isArray(input.sections) ? input.sections : []) as Record<string, unknown>[]) {
    const page = doc.pages.find((p) => p.slug === raw.page) ?? doc.pages.find((p) => p.slug === "home");
    if (!page) continue;
    const op = String(raw.op);
    if (op === "add") {
      const id = String(raw.id || `s${page.sections.length + 1}`).slice(0, 48);
      // a duplicate id would create two sections that silently shadow each other for every future
      // update/remove (only the first is ever addressable) — never allowed, even if the model asks.
      if (page.sections.some((s) => s.id === id)) continue;
      const sec: DesignSection = {
        id,
        type: (SECTION_TYPES.includes(String(raw.type)) ? String(raw.type) : "custom") as DesignSection["type"],
        label: String(raw.label ?? raw.type ?? "Section").slice(0, 60),
        html: String(raw.html ?? ""),
        visible: raw.visible !== false,
      };
      const idx = raw.afterId ? page.sections.findIndex((s) => s.id === raw.afterId) : -1;
      if (idx >= 0) page.sections.splice(idx + 1, 0, sec);
      else page.sections.push(sec);
    } else if (op === "update") {
      const s = page.sections.find((x) => x.id === raw.id);
      if (s) {
        if (typeof raw.html === "string" && !isDestructiveSectionEdit(s.html, raw.html)) s.html = raw.html;
        if (typeof raw.label === "string") s.label = raw.label.slice(0, 60);
        if (typeof raw.type === "string" && SECTION_TYPES.includes(raw.type)) s.type = raw.type as DesignSection["type"];
        if (typeof raw.visible === "boolean") s.visible = raw.visible;
      }
    } else if (op === "remove") {
      page.sections = page.sections.filter((s) => s.id !== raw.id);
    } else if (op === "set_visible") {
      const s = page.sections.find((x) => x.id === raw.id);
      if (s) s.visible = raw.visible !== false;
    } else if (op === "reorder" && Array.isArray(raw.ids)) {
      const rank = new Map((raw.ids as string[]).map((id, i) => [id, i]));
      page.sections.sort((a, b) => (rank.get(a.id) ?? 99) - (rank.get(b.id) ?? 99));
    }
  }

  return normalizeDoc(doc, storeName, niche);
}

// ---------------------------------------------------------------------------
// Verify → self-fix pass
// ---------------------------------------------------------------------------

async function verifyAndFix(
  businessId: string,
  doc: OrbitDesignDoc,
  message: string,
  products: StorefrontProduct[],
): Promise<{ doc: OrbitDesignDoc; fixed: string[] }> {
  const homeHtml = renderPageDocument(doc, { products, businessId, pageSlug: "home" });
  const otherPages = doc.pages
    .filter((p) => p.slug !== "home")
    .map((p) => `- /p/${p.slug} "${p.title}": ${p.sections.map((s) => `${s.id}(${s.type})`).join(", ") || "empty"}`)
    .join("\n");

  let msg;
  try {
    msg = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 6000,
      system: `You are a strict front-end QA reviewer for an e-commerce storefront. You are given the rendered HOME page and the seller's request. Find CONCRETE defects only:
- malformed / unclosed HTML tags, or a section that renders visually empty
- text with poor contrast against its actual background (muted-on-muted, light-on-light)
- fixed pixel widths that overflow a 375px phone; content that clearly breaks on mobile
- raw hex colours instead of var(--od-*) tokens in section/component HTML
- lorem ipsum / obvious placeholder copy / invented facts
- something the seller explicitly asked for that is missing
Call report_qa. If the storefront is solid, set ok=true with a short note. Otherwise set ok=false and provide fixes (corrected full HTML for the affected section by page+id, and/or component_fixes, and/or token_fixes) — only fixes you are confident improve the result. Keep every fix on-style and token-driven.`,
      tools: [QA_TOOL],
      tool_choice: { type: "tool", name: "report_qa" },
      messages: [
        {
          role: "user",
          content: `SELLER REQUEST: ${message}

RENDERED HOME PAGE:
${homeHtml.slice(0, 24000)}

OTHER PAGES:
${otherPages || "(none)"}

DESIGN TOKENS: ${JSON.stringify(doc.tokens)}`,
        },
      ],
    });
  } catch {
    return { doc, fixed: [] };
  }

  try {
    await prisma.agentUsage.create({
      data: {
        businessId,
        agentId: "orbit-design-qa",
        model: MODEL,
        inputTokens: msg.usage.input_tokens,
        outputTokens: msg.usage.output_tokens,
        costUsd: estimateCostUsd(MODEL, msg.usage.input_tokens, msg.usage.output_tokens),
      },
    });
  } catch {
    /* best effort */
  }

  const tool = msg.content.find((b) => b.type === "tool_use");
  if (!tool || tool.type !== "tool_use") return { doc, fixed: [] };
  const out = tool.input as {
    ok?: boolean;
    notes?: string;
    section_fixes?: { page: string; id: string; html: string }[];
    component_fixes?: Record<string, string>;
    token_fixes?: Record<string, string>;
  };
  if (out.ok) return { doc, fixed: [] };

  const next: OrbitDesignDoc = JSON.parse(JSON.stringify(doc));
  const fixed: string[] = [];

  for (const f of out.section_fixes ?? []) {
    const page = next.pages.find((p) => p.slug === f.page);
    const sec = page?.sections.find((s) => s.id === f.id);
    if (sec && typeof f.html === "string" && f.html.trim() && !isDestructiveSectionEdit(sec.html, f.html)) {
      sec.html = f.html;
      fixed.push(`${f.page}/${f.id}`);
    }
  }
  if (out.component_fixes) {
    for (const k of ["header", "footer"] as const) {
      const v = out.component_fixes[k];
      if ((k === "header" ? usableHeader(v) : usableFooter(v)) && !isDestructiveSectionEdit(next.components[k], v as string)) {
        next.components[k] = v;
        fixed.push(k);
      }
    }
  }
  if (out.token_fixes) {
    const clean = cleanTokens(out.token_fixes);
    if (Object.keys(clean).length) {
      Object.assign(next.tokens, clean);
      fixed.push("colours");
    }
  }

  if (!fixed.length) return { doc, fixed: [] };
  return { doc: normalizeDoc(next, next.storeName, next.tagline), fixed: out.notes ? [out.notes] : fixed };
}

// ---------------------------------------------------------------------------
// Visual design review — screenshots the rendered store and a designer-model fixes what looks wrong
// ---------------------------------------------------------------------------

const VISUAL_QA_TOOL = {
  name: "report_visual_qa",
  description: "Report visual/layout/responsive defects seen in the screenshots and the corrected HTML.",
  input_schema: {
    type: "object" as const,
    properties: {
      ok: { type: "boolean", description: "true only if BOTH desktop and mobile look genuinely polished" },
      notes: { type: "string", description: "one short line per defect you're fixing" },
      section_fixes: {
        type: "array",
        items: { type: "object", properties: { page: { type: "string" }, id: { type: "string" }, html: { type: "string" } }, required: ["page", "id", "html"] },
      },
      component_fixes: { type: "object", properties: { header: { type: "string" }, footer: { type: "string" } } },
      token_fixes: {
        type: "object",
        properties: {
          accent: { type: "string" }, accentText: { type: "string" }, bg: { type: "string" }, surface: { type: "string" },
          text: { type: "string" }, muted: { type: "string" }, border: { type: "string" }, radius: { type: "number" }, density: { type: "number" },
        },
      },
      section_adds: {
        type: "array",
        description: "sections the seller asked for that are MISSING — build each one fully",
        items: {
          type: "object",
          properties: {
            page: { type: "string" }, afterId: { type: "string", description: "insert after this section id (omit = append)" },
            id: { type: "string" }, type: { type: "string", enum: SECTION_TYPES }, label: { type: "string" }, html: { type: "string" },
          },
          required: ["page", "id", "type", "label", "html"],
        },
      },
      page_adds: {
        type: "array",
        description: "whole pages the seller listed that were never built — build each fully",
        items: {
          type: "object",
          properties: {
            slug: { type: "string" }, title: { type: "string" }, nav: { type: "boolean" },
            sections: { type: "array", items: { type: "object", properties: { id: { type: "string" }, type: { type: "string", enum: SECTION_TYPES }, label: { type: "string" }, html: { type: "string" } }, required: ["id", "type", "label", "html"] } },
          },
          required: ["slug", "title", "sections"],
        },
      },
    },
    required: ["ok", "notes"],
  },
};

// ---------------------------------------------------------------------------
// V2 checking layer — block-aware. Renders screenshots, then lets the model
// swap variants, rewrite copy, retune tokens, reorder/add/remove sections.
// It CANNOT write raw HTML, so it can't break the curated components.
// ---------------------------------------------------------------------------

const REVIEW_TOOL = {
  name: "report_review",
  description: "Report the storefront's design quality and the precise edits to bring it to a senior-designer bar.",
  input_schema: {
    type: "object" as const,
    properties: {
      ok: { type: "boolean", description: "true only if every page already looks professionally designed" },
      notes: { type: "string", description: "one line on what you changed / why it's ok" },
      token_fixes: { type: "object", properties: tokenProps, description: "only the tokens to change (usually a contrast fix)" },
      section_edits: {
        type: "array",
        description: "tweak an existing section: swap its variant and/or merge new/edited props (copy).",
        items: {
          type: "object",
          properties: {
            page: { type: "string" },
            id: { type: "string" },
            variant: { type: "string" },
            props: { type: "object" },
          },
          required: ["page", "id"],
        },
      },
      section_adds: {
        type: "array",
        description: "add a missing section the brief asked for.",
        items: {
          type: "object",
          properties: {
            page: { type: "string" },
            afterId: { type: "string" },
            id: { type: "string" },
            kind: { type: "string", enum: Object.keys(SECTION_KINDS) },
            variant: { type: "string" },
            label: { type: "string" },
            props: { type: "object" },
          },
          required: ["page", "id", "kind", "variant", "props"],
        },
      },
      section_removes: { type: "array", items: { type: "object", properties: { page: { type: "string" }, id: { type: "string" } }, required: ["page", "id"] } },
      reorder: { type: "array", items: { type: "object", properties: { page: { type: "string" }, ids: { type: "array", items: { type: "string" } } }, required: ["page", "ids"] } },
    },
    required: ["ok", "notes"],
  },
};

async function reviewComposedStore(
  businessId: string,
  doc: OrbitDesignDoc,
  message: string,
  concept: string | undefined,
  products: StorefrontProduct[],
  rounds = 2,
): Promise<{ doc: OrbitDesignDoc; fixed: string[] }> {
  let current = doc;
  const allFixed: string[] = [];

  for (let round = 0; round < rounds; round++) {
    const targets = reviewTargets(current);
    const shots = await renderDocShots(
      targets.map((t) => ({ label: t.label, html: renderPageDocument(current, { products, businessId, pageSlug: t.slug }) })),
    ).catch(() => []);
    if (!shots.length) break;

    const index = current.pages
      .map((p) => `/${p.slug}:\n${p.sections.filter((s) => s.visible).map((s) => `  ${s.id} — ${s.block?.kind || s.type}/${s.block?.variant || "-"}`).join("\n") || "  (empty)"}`)
      .join("\n");
    const kindMenu = (Object.keys(SECTION_KINDS) as (keyof typeof SECTION_KINDS)[]).map((k) => `${k}: ${SECTION_KINDS[k].join("|")}`).join("  ·  ");

    let msg;
    try {
      msg = await anthropic.messages.create({
        model: MODEL,
        max_tokens: 12000,
        system: `You are a senior product designer doing QA on a real storefront built from a curated section-component library. You see desktop + mobile screenshots.

You can ONLY: swap a section's variant, edit its copy (props), retune tokens, add/remove/reorder sections. You cannot write HTML — the components render themselves, always balanced.

Judge against a senior bar and the brand's concept:
- CONTRAST: every text/background pair must be clearly readable (esp. any accent band). Fix via token_fixes.
- FIT: is each section using the best variant for its content and the concept's structural stance? If a hero looks weak, try a different hero variant. If two neighbours use the same variant, change one.
- COPY: headings sharp and specific, body substantial (not one thin line), items filled (a feature/steps/faq with < 3 items is thin — add items via section_edits props). No lorem, no invented stats/reviews.
- COMPLETENESS: if the brief named a section that isn't in the INDEX, add it via section_adds. A retail Home with fewer than 6 sections is INCOMPLETE — add the missing story (story/editorial), a proof section (a testimonial only of real reviews already on the page, otherwise a promise/guarantee section — never invent quotes, names, stats or press) and a slim trust bar via section_adds, with real copy. Never add sections to the product / cart / account / sign-in pages or use {{product.name}}-style tokens — those pages are platform widgets. If the brief mentions shop/filtering/catalog and there is no shop page, that's a gap to flag.
- ORDER & RHYTHM: hero first, cta last, varied variants, no dead weight. Alternate section width + background (contained / full-bleed, plain / banded / inverted) — if every section is the same contained width on the same background, break it up via section_edits/reorder.
- AI-LOOK TELLS to correct: a low-contrast gradient hero; every section a centered heading + 3 cards; everything in rounded drop-shadow cards; a blue/purple accent on a brand that isn't tech; body font left on plain Inter when the concept wanted character. Nudge tokens/variants away from these.
- Keep the concept's point of view — don't flatten bold choices. A polished-but-generic page still needs fixes.

KINDS → VARIANTS: ${kindMenu}

CRITICAL: 'notes' is a ONE-LINE summary only. NEVER describe a change in 'notes' instead of making it. Every single change MUST be a structured entry in section_edits / section_adds / section_removes / reorder / token_fixes — if you say "added testimonials" in notes, there MUST be a matching section_adds entry with full real copy, or it did not happen. A retail Home under 6 sections is not acceptable: return the section_adds to fix it.

If every page already looks professionally designed, set ok=true. Call report_review.`,
        tools: [REVIEW_TOOL],
        tool_choice: { type: "tool", name: "report_review" },
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: `SELLER ASKED: ${message}\n${concept ? `\nCONCEPT: ${concept}\n` : ""}\nSECTION INDEX:\n${index}\n\nTOKENS: ${JSON.stringify(current.tokens)}\n\nScreenshots (desktop then mobile per page):` },
              ...shots.flatMap((s): Anthropic.ContentBlockParam[] => [
                { type: "text", text: s.label },
                { type: "image", source: { type: "base64", media_type: s.mediaType, data: s.data } },
              ]),
            ],
          },
        ],
      });
    } catch {
      break;
    }
    const tool = msg.content.find((b) => b.type === "tool_use");
    if (!tool || tool.type !== "tool_use") break;
    const out = tool.input as {
      ok?: boolean;
      notes?: string;
      token_fixes?: Record<string, unknown>;
      section_edits?: { page: string; id: string; variant?: string; props?: Record<string, unknown> }[];
      section_adds?: { page: string; afterId?: string; id: string; kind: string; variant: string; label?: string; props?: Record<string, unknown> }[];
      section_removes?: { page: string; id: string }[];
      reorder?: { page: string; ids: string[] }[];
    };

    const next: OrbitDesignDoc = JSON.parse(JSON.stringify(current));
    let changed = false;

    if (out.token_fixes && Object.keys(out.token_fixes).length) {
      Object.assign(next.tokens, cleanTokens(out.token_fixes));
      changed = true;
    }
    for (const e of out.section_edits ?? []) {
      const sec = next.pages.find((p) => p.slug === e.page)?.sections.find((s) => s.id === e.id);
      if (!sec?.block) continue;
      if (e.variant && SECTION_KINDS[sec.block.kind as keyof typeof SECTION_KINDS]?.includes(e.variant)) sec.block.variant = e.variant;
      if (e.props && typeof e.props === "object") sec.block.props = { ...sec.block.props, ...e.props };
      changed = true;
    }
    for (const a of out.section_adds ?? []) {
      const pg = next.pages.find((p) => p.slug === a.page);
      if (!pg || !isOrbitKind(a.kind) || pg.sections.some((s) => s.id === a.id)) continue;
      const sec: DesignSection = {
        id: slugify(a.id).slice(0, 40),
        type: (KIND_TO_TYPE[a.kind] || "custom") as DesignSection["type"],
        label: String(a.label || a.kind).slice(0, 60),
        html: "",
        block: {
          kind: a.kind as import("@/lib/orbit-sections").OrbitKind,
          variant: SECTION_KINDS[a.kind].includes(a.variant) ? a.variant : SECTION_KINDS[a.kind][0],
          props: a.props && typeof a.props === "object" ? a.props : {},
        },
        visible: true,
      };
      const at = a.afterId ? pg.sections.findIndex((s) => s.id === a.afterId) : -1;
      if (at >= 0) pg.sections.splice(at + 1, 0, sec);
      else pg.sections.push(sec);
      changed = true;
    }
    for (const r of out.section_removes ?? []) {
      const pg = next.pages.find((p) => p.slug === r.page);
      if (pg && pg.sections.length > 2) {
        const before = pg.sections.length;
        pg.sections = pg.sections.filter((s) => s.id !== r.id);
        if (pg.sections.length !== before) changed = true;
      }
    }
    for (const r of out.reorder ?? []) {
      const pg = next.pages.find((p) => p.slug === r.page);
      if (!pg) continue;
      const byId = new Map(pg.sections.map((s) => [s.id, s]));
      const ordered = r.ids.map((id) => byId.get(id)).filter(Boolean) as DesignSection[];
      if (ordered.length === pg.sections.length) {
        pg.sections = ordered;
        changed = true;
      }
    }

    if (out.notes) allFixed.push(out.notes);
    current = normalizeDoc(next, next.storeName, next.tagline);
    if (out.ok || !changed) break;
  }

  return { doc: current, fixed: allFixed };
}

/** The pages worth reviewing visually: home + the first real content page + the product page. */
function reviewTargets(doc: OrbitDesignDoc): { slug: string; label: string }[] {
  const out = [{ slug: "home", label: "home" }];
  const content = doc.pages.find((p) => p.slug !== "home" && p.slug !== "product" && p.slug !== "cart" && p.sections.some((s) => s.visible));
  if (content) out.push({ slug: content.slug, label: content.title.toLowerCase() });
  return out;
}

async function visualReviewAndFix(
  businessId: string,
  doc: OrbitDesignDoc,
  message: string,
  products: StorefrontProduct[],
  rounds = 2,
  concept?: string,
  spatialSystem?: string,
): Promise<{ doc: OrbitDesignDoc; fixed: string[] }> {
  let current = doc;
  const allFixed: string[] = [];
  // A Phase-2.2 bespoke store deliberately does NOT use the .od-section fixed rhythm — reviewing it
  // against the kit rules would flatten its whole spatial system. Detect it and hold back.
  const bespoke =
    current.pages.reduce((n, p) => n + p.sections.filter((s) => !s.block && (s.html || "").length > 150).length, 0) >
    current.pages.reduce((n, p) => n + p.sections.filter((s) => s.block).length, 0);

  for (let round = 0; round < rounds; round++) {
    const targets = reviewTargets(current);
    const pages = targets.map((t) => ({
      label: t.label,
      html: renderPageDocument(current, { products, businessId, pageSlug: t.slug }),
    }));
    const shots = await renderDocShots(pages).catch(() => []);
    if (!shots.length) break; // headless browser unavailable — skip silently

    const sectionIndex = current.pages
      .map((p) => `/${p.slug}: ${p.sections.filter((s) => s.visible).map((s) => `${s.id}(${s.type},"${s.label}")`).join(", ") || "empty"}`)
      .join("\n");

    let msg;
    try {
      msg = await anthropic.messages.create({
        model: MODEL,
        max_tokens: 14000,
        system: `You are a senior product designer doing a QA pass on a real storefront, holding it to Apple's Human Interface Guidelines (Clarity, Deference, Depth). You see desktop AND mobile screenshots of each page.

FIRST — COMPLETENESS. Compare the SELLER ASKED brief to the SECTION INDEX. If any PAGE the seller listed was never built, add it via page_adds. If any SECTION they asked for is missing (an FAQ accordion, a newsletter signup, a multi-column footer), add it via section_adds — fully built, on-brand. Never add customer quotes, names, stats or press you weren't given — shoppers read them as real. The product, cart, account and sign-in pages are platform widgets ({{product}}, {{cart}}, {{account}}, {{auth}}): never add a section that re-creates them by hand, and never use tokens like {{product.name}} / {{product.price}} — they don't exist and print literally. Restyle around the widget instead. A half-built store is the #1 defect.

${
  bespoke
    ? `SECOND — COHERENCE, for a BESPOKE store (every section is hand-authored HTML — there is NO shared .od-section class and that is CORRECT). Preserve the design's point of view:
- The store obeys ONE spatial system: "${spatialSystem || "as set in the concept"}". Every section must honour it. Fix a section that drifts from it (e.g. a lone contained centred column in a full-bleed store) — rework it to match, don't flatten the others.
- Keep bespoke section markup, custom widths, full-bleed sections, overlaps, min-height panels. Do NOT wrap things back into .od-container / .od-section.
- PRESERVE every motion/interaction hook already on an element: data-od-parallax, data-od-reveal, data-od-reveal-stagger, data-od-hover, data-video-slot, data-od-marquee/carousel/accordion/tabs, data-od-count, data-od-shrink, data-od-draw, and any SMIL <animate>/<animateTransform> inside an <svg>. When you re-emit a section's html, carry these through verbatim.
- Colour: every colour a var(--od-*) token — including the BRAND PALETTE var(--od-<name>) if this store has one; a section deliberately set to a palette colour is CORRECT, keep it (don't normalise every section back to var(--od-bg)). Fix only genuinely-unreadable pairs and stray raw hex.
- Type: one dominant h1 (the hero); section titles a step down. Fix genuinely broken hierarchy only.
Emit fixes as section_fixes (corrected FULL html, hooks intact).`
    : `SECOND — COHERENCE (the page must read as ONE designed system, not stacked blobs):
- Same inner container width down the whole page; consistent left/right edges — whether via class="od-section"/"od-container" or your own consistent wrapper.
- Backgrounds alternate in clear bands (var(--od-bg) / var(--od-surface) or your own equivalents) — fix any run of 3+ identical backgrounds.
- One dominant heading treatment on the page (the hero). Every other section title reads as a clear step down. Fix stray oversized section headings, not the choice of heading class.
- No two ADJACENT sections with the same layout — rework the second into a different shape.
- Buttons and cards should read as ONE consistent visual language across the page (same shape/weight/treatment) — fix a button/card that's visibly off-system from the rest, don't force everything into od-btn/od-card if the page already has its own consistent language.
- Spacing rhythm even between sections; generous whitespace. Cramped = amateur.
Emit these as section_fixes (corrected full html) too.`
}

THEN report concrete visual defects you can actually see:
- broken or misaligned grids; cards of wildly different heights; awkward empty gaps
- overlapping / clipped / cut-off text; text overflowing its container
- a component that clearly isn't rendering right (marquee showing one stacked item, carousel with all slides visible, accordion always open, image slot collapsed to nothing or stretched to a wrong aspect ratio)
- cramped or overflowing mobile layout; something wider than the phone
- weak hierarchy (everything the same size), poor contrast, inconsistent spacing/edges
- the hero or a key section looking empty, unbalanced, or unfinished
- a card/tile with noticeably thinner content than its siblings in the same grid (e.g. one product card showing only a name where the others show name + description + price) — fill it in from real data already loaded for this page, never invented copy
- MOBILE HEADER/NAV: on the mobile screenshot, check the header specifically — nav links wrapping into a cramped second row or overflowing off-screen instead of collapsing behind a hamburger; icons (account/cart/search) overlapping the logo or each other; a hamburger button that's missing entirely when there are more than ~3 nav links; a header that's visibly taller than it should be because links didn't collapse. This usually means the header markup didn't use the platform's own nav markers correctly — the fix is to rebuild that header section using a plain <!--OD_NAV--> (or <!--OD_NAV_LINKS--><!--OD_BURGER-->) marker instead of hand-written nav links, never custom media-query CSS for the nav.
For each, give the corrected FULL html for that section (by page slug + section id from the index below), and/or component_fixes / token_fixes. Keep every fix token-driven and on-style — you are polishing, not redesigning.

HARD RULES for your fixes:
- The storefront ships optional design-kit classes and scale tokens (od-section, od-container, od-grid, od-h1-3, od-btn, od-card, var(--od-s*)/var(--od-shadow-*)/var(--od-radius-*)/var(--od-text-*)) — use them where the page already leans on them, but don't force a section into kit classes just because they exist; matching the page's OWN existing visual language matters more than conformance to the kit.
- CONTRAST: any section on an accent/dark background MUST have its text colour flipped for contrast (var(--od-accent-text) or equivalent) — via class="od-section--invert" if using the kit, or by setting colours directly otherwise. If you see dark text on the accent colour, that's the fix — it's the most common defect.
- Inline styles for the rest + var(--od-*) only. NO <style>, NO <script>, NO @keyframes, NO inline animation:/animation-name: — they are stripped and leave the element broken.
- For ANY moving/interactive part use ONLY these platform hooks (the runtime animates them):
  marquee: <div data-od-marquee="30"><div style="display:inline-flex;gap:48px">…items…</div></div>
  carousel: <div data-od-carousel data-od-autoplay="5000"><div data-od-track><div data-od-slide>…</div>…</div><button type="button" data-od-prev>‹</button><button type="button" data-od-next>›</button><div data-od-dots></div></div>
  accordion: <div data-od-accordion><div data-od-acc-item><button data-od-acc-trigger>Q</button><div data-od-acc-panel><p>A</p></div></div>…</div>
  tabs: <div data-od-tabs><button data-od-tab="k">…</button>…<div data-od-panel="k">…</div>…</div>
  scroll reveal: add data-od-reveal (or ="up|fade|scale") to the element.
- For the product grid: its content is injected automatically — a section of type "product-grid" only needs an optional heading/intro line, never hand-write cards. To scope a custom page's grid to ONE category, make it a "product-grid" section whose html includes the comment <!--grid-only:<category-slug>--> (e.g. <!--grid-only:mens-wear-->); the platform renders that category's cards there with attribute + price filters.
- Never touch the <!--OD_NAV--> marker or hand-write header nav links.
- Images are <div data-img-slot="brief" style="…sizing…"></div> — give sizing with a fixed aspect-ratio so cards stay equal height.

If BOTH views genuinely look clean and professional, set ok=true. Call report_visual_qa.`,
        tools: [VISUAL_QA_TOOL],
        tool_choice: { type: "tool", name: "report_visual_qa" },
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: `SELLER ASKED: ${message}\n${concept ? `\nART DIRECTION (preserve this — do NOT flatten bold choices into a generic clean look; fix execution, not the point of view):\n${concept}\n` : ""}\nSECTION INDEX (page slug → section ids you can fix):\n${sectionIndex}\n\nTOKENS: ${JSON.stringify(current.tokens)}\n\nScreenshots follow (desktop then mobile for each page):` },
              ...shots.flatMap((s): Anthropic.ContentBlockParam[] => [
                { type: "text", text: s.label },
                { type: "image", source: { type: "base64", media_type: s.mediaType, data: s.data } },
              ]),
            ],
          },
        ],
      });
    } catch {
      break;
    }

    try {
      await prisma.agentUsage.create({
        data: {
          businessId,
          agentId: "orbit-design-visual-qa",
          model: MODEL,
          inputTokens: msg.usage.input_tokens,
          outputTokens: msg.usage.output_tokens,
          costUsd: estimateCostUsd(MODEL, msg.usage.input_tokens, msg.usage.output_tokens),
        },
      });
    } catch {
      /* best effort */
    }

    const tool = msg.content.find((b) => b.type === "tool_use");
    if (!tool || tool.type !== "tool_use") break;
    const out = tool.input as {
      ok?: boolean;
      notes?: string;
      section_fixes?: { page: string; id: string; html: string }[];
      section_adds?: { page: string; afterId?: string; id: string; type: string; label: string; html: string }[];
      page_adds?: { slug: string; title: string; nav?: boolean; sections: { id: string; type: string; label: string; html: string }[] }[];
      component_fixes?: Record<string, string>;
      token_fixes?: Record<string, string>;
    };
    if (out.ok) break;

    const next: OrbitDesignDoc = JSON.parse(JSON.stringify(current));
    let changed = false;
    for (const f of out.section_fixes ?? []) {
      const sec = next.pages.find((p) => p.slug === f.page)?.sections.find((s) => s.id === f.id);
      if (sec && typeof f.html === "string" && f.html.trim() && !isDestructiveSectionEdit(sec.html, f.html)) {
        sec.html = f.html;
        changed = true;
      }
    }
    for (const a of out.section_adds ?? []) {
      const page = next.pages.find((p) => p.slug === a.page);
      if (!page || !a.html?.trim() || page.sections.some((s) => s.id === a.id)) continue;
      const sec: DesignSection = {
        id: a.id,
        type: (SECTION_TYPES.includes(a.type) ? a.type : "custom") as DesignSection["type"],
        label: (a.label || "Section").slice(0, 60),
        html: a.html,
        visible: true,
      };
      const idx = a.afterId ? page.sections.findIndex((s) => s.id === a.afterId) : -1;
      if (idx >= 0) page.sections.splice(idx + 1, 0, sec);
      else page.sections.push(sec);
      changed = true;
    }
    for (const a of out.page_adds ?? []) {
      const slug = a.slug?.toLowerCase().replace(/[^a-z0-9-]/g, "");
      if (!slug || slug === "home" || FUNCTIONAL_PAGES.includes(slug) || next.pages.some((p) => p.slug === slug)) continue;
      if (!Array.isArray(a.sections) || !a.sections.length) continue;
      next.pages.push({
        slug,
        title: (a.title || slug).slice(0, 60),
        nav: a.nav !== false,
        sections: a.sections
          .filter((s) => s.html?.trim())
          .map((s, i) => ({
            id: s.id || `${slug}-s${i}`,
            type: (SECTION_TYPES.includes(s.type) ? s.type : "custom") as DesignSection["type"],
            label: (s.label || "Section").slice(0, 60),
            html: s.html,
            visible: true,
          })),
      });
      changed = true;
    }
    if (out.component_fixes) {
      for (const k of ["header", "footer"] as const) {
        const v = out.component_fixes[k];
        if ((k === "header" ? usableHeader(v) : usableFooter(v)) && !isDestructiveSectionEdit(next.components[k], v as string)) {
          next.components[k] = v;
          changed = true;
        }
      }
    }
    if (out.token_fixes) {
      const clean = cleanTokens(out.token_fixes);
      if (Object.keys(clean).length) {
        Object.assign(next.tokens, clean);
        changed = true;
      }
    }
    if (!changed) break;

    current = normalizeDoc(next, next.storeName, next.tagline);
    if (out.notes) allFixed.push(out.notes);
  }

  return { doc: current, fixed: allFixed };
}

// ---------------------------------------------------------------------------
// Full store audit — a dedicated, seller-triggered deep QA pass (not part of every build).
// Screenshots EVERY real page at desktop + mobile, reports every defect as a discrete finding with
// its own fix already prepared, and returns them for the seller to approve — nothing is applied
// until `applyAuditFindings` is called with the ids they picked.
// ---------------------------------------------------------------------------

export interface AuditFinding {
  id: string;
  page: string; // page slug this finding is about, or "global" for header/footer/tokens
  area: string; // human label, e.g. "Home · Hero" / "Header" / "Global colours"
  severity: "high" | "medium" | "low";
  issue: string; // what's wrong, in plain language
  fixSummary: string; // what the fix does, in plain language
  // Absent when the model reported a REAL issue but it doesn't reduce to a one-click section/
  // component/token patch (e.g. "this whole page is unbuilt") — still shown to the seller, just
  // without an auto-apply checkbox, instead of being silently dropped (which used to make the
  // panel say "nothing wrong found" under a summary describing serious problems).
  fix?:
    | { kind: "section"; sectionId: string; html: string }
    | { kind: "component"; component: "header" | "footer"; html: string }
    | { kind: "token"; tokens: Record<string, string | number> };
}

const AUDIT_TOOL = {
  name: "report_store_audit",
  description: "Report every real visual/layout/alignment/responsive/contrast defect found across the screenshots, each with its own ready-to-apply fix.",
  input_schema: {
    type: "object" as const,
    properties: {
      summary: { type: "string", description: "one warm sentence on overall state — 'looking sharp, a few small things' / 'several real issues across mobile'" },
      findings: {
        type: "array",
        items: {
          type: "object",
          properties: {
            page: { type: "string", description: "page slug this belongs to (from the SECTION INDEX), or 'global' for header/footer/token-wide issues" },
            area: { type: "string", description: "short human label, e.g. 'Home · Hero', 'Header', 'Global colours'" },
            severity: { type: "string", enum: ["high", "medium", "low"] },
            issue: { type: "string", description: "one plain sentence describing exactly what's wrong and where" },
            fixSummary: { type: "string", description: "one plain sentence describing what the fix does" },
            fixKind: { type: "string", enum: ["section", "component", "token"] },
            sectionId: { type: "string", description: "required when fixKind=section — the section id from the index" },
            html: { type: "string", description: "required when fixKind=section or component — the corrected full HTML" },
            component: { type: "string", enum: ["header", "footer"], description: "required when fixKind=component" },
            tokens: { type: "object", properties: tokenProps, description: "required when fixKind=token — only the tokens to change" },
          },
          required: ["page", "area", "severity", "issue", "fixSummary", "fixKind"],
        },
      },
    },
    required: ["summary", "findings"],
  },
};

/** Every real page worth auditing — skips a page with no visible sections (nothing to look at). */
function auditTargets(doc: OrbitDesignDoc): { slug: string; label: string }[] {
  return doc.pages.filter((p) => p.sections.some((s) => s.visible)).map((p) => ({ slug: p.slug, label: p.title || p.slug })).slice(0, 8);
}

export async function runStoreAudit(
  businessId: string,
): Promise<{ summary: string; findings: AuditFinding[]; error?: string }> {
  const doc = await loadDoc(businessId);
  const business = await prisma.business.findUnique({
    where: { id: businessId },
    select: { name: true, niche: true, products: { select: DESIGN_PRODUCT_SELECT, take: 24 } },
  });
  const products: StorefrontProduct[] = toStorefrontProducts(business?.products ?? []);
  if (!process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_API_KEY === "paste_your_key_here")
    return { summary: "", findings: [], error: "no api key" };

  const targets = auditTargets(doc);
  if (!targets.length) return { summary: "Nothing built yet to audit.", findings: [] };

  const pages = targets.map((t) => ({ label: t.label, html: renderPageDocument(doc, { products, businessId, pageSlug: t.slug }) }));
  const shots = await renderDocShots(pages).catch(() => []);
  if (!shots.length) return { summary: "", findings: [], error: "screenshot engine unavailable" };

  const sectionIndex = doc.pages
    .map((p) => `/${p.slug} ("${p.title}"): ${p.sections.filter((s) => s.visible).map((s) => `${s.id}(${s.type},"${s.label}")`).join(", ") || "empty"}`)
    .join("\n");

  let msg;
  try {
    msg = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 16000,
      system: `You are a senior product designer doing a FULL, exhaustive QA pass on a real storefront — "${business?.name ?? "this store"}" (sells ${business?.niche ?? "products"}) — across EVERY page, holding it to Apple's Human Interface Guidelines (Clarity, Deference, Depth). You see desktop AND mobile screenshots of EVERY real page. This is a deliberate deep audit, not a quick pass — go section by section, page by page, and catch every genuine defect, however small: nothing is too minor to report if it's actually visible in a screenshot.

CHECK EACH PAGE, EACH VIEW, FOR:
- ALIGNMENT & OVERFLOW: text/image/button baselines that don't line up within a row; a grid whose cards aren't evenly spaced; content that's off-centre when it should be centred (or vice versa); inconsistent left/right edges down the page. Look CLOSELY at every element's right/bottom edge against its own immediate parent's edge and against the viewport edge — text or an element that visibly runs past its container or off the edge of the screen (even by a little) is a HIGH severity finding; the fix is almost always adding min-width:0 / width:100% to the overflowing element or its flex/grid container, or shortening a fixed width.
- RESPONSIVENESS: anything that overflows or gets clipped at 390px mobile width; a grid that doesn't collapse to fewer columns; text that's too large/small on mobile; a fixed-width element that breaks the layout; tap targets that look too small or too close together.
- CONTRAST & COLOUR: text that's hard to read on ITS ACTUAL BACKGROUND — judge every piece of text against the real colour behind it in the screenshot, never assume a token name is automatically safe. The most common trap: --od-muted / --od-text are calibrated against --od-bg, but a footer or any section using od-section--invert, var(--od-accent), or a BRAND PALETTE colour as its background has a DIFFERENT background — muted grey that reads fine on the page body can wash out and blend into a gold/accent-coloured footer. Check contrast inside every invert/palette-coloured section separately, not just the main body. Also flag a token used for the wrong purpose (e.g. a background colour used as text colour); inconsistent colour logic between sections.
- SPACING & RHYTHM: cramped sections; a section with an odd empty gap; inconsistent vertical rhythm between sections; a card grid with uneven card heights; a section where content is pushed to one side leaving a large obviously-empty area on the other with nothing to justify it.
- COMPONENTS RENDERING WRONG: a broken carousel/accordion/marquee; a collapsed or wrongly-stretched image slot; an empty section; literal template/placeholder text visible anywhere — a stray {{#each}}/{{/each}} or any {{something}} that never got replaced with a real value (the only real tokens are {{store.name}}, {{store.tagline}}, {{store.year}}, {{contact.email}}, {{contact.phone}}, {{contact.address}}, {{social.*}} — any OTHER {{...}} you see in a screenshot, including things like {{store.founded}}, is a bug someone must hand-write a real value into) — this should never be user-visible.
- DECORATIVE MOTIFS THAT NEVER APPEARED: an SVG ring/arc/underline that's clearly meant to be visible (part of the page's signature motif) but reads as a blank/invisible outline in the screenshot — this usually means its stroke-dashoffset is stuck fully hidden. Flag it even though you can't verify the JS at fault; the fix is a token_fix is not appropriate here, use a section_fix that removes the incomplete motif or simplifies it to something that renders correctly without relying on an animation that isn't firing.
- TYPOGRAPHY: inconsistent heading hierarchy; a page with more than one dominant hero-scale headline; body copy that's too wide (>~46ch) or too narrow.
- SMALL POLISH: a button/link that looks unstyled or default-browser; an icon that's the wrong size or misaligned with its label; inconsistent button styles across the store.
- CONTENT THINNESS: a card/tile that shows noticeably LESS real content than its siblings in the same grid or than its own layout has room for — e.g. every other product card in a grid shows a name + description + price, but one shows only a name with an empty gap where the rest should be; a "featured" or "spotlight" card that's supposed to carry a description/spec line but only has a title; a list where one row is conspicuously sparser than the rest. This is a real defect even though nothing overflows or misaligns — flag it and give it a section_fix that fills in the missing piece using real data already available for that item (the product/content already loaded for this page), never invented copy.
- MOBILE HEADER/NAV: on EVERY page's mobile (390px) screenshot, look specifically at the header — nav links wrapping into a cramped second row, running off the right edge, or overlapping the logo/cart/account icons instead of collapsing behind a hamburger toggle; a header that's visibly taller than a normal single-row header because its links didn't collapse; more than ~3 nav links visible inline on mobile with no hamburger icon anywhere. This is HIGH severity — a broken mobile nav blocks navigation entirely for phone shoppers. It almost always means that page's header section was hand-written with custom nav markup/media queries instead of the platform's own <!--OD_NAV--> (or <!--OD_NAV_LINKS-->/<!--OD_BURGER-->) marker system, which already collapses correctly. The fix is a section_fix that replaces the header's nav markup with the plain marker(s) instead of hand-rolled links/CSS.

Every finding needs ITS OWN ready-to-apply fix — never bundle multiple defects into one finding, and never describe a defect without a fix. Report even small/cosmetic issues — a seller reviewing this expects a genuinely thorough pass, not just the big stuff. If a page/view is completely clean, don't invent a finding for it — an empty findings array (or very few) for an already-good store is the correct, honest result.

HARD RULES for every fix (same platform rules the generator follows):
- The storefront ships a design kit — KEEP using its classes (od-section, od-section--invert, od-container, od-container-narrow, od-grid, od-eyebrow, od-h1/h2/h3, od-lead, od-body, od-btn + od-btn-primary/od-btn-ghost, od-card + od-card--soft/--lift) and its scales (var(--od-s1..s10), var(--od-shadow-*), var(--od-radius-*), var(--od-text-*)) if the section already uses them — OR if the section is bespoke inline-styled HTML (common on a hand-built store), preserve that bespoke style and just fix the actual defect, do not force it back into kit classes.
- PRESERVE every motion/interaction hook already on an element verbatim: data-od-parallax, data-od-reveal, data-od-reveal-stagger, data-od-hover, data-video-slot, data-img-slot, data-od-marquee/carousel/accordion/tabs, data-od-count, data-od-shrink, data-od-draw/dash/spin, and any SMIL <animate>/<animateTransform> inside an <svg>.
- Colour only through var(--od-*) tokens (including a BRAND PALETTE var(--od-<name>) if this store has one — a section deliberately set to a palette colour is correct, don't flatten it). Text tokens (--od-text/--od-muted/--od-accent-text) are for copy; background tokens (--od-bg/--od-surface/--od-border) are never a font colour.
- No {{#each}}/{{#if}}/templating syntax of any kind — only {{store.x}}/{{contact.x}}/{{social.x}}/{{product}}/{{cart}} are real tokens.
- Never touch the <!--OD_NAV--> marker or hand-write header nav links/cart/account icon.
- fixKind="section" needs sectionId + the corrected full html. fixKind="component" needs component + the corrected full header/footer html (a complete <header>/<footer> element). fixKind="token" needs just the tokens changing (e.g. a global contrast fix) — use this when the SAME defect repeats across many sections, instead of one section fix per section.

Call report_store_audit with every real finding.`,
      tools: [AUDIT_TOOL],
      tool_choice: { type: "tool", name: "report_store_audit" },
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: `SECTION INDEX (page slug → section ids you can fix):\n${sectionIndex}\n\nTOKENS: ${JSON.stringify(doc.tokens)}\n\nScreenshots follow (desktop then mobile for each page):` },
            ...shots.flatMap((s): Anthropic.ContentBlockParam[] => [
              { type: "text", text: s.label },
              { type: "image", source: { type: "base64", media_type: s.mediaType, data: s.data } },
            ]),
          ],
        },
      ],
    });
  } catch {
    return { summary: "", findings: [], error: "review call failed" };
  }

  try {
    await prisma.agentUsage.create({
      data: {
        businessId,
        agentId: "orbit-design-audit",
        model: MODEL,
        inputTokens: msg.usage.input_tokens,
        outputTokens: msg.usage.output_tokens,
        costUsd: estimateCostUsd(MODEL, msg.usage.input_tokens, msg.usage.output_tokens),
      },
    });
  } catch {
    /* best effort */
  }

  const tool = msg.content.find((b) => b.type === "tool_use");
  if (!tool || tool.type !== "tool_use") return { summary: "", findings: [], error: "no findings returned" };
  const out = tool.input as {
    summary?: string;
    findings?: {
      page?: string; area?: string; severity?: string; issue?: string; fixSummary?: string;
      fixKind?: string; sectionId?: string; html?: string; component?: string; tokens?: Record<string, unknown>;
    }[];
  };

  const findings: AuditFinding[] = [];
  (Array.isArray(out.findings) ? out.findings : []).forEach((f, i) => {
    if (!f.page || !f.area || !f.issue || !f.fixSummary) return;
    const severity: AuditFinding["severity"] = f.severity === "high" || f.severity === "low" ? f.severity : "medium";
    const base = { id: `f${i + 1}`, page: f.page, area: f.area.slice(0, 80), severity, issue: f.issue.slice(0, 300), fixSummary: f.fixSummary.slice(0, 200) };
    if (f.fixKind === "section" && f.sectionId && typeof f.html === "string" && f.html.trim()) {
      findings.push({ ...base, fix: { kind: "section", sectionId: f.sectionId, html: f.html } });
    } else if (f.fixKind === "component" && (f.component === "header" || f.component === "footer") && typeof f.html === "string") {
      if ((f.component === "header" && usableHeader(f.html)) || (f.component === "footer" && usableFooter(f.html))) {
        findings.push({ ...base, fix: { kind: "component", component: f.component, html: f.html } });
      } else {
        findings.push(base); // real defect, but the header/footer patch itself didn't pass validation
      }
    } else if (f.fixKind === "token" && f.tokens) {
      const clean = cleanTokens(f.tokens);
      findings.push(Object.keys(clean).length ? { ...base, fix: { kind: "token", tokens: clean as Record<string, string | number> } } : base);
    } else {
      // No fixKind, or one the model couldn't back with real patch data (e.g. "this whole page
      // needs real content built") — still a real finding worth surfacing, just not auto-fixable.
      findings.push(base);
    }
  });

  return { summary: (out.summary || "").slice(0, 300), findings };
}

/** Apply only the findings the seller approved (by id) and save. Returns the updated doc. */
export async function applyAuditFindings(businessId: string, findings: AuditFinding[], approvedIds: string[]): Promise<OrbitDesignDoc> {
  const doc = await loadDoc(businessId);
  const approved = new Set(approvedIds);
  const next: OrbitDesignDoc = JSON.parse(JSON.stringify(doc));
  for (const f of findings) {
    if (!approved.has(f.id) || !f.fix) continue;
    if (f.fix.kind === "section") {
      const { sectionId, html } = f.fix;
      for (const p of next.pages) {
        const sec = p.sections.find((s) => s.id === sectionId);
        if (sec) sec.html = sanitizeGeneratedHtml(html);
      }
    } else if (f.fix.kind === "component") {
      next.components[f.fix.component] = sanitizeGeneratedHtml(f.fix.html);
    } else if (f.fix.kind === "token") {
      Object.assign(next.tokens, f.fix.tokens);
    }
  }
  const saved = normalizeDoc(next, next.storeName, next.tagline);
  await saveDoc(businessId, saved);
  return saved;
}

// ---------------------------------------------------------------------------
// Tweaks — AI-authored per-design adjustment controls
// ---------------------------------------------------------------------------

const TWEAKS_TOOL = {
  name: "define_tweaks",
  description: "Add bespoke adjustment controls to this design, wiring each to a --tw-<key> CSS variable.",
  input_schema: {
    type: "object" as const,
    properties: {
      reply: { type: "string", description: "1-2 plain sentences on what controls you added" },
      tweaks: {
        type: "array",
        items: {
          type: "object",
          properties: {
            key: { type: "string", description: "short kebab id, unique" },
            label: { type: "string" },
            type: { type: "string", enum: ["slider", "select", "color"] },
            value: { type: "string", description: "the design's CURRENT value for this property (becomes the default)" },
            unit: { type: "string", description: "slider unit e.g. px, rem, deg — omit for unitless" },
            min: { type: "number" },
            max: { type: "number" },
            step: { type: "number" },
            options: { type: "array", items: { type: "object", properties: { label: { type: "string" }, value: { type: "string" } }, required: ["label", "value"] } },
          },
          required: ["key", "label", "type", "value"],
        },
      },
      sectionEdits: {
        type: "array",
        description: "the section HTML changes that wire var(--tw-<key>, <fallback>) into the right properties",
        items: { type: "object", properties: { page: { type: "string" }, id: { type: "string" }, html: { type: "string" } }, required: ["page", "id", "html"] },
      },
    },
    required: ["reply", "tweaks", "sectionEdits"],
  },
};

export interface TweaksResult {
  reply: string;
  doc: OrbitDesignDoc;
  error?: string;
}

export async function runTweaksTurn(businessId: string, request: string): Promise<TweaksResult> {
  const doc = await loadDoc(businessId);
  if (!process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_API_KEY === "paste_your_key_here")
    return { reply: "", doc, error: "no api key" };
  try {
    await assertUnderUsageCap(businessId);
  } catch {
    return { reply: "You've hit this month's AI usage cap.", doc, error: "cap" };
  }

  const business = await prisma.business.findUnique({ where: { id: businessId }, select: { name: true, niche: true } });
  const pageIndex = doc.pages
    .map((p) => `/${p.slug}:\n${p.sections.map((s) => `  ${s.id} (${s.type}) "${s.label}"`).join("\n") || "  (empty)"}`)
    .join("\n");
  const existing = (doc.tweaks ?? []).map((t) => `${t.key} (${t.cssVar})`).join(", ") || "none";

  let msg;
  try {
    msg = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 12000,
      system: `You add bespoke "Tweaks" controls to a live storefront design — sliders / selects / colour pickers the seller can drag afterwards, each bound to a CSS custom property you wire in.

FOR EACH control the seller wants:
1. Pick a short unique kebab \`key\` and a variable \`--tw-<key>\`.
2. Find the exact property in the relevant SECTION HTML and rewrite it to use the variable WITH the current value as fallback, e.g.
   height:420px            ->  height:var(--tw-hero-h, 420px)
   gap:clamp(16px,3vw,32px) ->  gap:var(--tw-card-gap, clamp(16px,3vw,32px))
   padding:80px 0          ->  padding:var(--tw-section-pad, 80px) 0
   If the property spans several elements (e.g. every card), edit each. Return the FULL corrected html for each touched section via sectionEdits (page slug + section id from the index).
3. Return the control spec: type slider (with min/max/step and unit), select (with options — value is the CSS value), or color. \`value\` = the design's current value (the fallback you used).

Only touch section HTML (not components / tokens / functional-page markers). Keep to the 1-4 controls asked for. Existing tweaks: ${existing}. Business: ${business?.name} — ${business?.niche}.

SECTION INDEX:
${pageIndex}

Call define_tweaks.`,
      tools: [TWEAKS_TOOL],
      tool_choice: { type: "tool", name: "define_tweaks" },
      messages: [
        {
          role: "user",
          content: `CURRENT DESIGN (sections):\n${JSON.stringify(doc.pages.map((p) => ({ slug: p.slug, sections: p.sections.map((s) => ({ id: s.id, html: s.html })) })))}\n\nADD CONTROLS FOR: ${request}`,
        },
      ],
    });
  } catch (e) {
    return { reply: "The tweak engine hit an error — try again.", doc, error: String(e).slice(0, 160) };
  }

  try {
    await prisma.agentUsage.create({
      data: { businessId, agentId: "orbit-design-tweaks", model: MODEL, inputTokens: msg.usage.input_tokens, outputTokens: msg.usage.output_tokens, costUsd: estimateCostUsd(MODEL, msg.usage.input_tokens, msg.usage.output_tokens) },
    });
  } catch {
    /* best effort */
  }

  const tool = msg.content.find((b) => b.type === "tool_use");
  if (!tool || tool.type !== "tool_use") return { reply: "Couldn't build those controls.", doc, error: "no tool" };
  const out = tool.input as {
    reply?: string;
    tweaks?: import("@/lib/orbit-design").DesignTweak[];
    sectionEdits?: { page: string; id: string; html: string }[];
  };

  const next: OrbitDesignDoc = JSON.parse(JSON.stringify(doc));
  for (const e of out.sectionEdits ?? []) {
    const sec = next.pages.find((p) => p.slug === e.page)?.sections.find((s) => s.id === e.id);
    if (sec && typeof e.html === "string" && e.html.trim()) sec.html = e.html;
  }
  const merged = [...(next.tweaks ?? [])];
  for (const t of out.tweaks ?? []) {
    if (!t?.key) continue;
    const cssVar = `--tw-${String(t.key).toLowerCase().replace(/[^a-z0-9-]/g, "")}`;
    const i = merged.findIndex((x) => x.key === t.key);
    const entry = { ...t, cssVar, value: t.value ?? "" };
    if (i >= 0) merged[i] = entry;
    else merged.push(entry);
  }
  next.tweaks = merged;

  const saved = normalizeDoc(next, next.storeName, next.tagline);
  await saveDoc(businessId, saved);
  return { reply: (out.reply || "Added your controls.").trim(), doc: saved };
}

// ---------------------------------------------------------------------------
// Persistence
// ---------------------------------------------------------------------------

export async function loadDoc(businessId: string): Promise<OrbitDesignDoc> {
  const [design, business] = await Promise.all([
    prisma.storeDesign.findUnique({ where: { businessId } }),
    prisma.business.findUnique({ where: { id: businessId }, select: { name: true, niche: true } }),
  ]);
  const name = business?.name ?? "Your Store";
  const niche = business?.niche ?? "great products";
  if (design?.doc) {
    try {
      return migrateDoc(JSON.parse(design.doc), name, niche);
    } catch {
      /* fall through */
    }
  }
  return defaultDoc(name, niche);
}

export async function saveDoc(businessId: string, doc: OrbitDesignDoc): Promise<void> {
  await prisma.storeDesign.upsert({
    where: { businessId },
    create: { businessId, doc: JSON.stringify(doc) },
    update: { doc: JSON.stringify(doc) },
  });
}

// ---------------------------------------------------------------------------
// One design turn
// ---------------------------------------------------------------------------

export interface DesignRef {
  /** base64 image data, no data: prefix */
  data: string;
  mediaType: "image/jpeg" | "image/png" | "image/webp" | "image/gif";
}

// ---------------------------------------------------------------------------
// Multi-pass whole-store build — plan the structure, then build each page's
// sections in a focused (parallel) call. One giant tool call can't reliably
// produce 4+ fully-sectioned pages; this does, like Claude Design's batches.
// ---------------------------------------------------------------------------


const STRUCTURE_TOOL = {
  name: "plan_store",
  description: "Lay out the whole storefront before it's built section by section: brand, palette/fonts, header, footer, and every page with each section's purpose (no section HTML yet).",
  input_schema: {
    type: "object" as const,
    properties: {
      reply: { type: "string", description: "1-2 warm sentences describing the store you're building" },
      storeName: { type: "string" },
      tagline: { type: "string" },
      concept: {
        type: "string",
        description:
          "The art direction, committed to in 2-3 sentences with SPECIFICS every section must honour: the visual idea, the type personality + how dramatic the scale jump is (hero vs body), whether accent is used as full section fills or just marks, and one signature motif that recurs (a rule, a badge shape, a number style, an offset card). Invent this fresh from the brief + niche each time — do NOT reach for a stock 'editorial' or 'quiet luxury' label out of habit; a hardware brand, a kids' toy shop, a spice merchant and a law firm should each land somewhere completely different. Make it a REAL, specific point of view, not 'clean and modern'.",
      },
      tokens: { type: "object", properties: tokenProps },
      spatialSystem: {
        type: "string",
        description:
          "the ONE spatial system every page obeys — how sections meet the viewport and each other. Commit hard to one: 'full-bleed colour bands edge to edge, no gutters, sections abut' / 'vast air — every section a contained column with huge whitespace between' / 'a fixed left rail with the content scrolling beside it' / 'asymmetric editorial grid, sections overlap and break the margin' / 'horizontal panels — each section a full-height screen' / 'tight, dense, magazine — thin rules, small gutters, no empty space'. This is what makes the store look unlike every other store — pick the one the brand demands and NEVER drift to a plain centred stack.",
      },
      announcement: {
        type: "object",
        description: "the thin promo strip above the header. Set show:false for a calm / luxury brand that wants none. show:true + a short text for a DTC / hype brand.",
        properties: { show: { type: "boolean" }, text: { type: "string" } },
      },
      preloader: {
        type: "boolean",
        description: "true for a brand whose first impression should be a beat of anticipation — a full-screen wordmark veil that fades as the page loads. Good for luxury / fashion / hype drops. Leave false for utilitarian / fast-shopping brands.",
      },
      designDna: {
        type: "string",
        description:
          "The concrete design language every page will be built to — 4-6 lines, SPECIFIC, so all sections share ONE vision instead of each reaching for defaults. Include: (1) TYPE SCALE — the actual hero size, h2 size, body size with clamp() and which font each, stated in your own numbers and your own font choice for THIS brand — never default to the same 2-3 fonts every time; pick from the full range of Google Fonts serif/sans/mono/display families that fit the concept. (2) COLOURWAY — which colour each kind of section takes, using names YOU invent for THIS brand's palette (never reuse 'sage/gold/rust/navy' as a reflex — those are one example brand's colours, not a template; a different brand needs different hues and different names entirely). (3) SIGNATURE MOTIF that recurs on every page (a hand-drawn arc, an oversized outline numeral, a squiggle rule, a wavy blob edge, or something else entirely of your own invention). (4) SPACING + shape (section padding, radius on images vs tiles vs buttons, the button style). (5) MOTION signature (what animates and how). Derive it from the brief — if the brief already specifies these, restate them exactly; otherwise invent one that could only belong to this specific brand.",
      },
      headerBrief: {
        type: "string",
        description:
          "1-2 sentences describing the header you want built — its shape and behaviour (slim top bar / tall split / centred stack / transparent-over-hero then solid on scroll / fixed left sidebar), whether it has mega-menu dropdowns, where the nav links sit, whether it's sticky. The HTML is built from this; don't write markup here.",
      },
      footerBrief: {
        type: "string",
        description: "1 sentence describing the footer — big-type / tidy columns / single centred line / newsletter-forward. Built from this, not written here.",
      },
      pages: {
        type: "array",
        description: "every page the seller listed, home first. Do NOT list 'product' or 'cart' — they're added automatically.",
        items: {
          type: "object",
          properties: {
            slug: { type: "string" }, title: { type: "string" }, nav: { type: "boolean" },
            sections: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  id: { type: "string", description: "short kebab id, unique on the page" },
                  type: { type: "string", enum: SECTION_TYPES },
                  label: { type: "string" },
                  layout: { type: "string", description: "the skeleton to use — for the hero name one of: editorial-broken-grid / monumental-centered / full-bleed-overlay / offset-overlap / stacked-type-forward. For mid-page sections name one of: split-statement / full-bleed-band / rule-separated-rows / alternating-media-rows / asymmetric-bento / oversized-numeral-cards / marquee|tabs|accordion|carousel / index-list. VARY hard — adjacent sections NEVER share a skeleton, and no page is a run of centered stacks." },
                  brief: { type: "string", description: "1 sentence: the exact content (headline angle + what the items say), grounded in the brand" },
                },
                required: ["id", "type", "label", "brief"],
              },
            },
          },
          required: ["slug", "title", "sections"],
        },
      },
    },
    required: ["storeName", "tokens", "header", "footer", "pages"],
  },
};

const BUILD_PAGE_TOOL = {
  name: "build_page",
  description: "Return the finished inline-styled HTML for each section of one page.",
  input_schema: {
    type: "object" as const,
    properties: {
      sections: { type: "array", items: { type: "object", properties: { id: { type: "string" }, html: { type: "string" } }, required: ["id", "html"] } },
    },
    required: ["sections"],
  },
};

const BUILD_SHELL_TOOL = {
  name: "build_shell",
  description: "Return the finished <header> and <footer> HTML for the storefront.",
  input_schema: {
    type: "object" as const,
    properties: { header: { type: "string" }, footer: { type: "string" } },
    required: ["header", "footer"],
  },
};

/** Build the <header> + <footer> HTML from the plan's briefs — a small, separate call so the plan
 *  itself stays compact enough to never truncate. */
async function buildShell(
  plan: StorePlan,
  business: { name: string; niche: string },
): Promise<{ header: string; footer: string }> {
  const fallback = {
    header: defaultComponents(plan.storeName, business.niche).header,
    footer: defaultComponents(plan.storeName, business.niche).footer,
  };
  try {
    const msg = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 6000,
      system: systemPrompt(business.name, business.niche, []),
      tools: [BUILD_SHELL_TOOL],
      tool_choice: { type: "tool", name: "build_shell" },
      messages: [
        {
          role: "user",
          content: `Build the <header> and <footer> for the "${plan.storeName}" storefront (sells ${business.niche}).

ART DIRECTION: ${plan.concept || "considered, editorial"}
SPATIAL SYSTEM: ${plan.spatialSystem || "contained columns"}
TOKENS (style everything through var(--od-*), no raw hex): ${JSON.stringify(plan.tokens)}

HEADER — ${plan.headerBrief || "a slim sticky bar: wordmark left, nav right"}.
  You own the layout. Put the literal marker <!--OD_NAV--> exactly once, inside a real <nav>...</nav> element, where the page links + the responsive mobile menu + the cart link (with its live count badge) + the account icon should appear — the platform injects all of that at that ONE spot. Never hand-write your own "Cart" / "Sign in" / account text, icons or links anywhere in the header — that creates fake, non-functional UI sitting next to (or instead of) the real one.
  The wordmark links home (href="#page:home"). A sticky header may carry data-od-shrink (the runtime compacts it on scroll — don't animate it yourself). Do NOT repeat the site's announcement-bar message (shipping/promo text) inside the header's own markup — that bar is separate and already shown above the header; a second row in the header should carry genuinely different content (a phone number, a tagline, social links) or simply not exist.
  ANY custom layout you build (multi-row headers, flex/grid arrangements, spacing) must be done with real inline style="..." attributes (display:flex, justify-content, gap, padding, etc). NEVER invent a bare CSS class name (like "site-topbar" or "header__utility") and rely on it for layout — no stylesheet rule exists for a class you made up, so the browser ignores it and elements collapse/overlap with no spacing. Only od-* helper classes documented elsewhere in this prompt have real CSS behind them.
  MEGA-MENU: if the brief wants multi-column dropdown menus, build your OWN <nav> with that markup and still place the single <!--OD_NAV--> marker inside it for the cart/account/mobile-menu piece. Structure each item as: <div data-od-dropdown><a ...>Women</a><div data-od-panel style="display:flex;gap:var(--od-s6)">...columns of links...</div></div> — the platform styles the fade+slide-down and mobile stacking (do NOT add your own :hover/position CSS, it gets stripped). Link category/attribute items to a PRE-FILTERED shop: href="#page:shop?cat=socks" or href="#page:shop?cat=socks&colour=black&size=m" or "#page:shop?pmax=5000". The shop grid reads these — cat = the category name kebab-cased; other keys = the option-axis name kebab-cased (colour / size / length / finish …); pmin / pmax for price; q for search; sort.

FOOTER — ${plan.footerBrief || "tidy columns: wordmark + tagline, nav, contact"}.
  Put <!--OD_FOOTER_NAV--> where the page links go. Use {{contact.email}} / {{contact.phone}} for contact details and {{social.instagram}} / {{social.tiktok}} / {{social.facebook}} for socials (wrap each in an <a href>). A copyright line is added automatically if you omit one.

Both are real elements (<header …> and <footer …>), inline-styled, token-driven, responsive (flex-wrap / clamp). Call build_shell.`,
        },
      ],
    });
    const tool = msg.content.find((b) => b.type === "tool_use");
    if (!tool || tool.type !== "tool_use") return fallback;
    const out = tool.input as { header?: string; footer?: string };
    return {
      header: /<header[\s>]/i.test(out.header || "") ? sanitizeGeneratedHtml(out.header!) : fallback.header,
      footer: /<footer[\s>]/i.test(out.footer || "") ? sanitizeGeneratedHtml(out.footer!) : fallback.footer,
    };
  } catch {
    return fallback;
  }
}

type PlannedSection = { id: string; type: string; label: string; brief: string; layout?: string };
type Announce = { show?: boolean; text?: string };
type StorePlan = {
  reply?: string;
  concept?: string;
  storeName: string;
  tagline?: string;
  tokens: Record<string, unknown>;
  designDna?: string;
  headerBrief?: string;
  footerBrief?: string;
  /** filled in by buildShell() after the (compact) plan comes back */
  header?: string;
  footer?: string;
  announcement?: Announce;
  spatialSystem?: string;
  preloader?: boolean;
  pages: { slug: string; title: string; nav?: boolean; sections: PlannedSection[] }[];
};

/** The model sometimes returns a NOTE ("Header renders fine — keep as is") instead of markup. Reject
 *  anything that isn't a real <header>/<footer> element and fall back to the default shell. */
function safeShell(kind: "header" | "footer", v: string | undefined, storeName: string, niche: string): string {
  if (typeof v === "string" && new RegExp(`<${kind}[\\s>]`, "i").test(v)) return v;
  return defaultComponents(storeName, niche)[kind];
}

/** Apply a plan's announcement choice onto the seller's Content (default bar stays if the plan is silent). */
function contentWithAnnounce(base: OrbitDesignDoc["content"], a?: Announce): OrbitDesignDoc["content"] {
  if (!a || a.show === undefined) return base;
  return {
    ...base,
    announcement: {
      enabled: !!a.show,
      text: (a.text || base.announcement?.text || "").slice(0, 200),
    },
  };
}

async function planStore(
  brief: string,
  images: DesignRef[],
  business: { name: string; niche: string },
  refNote?: string,
): Promise<StorePlan | null> {
  const content: Anthropic.ContentBlockParam[] = [
    { type: "text", text: `THE BRIEF:\n${brief}${refNote ? `\n\n${refNote}` : ""}` },
    ...images.map((im): Anthropic.ContentBlockParam => ({ type: "image", source: { type: "base64", media_type: im.mediaType, data: im.data } })),
  ];
  let msg;
  try {
    msg = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 20000, // a COMPACT plan — no HTML, just briefs: header/footer briefs + ~5 pages × up to 8 short section briefs
      system: `You are Orbit Design, an award-tier art director laying out a complete storefront BEFORE it is built section by section. You produce STRUCTURE ONLY — never any HTML.
- Business: "${business.name}" — sells ${business.niche}.
- IF THE SELLER'S BRIEF IS DETAILED (names exact sections, colours, fonts, animations, copy, layouts): your job is to CARRY EVERY SPECIFIC through, not to summarise it into a generic store. Each section's \`brief\` must restate the brief's exact intent for that section — its copy, its colour, its animation, its layout. A detailed brief that comes out as a plain centred store is a FAILURE.
- concept FIRST: commit to a real art direction with a point of view (see the field description). Everything downstream honours it. "Clean and modern" is not a concept — "Swiss editorial with oversized numerals and hairline rules" is. Be specific about type-scale drama, whether accent fills whole sections, and one recurring signature motif.
- designDna: the single most important field for a store that doesn't look typical — write the CONCRETE design language (exact type sizes, per-section colourway, the recurring motif, spacing/shape, motion). Every page is built to it. See the field description.
- spatialSystem: the ONE way sections meet the screen and each other — SET IT and make every page obey it. This, more than colour, is what stops the store looking like every other store. See the field description; do NOT default to "a centred column, section after section".
- tokens: a palette + font pairing that SERVES the concept, OR the seller's exact stated hex/fonts. Any direction is fair game — dark, light, loud, near-monochrome, whatever the concept calls for — but wherever you land, text/muted MUST read clearly on bg and accentText MUST read clearly on accent (light text on a dark colour, dark text on a light one — never the same tone on itself). This is the #1 way a store ships broken, so pick bg first, then choose text/muted from the opposite end of the lightness scale. googleFonts = the family names. radius 0-20, density 0.95-1.15, headingWeight 500-800. If the concept is bold, the palette can be high-contrast; if quiet-luxury, near-monochrome + one accent. **tokens.palette**: if the brief names more than one brand colour, put EACH as {name,value} here, named and coloured to fit THIS brand (never reuse a colour set from a different brief you've seen before) — the section builder uses var(--od-<name>) to give sections deliberately different colourways. Only skip it for a truly one-accent brand.
- headerBrief / footerBrief: 1-2 sentences each describing the shape + behaviour you want (the HTML is built from these). Match the spatialSystem — a sidebar system → a vertical header; full-bleed bands → a slim flush bar that goes solid on scroll; vast-air luxury → a tall centred header.
- announcement: decide per brand — show:false for calm/luxury, show:true + short text for DTC/hype.
- preloader: true if the brand wants a beat of anticipation on load (luxury / fashion / hype).
- MOTION available to the section builder — mention it in a section's \`brief\` when it should be used: a full-bleed hero can have a background video (data-video-slot) behind a scrim with centred text; any element can drift with data-od-parallax; data-od-reveal for entrances; data-od-hover="lift|zoom|glow|underline" for hovers.
- pages: you ALWAYS lay out these four, designed to THIS brand even if the brief never names them — home (6-9 sections), shop (a one-line hero + optional collection tiles + exactly ONE product-grid), about (story + values + a process/proof section + cta), contact (one contact section + optional faq + cta). PLUS any extra page the brief NAMES (Lookbook, Journal, Wholesale, a custom collection…). Never list product / cart / checkout / sign-in / my-account / order-tracking — those are pre-wired core pages the platform builds automatically. "home" first. Section types: ${SECTION_TYPES.join(", ")}. 3-8 sections per page. Each section \`brief\` = 1-2 sentences carrying the brief's exact intent for THAT section: its copy/headline, its colour (name the token/palette), its layout skeleton, its animation.
- The shop's ONE product-grid section renders its OWN working filters automatically — category pills, size/colour attribute pills, a price range, search and sort (whatever the catalogue supports) — never plan a separate "filters" or "search" section, and its brief is just a one-line heading/intro.
- For EACH section pick a \`layout\` skeleton (see the layout field). VARY hard: adjacent sections never share a skeleton; the "centred heading + intro + 3 equal columns" default is used at most ONCE per page. Column ratios vary (never all 50/50). The spatialSystem governs how each section fills width and vertical space.
- The storefront ships optional helpers (od-section / od-section--invert / od-container / od-btn / od-card / od-grid / od-h1..3 / od-lead / spacing+shadow+radius scales) — use them where they fit, but the section builder may also author its own <section> with custom padding, full-bleed width, min-height:100vh, overlap, sticky panels — whatever the spatialSystem calls for.
Call plan_store — structure only, no section HTML.`,
      tools: [STRUCTURE_TOOL],
      tool_choice: { type: "tool", name: "plan_store" },
      messages: [{ role: "user", content }],
    });
  } catch {
    return null;
  }
  const tool = msg.content.find((b) => b.type === "tool_use");
  if (!tool || tool.type !== "tool_use") return null;
  if (msg.stop_reason === "max_tokens") console.warn("[planStore] hit max_tokens — plan may be truncated");
  const p = tool.input as Partial<StorePlan>;
  // Tolerate a plan that ran out of tokens mid-way: keep the fully-formed pages, drop a trailing
  // half-written one, and only bail if there's nothing usable at all.
  if (Array.isArray(p.pages)) {
    p.pages = p.pages.filter((pg) => pg && pg.slug && Array.isArray(pg.sections) && pg.sections.every((s) => s && s.id && s.brief));
  }
  if (!p.tokens || !Array.isArray(p.pages) || !p.pages.length) return null;
  const pages = p.pages
    .filter((pg) => pg && pg.slug && Array.isArray(pg.sections))
    .map((pg) => ({
      slug: slugify(pg.slug),
      title: String(pg.title || pg.slug).slice(0, 60),
      nav: pg.nav,
      sections: (pg.sections as PlannedSection[])
        .filter((s) => s && s.id && s.brief)
        .slice(0, 10)
        .map((s) => ({
          ...s,
          id: slugify(String(s.id)),
          type: String(s.type || "custom"),
          label: String(s.label || s.type || s.id || "Section").slice(0, 60),
          brief: String(s.brief),
        })),
    }))
    .filter((pg) => !FUNCTIONAL_PAGES.includes(pg.slug) && pg.sections.length);
  if (!pages.length) return null;
  if (!pages.some((pg) => pg.slug === "home")) pages[0].slug = "home";
  const rawAnn = (p as { announcement?: Announce }).announcement;
  return {
    reply: p.reply,
    concept: p.concept ? String(p.concept).slice(0, 700) : undefined,
    spatialSystem: (p as { spatialSystem?: string }).spatialSystem
      ? String((p as { spatialSystem?: string }).spatialSystem).slice(0, 400)
      : undefined,
    preloader: (p as { preloader?: boolean }).preloader === true,
    storeName: String(p.storeName || business.name).slice(0, 80),
    tagline: p.tagline ? String(p.tagline).slice(0, 160) : undefined,
    tokens: p.tokens,
    designDna: (p as { designDna?: string }).designDna ? String((p as { designDna?: string }).designDna).slice(0, 1400) : undefined,
    headerBrief: (p as { headerBrief?: string }).headerBrief ? String((p as { headerBrief?: string }).headerBrief).slice(0, 500) : undefined,
    footerBrief: (p as { footerBrief?: string }).footerBrief ? String((p as { footerBrief?: string }).footerBrief).slice(0, 300) : undefined,
    announcement:
      rawAnn && typeof rawAnn === "object"
        ? { show: rawAnn.show === undefined ? undefined : !!rawAnn.show, text: rawAnn.text ? String(rawAnn.text).slice(0, 180) : undefined }
        : undefined,
    pages,
  };
}

/** Tiny concurrency gate — all section builds share it so 4 parallel pages don't fire ~16
 *  simultaneous Anthropic calls and start getting rate-limited into stub sections. */
function makeLimiter(max: number) {
  let active = 0;
  const queue: (() => void)[] = [];
  const pump = () => {
    if (active >= max || queue.length === 0) return;
    active++;
    queue.shift()!();
  };
  return <T>(fn: () => Promise<T>): Promise<T> =>
    new Promise<T>((resolve, reject) => {
      queue.push(() => {
        fn().then(resolve, reject).finally(() => {
          active--;
          pump();
        });
      });
      pump();
    });
}
const sectionGate = makeLimiter(6);

// Concrete, structurally-DIFFERENT skeletons. The builder must fit each planned section into one
// of these (or something equally distinct) — not fall back to "centered heading + centered intro +
// 3 equal columns" every time. Content/copy is the model's; the bones are fixed here.
const LAYOUT_PLAYBOOK = `LAYOUT IDEAS — these are starting points to spark variety, not fixed templates to fill in. Invent your own structure freely; the point is that the STRUCTURE must vary section to section — never two neighbours alike, and NEVER default to a centered stack of heading+intro+3-columns just because it's easy:

HEROES (the first section only — these are directions, build the actual markup however serves the concept, any classes/none):
A. Editorial broken-grid — a huge headline spanning most of the width, sitting hard LEFT; a short support column lower-right; the CTA reads as a plain underlined link rather than a filled button; little or no image.
B. Monumental centered — one enormous line of type, a small eyebrow above, one strong CTA below, lots of vertical air, no image. Fits a "quiet / luxury" concept.
C. Full-bleed overlay — a full-bleed photo or illustration filling the section, headline + CTA positioned over it (often bottom-left), text colour flipped for contrast against a scrim.
D. Offset overlap — an image on one side, with the headline block overlapping its edge (negative margin, higher z-index) so text and image visually intersect. Asymmetric proportions, not 50/50.
E. Stacked type-forward — eyebrow, headline, lead, CTA, all in a single narrow left-aligned column, with a wide image or graphic below spanning full width.

MID-PAGE SECTION DIRECTIONS (adapt freely — these are prompts for variety, not a menu):
1. Split statement — heading on one side, body + link on the other. Not centered.
2. Full-bleed colour band — one large statement + a row of a few counted-up stats beneath, generous space.
3. Rule-separated rows — each item is a row: a small index/label on the left, content on the right, a thin rule between rows. No cards.
4. Alternating media rows — image + text, alternating which side each row sits on, 2-3 rows max.
5. Asymmetric grid — mixed cell sizes (one cell spans wider/taller than its neighbours), not a uniform grid.
6. Oversized-numeral cards — a huge outline/ghost numeral behind or above each card's title.
7. Marquee / tabs / accordion / carousel — use the matching data-od-* hook; style it fully on-brand, any way you like.
8. Index list — a numbered list styled as an editorial list, big counters, generous line spacing, no boxes.

SECTION HEADERS: default LEFT-aligned and large reads more considered than centered — but this is a default, not a rule; break it when the concept calls for it. At most one deliberately symmetric/centered section per page.`;

async function buildSectionChunk(
  page: StorePlan["pages"][number],
  chunk: PlannedSection[],
  tokens: Record<string, unknown>,
  header: string,
  brief: string,
  business: { name: string; niche: string; products?: { name: string; imageUrl: string | null }[] },
  concept?: string,
  spatialSystem?: string,
): Promise<Map<string, string>> {
  const list = chunk
    .map((s) => `- id "${s.id}" · type ${s.type} · "${s.label}"\n    layout: ${s.layout || "pick one that fits and differs from its neighbours"}\n    content: ${s.brief}`)
    .join("\n");
  const posNote = page.sections[0] && chunk.some((c) => c.id === page.sections[0].id)
    ? "The FIRST section is the hero — it carries the page's one od-h1."
    : "These are mid-page sections — their titles are od-h2, never od-h1.";
  let msg;
  try {
    msg = await sectionGate(() =>
      anthropic.messages.create({
      model: MODEL,
      max_tokens: 12000,
      system: systemPrompt(
        business.name,
        business.niche,
        [],
        (business.products ?? []).filter((p): p is { name: string; imageUrl: string } => !!p.imageUrl),
      ),
      tools: [BUILD_PAGE_TOOL],
      tool_choice: { type: "tool", name: "build_page" },
      messages: [
        {
          role: "user",
          content: `Build ${chunk.length} section${chunk.length > 1 ? "s" : ""} of the "${page.title}" page (/${page.slug}) — finished, richly-detailed inline-styled HTML for EVERY section id below. Never return an empty or heading-only section.

ART DIRECTION — every section must express this, hard:
${concept || "warm, considered, editorial — real hierarchy, generous whitespace, one accent used with intent"}

SPATIAL SYSTEM — how EVERY section on this store meets the screen and its neighbours. Obey it exactly, section after section:
${spatialSystem || "contained editorial columns with generous, consistent whitespace between sections"}

${LAYOUT_PLAYBOOK}

DESIGN TOKENS (already applied — style everything through var(--od-*), do not restate raw hex): ${JSON.stringify(tokens)}

HEADER (already built — for visual consistency only, do NOT rebuild it):
${header.slice(0, 1200)}

ORIGINAL BRIEF (for tone, copy, brand voice):
${brief}

SECTIONS TO BUILD, IN ORDER:
${list}

${posNote}
- Each section is a top-level <section>. You OWN its width and vertical space — realise the SPATIAL SYSTEM above: full-bleed edge-to-edge (width:100vw;margin-inline:calc(50% - 50vw)), or a contained column (max-width via var(--od-container)/(--od-container-narrow) or your own), or a full-height panel (min-height:100vh), or one that overlaps its neighbour (negative margin + position:relative + z-index), or a sticky split. Set padding with the var(--od-s*) scale (or 0 for flush/abutting sections). The old ".od-section fixed rhythm" is gone — consistency now comes from obeying ONE spatial system, not from a shared class.
- \`.od-section\` / \`.od-container\` / \`.od-section--invert\` still exist as convenience — use them where they genuinely fit, ignore them where the spatial system wants something else. A full-accent section (text in var(--od-accent-text) on var(--od-accent)) is a strong move for 1–2 sections; add class "od-section--invert" OR set the colours yourself via tokens.
- Heading sizes are yours to set — the od-h1/h2/h3 classes are a convenience type ramp, not a requirement; hand-set font-size freely when the design calls for it, just keep a clear, deliberate scale down the page (hero biggest, section titles a clear step down, never arbitrary). Prefer the var(--od-s*) / var(--od-shadow-*) / var(--od-radius-*) scales over raw px for spacing/elevation/corners.
- COLOUR: style through tokens, not raw hex. Base tokens: --od-bg / --od-surface / --od-text / --od-muted / --od-border / --od-accent / --od-accent-text.${
        Array.isArray((tokens as { palette?: { name: string }[] }).palette) && (tokens as { palette?: { name: string }[] }).palette!.length
          ? ` BRAND PALETTE (use freely for section colourways — a section can BE var(--od-${(tokens as { palette?: { name: string }[] }).palette![0].name}), text on it your choice): ${(tokens as { palette?: { name: string }[] }).palette!.map((p) => `var(--od-${p.name})`).join(", ")}. Give sections deliberate, varied backgrounds from this palette — that is the point of it.`
          : ""
      } For a tint use color-mix(in srgb, <token> 8%, transparent). A raw hex is allowed ONLY as a one-off subtle tint the palette can't express — never for a section's main colours (the seller's Adjust panel edits tokens, not hex).
- TEXT vs BACKGROUND tokens are not interchangeable: --od-text / --od-muted / --od-accent-text (and a palette colour when a section deliberately sits ON it) are for readable copy; --od-bg / --od-surface / --od-border are backgrounds and hairlines, never a font colour. Setting a heading's color to --od-surface or --od-bg is the single most common way a section goes invisible — before you finish a section, check every color: on its background: for that contrast.
- ONLY use var(--od-<name>) for a name that is one of the base tokens above OR literally appears in the BRAND PALETTE list. Never invent a new token name (var(--od-graphite), var(--od-slate)…) — nothing defines it, so it renders as transparent/invisible. Need a one-off shade the palette doesn't have? Use a raw hex there (see the rule above) or color-mix() off an existing token instead.
- LAYOUT SAFETY — an unconventional layout must still actually render. position:absolute / position:fixed takes an element OUT of normal flow entirely — only use it for a genuinely decorative overlay (a background graphic, a scrim, a small badge) on a section whose real content (headline, body copy, CTA, cards) sits in normal flow beside/under it. NEVER make the section's primary content itself position:absolute, and never rely on absolutely-positioned children alone to give a section its height — a section with no in-flow content collapses to zero height and becomes an invisible blank gap. Likewise, any custom class name you invent for layout (spacing, flex, grid) has no CSS behind it unless you also put the actual layout as an inline style="..." attribute — a bare class name alone will not arrange anything.
- NO Handlebars/Mustache/templating syntax anywhere — no {{#each}}, {{#if}}, {{/each}}, {{else}}, no loops or conditionals of any kind. This platform only substitutes the literal {{store.x}} / {{contact.x}} / {{social.x}} / {{product}} / {{cart}} tokens named elsewhere in this prompt; anything else you write between braces prints as literal broken text. If a section needs 3 repeated cards, write all 3 cards out by hand — never a loop marker.
- SVG ANIMATION: you MAY author bespoke motion with SMIL inside an <svg> — <animate> / <animateTransform> / <animateMotion> / <set> (declarative, no JS). Self-drawing strokes (animate stroke-dashoffset from a length to 0, fill="freeze"), a flowing wave (animate the path "d" between 2-3 shapes, repeatCount="indefinite"), marching-ants (animate stroke-dashoffset on a dashed stroke, indefinite), a slow rotate. NO <script> and NO <style> anywhere. Or use data-od-draw on a group/svg to self-draw its strokes on scroll-in with zero SMIL.
- INTERACTIVE PARTS THAT NEED REAL BACKEND WORK (sign-in, account/orders dashboard, order-tracking lookup, a "write a review" widget, a booking/RSVP form, a rewards/loyalty page): design these AS REAL, FULLY-STYLED HTML in your own layout/visual language — real-looking inputs, labels, buttons, whatever the concept calls for — but wrap the interactive part in <div data-od-slot="<short-name>" data-od-purpose="<one plain sentence: what this does for the shopper>">...your real markup...</div>. The platform reads your actual markup on Handoff and wires it to real data (it does NOT throw your design away) — so build it to really look designed, not a dashed-border stub. (A plain mailto: link or tel: link is fine outside a slot; a <form> that needs real backend processing must be inside a data-od-slot.)
- CHECKOUT / CART: the cart page defaults to the marker {{cart}} (the platform's own built-in checkout — safe, zero risk). ONLY design your own custom checkout when the brief actually calls for a distinctive checkout experience/animation; otherwise leave {{cart}} alone. When you do design your own: same data-od-slot pattern, extended so Handoff can map real fields. Design the whole cart + checkout flow yourself (line items, quantity controls, delivery form, payment choice, place-order button, a success moment) in your own visual language. Wrap the page's checkout area in <div data-od-slot="checkout" data-od-purpose="checkout">...</div>. Inside it:
  - every delivery-detail input gets data-od-field="customerName|customerPhone|customerEmail|line1|city|area|postalCode" (pick the matching one per field) so Handoff knows which real field it is — the platform requires customerName, customerPhone, line1 and city to exist somewhere in your design (email/area/postalCode are optional); if you skip a required one, Handoff will ask the seller to add it before going live, so don't skip them.
  - cart lines render from ONE template row, not a loop you write: wrap the list in <div data-od-cart-list>, and inside it write exactly ONE example row (real-looking sample content) carrying data-od-cart-line="" — tag its parts with data-od-cart-name / data-od-cart-price / data-od-cart-qty / data-od-cart-image (whichever you included), plus data-od-qty-inc / data-od-qty-dec / data-od-cart-remove buttons inside that row. The runtime clones your one row per real cart line and fills in the real values — never write multiple rows or a loop marker. Optional: data-od-cart-empty on an empty-cart message (auto shown/hidden), data-od-cart-total or data-od-cart-subtotal on an element that should show the live total.
  - a coupon input+button pair: input gets data-od-coupon-input, button gets data-od-coupon-apply (same for gift cards: data-od-giftcard-input / data-od-giftcard-apply).
  - a payment choice (if the store takes card payments): radio inputs with data-od-payment and value="cod" or value="stripe".
  - the actual submit is a normal <form data-od-form="checkout"> wrapping the delivery fields + place-order button (same mechanism as newsletter/contact forms below).
  - add ONE hidden-by-default element (style="display:none") with data-od-checkout-success inside the slot for your own success moment (a message, an animation via the interactive hooks below, whatever fits the brand) — the platform reveals it in place of a redirect once a real order is placed, instead of you needing to build the redirect yourself.
  This is genuinely a designed page, not a stub — invent the flow, the layout, the payment-method presentation, the success moment, all of it.
- Realise the stated layout AND the art direction — it should look composed, not a template. Use interactive hooks where the layout calls for them:
  data-od-accordion / data-od-carousel / data-od-marquee / data-od-tabs / data-od-count / data-od-reveal / data-od-reveal-stagger,
  data-od-draw (self-drawing svg strokes on scroll-in) / data-od-dash (marching-ants on a dashed svg stroke) / data-od-spin (slow rotate) on an svg element,
  data-od-parallax="0.15".."0.5" (element drifts as it scrolls — great on a hero image / oversized numeral / offset block),
  <div data-video-slot="what plays" style="position:absolute;inset:0"></div> for a full-bleed background video behind a hero (put the section to position:relative;overflow:hidden and layer the headline over a var(--od-text)-tinted scrim so it stays readable).
  Hover: use the hooks — data-od-hover="lift" (card raises) / "zoom" (its image scales) / "glow" (accent ring) / "underline" (link wipe). Inline style can't hold :hover, so don't hand-write one.
- For a "product-grid" section the html is JUST a heading + one intro line — the cards AND a working category-filter-pills + search + sort bar are injected automatically. NEVER hand-write cards, filter pills, a search box or a sort dropdown anywhere (they'd duplicate the working ones). Every image is <div data-img-slot="specific brief" style="width:100%;aspect-ratio:<ratio>;border-radius:var(--od-radius-lg)"></div> — keep non-hero image slots to aspect-ratio 4/3 or 16/10 so sections don't tower. Ground ALL copy in the brief — no lorem ipsum, no invented stats or review counts, no "trusted by thousands".`,
        },
      ],
      }),
    );
  } catch {
    return new Map();
  }
  const tool = msg.content.find((b) => b.type === "tool_use");
  const map = new Map<string, string>();
  if (!tool || tool.type !== "tool_use") return map;
  const out = tool.input as { sections?: { id: string; html: string }[] };
  for (const s of out.sections ?? []) if (s?.id && typeof s.html === "string" && s.html.trim().length > 40) map.set(s.id, s.html);
  return map;
}

/**
 * Build ONE page's whole HTML in a single call so the model composes the page as one designed
 * system (every section aware of its neighbours + the design DNA) rather than filling slots blind.
 * Anything the one call drops / returns thin is retried section-by-section afterwards.
 */
async function buildPageWhole(
  page: StorePlan["pages"][number],
  plan: StorePlan,
  header: string,
  brief: string,
  business: { name: string; niche: string; products?: { name: string; imageUrl: string | null }[] },
): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  const heroId = page.sections[0]?.id;
  const list = page.sections
    .map((s, i) => `${i + 1}. id "${s.id}" — ${s.type}${s.id === heroId ? " (HERO — the page's one <h1>)" : ""}\n   layout: ${s.layout || "choose one distinct from its neighbours"}\n   ${s.brief}`)
    .join("\n\n");
  const pal = Array.isArray((plan.tokens as { palette?: { name: string }[] }).palette)
    ? (plan.tokens as { palette?: { name: string }[] }).palette!.map((p) => `var(--od-${p.name})`).join(", ")
    : "";
  try {
    const msg = await sectionGate(async () =>
      anthropic.messages.stream({
        model: MODEL,
        max_tokens: 32000,
        system: systemPrompt(
          business.name,
          business.niche,
          [],
          (business.products ?? []).filter((p): p is { name: string; imageUrl: string } => !!p.imageUrl),
        ),
        tools: [BUILD_PAGE_TOOL],
        tool_choice: { type: "tool", name: "build_page" },
        messages: [
          {
            role: "user",
            content: `Build the COMPLETE "${page.title}" page (/${page.slug}) — finished inline-styled HTML for EVERY section id below, composed as ONE designed page. You see all the sections together: make them flow, vary hard, and read as one real brand — not a template.

THE SELLER'S FULL BRIEF (follow it exactly — its copy, its section order, its colours, its animations are the spec, not suggestions):
${brief}

ART DIRECTION: ${plan.concept || "warm, considered, editorial — real hierarchy, one accent with intent"}

DESIGN DNA — build every section to THIS (it is the shared vision; do not drift to defaults):
${plan.designDna || "Derive it now from the brief + concept: an exact type scale (hero / h2 / body sizes + fonts), a per-section colourway, one recurring motif, spacing + shape, a motion signature — then build to it."}

SPATIAL SYSTEM (how every section meets the screen + its neighbours): ${plan.spatialSystem || "contained editorial columns, consistent whitespace"}

TOKENS: ${JSON.stringify(plan.tokens)}${pal ? `\nBRAND PALETTE — use these boldly as section backgrounds and accents: ${pal}` : ""}

HEADER (for visual consistency only, do NOT rebuild): ${header.slice(0, 1000)}

SECTIONS, IN ORDER:
${list}

HOW TO BUILD:
- Compose the whole page: adjacent sections NEVER share a layout skeleton; column ratios vary; the "centred heading + intro + 3 equal columns" pattern appears at most ONCE. Use the ${LAYOUT_PLAYBOOK ? "layout playbook skeletons as a starting point" : "your judgement"} but the brief's stated layout for a section wins.
- OWN THE DESIGN. Author your own type sizes with clamp() to match the DESIGN DNA (the var(--od-text-*) ramp is available but you are not limited to it). Set section backgrounds from the palette / accent deliberately — a section can BE var(--od-accent) or a palette colour, with its text chosen for contrast. A raw hex is fine for a brand colour the tokens/palette genuinely can't express — but colour a section through a token/palette var wherever one fits so the seller's Adjust panel still works.
- FOLLOW THE BRIEF'S SPECIFICS: exact headlines/copy verbatim; a named section colour → that section IS that colour; a described animation → build it (SMIL <animate> inside an <svg> for self-drawing arcs / flowing waves / marching-ants, or data-od-draw / data-od-dash / data-od-spin / data-od-parallax / data-od-count / data-od-reveal / data-od-marquee / data-od-carousel / data-od-accordion / data-od-tabs; data-od-hover="lift|zoom|glow|underline").
- Images: <div data-img-slot="specific brief" style="width:100%;aspect-ratio:<ratio>;border-radius:…"></div>. Background video for a hero: <div data-video-slot="what plays" style="position:absolute;inset:0"></div> under a scrim.
- Content tokens: {{store.name}} {{store.tagline}} {{store.year}} {{contact.email}} {{contact.phone}} {{contact.address}} {{social.instagram}} {{social.tiktok}} {{social.facebook}} {{social.x}} {{social.youtube}} — this is the COMPLETE list, never hard-code contact/social and never invent another one (it prints as literal broken text — write a real value yourself instead, e.g. a real founding year, not a token for it). These are also the ONLY brace tokens this platform understands — no {{#each}}, {{#if}}, {{/each}} or any other Handlebars/templating syntax anywhere. Need 3 repeated cards? Write all 3 out by hand.
- TEXT vs BACKGROUND tokens are not interchangeable: --od-text / --od-muted / --od-accent-text (or a palette colour a section deliberately sits ON) are for readable copy; --od-bg / --od-surface / --od-border are backgrounds and hairlines, never a font colour — setting a heading's color to --od-surface/--od-bg is the most common way a section goes invisible. And only use var(--od-<name>) for a base token or a name that's actually in the BRAND PALETTE above — an invented name (var(--od-graphite)…) is undefined and renders transparent; use a raw hex or color-mix() for a genuine one-off instead.
- A "product-grid" section = JUST a heading + one intro line (cards + working filters are injected). A form / sign-in / newsletter-that-stores-emails / review widget = ONE placeholder <div class="od-card" data-od-slot="short-name" data-od-purpose="one plain sentence" style="padding:var(--od-s7);text-align:center;border:1.5px dashed var(--od-border)"></div>. Functional pages keep {{product}} / {{cart}}.
- NO <script>, NO <style>. Ground every word in the brief — no lorem, no invented stats/reviews.

Return build_page with html for all ${page.sections.length} section ids.`,
          },
        ],
      }).finalMessage(),
    );
    const tool = msg.content.find((b) => b.type === "tool_use");
    if (tool && tool.type === "tool_use") {
      const out = tool.input as { sections?: { id: string; html: string }[] };
      for (const s of out.sections ?? []) if (s?.id && typeof s.html === "string" && s.html.trim().length > 60) map.set(s.id, s.html);
    }
  } catch (e) {
    console.warn("[buildPageWhole]", page.slug, String(e).slice(0, 160));
  }
  return map;
}

async function buildPageSections(
  page: StorePlan["pages"][number],
  plan: StorePlan,
  header: string,
  brief: string,
  business: { name: string; niche: string },
): Promise<Map<string, string>> {
  // One call builds the whole page (sections aware of each other). Retry anything it drops or
  // returns thin, section-by-section, so the page is never left with holes.
  const merged = await buildPageWhole(page, plan, header, brief, business);
  const missing = page.sections.filter((s) => {
    const h = merged.get(s.id);
    return !h || h.trim().length < 120;
  });
  if (missing.length) {
    const retries = await Promise.all(
      missing.map((s) => buildSectionChunk(page, [s], plan.tokens, header, brief, business, plan.concept, plan.spatialSystem)),
    );
    for (const m of retries) for (const [k, v] of m) merged.set(k, v);
  }
  for (const [k, v] of merged) merged.set(k, sanitizeGeneratedHtml(v));
  return merged;
}

/** Deterministic cleanup for the two mistakes prompt wording alone doesn't reliably prevent: a stray
 *  Handlebars/loop marker ({{#each}}…) that prints as literal text, and a heading/body coloured with
 *  a BACKGROUND token (--od-bg/--od-surface/--od-border) instead of a text token — which reads as
 *  invisible text on its own background. */
function sanitizeGeneratedHtml(html: string): string {
  if (!html) return html;
  let out = html.replace(/\{\{\s*[#/]\w+[^}]*\}\}/g, "");
  out = out.replace(/color\s*:\s*var\(\s*--od-(bg|surface|border)\s*\)/gi, "color:var(--od-text)");
  return out;
}

// ---------------------------------------------------------------------------
// V2 — compose the whole store from the curated section library in ONE call.
// No per-section HTML generation: the model picks kind + variant and fills props;
// the library renders balanced, non-sparse markup. Fast, cheap, can't come back broken.
// ---------------------------------------------------------------------------

const VARIANT_LINES = (Object.keys(SECTION_KINDS) as (keyof typeof SECTION_KINDS)[])
  .map((k) => `  ${k}: ${SECTION_KINDS[k].join(" | ")}`)
  .join("\n");

const COMPOSE_GUIDE = `You compose a storefront by choosing SECTION COMPONENTS from a fixed library and filling their copy. You never write HTML — the library renders each section, always balanced and full.

KINDS → VARIANTS:
${VARIANT_LINES}

PROPS per kind (fill real, brand-grounded copy — no lorem, no invented stats/reviews):
- hero: { heading, eyebrow?, body, cta:{label}, cta2?:{label}, figure?:"photo brief", stats?:[{value,label}] (showcase only, ≤3) }
- feature: { heading, eyebrow?, body?, items:[{title, body, icon?:0-7}] (3–6) }
- stat: { heading? (band variant only), items:[{value:"12k+"|"98%"|"1,830", label}] (2–4) } — ONLY numbers the seller gave you (years, customers, cities). Never make one up; without real numbers, don't use this kind.
- story: { heading, eyebrow?, body:"paragraph one\\n\\nparagraph two", figure?:"photo brief" }
- steps: { heading, body?, items:[{title, body}] (3–6) }
- testimonial: { heading, body?, items:[{quote, name, role?}] (2–6) } — ONLY quotes copied from the REAL CUSTOMER REVIEWS given to you, with the name as given. Never write a quote or a customer name yourself; with no real reviews, don't use this kind.
- logos: { heading?:"AS SEEN IN", items:[…] (5–10) } — ONLY press / stockists the seller actually named. Never list brands or outlets they didn't give you.
- faq: { heading, body?, items:[{q, a}] (4–10) }
- cta: { heading, eyebrow?, body?, cta:{label}, placeholder?:"you@email.com" }  (banner/split/invert render a newsletter form; if you only want a link, still pass cta.label)
- gallery: { heading?, items:["photo brief","photo brief",…] }
- values: { heading, body?, items:[{title, body}] (3–6) }
- collections: { heading?, items:[{label:"Men's"|"Outerwear"|…, figure:"photo brief", href?}] (3–6) } — shop-by-category tiles
- trust: { items:[{title:"Free returns", body?:"30 days", icon?:0-7}] (3–4) } — a slim guarantee bar, no heading
- pricing: { heading, body?, items:[{name, price:"$29", cadence:"/mo", body?, features:["…","…"], featured?:true, cta?}] (2–4) }
- compare: { heading, body?, usLabel?, themLabel?, items:[{label:"4-way stretch", us:"yes", them:"no"}] (4–8) }
- editorial: { eyebrow?, heading, body, figure:"photo brief", cta?:{label} } — a magazine-style spread, image + offset card
- product-grid: { heading?, body? }   — the real product cards are injected automatically
- contact: { heading, body?, items:[{label:"Email"|"Phone"|"Hours"|"Visit", value}], cta?:{label} }
- slot: { heading?, name:"write-a-review"|"trade-enquiry"|"complaint-form"|"wishlist"|…, purpose:"one plain sentence: what this working part does for the shopper" }
    — USE THIS ONLY for a CUSTOM interactive widget the brief specifically asks for: a product-reviews section, a wishlist, a trade / wholesale enquiry form, a complaints / feedback form, an RSVP.
    Do NOT use slot for cart, checkout, sign in / log in, my account, or order tracking — those are CORE PAGES the platform builds and wires automatically (see PAGES below). You never design or mention them.
    You design the surrounding page (hero, headings, trust copy) with the other kinds; the \`slot\` section is the ONE spot where the custom working part goes. NEVER hand-fake a form. In your \`reply\` say "designed the look — hit Handoff and Orbit Code wires the backend" for slot sections.

WORKED EXAMPLE — a good retail Home (8 sections), for a handmade-footwear brand:
  1 hero:editorial      — eyebrow, big headline, 2-line story, one CTA
  2 collections:tiles    — 3 category tiles (Boots, Loafers, Bags)
  3 story:split          — "Made in one workshop" — 2 paragraphs on the makers
  4 product-grid:standard (only because there is no shop page)
  5 feature:checklist    — "Why hand-lasted" — 4 concrete points
  6 feature:checklist    — "Our promise" — cash on delivery and other facts the seller gave (never an invented policy or delivery time) (a testimonial:carousel goes here instead ONLY when real reviews are given)
  7 trust:row            — Free returns · 60-day trial · Carbon-neutral
  8 cta:banner           — newsletter
BAD Home (never ship this): hero → collections → product-grid → cta. Four sections, no story, no proof — reads half-built.

RULES:
- storeName: use the brand name from the brief. If the brief gives none (or only an account handle / a person's username like "ayyan"), INVENT a real, ownable wordmark that fits the niche — two syllables, no generic words like "Shop" or "Store". Never ship the seller's login name as the brand.
- PAGES — you ALWAYS build these FOUR content pages, designed to THIS brand, even if the brief never mentions them:
    home    — the storytelling homepage (6–9 sections, shape below)
    shop    — the catalogue: a one-line centered hero + optional \`collections\` tiles + exactly ONE \`product-grid\`
    about   — the brand story: \`story\` + \`values\` + \`steps\` (or a \`testimonial\` of real reviews) + \`cta\`
    contact — one \`contact\` section (+ \`faq\` if the brief asks) + \`cta\`
  PLUS any extra page the brief NAMES explicitly (Lookbook, Journal, Wholesale, Size Guide, a custom collection page like "Men's" or "Gifting"…). Do NOT invent pages beyond the four core ones unless the brief names them.
  NEVER build a cart, checkout, sign-in / log-in, my-account or order-tracking page, and never put a \`slot\` for those — the platform ships those as pre-wired core pages automatically, matched to your tokens + header. Just don't mention them.
- Home: 6–9 sections for retail, and it MUST tell a story, not just list things. Required shape: hero → (collections OR gallery) → a brand moment (story / editorial / feature) → proof (a testimonial of REAL reviews if given; otherwise a promise/guarantee section — never invented quotes, names, stats or press) → a slim trust bar → cta. Put the product-grid on the SHOP page, never Home.
- The shop page's product-grid is where the real cards render — one grid, on shop, always. It auto-renders its own working filters (category + size/colour attribute pills + price range + search + sort) — NEVER add your own filter / search / sort section or controls.
- EXCEPTION — a category-scoped custom page (e.g. "Men's Wear"): if the brief asks for a page showing one product category, give that page a product-grid section whose html contains the comment <!--grid-only:<category-slug>--> (e.g. <!--grid-only:mens-wear-->). The platform renders a real, filtered grid there (that category only, no category pills, keeps attribute + price filters). Still just a heading + one intro line + that comment — never hand-write cards.
- About: story + values + steps (or a testimonial of real reviews). Contact: one contact section (+ faq if asked).
- Every page ends on a \`cta\`. Two adjacent sections must never both be near-empty of real content (e.g. collections tiles with no photos + an empty product-grid) — separate them with a copy-rich section.
- VARY variants down each page — never the same variant twice in a row. Pick variants that fit the concept's structural stance.
- Every section needs a short kebab \`id\` (unique on its page) and a \`label\` for the studio list.
- tokens: choose a palette + fonts that serve the concept, OR match the seller's exact stated hex/fonts. Whatever direction you pick — dark, light, loud, monochrome — text/muted must read clearly on bg and accentText must read clearly on accent (opposite ends of the lightness scale, never near-matching tones). radius 0–20, density 0.95–1.15, headingWeight 500–800. googleFonts = the family names.
- header: ONE <header> with the logo/store-name on the LEFT and the literal marker <!--OD_NAV--> where nav goes. Nav links + Cart + the responsive hamburger are injected — never hand-write them, and no announcement bar.
- footer: send "" — the platform builds the footer itself from the brand, nav pages and the seller's contact details.
- announcement: {show:false} for a calm / luxury brand that wants no promo strip; {show:true, text:"…"} for a DTC / hype brand. Omit to keep the seller's current bar.
- concept: commit to a real art direction + structural stance in 2–3 sentences (e.g. "Swiss editorial, hairline rules, no cards, oversized numerals" / "warm maximalist, full-bleed colour bands"). It guides variant + palette choices.

DESIGN DIRECTIONS — pick ONE as the backbone (or blend two), then commit hard. Each is a full package: palette + type + density + which variants to favour. Do NOT average them into beige mush.
- MODERNIST (Swiss/Bauhaus): near-monochrome + ONE loud primary (red / cobalt / lime). Grotesk headings, tight tracking, huge size jumps. radius 0, density 1.12, headingWeight 700. Favour hero.editorial, stat.band, feature.checklist, faq.twocol, compare.table. Hairline borders, zero card shadows.
- ATELIER (quiet luxury): bone / ivory / warm grey + charcoal text + one muted metal or clay accent. Display serif headings (Fraunces, Libre Caslon, Playfair), generous leading. radius 2–6, density 1.06, headingWeight 500. Favour hero.centered or hero.media, editorial.spread, story.split, gallery.feature, testimonial.single. Whitespace separates sections — no lines, no cards.
- BROADSHEET (editorial magazine): off-white paper + ink black + a single ink-wash accent (oxblood, forest). Serif display + serif or condensed-sans body, multi-column feel. radius 0, density 1.15, headingWeight 600. Favour hero.editorial, story.columns, feature.alternating, logos.row, faq.twocol.
- NOCTURNE (dark premium): near-black bg (#0C0D10) + off-white text + a vivid accent (electric violet, acid green, amber). Geometric sans, medium contrast. radius 8–14, density 1.05, headingWeight 600. Favour hero.overlay or hero.showcase, feature.cards, stat.band (invert), gallery.strip, cta.invert.
- ORGANIC (earthy craft): clay / sand / moss / terracotta, low contrast, warm. Humanist sans or soft serif. radius 12–20, density 1.02, headingWeight 500. Favour hero.media, collections.tiles, story.split, values.list, steps.rows, trust.row.
- KINETIC (bold DTC / sport): high-saturation accent on white OR full accent bands, big black display type (Archivo, Unbounded, Syne). radius 4–10, density 1.1, headingWeight 800. Favour hero.showcase, collections.split, stat.band, feature.cards, cta.split, compare.table.

AVOID THE AI LOOK — these are the tells that make a site read as "generated":
- Do NOT default fontBody to Inter or DM Sans. Reach for the direction's pairing (Public Sans, Work Sans, Manrope, Geist, Newsreader, Inter Tight are fine; plain Inter is a last resort).
- Do NOT pick a blue or purple accent unless the brand truly calls for it. Most brands want a warm or unexpected accent.
- Do NOT use a low-contrast gradient hero. Do NOT make every section a centered heading + intro + 3 cards.
- Do NOT wrap everything in rounded drop-shadow cards. Prefer whitespace and hairlines to separate sections.
- Vary section WIDTH and BACKGROUND, not just content: alternate contained / full-bleed, plain / banded / inverted.
- One strong idea, executed consistently, beats five safe ones.

- REFERENCE (if a screenshot or a shot of a site is attached): read its LAYOUT RHYTHM (dense vs airy, full-bleed vs contained, card-heavy vs flat), its PALETTE and whether colour is used in big blocks or just marks, its TYPE MOOD (condensed/serif/geometric, size contrast), and its SECTION SHAPES (overlay hero? alternating rows? tiles?). Translate that into: concept + tokens + which section variants to use — for THIS seller's brand and products. Match the feel, never copy the reference's copy, logo, product names or exact pixels.`;

const COMPOSE_TOOL = {
  name: "compose_store",
  description: "Lay out the whole storefront by choosing section components from the library and filling their copy.",
  input_schema: {
    type: "object" as const,
    properties: {
      reply: { type: "string", description: "1–2 warm sentences on the store you're building" },
      concept: { type: "string" },
      storeName: { type: "string" },
      tagline: { type: "string" },
      tokens: { type: "object", properties: tokenProps },
      header: { type: "string" },
      announcement: {
        type: "object",
        description: "the thin promo strip above the header — {show:false} for calm/luxury, {show:true,text:'…'} for DTC/hype, omit to keep the current bar.",
        properties: { show: { type: "boolean" }, text: { type: "string" } },
      },
      pages: {
        type: "array",
        description: "every page the seller listed, home first. Never list 'product' or 'cart'.",
        items: {
          type: "object",
          properties: {
            slug: { type: "string" },
            title: { type: "string" },
            nav: { type: "boolean" },
            sections: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  id: { type: "string", description: "short kebab id, unique on the page" },
                  kind: { type: "string", enum: Object.keys(SECTION_KINDS) },
                  variant: { type: "string", description: "one of the variants for this kind" },
                  label: { type: "string" },
                  props: { type: "object", description: "the copy for this section — see the guide" },
                },
                required: ["id", "kind", "variant", "props"],
              },
            },
          },
          required: ["slug", "title", "sections"],
        },
      },
    },
    required: ["storeName", "tokens", "header", "pages"],
  },
};

type ComposedSection = { id: string; kind: string; variant: string; label?: string; props?: Record<string, unknown> };
type ComposedPlan = {
  reply?: string;
  concept?: string;
  storeName: string;
  tagline?: string;
  tokens: Record<string, unknown>;
  header: string;
  footer: string;
  announcement?: Announce;
  pages: { slug: string; title: string; nav?: boolean; sections: ComposedSection[] }[];
};

const KIND_TO_TYPE: Record<string, DesignSection["type"]> = {
  hero: "hero",
  feature: "featured",
  stat: "featured",
  story: "rich-text",
  steps: "rich-text",
  testimonial: "featured",
  logos: "marquee",
  faq: "rich-text",
  cta: "newsletter",
  gallery: "gallery",
  values: "featured",
  collections: "gallery",
  trust: "featured",
  pricing: "featured",
  compare: "featured",
  editorial: "rich-text",
  "product-grid": "product-grid",
  contact: "contact",
  slot: "custom",
};

async function composeStore(
  brief: string,
  images: DesignRef[],
  business: { name: string; niche: string; proof?: string },
  refNote?: string,
): Promise<ComposedPlan | null> {
  const userContent: Anthropic.ContentBlockParam[] = [
    { type: "text", text: `THE BRIEF:\n${brief}${refNote ? `\n\n${refNote}` : ""}` },
    ...images.map((im): Anthropic.ContentBlockParam => ({ type: "image", source: { type: "base64", media_type: im.mediaType, data: im.data } })),
  ];

  const callOnce = async (messages: Anthropic.MessageParam[]): Promise<Anthropic.Message | null> => {
    try {
      // Streamed: a full 4-page store easily runs past the SDK's 10-minute non-streaming ceiling at
      // this token budget, and a truncated tool call silently drops us to the legacy path.
      return await anthropic.messages
        .stream({
          model: MODEL,
          max_tokens: 32000,
          system: `You are Orbit Design, an award-tier art director. Business "${business.name}" — sells ${business.niche}.\n\n${COMPOSE_GUIDE}${business.proof ? `\n\n${business.proof}` : ""}\n\nCall compose_store.`,
          tools: [COMPOSE_TOOL],
          tool_choice: { type: "tool", name: "compose_store" },
          messages,
        })
        .finalMessage();
    } catch (e) {
      console.warn("[composeStore] api error:", String(e).slice(0, 300));
      return null;
    }
  };

  let msg = await callOnce([{ role: "user", content: userContent }]);
  if (msg) {
    const t = msg.content.find((b) => b.type === "tool_use");
    const rawPages = t?.type === "tool_use" ? (t.input as Partial<ComposedPlan>).pages : undefined;
    const tPages: { slug?: string; sections?: unknown[] }[] = Array.isArray(rawPages) ? rawPages : [];
    const gotTool = t?.type === "tool_use" && tPages.length > 0;
    const homeCount = gotTool
      ? (tPages.find((pg) => /^(home)?$/.test(slugify(pg?.slug || "home")))?.sections?.length ?? tPages[0]?.sections?.length ?? 0)
      : 99;
    const has = (re: RegExp) => tPages.some((pg) => re.test(slugify(pg?.slug || "")));
    // Only re-request for the gaps that genuinely need the model's hand — a thin Home, or a missing
    // Shop page (it carries the product grid). A missing About / Contact is filled in deterministically
    // by composedToDoc so we don't pay for another 30k-token round trip.
    const gaps: string[] = [];
    if (gotTool && homeCount > 0 && homeCount < 6) gaps.push(`the Home page has only ${homeCount} sections (needs 7–8: hero → collections/gallery → brand story → social proof → slim trust bar → cta)`);
    if (gotTool && !has(/^(shop|store|catalog(ue)?|collections?|products?|browse)$/))
      gaps.push(`no Shop / catalogue page — ALWAYS build one: a one-line centered hero + optional collections tiles + exactly one product-grid (the grid belongs HERE, never on Home)`);
    if (gaps.length) {
      console.warn(`[composeStore] gaps → re-request:`, gaps.join("; "));
      msg =
        (await callOnce([
          { role: "user", content: userContent },
          { role: "assistant", content: msg.content },
          {
            role: "user",
            content: `That store has gaps: ${gaps.join("; ")}. Call compose_store AGAIN with the FULL corrected store — keep everything that's good, fix the gaps, write real specific copy for anything new. Vary section backgrounds for rhythm (alternate plain and banded/inverted).`,
          },
        ])) ?? msg;
    }
  }
  if (!msg) return null;
  if (msg.stop_reason === "max_tokens") console.warn("[composeStore] hit max_tokens — tool input likely truncated");
  const tool = msg.content.find((b) => b.type === "tool_use");
  if (!tool || tool.type !== "tool_use") {
    console.warn("[composeStore] no tool_use in response; stop_reason:", msg.stop_reason);
    return null;
  }
  const p = tool.input as Partial<ComposedPlan>;
  if (!p.tokens || !p.header || !Array.isArray(p.pages)) {
    console.warn("[composeStore] incomplete plan — tokens:", !!p.tokens, "header:", !!p.header, "pages:", Array.isArray(p.pages), "stop_reason:", msg.stop_reason);
    return null;
  }

  const pages = p.pages
    .filter((pg) => pg && pg.slug && Array.isArray(pg.sections))
    .map((pg) => ({
      slug: slugify(pg.slug),
      title: String(pg.title || pg.slug).slice(0, 60),
      nav: pg.nav,
      sections: (pg.sections as ComposedSection[])
        .filter((s) => s && s.id && s.kind && isOrbitKind(s.kind))
        .map((s) => ({
          id: slugify(s.id).slice(0, 40),
          kind: s.kind,
          variant: SECTION_KINDS[s.kind as keyof typeof SECTION_KINDS].includes(s.variant) ? s.variant : SECTION_KINDS[s.kind as keyof typeof SECTION_KINDS][0],
          label: String(s.label || s.kind).slice(0, 60),
          props: s.props && typeof s.props === "object" ? s.props : {},
        }))
        .slice(0, 10),
    }))
    .filter((pg) => !FUNCTIONAL_PAGES.includes(pg.slug) && pg.sections.length);
  if (!pages.length) return null;
  if (!pages.some((pg) => pg.slug === "home")) pages[0].slug = "home";

  const rawAnn = (p as { announcement?: Announce }).announcement;
  return {
    reply: p.reply,
    concept: p.concept ? String(p.concept).slice(0, 700) : undefined,
    storeName: String(p.storeName || business.name).slice(0, 80),
    tagline: p.tagline ? String(p.tagline).slice(0, 160) : undefined,
    tokens: p.tokens,
    header: String(p.header),
    footer: String(p.footer || ""),
    announcement:
      rawAnn && typeof rawAnn === "object"
        ? { show: rawAnn.show === undefined ? undefined : !!rawAnn.show, text: rawAnn.text ? String(rawAnn.text).slice(0, 180) : undefined }
        : undefined,
    pages,
  };
}

/** A kit-block section (used to backfill a core page the generator skipped). */
function kitSection(id: string, kind: string, variant: string, props: Record<string, unknown>): DesignSection {
  return {
    id,
    type: KIND_TO_TYPE[kind] || "custom",
    label: id.replace(/-/g, " "),
    html: "",
    block: { kind: kind as import("@/lib/orbit-sections").OrbitKind, variant, props },
    visible: true,
  };
}

/**
 * Guarantee the store has home + shop + about + contact. Splits a home-embedded product-grid into
 * a Shop page, and backfills any still-missing core page with on-brand kit sections. Mutates `pages`.
 * Works for both the bespoke-HTML path and the kit path (a page may end up mixed html + block).
 */
function ensureCoreContentPages(
  pages: DesignPage[],
  business: { name: string; niche: string },
  storeName: string,
  tagline: string,
): void {
  const niceHeading = business.niche.split(/[—,]/)[0].trim() || "products";
  const hasPage = (re: RegExp) => pages.some((p) => re.test(p.slug));
  const homeIdx = () => pages.findIndex((p) => p.slug === "home");
  const insertAfterHome = (page: DesignPage) => pages.splice(homeIdx() + 1, 0, page);
  const SHOP_RE = /^(shop|catalog(ue)?|collections?|store|products?)$/;

  const home = pages.find((p) => p.slug === "home");
  const homeGrid =
    home?.sections.findIndex((s) => s.block?.kind === "product-grid" || (s.html || "").includes("data-od-product-grid")) ?? -1;
  if (home && !hasPage(SHOP_RE) && homeGrid >= 0) {
    const grid = home.sections.splice(homeGrid, 1)[0];
    insertAfterHome({
      slug: "shop",
      title: "Shop",
      nav: true,
      sections: [kitSection("shop-intro", "hero", "centered", { heading: `Shop all ${niceHeading}`, body: tagline.slice(0, 120) }), grid],
    });
  }
  if (!hasPage(SHOP_RE)) {
    insertAfterHome({
      slug: "shop",
      title: "Shop",
      nav: true,
      sections: [
        kitSection("shop-intro", "hero", "centered", { heading: `Shop all ${niceHeading}`, body: tagline.slice(0, 120) }),
        kitSection("shop-grid", "product-grid", "standard", {}),
      ],
    });
  }
  if (!hasPage(/^(about|about-us|our-story|story|the-story)$/)) {
    pages.push({
      slug: "about",
      title: "About",
      nav: true,
      sections: [
        kitSection("about-story", "story", "split", {
          heading: `About ${storeName}`,
          body: `${storeName} makes ${business.niche}.\n\nWe started small and stayed that way on purpose — every order is checked by a person before it ships.`,
          figure: `the ${storeName} workshop / team at work`,
        }),
        kitSection("about-values", "values", "list", {
          heading: "What we stand for",
          items: [
            { title: "Made to last", body: "We'd rather sell you one good thing than three that wear out." },
            { title: "Fair prices", body: "No inflated RRPs, no fake discounts — one honest price." },
            { title: "Real support", body: "A person replies, usually the same day." },
          ],
        }),
        kitSection("about-cta", "cta", "banner", { heading: "Come say hi", body: "New drops and the occasional note — nothing else.", cta: { label: "Shop the collection" }, placeholder: "you@email.com" }),
      ],
    });
  }
  if (!hasPage(/^(contact|contact-us|get-in-touch)$/)) {
    pages.push({
      slug: "contact",
      title: "Contact",
      nav: true,
      sections: [
        kitSection("contact-main", "contact", "standard", {
          heading: "Get in touch",
          body: "Questions about an order, a product, or a wholesale enquiry — we're happy to help.",
          items: [
            { label: "Email", value: "{{contact.email}}" },
            { label: "Phone", value: "{{contact.phone}}" },
          ],
        }),
        kitSection("contact-cta", "cta", "banner", { heading: "Prefer to browse first?", cta: { label: "Shop all" } }),
      ],
    });
  }
}

function composedToDoc(plan: ComposedPlan, base: OrbitDesignDoc, business: { name: string; niche: string }): OrbitDesignDoc {
  const pages: DesignPage[] = plan.pages.map((pg) => ({
    slug: pg.slug,
    title: pg.title,
    nav: pg.nav !== false && pg.slug !== "home",
    sections: pg.sections.map((s) => ({
      id: s.id,
      type: KIND_TO_TYPE[s.kind] || "custom",
      label: s.label || s.kind,
      html: "",
      block: { kind: s.kind as import("@/lib/orbit-sections").OrbitKind, variant: s.variant, props: s.props || {} },
      visible: true,
    })),
  }));

  ensureCoreContentPages(pages, business, plan.storeName, plan.tagline || "");

  return normalizeDoc(
    {
      version: base.version,
      storeName: plan.storeName,
      tagline: plan.tagline || base.tagline,
      tokens: { ...defaultTokens(), ...cleanTokens(plan.tokens) },
      content: contentWithAnnounce(base.content, plan.announcement),
      components: {
        header: injectNavMarker(safeShell("header", plan.header, plan.storeName, business.niche)),
        footer: safeShell("footer", plan.footer, plan.storeName, business.niche),
      },
      pages,
      tweaks: [],
    } as OrbitDesignDoc,
    business.name,
    business.niche,
  );
}

/**
 * PHASE 2 — the primary path. Take a `plan` (concept + tokens + per-page section briefs with layout
 * skeletons), build genuinely bespoke inline-styled HTML for every section (parallel, chunked), and
 * assemble the doc. Returns the doc plus a `quality` flag: false when too many sections came back
 * empty/stub, so the caller can fall back to the kit.
 */
async function buildBespokeDoc(
  plan: StorePlan,
  base: OrbitDesignDoc,
  business: { name: string; niche: string },
  brief: string,
): Promise<{ doc: OrbitDesignDoc; quality: boolean }> {
  let stubs = 0;
  let total = 0;
  // Header/footer HTML is its own small call — kept OUT of the plan so the plan never truncates.
  // Run it fully parallel with the page section builds (pages only need the header *brief* for context).
  const headerHint = plan.headerBrief || "a slim sticky header, wordmark left, nav right";
  const [shell, built] = await Promise.all([
    buildShell(plan, business),
    Promise.all(
    plan.pages.map(async (pg): Promise<DesignPage> => {
      const html = await buildPageSections(pg, plan, headerHint, brief, business);
      return {
        slug: pg.slug,
        title: pg.title,
        nav: pg.nav !== false && pg.slug !== "home",
        sections: pg.sections.filter((s) => {
          // The shell owns the global header/footer — drop any page-level section that tries to be one
          // (planner sometimes lists a "footer" section, which then renders on top of components.footer).
          const idl = String(s.id || "").toLowerCase();
          if (/^(site-)?(header|footer)(-main|-site)?$/.test(idl) || /\b(footer|header)\b/.test(String(s.label || "").toLowerCase())) {
            const h = (html.get(s.id) || "").trim().toLowerCase();
            if (!h || h.startsWith("<footer") || h.startsWith("<header") || /^(footer|header)$/.test(idl)) return false;
          }
          // Drop no-op placeholder sections (html that is only comments / whitespace / an empty wrapper).
          const raw = html.get(s.id);
          if (typeof raw === "string" && raw.trim()) {
            const stripped = raw.replace(/<!--[\s\S]*?-->/g, "").replace(/<[^>]+>/g, "").trim();
            const hasWidget = /data-(od|img|video)-|<svg|<img|<iframe/i.test(raw);
            if (!stripped && !hasWidget) return false;
          }
          return true;
        }).map((s) => {
          total++;
          const got = html.get(s.id);
          if (!got || got.trim().length < 120) stubs++;
          return {
            id: s.id,
            type: (SECTION_TYPES.includes(s.type) ? s.type : "custom") as DesignSection["type"],
            label: s.label.slice(0, 60),
            html: got || `<section class="od-section"><div class="od-container"><h2 class="od-h2">${escapeHtml(s.label)}</h2></div></section>`,
            visible: true,
          };
        }),
      };
    }),
    ),
  ]);
  plan.header = shell.header;
  plan.footer = shell.footer;

  ensureCoreContentPages(built, business, plan.storeName, plan.tagline || "");

  // Palette harvest — the section builders reach for named brand colours (var(--od-navy,#223859),
  // var(--od-gold,#e8ba4c)…) with a hex fallback even when planStore forgot to emit tokens.palette.
  // Materialise every such reference as a real palette entry so the colour is defined once, stays
  // consistent across sections, and shows up as an editable swatch.
  {
    const CORE = new Set([
      "accent", "accent-2", "accent-text", "accenttext", "bg", "surface", "text", "muted", "border",
      "ink", "ink-2", "font-heading", "font-body", "font-serif", "font-display", "font-sans",
      "heading-weight", "radius", "density", "gutter", "container", "wrap",
    ]);
    const found = new Map<string, string>();
    const scan = (html: string) => {
      // matches var(--name,#hex) and var(--od-name,#hex) — the model uses both spellings
      const re = /var\(\s*--(?:od-)?([a-z][a-z0-9-]*)\s*,\s*(#[0-9a-fA-F]{3,8})\s*\)/g;
      let m: RegExpExecArray | null;
      while ((m = re.exec(html))) {
        const name = m[1].toLowerCase();
        if (CORE.has(name) || /^(s|text|shadow|radius)-?\d/.test(name)) continue;
        if (!found.has(name)) found.set(name, m[2]);
      }
    };
    for (const p of built) for (const s of p.sections) scan(s.html || "");
    scan(plan.header || "");
    scan(plan.footer || "");
    if (found.size) {
      const existing = Array.isArray((plan.tokens as { palette?: { name: string; value: string }[] }).palette)
        ? (plan.tokens as { palette: { name: string; value: string }[] }).palette
        : [];
      const have = new Set(existing.map((e) => String(e.name).toLowerCase()));
      const merged = [...existing];
      for (const [name, value] of found) if (!have.has(name)) merged.push({ name, value });
      (plan.tokens as { palette?: unknown }).palette = merged.slice(0, 8);
    }
  }

  const doc = normalizeDoc(
    {
      version: base.version,
      storeName: plan.storeName,
      tagline: plan.tagline || base.tagline,
      tokens: { ...defaultTokens(), ...cleanTokens(plan.tokens) },
      content: contentWithAnnounce(base.content, plan.announcement),
      components: {
        header: injectNavMarker(safeShell("header", plan.header, plan.storeName, business.niche)),
        footer: safeShell("footer", plan.footer, plan.storeName, business.niche),
      },
      pages: built as DesignPage[],
      tweaks: [],
      motion: plan.preloader ? { preloader: true } : undefined,
    } as OrbitDesignDoc,
    business.name,
    business.niche,
  );
  // Good enough if under ~40% of sections stubbed out and Home actually built (the visual-review
  // pass repairs the rest). Bespoke-but-imperfect still beats the kit's sameness.
  const homeStubbed = built.find((p) => p.slug === "home")?.sections.every((s) => (s.html || "").length < 220) ?? true;
  const quality = total > 0 && stubs / total < 0.4 && !homeStubbed;
  console.warn(`[buildBespokeDoc] ${built.length} pages, ${total} sections, ${stubs} thin (${((stubs / (total || 1)) * 100).toFixed(0)}%), homeStubbed=${homeStubbed} → quality=${quality}`);
  return { doc, quality };
}

/** Detect a "build my whole store" request that warrants the multi-pass path. */
export function isWholeStoreRequest(m: string): boolean {
  const t = m.toLowerCase();
  if (/\b(start (over|fresh|from scratch)|scratch se|dobara se|redesign everything)\b/.test(t)) return true;
  // Tight phrase match only — "design my checkout" or "make it feel complete" must never trip this;
  // the modifier has to sit right next to both the verb and the store/site noun, not just appear
  // loosely somewhere in a longer sentence about something else (a real false-positive that used to
  // wipe a seller's whole store back to blank stubs on an ordinary "design my account page" edit).
  if (/\b(build|create|make|design|rebuild|banwa|banao)\b[\s\S]{0,12}\b(whole|complete|entire|full|pora|poora|my|mera)\b[\s\S]{0,8}\b(store|storefront|site|website|shop)\b/.test(t)) return true;
  const pageWords = (t.match(/\b(home|shop|about|contact|faq|journal|blog|lookbook|product|gallery|story|collections?|pricing|services)\b/g) || []).length;
  if (/\bpages?\s*[:—-]/.test(t) && pageWords >= 3) return true;
  return false;
}

export async function runWholeStoreBuild(businessId: string, message: string, refs: { images?: DesignRef[]; siteUrl?: string; siteHint?: string } = {}): Promise<TurnResult> {
  const business = await prisma.business.findUnique({
    where: { id: businessId },
    select: { name: true, niche: true, products: { select: DESIGN_PRODUCT_SELECT, take: 24 } },
  });
  const doc = await loadDoc(businessId);
  if (!business) return { reply: "", doc, error: "Business not found" };
  if (!process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_API_KEY === "paste_your_key_here")
    return { reply: "Design AI isn't configured yet.", doc, error: "no api key" };
  try {
    await assertUnderUsageCap(businessId);
  } catch (e) {
    if (e instanceof UsageCapExceededError) return { reply: "You've hit this month's AI usage cap — try again next cycle.", doc, error: "cap" };
    throw e;
  }

  const products: StorefrontProduct[] = toStorefrontProducts(business.products);
  const images = (refs.images ?? []).slice(0, 4);

  const refNote =
    images.length || refs.siteUrl
      ? `REFERENCE ATTACHED${refs.siteUrl ? ` — a screenshot of ${refs.siteUrl}` : ""}. Match its FEEL for this brand: read the real palette off it and set tokens.accent/bg/surface/text/muted/border to those colours; match its layout rhythm (dense vs airy, full-bleed vs contained, card-heavy vs flat), its type mood, and its section shapes. Only the store name, product names, copy and logo are this seller's — everything visual should echo the reference.${
          refs.siteHint ? ` Colour/font hints pulled from the site: ${refs.siteHint}.` : ""
        }`
      : undefined;

  // PHASE 2: bespoke first — plan the structure, then build genuinely custom HTML per section.
  // Fall back to the curated kit only if the plan fails or too many sections come back thin.
  let concept: string | undefined;
  let replyText: string | undefined;
  let next: OrbitDesignDoc | undefined;

  const plan = await planStore(message, images, business, refNote);
  const bespoke = plan ? await buildBespokeDoc(plan, doc, business, message) : null;
  if (plan && bespoke?.quality) {
    concept = plan.concept;
    replyText = plan.reply;
    next = bespoke.doc;
  }

  if (!next) {
    if (bespoke) console.warn("[runWholeStoreBuild] bespoke build too thin — trying the kit");
    else console.warn("[runWholeStoreBuild] planStore returned nothing — trying the kit");
    const composed = await composeStore(message, images, { ...business, proof: await realReviewsNote(businessId) }, refNote);
    if (composed) {
      concept = composed.concept;
      replyText = composed.reply;
      next = composedToDoc(composed, doc, business);
    } else if (bespoke) {
      // Neither path is clean — take the bespoke doc we already have rather than nothing.
      concept = plan?.concept;
      replyText = plan?.reply;
      next = bespoke.doc;
    }
  }
  // Only fall back to a plain single-turn edit as a true last resort (both whole-store paths failed).
  if (!next) return runDesignTurn(businessId, message, refs, true);

  // Carry the seller's locked nav choices + any custom pages across a full rebuild.
  const lockedNav = new Map(doc.pages.filter((p) => p.navLocked).map((p) => [p.slug, p]));
  for (const p of next.pages) {
    const l = lockedNav.get(p.slug);
    if (l) {
      p.navShow = l.navShow;
      p.nav = l.navShow !== "never";
      p.navLocked = true;
      if (l.pageType === "custom") p.title = l.title;
    }
  }
  for (const p of doc.pages) {
    if (p.pageType === "custom" && !next.pages.some((x) => x.slug === p.slug)) next.pages.push(p);
  }

  const planPages = next.pages;
  await saveDoc(businessId, next);
  // A whole-store rebuild replaces the design — the old wired doc + backend spec no longer match it,
  // so clear them. The live store falls back to `doc` (the new design) and the seller re-runs Handoff.
  await prisma.storeDesign
    .update({ where: { businessId }, data: { wired: null, wiredAt: null, backend: null, backendWiredAt: null } })
    .catch(() => {});

  // Tweaks + turn record BEFORE the best-effort visual review, so the store is fully usable even
  // if the review call times out (maxDuration).
  next.tweaks = [
    { key: "accent", label: "Accent colour", type: "color", cssVar: "--tw-accent", value: String(next.tokens.accent || "#1f3a2e") },
    { key: "radius", label: "Corner radius", type: "slider", cssVar: "--tw-radius", value: `${next.tokens.radius ?? 8}px`, min: 0, max: 28, step: 1, unit: "px" },
    { key: "heading-weight", label: "Heading weight", type: "slider", cssVar: "--tw-heading-weight", value: String(next.tokens.headingWeight ?? 600), min: 400, max: 800, step: 50 },
    { key: "density", label: "Spacing density", type: "slider", cssVar: "--tw-density", value: String(next.tokens.density ?? 1), min: 0.8, max: 1.4, step: 0.05 },
  ];
  next = normalizeDoc(next, business.name, business.niche);
  await saveDoc(businessId, next);
  const reply0 = (replyText || `Built your full ${next.storeName} storefront — ${planPages.map((p) => p.title).join(", ")}.`).trim();
  await prisma.orbitDesignTurn.createMany({
    data: [
      { businessId, role: "user", content: message },
      { businessId, role: "assistant", content: reply0, meta: JSON.stringify({ version: next.version, multipass: true }) },
    ],
  });

  // A doc that is MOSTLY hand-authored html (Phase 2.2 bespoke) gets the bespoke-aware review even
  // if ensureCoreContentPages backfilled a couple of kit sections.
  const kitCount = next.pages.reduce((n, p) => n + p.sections.filter((s) => s.block).length, 0);
  const htmlCount = next.pages.reduce((n, p) => n + p.sections.filter((s) => !s.block && (s.html || "").length > 150).length, 0);
  const mostlyKit = kitCount > htmlCount;
  let fixed: string[] = [];
  try {
    const vv = mostlyKit
      ? await reviewComposedStore(businessId, next, message, concept, products, 2)
      : await visualReviewAndFix(businessId, next, message, products, 2, concept, plan?.spatialSystem);
    next = vv.doc;
    fixed = vv.fixed;
  } catch {
    /* visual polish is best-effort */
  }
  await saveDoc(businessId, next);
  return { reply: reply0, doc: next, fixed: fixed.length ? fixed : undefined };
}

export async function runDesignTurn(
  businessId: string,
  message: string,
  refs: { images?: DesignRef[]; siteUrl?: string; siteHint?: string } = {},
  skipMultiPass = false,
): Promise<TurnResult> {
  if (!skipMultiPass && isWholeStoreRequest(message)) {
    return runWholeStoreBuild(businessId, message, refs);
  }
  const business = await prisma.business.findUnique({
    where: { id: businessId },
    select: {
      name: true,
      niche: true,
      widgetCopy: true,
      products: { select: DESIGN_PRODUCT_SELECT, take: 24 },
    },
  });
  if (!business) return { reply: "", doc: defaultDoc("Store", "products"), error: "Business not found" };

  const doc = await loadDoc(businessId);
  const products: StorefrontProduct[] = toStorefrontProducts(business.products);

  if (!process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_API_KEY === "paste_your_key_here") {
    return { reply: "Design AI isn't configured yet — add ANTHROPIC_API_KEY.", doc, error: "no api key" };
  }
  try {
    await assertUnderUsageCap(businessId);
  } catch (e) {
    if (e instanceof UsageCapExceededError) return { reply: "You've hit this month's AI usage cap — try again next cycle.", doc, error: "cap" };
    throw e;
  }

  const turns = await prisma.orbitDesignTurn.findMany({ where: { businessId }, orderBy: { createdAt: "asc" }, take: 12 });
  const history = turns.map((t) => ({ role: t.role as "user" | "assistant", content: t.content }));

  const stateMsg = `CURRENT STOREFRONT (JSON):\n${JSON.stringify({
    storeName: doc.storeName,
    tagline: doc.tagline,
    tokens: doc.tokens,
    content: doc.content,
    components: doc.components,
    pages: doc.pages,
  })}`;

  const images = (refs.images ?? []).slice(0, 4);
  const refNote =
    images.length || refs.siteUrl
      ? `\n\nThe seller attached ${images.length ? `${images.length} reference image(s)` : ""}${images.length && refs.siteUrl ? " and " : ""}${
          refs.siteUrl ? `a screenshot of ${refs.siteUrl}` : ""
        } as the design they want to match. MATCH IT CLOSELY: read the actual colour palette off the reference and SET tokens.accent, tokens.bg, tokens.surface, tokens.text, tokens.muted, tokens.border to those colours (sample real pixel values from the image, don't approximate loosely). Match the layout, spacing, type treatment and section rhythm too. ONLY the store name, product names, copy and logo are this seller's — everything visual should look like the reference.${
          refs.siteHint ? ` Colour/font hints pulled from the site: ${refs.siteHint}.` : ""
        }`
      : "";
  const userBlocks: Anthropic.ContentBlockParam[] = [
    { type: "text", text: `${stateMsg}\n\nSELLER REQUEST: ${message}${refNote}` },
    ...images.map(
      (im): Anthropic.ContentBlockParam => ({
        type: "image",
        source: { type: "base64", media_type: im.mediaType, data: im.data },
      }),
    ),
  ];

  const proofNote = await realReviewsNote(businessId);
  const callModel = () =>
    anthropic.messages.create({
      model: MODEL,
      max_tokens: 16000,
      system:
        systemPrompt(
          business.name,
          business.niche,
          business.products.map((p) => p.name),
          products.filter((p): p is StorefrontProduct & { imageUrl: string } => !!p.imageUrl).map((p) => ({ name: p.name, imageUrl: p.imageUrl })),
        ) +
        WIDGET_SETTINGS_PROMPT +
        `\n\n${proofNote}`,
      tools: [EDIT_TOOL],
      tool_choice: { type: "tool", name: "edit_storefront" },
      messages: [...history, { role: "user", content: userBlocks }],
    });

  // If the model's answer changes nothing (its tool input came back in a shape we can't use), ask
  // once more before giving up — and then say so, never a "Done" on a storefront that didn't change.
  let input: Record<string, unknown> = {};
  let nextDoc = doc;
  for (let attempt = 1; ; attempt++) {
    let msg;
    try {
      msg = await callModel();
    } catch (e) {
      return { reply: "The design engine hit an error — try rephrasing, or try again in a moment.", doc, error: String(e).slice(0, 200) };
    }

    try {
      await prisma.agentUsage.create({
        data: {
          businessId,
          agentId: "orbit-design",
          model: MODEL,
          inputTokens: msg.usage.input_tokens,
          outputTokens: msg.usage.output_tokens,
          costUsd: estimateCostUsd(MODEL, msg.usage.input_tokens, msg.usage.output_tokens),
        },
      });
    } catch {
      /* best effort */
    }

    const tool = msg.content.find((b) => b.type === "tool_use");
    if (!tool || tool.type !== "tool_use") {
      if (msg.stop_reason === "max_tokens")
        return { reply: "That was a lot to design in one go — try asking for it in two steps (e.g. the pages first, then the polish).", doc, error: "max_tokens" };
      const t = msg.content.find((b) => b.type === "text");
      return { reply: t && t.type === "text" ? t.text : "I couldn't apply that change.", doc, error: "no tool_use" };
    }
    if (msg.stop_reason === "max_tokens")
      // the tool call was truncated mid-JSON — applyOps would drop the tail; bail cleanly
      return { reply: "That storefront was too big to build in one pass — ask for the core pages first, then add sections.", doc, error: "max_tokens" };

    input = coerceToolInput(tool.input as Record<string, unknown>);
    nextDoc = applyOps(doc, input, business.name, business.niche);
    // Only design edits that came back unusable count as a failure — a reply-only answer (a question,
    // "that's already how it is") or a wording/motion-only change legitimately leaves the doc as it was.
    const sentEdits = ["rebuild", "tokens", "components", "pages", "sections", "block_edits"].some((k) => input[k] !== undefined);
    if (!sentEdits || input.widgetSettings || JSON.stringify(nextDoc) !== JSON.stringify(doc)) break;
    console.warn("[orbit-design] model answer changed nothing", {
      attempt,
      fields: Object.fromEntries(Object.entries(input).map(([k, v]) => [k, Array.isArray(v) ? `array(${v.length})` : typeof v])),
    });
    if (attempt >= 2) {
      return { reply: "I couldn't turn that into changes this time — please send it again, or ask for one part at a time.", doc, error: "no change" };
    }
  }
  const reply = typeof input.reply === "string" && input.reply.trim() ? input.reply.trim() : "Done — updated your storefront.";

  const ws = input.widgetSettings as { motion?: string; copy?: Record<string, string> } | undefined;
  if (ws && typeof ws === "object") {
    const data: Record<string, unknown> = {};
    if (typeof ws.motion === "string" && ["none", "standard", "playful", "premium"].includes(ws.motion)) data.widgetMotion = ws.motion;
    if (ws.copy && typeof ws.copy === "object") {
      const merged = { ...parseWidgetCopy(business.widgetCopy) };
      for (const [k, v] of Object.entries(ws.copy)) {
        if (k in DEFAULT_WIDGET_COPY && typeof v === "string" && v.trim()) merged[k as WidgetCopyKey] = v.trim().slice(0, 300);
      }
      data.widgetCopy = JSON.stringify(merged);
    }
    if (Object.keys(data).length) {
      try {
        await prisma.business.update({ where: { id: businessId }, data });
      } catch {
        /* best effort — the design reply still applies even if this fails */
      }
    }
  }

  // Verify only when something structural changed (pure token tweaks are handled by the knobs, LLM-free)
  const structural = !!(input.rebuild || input.components || (Array.isArray(input.sections) && input.sections.length) || (Array.isArray(input.pages) && input.pages.length));
  let fixed: string[] = [];
  if (structural) {
    try {
      const v = await verifyAndFix(businessId, nextDoc, message, products);
      nextDoc = v.doc;
      fixed = v.fixed;
    } catch {
      /* the design already applied — a QA hiccup must never lose it */
    }
    // Then a real visual pass: screenshot the rendered store (desktop + mobile) and let a
    // designer-model fix what actually looks broken — grids, spacing, mobile, components.
    try {
      const vv = await visualReviewAndFix(businessId, nextDoc, message, products);
      nextDoc = vv.doc;
      fixed = [...fixed, ...vv.fixed];
    } catch {
      /* visual polish is best-effort — keep the design we have */
    }
  }

  await saveDoc(businessId, nextDoc);
  const userLog =
    images.length || refs.siteUrl
      ? `${message}\n\n_(with ${images.length ? `${images.length} reference image${images.length > 1 ? "s" : ""}` : ""}${
          images.length && refs.siteUrl ? " + " : ""
        }${refs.siteUrl ? refs.siteUrl : ""})_`
      : message;
  await prisma.orbitDesignTurn.createMany({
    data: [
      { businessId, role: "user", content: userLog },
      { businessId, role: "assistant", content: reply, meta: JSON.stringify({ version: nextDoc.version, fixed }) },
    ],
  });

  return { reply, doc: nextDoc, fixed: fixed.length ? fixed : undefined };
}

// ---------------------------------------------------------------------------
// Design-system extraction from the seller's existing website
// ---------------------------------------------------------------------------

export interface ExtractResult {
  tokens: Partial<DesignTokens>;
  notes: string;
  error?: string;
}

export async function extractDesignSystem(businessId: string, url: string): Promise<ExtractResult> {
  const html = await fetchRawHtml(url);
  if (!html) return { tokens: {}, notes: "", error: "Couldn't reach that site." };

  const hexes = [...html.matchAll(/#[0-9a-fA-F]{6}\b/g)].map((m) => m[0].toLowerCase());
  const freq = new Map<string, number>();
  for (const h of hexes) freq.set(h, (freq.get(h) ?? 0) + 1);
  const topHex = [...freq.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([h]) => h);
  const gfonts = [...html.matchAll(/fonts\.googleapis\.com\/css2?\?family=([^"'&]+)/g)].map((m) => decodeURIComponent(m[1]).replace(/\+/g, " ").split(":")[0]);

  if (!process.env.ANTHROPIC_API_KEY) {
    return { tokens: { googleFonts: gfonts.length ? gfonts.slice(0, 2) : undefined }, notes: "Pulled fonts from the page; add an API key for full colour extraction." };
  }
  try {
    await assertUnderUsageCap(businessId);
  } catch {
    return { tokens: {}, notes: "", error: "Monthly AI usage cap reached." };
  }

  try {
    const msg = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 1200,
      system: `You extract a clean, usable design system from a real website's HTML. Return ONE JSON object only: {"accent","accentText","bg","surface","text","muted","border","fontHeading","fontBody","googleFonts":[..],"radius","density","headingWeight","notes"}. Colours are hex. fontHeading/fontBody are CSS font-family stacks. googleFonts are bare family names. radius 0-24, density 0.9-1.2, headingWeight 500-800. If the page is sparse, infer a tasteful system and say so in notes. No prose outside the JSON.`,
      messages: [
        { role: "user", content: `Most-used hex colours: ${topHex.join(", ") || "none"}\nGoogle Fonts linked: ${gfonts.join(", ") || "none"}\n\nHTML (truncated):\n${html.slice(0, 14000)}` },
      ],
    });
    const text = msg.content.find((b) => b.type === "text");
    const raw = text && text.type === "text" ? text.text : "{}";
    const json = JSON.parse(raw.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "").trim());
    const { notes = "Extracted from your site.", ...tokens } = json;
    if (tokens.radius !== undefined) tokens.radius = clamp(Number(tokens.radius), 0, 32);
    return { tokens, notes };
  } catch (e) {
    return { tokens: { googleFonts: gfonts.slice(0, 2) }, notes: "", error: `Extraction failed: ${String(e).slice(0, 120)}` };
  }
}
