/**
 * Orbit Design's skill library. Like Claude Code's skills: a short catalogue (name + when to use)
 * is always visible to the designer, and it LOADS the full playbook for the ones it needs before
 * planning. Loaded skills are also handed to the section builders, so the knowledge reaches the
 * code that actually writes the HTML. Skills are craft knowledge — they never override the seller's
 * brief or the assigned art direction.
 */

export interface DesignSkill {
  name: string;
  /** one line: when this skill applies (this is what the designer reads to choose) */
  when: string;
  body: string;
}

export const DESIGN_SKILLS: DesignSkill[] = [
  {
    name: "anti-generic",
    when: "ALWAYS load first. The checklist that stops a store looking like every other AI-made store.",
    body: `Generic is a pattern, not a style. These are the tells — remove every one that you did not choose on purpose:
- Inter/Roboto/Arial/system fonts as the only voice. Pair a characterful heading font with a quiet body font; the heading font is where the personality lives.
- A purple/blue gradient, or a "safe" blue accent on a brand that isn't tech. Take colour from the PRODUCTS (their packaging, materials, culture), not from a default.
- White page + centred heading + three equal rounded cards, repeated down the page. Vary skeletons; let one section be dramatically different.
- Every block a rounded, soft-shadowed card. Use rules, bands, bleeds, overlaps, frames or nothing instead.
- Hero = big centred headline + gradient blob + two buttons. A hero should be a composition: type scale contrast, an image treatment, an asymmetry.
- Evenly distributed everything. Real design has a dominant element per screen, a hierarchy, and deliberate emptiness.
- Decoration that means nothing (sparkles, blobs). Every ornament must belong to the brand's story or the chosen motif.
Commit to ONE bold idea and execute it with precision. Restraint and maximalism both work; indecision does not.`,
  },
  {
    name: "typography",
    when: "Choosing fonts, sizes, weights, and how headings and body text behave. Load for every build.",
    body: `- Scale contrast makes hierarchy: hero headline 3-6x body size is normal for a confident brand. Timid 1.5x steps read as a template.
- Use clamp() for fluid sizes: hero clamp(2.6rem, 7vw, 6.5rem); h2 clamp(1.8rem, 4vw, 3.2rem); body 1rem-1.1rem at line-height 1.6-1.7.
- Tight tracking (-0.02em to -0.04em) on big display type; open tracking (0.08-0.2em) on small uppercase labels. Never track body text.
- Line length: body text 55-70 characters (max-width 60ch). Headlines can run wide; paragraphs cannot.
- One display face + one text face. A third (mono or script) only as a deliberate accent. Max 3 weights.
- Mix one word in a different style inside a headline (italic, outlined, a colour, a different face) — a classic way to add voice.
- Real numerals: tabular figures for prices and specs; oversized numerals as a graphic element.
- Urdu / Roman Urdu text: never letter-space Urdu script; give it 1.8+ line-height and a proper font (Noto Nastaliq Urdu, Jameel-style) if the seller writes in Urdu.`,
  },
  {
    name: "colour",
    when: "Building the palette, section colourways, and contrast. Load for every build.",
    body: `- Build the palette around the products: sample the colours of the actual goods, their packaging and culture. A chai brand and a gadget brand must not share a palette.
- 60/30/10: a dominant colour (usually the page), a secondary (panels/bands), a sharp accent (buttons, marks). The accent should be used rarely so it keeps power.
- Dark themes: use a TINTED black (warm, blue or green), never #000, and off-white text (never #fff on #000 body text). Glow accents sparingly.
- Light themes: avoid pure white + pure black together unless the direction is Swiss/mono; warm or cool the whites slightly.
- Give sections different colourways (page / panel / accent-fill / dark band) — alternating them is what makes a long page feel composed, not scrolled.
- Contrast is non-negotiable: body text >= 4.5:1, large text >= 3:1. Choose bg first, then text from the opposite end of lightness; check accentText on accent.
- Never put muted text on a coloured band without checking it; mix text colours from the band, not the page.`,
  },
  {
    name: "layout-composition",
    when: "Planning the structure of pages and sections; making sections that do not all look alike. Load for every build.",
    body: `- Pick ONE spatial system and obey it (contained column / full-bleed bands / asymmetric editorial grid / rail+content / dense magazine). Mixing them randomly looks accidental.
- Rhythm: alternate density. After a dense section, give a spacious one. After a text section, a visual one.
- Break the grid on purpose, once or twice per page: an image that bleeds off the edge, a headline overlapping a photo, a number that is half out of frame.
- Asymmetry beats symmetry for modern brands (5/7, 4/8, 3/9 columns). Symmetry suits ceremonial/luxury/heritage directions — then commit fully.
- Hierarchy per screen: one dominant element, one supporting, the rest quiet.
- Section separators: use a different device each time (colour change, rule, angled cut, pattern band, overlap) — not just whitespace.
- Whitespace is a material. Luxury = a lot; bazaar = little. Match the direction.
- Mobile first: collapse to one column gracefully, keep the hero type readable (28-40px), keep tap targets >= 44px.
- Never end a page abruptly: a closing section (CTA band, newsletter, or a big statement) before the footer.`,
  },
  {
    name: "ecommerce-conversion",
    when: "Home/shop/product presentation for a store that must sell, especially cash-on-delivery sellers. Load for every build.",
    body: `- Above the fold: what is sold, for whom, and one clear action. A shopper should know in 3 seconds.
- Put real products early. A hero without a product photo or a path to products wastes the most valuable screen.
- Trust for COD buyers: state "Cash on delivery" plainly, show delivery cities/time ONLY if the seller gave them, show a return/exchange promise ONLY if the seller gave it. Never invent reviews, counts, awards, or press.
- Price clarity: price next to the name, "From Rs X" for variants, compare-at only when real.
- Scarcity/urgency only from real stock or a real offer — never fake timers.
- Make the buy path short: product → size/option → add → cart → COD checkout. Do not bury it behind decorative sections.
- Social proof: use real reviews if provided; otherwise use a promise/process section (how it is made, how it is packed), not fake quotes.
- Category entry points: collection circles or tiles (data-od-collections) on the home page when the catalogue has 2+ categories.
- Show real products high on the home page: a bestsellers or new-arrivals rail (data-od-products) right after the hero, a featured product (data-od-featured-product) further down, shop by price (data-od-price-bands) for a wide price range. These are live blocks — never hand-write product cards.
- WhatsApp/Instagram sellers: a visible contact path (phone/WhatsApp link from the content tokens) in header or footer.`,
  },
  {
    name: "imagery",
    when: "Deciding how photos, illustrations and image slots are used and treated. Load for every build.",
    body: `- Photos are the biggest lever on how a store feels. Treat them: one consistent crop ratio per grid, one consistent colour treatment (natural / warm / duotone / grain / black-and-white).
- Never stretch; always object-fit:cover with a sensible object-position.
- Shape language for frames: arch, circle, hard rectangle, torn edge, polaroid, tape-pinned — chosen by the art direction, used consistently.
- Overlay type on photos only with a scrim (gradient 0 → 0.6 black) or on a solid panel; check contrast over the lightest part of the photo.
- Hero photography: one strong image beats a collage. Crop tight on the product detail for premium; show it in use for lifestyle.
- Use real product photos where the catalogue has them (the product grid injects them); use image slots for lifestyle/hero shots and describe them concretely (subject, light, angle, mood), never "a nice photo".
- If there are no photos at all: lean on type, colour, pattern and illustration-style SVG shapes rather than empty grey boxes.`,
  },
  {
    name: "motion",
    when: "Deciding what animates and how. Load when the direction or brief wants motion, or for any hero.",
    body: `- Motion should express the brand's temperament: slow fades for calm/luxury, snappy 120-180ms with overshoot for playful, hard cuts and slides for brutal/industrial.
- One signature motion, repeated: e.g. headlines clip-reveal upward; rules draw left to right; stickers pop. Consistency reads as design; variety reads as noise.
- Reveal on scroll with data-od-reveal / data-od-reveal-stagger; hover feedback with data-od-hover; parallax (data-od-parallax) only on large background elements and always subtle.
- Animate transform and opacity only. Respect reduced motion (the platform already disables animation for it).
- Self-drawing lines, counters (data-od-count), marquees (data-od-marquee), tabs/accordions/carousels via the data-od-* hooks — use them where they serve the content, not everywhere.
- Never auto-play anything with sound; never block content behind an animation.`,
  },
  {
    name: "copywriting",
    when: "Writing headlines, microcopy, button labels and descriptions. Load for every build.",
    body: `- Headlines state something specific about THIS brand ("Hand-pressed mustard oil from one family farm in Sahiwal"), not a category cliché ("Quality you can trust").
- Banned filler: "elevate", "curated", "seamless", "unlock", "journey", "crafted with passion", "high-quality", "your one-stop shop".
- Short sentences. Concrete nouns. One idea per line. Numbers only when the seller gave them.
- Button labels are verbs about the outcome: "Shop the lawn collection", "See what's in stock", not "Learn more" / "Click here".
- Match the seller's language: if they wrote Roman Urdu, a bilingual touch is welcome in small places; never machine-translate long copy.
- Never invent facts: no made-up founding years, certifications ("cruelty-free", "organic", "halal certified"), awards, press, customer counts, or delivery promises. If it was not in the brief, don't claim it — write about what the product visibly is and how it's made instead.
- Microcopy has a voice too: empty states, form helpers, and the announcement bar should sound like the brand.`,
  },
  {
    name: "pakistan-market",
    when: "The seller is in Pakistan / sells to South Asian shoppers (COD, WhatsApp, local categories like lawn, unstitched, attar, mithai, bridal).",
    body: `- Cash on delivery is the default trust signal — say it plainly near the buy path and in the footer; it is a feature, not an apology.
- Shoppers browse on mid-range Android phones over mobile data: keep layouts light, hero imagery compressed, and the first screen useful without heavy motion.
- WhatsApp is the real support channel — make a WhatsApp/phone link easy to find (via the {{contact.phone}} token).
- Seasonal rhythm matters (Eid, Ramadan, wedding season, summer lawn drops, winter shawls) — design sections that can swap with the season, but do not invent a sale.
- Heritage craft categories (lawn, khussa, embroidery, attar, jewellery) reward ornament, rich colour and pattern; do not flatten them into generic minimalism unless the seller asks.
- Price display: "Rs 2,450" with thousands separators; avoid decimals.
- Sizes: S/M/L/XL and unstitched (3-piece) are common — make option labels explicit.`,
  },
];

export function skillCatalogue(): string {
  return DESIGN_SKILLS.map((s) => `- ${s.name} — ${s.when}`).join("\n");
}

export function getSkill(name: string): DesignSkill | undefined {
  const n = String(name || "").toLowerCase().trim();
  return DESIGN_SKILLS.find((s) => s.name === n);
}

/** The text injected into the section builders for the skills the designer loaded. */
export function skillsForBuilders(names: string[]): string {
  const picked = names.map(getSkill).filter((s): s is DesignSkill => !!s);
  if (!picked.length) return "";
  return picked.map((s) => `### SKILL: ${s.name}\n${s.body}`).join("\n\n");
}

/** Skills every build gets, whether or not the designer remembered to load them. */
export const ALWAYS_SKILLS = ["anti-generic", "typography", "colour", "layout-composition", "ecommerce-conversion", "imagery", "copywriting"];
