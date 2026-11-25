/**
 * How successful online stores in each kind of shop are really laid out — the commerce patterns a
 * good designer starts from when the seller gives no reference. Written from what works on real,
 * selling stores (Pakistani and international), not from portfolio sites. The designer adapts the
 * pattern to the brand; it doesn't invent a gallery piece.
 */
interface Pattern {
  match: RegExp;
  name: string;
  text: string;
}

const COMMON = `WHAT EVERY SELLING STORE HAS (keep, whatever the niche):
- First screen: what you sell, for whom, and one clear way in (shop button or the products themselves). On a phone, at least one product or category is visible after one swipe.
- A clean header: logo, 4–7 plain menu words (category names, not poetry), search, account, bag with a count. A thin announcement strip only for a real offer (delivery, COD).
- Products early and often: a category row near the top, then product rails/grids with real photos, name, price, one add button. Prices are big enough to read.
- Trust where the doubt is: cash on delivery, delivery time/fee, returns — only facts the seller gave — near the hero and again near the footer.
- A real footer: menu, contact, socials, policies the seller has, newsletter.
- Copy that sounds like a shop, not a poem: short, concrete, the product's own facts.`;

const PATTERNS: Pattern[] = [
  {
    match: /perfume|fragrance|attar|oud|scent|cologne|itr/i,
    name: "Perfume / fragrance",
    text: `Proven perfume-store pattern (e.g. Pakistani houses like J., Scents N Stories, Bonanza Fragrances; international Le Labo, Byredo, Maison Margiela Replica):
- Mostly WHITE / very light pages so bottles and colourful campaign banners carry the colour. Black or deep brand-colour header or announcement strip.
- Hero: a wide campaign banner slider — the bottles on a bold, saturated colour set (one strong colour per slide), short campaign line, one button.
- "Shop by collection" tiles right after (Men, Women, Oud, Attars, Gift sets, Under Rs 2,000…), square or portrait photos with the name under or on them.
- Many product rails, each a collection ("Best sellers" with tabs per collection, then one rail per collection), 4–5 cards per row on desktop, 2 on phones, swipeable.
- Cards: light grey or white photo square, collection name small, product name, price (sale price in red if any), "Add to cart" button or a quick-add icon; scent notes in one short line.
- A help-me-choose band ("Don't know where to start?" → sample set / quiz / by occasion), gift sets, a promises row with icons, then footer.
- Type: one strong clean sans for everything (bold, often UPPERCASE section titles, centred), a refined serif only for the logo if at all. No italics in headings.`,
  },
  {
    match: /cloth|lawn|kurta|dress|fashion|apparel|wear|abaya|shirt|jeans|suit|saree|hijab/i,
    name: "Fashion / clothing",
    text: `Proven fashion pattern (Khaadi, Sapphire, Generation, Zara, COS):
- White pages, black type, photography does all the work. Full-bleed campaign hero (model shot) with the season/drop name and SHOP NOW.
- Category tiles (Unstitched, Ready to wear, Kids…) then "New arrivals" grid; 4 columns desktop, 2 on phones; tall portrait photos (3:4), second photo on hover.
- Cards: photo, name, price, colour dots; sale price in red. Size chosen on the product page with a size guide.
- Thin uppercase menu, big search, filters (size, colour, price) on the shop page.`,
  },
  {
    match: /food|snack|honey|tea|chai|coffee|spice|masala|sweet|mithai|bakery|dry ?fruit|pickle|achar|organic/i,
    name: "Food / pantry",
    text: `Proven food pattern (Bake Parlor, Shan, Graze, Oddbox, local organic stores):
- Warm but CLEAN: white or cream pages, one appetite colour (honey, chilli, green), big product/pack shots and ingredient close-ups.
- Hero states the product and the promise in plain words (pure, fresh, from where), with the best seller visible.
- Category tiles, best sellers grid, bundles/combos, "how it's made / where it comes from" with real facts only, reviews if real, delivery cities and freshness info.
- Cards: square pack shot on white, weight/size, price per pack, add button.`,
  },
  {
    match: /phone|charger|cable|earbud|gadget|electronic|accessor|laptop|power ?bank|watch/i,
    name: "Electronics / gadgets",
    text: `Proven electronics pattern (Anker, Audionic, Daraz Mall stores, Apple accessories):
- White or very light grey pages, dark text, ONE accent colour for buttons and prices. Crisp product renders on white.
- Hero: one hero product with its key spec (e.g. 65W, 20,000 mAh) and price, or a deals banner.
- Category tiles with icons/photos, "Best deals" rail, comparison of key specs, warranty and COD promises prominent.
- Cards: product on white, name with the spec, price (old price struck through), rating if real, add button. Dense grids are fine (4–5 per row).`,
  },
  {
    match: /skin|beauty|cosmetic|serum|cream|makeup|hair|salon|soap|care/i,
    name: "Beauty / skin care",
    text: `Proven beauty pattern (The Ordinary, Conatural, Glossier, Saeed Ghani):
- Clean, light, soft: white/off-white pages with one soft brand colour; product shots on plain colour.
- Hero: product + the concern it addresses (dryness, glow) in plain words; never cure/medical claims.
- Shop by concern / skin type, best sellers, "how to use" steps, ingredients in plain language, real reviews only.
- Cards: product on soft colour, size, short benefit line, price, add.`,
  },
  {
    match: /jewel|jewellery|jewelry|ring|bangle|earring|kundan|necklace|bridal/i,
    name: "Jewellery",
    text: `Proven jewellery pattern (Mejuri, Missoma, local bridal sets stores):
- Light neutral pages (white, ivory), black or deep green type, gold only as an accent. Macro product shots and worn-on-model shots.
- Hero: hero piece or bridal set, occasion line, shop button. Shop by category (earrings, sets, rings) and by occasion (bridal, everyday).
- Cards: square close-up on neutral background, name, price; second image worn on hover.`,
  },
  {
    match: /home|decor|candle|furniture|kitchen|ceramic|mug|pottery|bedding|lamp|plant/i,
    name: "Home / decor",
    text: `Proven home pattern (H&M Home, Zara Home, Khaadi Home, local ceramics stores):
- Light warm neutrals, lifestyle photos of the product in a room or on a table, plenty of white space.
- Hero: room/lifestyle shot with a collection name. Category tiles by room or product type, best sellers, a short maker story with real facts, gifting.
- Cards: product on neutral background, name, price; lifestyle image on hover.`,
  },
  {
    match: /toy|kid|baby|child/i,
    name: "Kids / toys",
    text: `Proven kids pattern (Lovevery, Mothercare, local toy stores):
- Bright but tidy: white pages with two or three cheerful accents, rounded shapes, friendly bold sans.
- Shop by age and by type, best sellers, safety/material facts, gift section. Cards: product on colour, age range, price, add.`,
  },
];

export function storePattern(text: string): string {
  const p = PATTERNS.find((x) => x.match.test(text));
  return `${COMMON}\n\n${p ? p.text : "No niche pattern matched: use the common rules and the layout of the best-selling stores you know in this category."}`;
}

/** Things that make a store look AI-made. Shared by the designer and the art director. */
export const SLOP_TELLS = `AI-MADE LOOK — never do these:
- One word in a heading set in italic or a second font ("Find your *scent*", "come back *for*").
- A tiny letter-spaced label ("eyebrow") above every heading. One or two on the page at most.
- Dark purple/indigo/near-black "luxury" pages with gold accents when the brand didn't ask for dark.
- Giant outlined or faded wordmark in the footer; huge background numbers or letters behind sections.
- Glows, gradient blobs, glassy cards, noise textures, everything with soft shadows.
- Cute "brand voice" lines instead of shop words ("Letters after dark", "Pick your hour", "Golden hour, bottled") — menu items, section titles and buttons say plainly what is there.
- Centred hero text over a vague mood photo with no product visible.
- Every section a different layout trick; inconsistent paddings, mismatched card sizes, text and images not aligned to the same grid.
- Thin light-grey body text that is hard to read; tiny buttons.`;
