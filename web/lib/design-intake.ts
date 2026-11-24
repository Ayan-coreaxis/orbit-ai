/**
 * The designer's intake — a fixed set of choices a seller makes BEFORE a store is built (no AI call,
 * no cost). Every answer becomes a binding line in the brief the builder gets, and any answer can
 * carry the seller's own reference image ("make the header like this"). The splash screen is applied
 * by the platform itself, so it can't go wrong: the builder only reads the `[splash=…]` marker.
 */
export interface IntakeOption {
  id: string;
  label: string;
  /** one line shown under the label */
  hint: string;
  /** what the designer is told (binding) */
  brief: string;
}
export interface IntakeSection {
  id: string;
  title: string;
  why: string;
  multi?: boolean;
  /** the seller may upload a reference image for this part */
  reference?: boolean;
  options: IntakeOption[];
}

export const SPLASH_IDS = ["none", "fade", "counter", "curtain"] as const;
export type SplashId = (typeof SPLASH_IDS)[number];

export const INTAKE: IntakeSection[] = [
  {
    id: "hero",
    title: "What does the first screen show?",
    why: "The hero decides the first impression.",
    reference: true,
    options: [
      { id: "photo", label: "One big photo", hint: "A single striking product or lifestyle image", brief: "one large photograph filling the first screen, headline and one button over or beside it" },
      { id: "slider", label: "Photo slider", hint: "Several photos that slide on their own", brief: "a full-width image carousel / slider of 3–4 slides, each with its own headline and button (data-od-carousel with autoplay, arrows and dots)" },
      { id: "video", label: "One video", hint: "A full-screen looping background video", brief: "a full-screen looping background video (<video data-video-query=…>) with the headline and one button over it" },
      { id: "videos", label: "Several videos", hint: "A row or grid of short clips", brief: "a hero built from several short looping videos in a grid / strip (each a <video data-video-query=…>), with the headline and one button" },
      { id: "type", label: "Big type only", hint: "Giant headline, no photo", brief: "a typographic hero — a giant headline as the picture, no photo, one button" },
      { id: "split", label: "Text + photo split", hint: "Words on one side, photo on the other", brief: "a split hero: text and button on one half, a tall photo on the other half" },
    ],
  },
  {
    id: "header",
    title: "How should the header look?",
    why: "It is on every page.",
    reference: true,
    options: [
      { id: "classic", label: "Logo left, menu right", hint: "Clean and familiar", brief: "logo at the left, page links at the right, cart and search icons at the far right" },
      { id: "centered", label: "Centred logo", hint: "Logo in the middle, menu beneath", brief: "the logo centred, the page links in a row beneath it, cart and search at the sides" },
      { id: "overlay", label: "Transparent over the hero", hint: "Floats on top of the first image", brief: "a transparent header that sits on top of the hero (light text), turning solid when the page is scrolled" },
      { id: "side", label: "Burger + side menu", hint: "Minimal bar, menu slides in", brief: "a minimal bar — logo and a burger button — and a full-height menu panel that slides in from the side (CSS-only toggle with its own unique input)" },
      { id: "bold", label: "Bold bar + announcement", hint: "Loud, colourful, with a strip above", brief: "an announcement strip above a bold, high-contrast header bar" },
    ],
  },
  {
    id: "splash",
    title: "Opening splash screen?",
    why: "A short intro while the store loads.",
    options: [
      { id: "none", label: "None", hint: "Straight into the store", brief: "no splash screen" },
      { id: "fade", label: "Logo fade", hint: "Store name fades in, then away", brief: "a splash where the store name fades in and away" },
      { id: "counter", label: "Counter 0 → 100", hint: "Big number counting up", brief: "a splash with a big counter running 0 to 100" },
      { id: "curtain", label: "Curtain reveal", hint: "Two panels slide open", brief: "a splash where two panels slide apart to reveal the store" },
    ],
  },
  {
    id: "cards",
    title: "How should product cards look?",
    why: "Shoppers see these the most.",
    reference: true,
    options: [
      { id: "minimal", label: "Minimal", hint: "Photo, name, price", brief: "minimal cards: photo, name and price with generous space; the add-to-cart button appears on hover (always visible on phones)" },
      { id: "boxed", label: "Boxed", hint: "Border, shadow, button", brief: "boxed cards with a visible border and soft shadow, the photo on top, name, price and a full-width add-to-cart button" },
      { id: "overlay", label: "Text over photo", hint: "Photo fills the card", brief: "overlay cards: the photo fills the whole card and the name and price sit on a gradient at the bottom, with a small round add button" },
      { id: "editorial", label: "Editorial", hint: "Tall photo, hover swaps", brief: "editorial cards: a tall portrait photo, small refined type beneath, a second photo or colour change on hover" },
      { id: "compact", label: "Compact list", hint: "Small photo beside the text", brief: "compact horizontal cards: a small square photo at the left, name, short description and price at the right, in a single column on phones" },
    ],
  },
  {
    id: "sections",
    title: "What goes on the home page?",
    why: "Pick as many as you like.",
    multi: true,
    options: [
      { id: "bestsellers", label: "Best sellers", hint: "A row of top products", brief: "a best-sellers rail of product cards" },
      { id: "categories", label: "Shop by category", hint: "Category tiles with photos", brief: "shop-by-category tiles with photos" },
      { id: "featured", label: "Featured product", hint: "One product, big", brief: "one featured product shown large" },
      { id: "story", label: "Our story", hint: "Short brand story", brief: "a short brand-story section with a photo" },
      { id: "process", label: "How it's made", hint: "Steps or sourcing", brief: "a how-it's-made / sourcing section in 3–4 steps" },
      { id: "video", label: "Video section", hint: "A video between sections", brief: "a video section (<video data-video-query=…>)" },
      { id: "gallery", label: "Photo gallery", hint: "Grid or lookbook", brief: "a photo gallery / lookbook" },
      { id: "reviews", label: "Customer reviews", hint: "Only real reviews are shown", brief: "a reviews section — only real reviews, otherwise promises the seller really keeps" },
      { id: "faq", label: "FAQ", hint: "Common questions", brief: "a short FAQ" },
      { id: "newsletter", label: "Newsletter", hint: "Email sign-up", brief: "a newsletter sign-up" },
    ],
  },
  {
    id: "feel",
    title: "What should it feel like?",
    why: "Sets colour, type and spacing.",
    reference: true,
    options: [
      { id: "warm", label: "Warm & handmade", hint: "Earthy, cosy, crafted", brief: "warm, earthy and handmade — natural textures, soft colours, a friendly serif" },
      { id: "luxe", label: "Dark & luxurious", hint: "Glossy, high-end", brief: "dark, luxurious and glossy — deep colours, gold or a single bright accent, elegant type" },
      { id: "pop", label: "Bright & playful", hint: "Bold colours, big type", brief: "bright, playful pop — saturated colours, oversized type, stickers and chunky shapes" },
      { id: "clean", label: "Clean & minimal", hint: "Calm and airy", brief: "clean, minimal and calm — lots of white space, restrained palette, precise type" },
      { id: "editorial", label: "Editorial", hint: "Magazine-like", brief: "editorial and magazine-like — strong grid, big photography, confident serif headlines" },
    ],
  },
];

export interface IntakeAnswers {
  /** section id → chosen option id(s) */
  picks: Record<string, string[]>;
  /** section id → the seller's own words */
  notes: Record<string, string>;
  /** the seller's brand colours / things to keep */
  brand: string;
  /** reference images (data URLs) by section id; "site" = the whole store */
  refs: Record<string, string[]>;
}

export function emptyAnswers(): IntakeAnswers {
  return { picks: {}, notes: {}, brand: "", refs: {} };
}

const optionOf = (s: IntakeSection, id: string) => s.options.find((o) => o.id === id);

export function splashFrom(message: string): SplashId | null {
  const m = /\[splash=(none|fade|counter|curtain)\]/.exec(message);
  return (m?.[1] as SplashId | undefined) ?? null;
}

/**
 * Turn the choices into the brief + the ordered list of reference images. The model is told which
 * picture belongs to which part, so "like this header" really means the header.
 */
export function composeIntake(brief: string, a: IntakeAnswers): { message: string; images: string[] } {
  const lines: string[] = [];
  const images: string[] = [];
  const refLines: string[] = [];
  const addRefs = (key: string, label: string) => {
    for (const url of a.refs[key] ?? []) {
      if (images.length >= 8) break;
      images.push(url);
      refLines.push(`- Image ${images.length}: ${label}`);
    }
  };

  for (const s of INTAKE) {
    const picked = (a.picks[s.id] ?? []).map((id) => optionOf(s, id)).filter((o): o is IntakeOption => !!o);
    const note = (a.notes[s.id] ?? "").trim();
    const hasRef = (a.refs[s.id] ?? []).length > 0;
    if (!picked.length && !note && !hasRef) continue;
    const title = s.id === "sections" ? "Home page sections (include all of these)" : s.id === "splash" ? "Splash screen" : s.id === "cards" ? "Product cards" : s.id === "feel" ? "Overall feel" : s.id === "hero" ? "Hero" : "Header";
    const parts = [picked.map((o) => o.brief).join("; ")];
    if (note) parts.push(`seller's own words: ${note}`);
    if (hasRef) parts.push("follow the attached reference image for this part (match its layout, spacing, type and colour mood — not its content)");
    lines.push(`- ${title}: ${parts.filter(Boolean).join(" — ")}`);
    addRefs(s.id, `reference for the ${s.id === "cards" ? "PRODUCT CARDS" : s.id.toUpperCase()}`);
  }
  if (a.brand.trim()) lines.push(`- Brand colours / things to keep: ${a.brand.trim()}`);
  addRefs("site", "reference for the WHOLE STORE — match its overall feel");

  const splash = a.picks.splash?.[0];
  const marker = splash && (SPLASH_IDS as readonly string[]).includes(splash) ? `\n[splash=${splash}]` : "";
  if (!lines.length && !images.length) return { message: brief, images: [] };
  const message = [
    brief.trim(),
    "",
    "THE SELLER'S DESIGN DECISIONS (binding — build exactly these; your craft decides how they look):",
    ...lines,
    ...(refLines.length ? ["", "REFERENCE IMAGES attached, in order:", ...refLines] : []),
  ].join("\n") + marker;
  return { message, images };
}
