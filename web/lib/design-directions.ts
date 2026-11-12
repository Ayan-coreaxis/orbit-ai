/**
 * Art-direction library. A language model left to "invent a fresh concept" lands on the same two or
 * three looks every time, so every store came out alike. Each whole-store build is now ASSIGNED one
 * of these directions (matched to the niche, never the one this store had before), and the planner
 * adapts it to the brand. The seller's own explicit wishes always win over the direction.
 */
import type { DesignStyle } from "./design-style";

export interface DesignDirection {
  id: string;
  name: string;
  /** niches this direction suits (matched against niche + brief). Empty = suits anything. */
  fits: RegExp | null;
  /** style words in the brief that ask for this direction outright */
  cues: RegExp;
  idea: string;
  palette: string;
  /** heading / body Google Font pairs — one is picked per build */
  fonts: [string, string][];
  style: DesignStyle;
  radius: number;
  headingWeight: number;
  density: number;
  spatial: string;
  motif: string;
  hero: string;
  header: string;
  motion: string;
}

const st = (
  button: DesignStyle["button"],
  card: DesignStyle["card"],
  imageRatio: DesignStyle["imageRatio"],
  imageShape: DesignStyle["imageShape"],
  align: DesignStyle["align"],
  buy: DesignStyle["buy"],
  grid: DesignStyle["grid"],
  caps = false,
): DesignStyle => ({ button, card, imageRatio, imageShape, align, buy, grid, caps });

export const DIRECTIONS: DesignDirection[] = [
  {
    id: "swiss-grid",
    name: "Swiss grid",
    fits: /electronic|gadget|stationer|tool|home|kitchen|appliance|furnitur|bag|watch|book|office/i,
    cues: /\b(swiss|grid|helvetica|international style|systematic)\b/i,
    idea: "International Typographic Style: a strict visible 12-column grid, hairline rules, flush-left grotesque type, oversized numerals indexing every section (01, 02…). Information design, not decoration.",
    palette: "white or very pale grey page, near-black text, ONE signal colour (a pure red, cobalt, or traffic yellow — choose from the product world) used only for numerals, rules and the primary button.",
    fonts: [["Archivo", "Inter Tight"], ["Schibsted Grotesk", "IBM Plex Sans"], ["Familjen Grotesk", "Work Sans"]],
    style: st("sharp", "line", "square", "sharp", "left", "link", "standard"),
    radius: 0, headingWeight: 700, density: 1,
    spatial: "a contained 12-column grid with 1px rules between sections and between columns; every block snaps to a column edge; nothing is centred.",
    motif: "a large tabular section number + a short uppercase label sitting on a hairline rule at the top-left of every section.",
    hero: "headline set huge and flush-left across 8 columns, a 4-column fact list (3 short facts about the store) to its right, product photo cropped square below spanning the full grid.",
    header: "a slim bar with a 1px bottom rule: wordmark hard left, nav as small uppercase links hard right.",
    motion: "rules draw in from left to right; numerals count up; nothing bounces.",
  },
  {
    id: "neo-brutal",
    name: "Neo-brutalist",
    fits: /street|gadget|sticker|snack|toy|kid|game|phone|case|merch|poster|youth|sneaker|accessor/i,
    cues: /\b(brutal|brutalist|neo-?brutal|bold borders|hard shadow|loud)\b/i,
    idea: "Neo-brutalism: thick black outlines on everything, hard offset shadows with no blur, flat loud colour blocks, chunky type, elements slightly rotated like stickers. Confident and a bit cheeky.",
    palette: "off-white or pale cream page, pure black text and borders, 2-3 flat saturated colours (e.g. a yellow, a pink, a blue — pick from the products) used as solid block fills. No gradients, no soft shadows.",
    fonts: [["Space Grotesk", "Space Grotesk"], ["Bricolage Grotesque", "DM Sans"], ["Unbounded", "Outfit"]],
    style: st("brutal", "brutal", "square", "sharp", "left", "button", "standard"),
    radius: 0, headingWeight: 800, density: 1,
    spatial: "boxed blocks with 2-3px black borders that butt against each other; some blocks are offset or rotated 1-2 degrees; sections are separated by a thick black rule, not by whitespace.",
    motif: "a rotated sticker badge (a starburst or a rounded tag with a black border and hard shadow) pinned to a corner of key blocks.",
    hero: "a two-block hero: a solid colour block with a huge headline, next to a bordered product photo with a hard shadow; a rotated sticker overlaps the seam.",
    header: "a bordered bar with a thick black bottom border; wordmark in a filled colour block at the left; nav links as small bordered tags.",
    motion: "buttons and cards shift into their shadow on hover; stickers wobble slightly on reveal.",
  },
  {
    id: "quiet-luxury",
    name: "Quiet luxury",
    fits: /luxur|premium|couture|silk|cashmere|leather|fine jewel|perfum|fragranc|bridal|designer/i,
    cues: /\b(luxury|luxurious|premium|elegant|high[- ]end|sophisticated|classy)\b/i,
    idea: "Quiet luxury: enormous calm whitespace, a thin high-contrast serif used small and confident, tiny tracked uppercase labels, photography given a whole screen to itself. Nothing shouts.",
    palette: "warm near-white page (bone / ivory), soft charcoal text, and one deep muted accent taken from the product (oxblood, forest, ink blue or tobacco). Near-monochrome.",
    fonts: [["Cormorant Garamond", "Jost"], ["Bodoni Moda", "Figtree"], ["Italiana", "Hanken Grotesk"]],
    style: st("sharp", "plain", "tall", "sharp", "center", "link", "airy", true),
    radius: 0, headingWeight: 500, density: 1.15,
    spatial: "vast air — narrow centred columns with very large vertical gaps; each image sits alone with wide margins; never more than two things side by side.",
    motif: "a tiny tracked uppercase label above a short thin rule, centred over every section title.",
    hero: "a full-height quiet hero: one tall product photo centred with wide margins, the headline small and centred beneath it, a single underlined text link.",
    header: "a tall centred header: wordmark centred in tracked caps, nav split left and right of it in small caps, no background, no border.",
    motion: "slow fades only (700ms+), images scale from 1.04 to 1 on reveal; no slides.",
  },
  {
    id: "editorial-magazine",
    name: "Editorial magazine",
    fits: /fashion|cloth|apparel|lawn|kurta|suit|dress|abaya|wear|book|magazin|coffee|food|lifestyle|beauty|home|decor/i,
    cues: /\b(editorial|magazine|journal|newspaper|print)\b/i,
    idea: "A printed magazine: big confident serif headlines, multi-column body text, drop caps, pull quotes, small italic photo captions, issue/page numbering. The store reads like a feature story about the products.",
    palette: "paper-white or newsprint cream page, true ink black text, ONE spot colour as in a printed issue (a vermilion, a cobalt, a bottle green — chosen from the products).",
    fonts: [["Playfair Display", "Source Serif 4"], ["Newsreader", "Inter"], ["DM Serif Display", "DM Sans"]],
    style: st("sharp", "line", "portrait", "sharp", "left", "link", "standard"),
    radius: 0, headingWeight: 600, density: 1,
    spatial: "an asymmetric magazine grid: a wide feature column with a narrow side column for captions and notes; text wraps in 2 columns; images break the margin on one side.",
    motif: "a folio line at the top of each section — a small italic section name, a thin rule, and a page number at the far right.",
    hero: "a cover: masthead-scale headline over two lines, a deck paragraph in a narrow column with a drop cap, and a tall cover photo bleeding off the right edge with an italic caption.",
    header: "a masthead: wordmark large and centred between two hairline rules, nav in a small-caps row beneath it.",
    motion: "text blocks rise 12px as they reveal, in reading order; images un-crop with a clip reveal.",
  },
  {
    id: "warm-artisan",
    name: "Warm artisan",
    fits: /handmade|craft|artisan|potter|ceramic|candle|soap|tea|chai|spice|masala|bak|jam|honey|pickle|achar|homemade|knit|crochet/i,
    cues: /\b(handmade|artisan|rustic|warm|cozy|cosy|homely|earthy)\b/i,
    idea: "Made by hand: soft organic shapes, arched photo frames, hand-drawn squiggle rules and little doodled marks, a warm soft serif. Feels like a maker's studio.",
    palette: "warm cream page, deep brown text, two earthy colours from the craft itself (terracotta, olive, mustard, clay, indigo) used as whole-section fills.",
    fonts: [["Fraunces", "Nunito Sans"], ["Young Serif", "Karla"], ["Gloock", "Mulish"]],
    style: st("pill", "plain", "portrait", "arch", "center", "outline", "standard"),
    radius: 18, headingWeight: 600, density: 1.05,
    spatial: "soft colour bands with wavy or curved edges between them; content in relaxed, slightly off-centre columns; images overlap the band edge.",
    motif: "a hand-drawn squiggle underline (inline SVG path) beneath one word of each heading, and arched photo frames.",
    hero: "an arched product photo on one side overlapping a coloured band, a warm serif headline on the other with one word squiggle-underlined, a pill button.",
    header: "a soft bar on the cream page: wordmark in the serif at the left with a tiny doodle mark, rounded nav links at the right.",
    motion: "squiggles draw themselves; arches rise gently; hover lifts are soft and slow.",
  },
  {
    id: "dark-cinematic",
    name: "Dark cinematic",
    fits: /perfum|fragranc|attar|watch|gaming|gamer|fitness|gym|car|auto|bike|men|leather|whisk|coffee|headphone|audio|sneaker/i,
    cues: /\b(dark|black|cinematic|moody|dramatic|night|noir)\b/i,
    idea: "A film title sequence: near-black screens, full-bleed dramatic photography, enormous condensed capitals, a single glowing accent. Each section is a scene.",
    palette: "near-black page (not pure #000 — a tinted black: warm, blue or green), off-white text, one luminous accent from the product (amber, ember red, ice blue, acid green) used sparingly like a light source.",
    fonts: [["Bebas Neue", "Inter"], ["Anton", "Manrope"], ["Oswald", "Source Sans 3"]],
    style: st("sharp", "overlay", "tall", "sharp", "left", "hover", "standard", true),
    radius: 2, headingWeight: 700, density: 1,
    spatial: "full-bleed scenes edge to edge with no gutters; sections abut; type sits over imagery on a dark scrim; some sections are a full viewport tall.",
    motif: "a thin accent-coloured line with a small tracked caption beside it, like a film subtitle or a timecode, at the bottom-left of each scene.",
    hero: "a full-viewport photo with a dark scrim, the headline in huge condensed caps at the bottom-left, a timecode-style caption line, one sharp button.",
    header: "transparent over the hero then solid tinted-black on scroll; wordmark in tracked caps left, nav in small caps right.",
    motion: "slow parallax on scene photos; headlines reveal by a clip-wipe upward; the accent line extends on scroll.",
  },
  {
    id: "pastel-soft",
    name: "Soft pastel",
    fits: /baby|kid|child|skin|beauty|cosmetic|makeup|stationer|bak|cake|sweet|gift|pet|nail|hair/i,
    cues: /\b(pastel|soft|cute|gentle|feminine|girly|sweet)\b/i,
    idea: "Soft and friendly: pastel colour bands, very large corner radii, rounded blob shapes behind products, a round friendly sans. Calm, approachable, tactile.",
    palette: "a milky off-white page with 3 pastels drawn from the products (e.g. a blush, a butter, a mint or lilac) as section fills, and one deeper tone of the main pastel for text and buttons — not black.",
    fonts: [["Quicksand", "Nunito"], ["Baloo 2", "Poppins"], ["Fredoka", "DM Sans"]],
    style: st("pill", "tile", "square", "rounded", "center", "button", "standard"),
    radius: 24, headingWeight: 600, density: 1.05,
    spatial: "rounded pastel panels floating inside the page with a gutter around them (inset cards, not edge-to-edge bands); generous padding inside each panel.",
    motif: "soft blob shapes (large border-radius ellipses in a pastel) sitting behind product photos and headings.",
    hero: "a big rounded pastel panel: headline in a round sans at the left, a product photo sitting on a blob at the right, two pill buttons.",
    header: "a floating rounded pill header inset from the top with a soft shadow; wordmark left, nav centre, cart right.",
    motion: "panels scale in softly from 0.97; blobs drift slowly; buttons squish slightly on press.",
  },
  {
    id: "retro-70s",
    name: "Retro seventies",
    fits: /vintage|retro|record|vinyl|coffee|burger|food|honey|ghee|dry fruit|ice|soda|drink|thrift|denim|t-?shirt|sunglass|candle/i,
    cues: /\b(retro|vintage|70s|seventies|groovy|nostalgi|old[- ]school)\b/i,
    idea: "Seventies print revival: chunky rounded display type, stacked stripes and sunbursts, rounded-rectangle badges, warm faded inks. Fun, nostalgic, a little loud.",
    palette: "cream page, deep brown text, and a 70s ink set — mustard, burnt orange, and one of avocado/teal/rust — used as stripes and block fills.",
    fonts: [["Shrikhand", "Work Sans"], ["Rubik", "Rubik"], ["Chango", "DM Sans"]],
    style: st("pill", "framed", "square", "rounded", "center", "button", "standard"),
    radius: 16, headingWeight: 700, density: 1,
    spatial: "bold colour-block bands, each closed with a stack of 3 coloured stripes; content centred inside rounded frames.",
    motif: "a three-stripe band (three stacked coloured bars) that runs under headings and between sections, plus a sunburst behind the hero product.",
    hero: "a centred hero: a sunburst (conic-gradient rays) behind the product photo in a rounded frame, a chunky headline above, stripes running out to both edges.",
    header: "a cream bar with the three-stripe band beneath it; wordmark in the chunky display face centred, nav in pills either side.",
    motion: "the sunburst rotates very slowly; stripes slide in from the edges; badges pop.",
  },
  {
    id: "tech-spec",
    name: "Technical spec sheet",
    fits: /electronic|gadget|phone|mobile|laptop|computer|charger|cable|accessor|tool|hardware|auto|part|camera|drone|keyboard|audio|led|solar/i,
    cues: /\b(tech|technical|spec|futuristic|engineer|modern tech|minimal tech)\b/i,
    idea: "An engineering data sheet: monospace labels, visible grid lines, spec tables, coordinates and part numbers as decoration, precise and cool. The products are presented like instruments.",
    palette: "cool very-light grey page (or graphite if the brief wants dark), near-black text, grey hairlines, one electric accent (signal orange, electric blue or lime) for key values and the primary button.",
    fonts: [["JetBrains Mono", "Inter"], ["IBM Plex Mono", "IBM Plex Sans"], ["Space Mono", "Sora"]],
    style: st("sharp", "framed", "square", "sharp", "left", "outline", "dense", true),
    radius: 2, headingWeight: 600, density: 0.95,
    spatial: "a dense ruled layout: thin grid lines divide the page into cells; content sits in cells with small monospace labels in the corners; little empty space.",
    motif: "monospace corner labels on every block — a part number top-left, a small crosshair or plus mark at the corners.",
    hero: "a split cell layout: headline in the left cell with a 3-row spec table beneath, product photo in the right cell with corner crosshairs and a part-number caption.",
    header: "a thin ruled bar: wordmark in monospace left, nav as monospace links with slashes between, a small status dot.",
    motion: "values type in character by character; grid lines draw; hover highlights a cell border in the accent.",
  },
  {
    id: "botanical-fresh",
    name: "Botanical fresh",
    fits: /skin|herbal|plant|organic|natural|honey|tea|wellness|oil|serum|soap|ayurved|hair|garden|flor|green|vegan/i,
    cues: /\b(botanical|natural|fresh|green|organic|herbal|clean beauty)\b/i,
    idea: "A botanical apothecary: deep leaf greens, fine line drawings of leaves and stems, arched frames, an airy classical serif. Fresh, clean, grown not manufactured.",
    palette: "soft ivory page, deep forest-green text, and a green family from pale sage to deep leaf, plus one warm contrast from the plant world (petal pink, turmeric or bark).",
    fonts: [["Marcellus", "Jost"], ["Cormorant", "Lato"], ["Gilda Display", "Mulish"]],
    style: st("pill", "plain", "portrait", "arch", "center", "outline", "airy"),
    radius: 14, headingWeight: 500, density: 1.1,
    spatial: "airy alternating sections — an ivory section then a deep green one; content in two unequal columns with a botanical line drawing growing in from an edge.",
    motif: "a fine single-line leaf/stem drawing (inline SVG, 1px stroke) growing in from a corner or dividing sections.",
    hero: "an arched product photo centred or offset, a light serif headline beside it, a line-drawn stem curling around the arch, an outlined pill button.",
    header: "an ivory bar with a small leaf mark beside a serif wordmark, centred; nav in small tracked caps beneath or beside.",
    motion: "line drawings draw themselves on scroll; arches fade up; nothing fast.",
  },
  {
    id: "bold-pop",
    name: "Bold colour pop",
    fits: /snack|drink|juice|candy|toy|pet|kid|sock|t-?shirt|merch|gift|party|ice|dessert|street food|sauce/i,
    cues: /\b(colou?rful|vibrant|pop|fun|playful|energetic|bright)\b/i,
    idea: "A pack of sweets: every section a different flat saturated colour, giant rounded headlines, rotated sticker badges, products floating big. Joyful and impossible to ignore.",
    palette: "4 saturated flat colours taken from the products/packaging, each used as a full section fill in turn, with text flipped to the darkest or lightest tone for contrast. The page itself is one of them, not white.",
    fonts: [["Lilita One", "Nunito Sans"], ["Bagel Fat One", "Plus Jakarta Sans"], ["Rubik", "Rubik"]],
    style: st("pill", "tile", "square", "rounded", "center", "button", "standard"),
    radius: 28, headingWeight: 800, density: 1,
    spatial: "edge-to-edge colour blocks that abut with no gap — each section its own colour, changing every time; content big and centred or hard-left, filling the block.",
    motif: "round sticker badges rotated 8-12 degrees (a short word in a circle or starburst) overlapping product photos and section seams.",
    hero: "a full-colour block with a giant rounded headline taking most of the width, the hero product floating over the seam into the next colour block, a sticker badge on it.",
    header: "a solid colour bar in the page colour; chunky wordmark left, nav as bold links, a round cart button.",
    motion: "stickers spin in; products bob slowly; section colours wipe in from the bottom.",
  },
  {
    id: "heritage-ornament",
    name: "Heritage ornament",
    fits: /ethnic|shalwar|kameez|kurta|lawn|saree|sari|lehenga|bridal|wedding|jewel|shawl|pashmina|attar|oud|mithai|sweet|handicraft|carpet|rug|khussa|embroid|henna|mehndi|abaya|hijab|unstitched|traditional/i,
    cues: /\b(traditional|heritage|desi|ethnic|royal|mughal|classic|ornate|festive)\b/i,
    idea: "Heritage craftsmanship: deep jewel tones with fine gold hairlines, ornamental frames and corner flourishes, geometric lattice (jaali) patterns, a stately classical serif. Rich, ceremonial, rooted.",
    palette: "a deep jewel page or deep jewel sections (maroon, emerald, indigo or plum — taken from the products) with ivory text, an antique gold for hairlines and ornaments, and ivory sections for contrast.",
    fonts: [["Cinzel", "EB Garamond"], ["Marcellus SC", "Crimson Pro"], ["Yeseva One", "Lora"]],
    style: st("sharp", "framed", "tall", "arch", "center", "outline", "standard", true),
    radius: 2, headingWeight: 600, density: 1.05,
    spatial: "symmetrical, framed compositions: each section sits inside a fine double-line gold frame with corner ornaments; jewel-tone and ivory sections alternate.",
    motif: "a fine double hairline frame with small corner flourishes, and a repeating geometric lattice pattern (CSS/SVG) as a low-contrast band between sections.",
    hero: "a symmetrical hero on a jewel-tone field: an arched (mihrab-shaped) product photo centred inside a gold hairline frame, headline in stately caps above, a lattice band beneath.",
    header: "a centred stately header on the jewel tone: wordmark in classical caps between two small ornaments, nav in tracked small caps beneath, a gold hairline under it.",
    motion: "frames draw in line by line; the lattice band drifts slowly; photos fade up within their arches.",
  },
  {
    id: "mono-minimal",
    name: "Monochrome minimal",
    fits: /fashion|cloth|apparel|lawn|kurta|suit|dress|abaya|wear|shoe|bag|sneaker|print|art|photo|jewel|watch|basics|denim/i,
    cues: /\b(minimal|minimalist|monochrome|black and white|simple|clean)\b/i,
    idea: "Strict monochrome: black and white only, so the product photos are the only colour on the page. Small precise type, a tight product-first grid, zero ornament. A fashion lookbook index.",
    palette: "pure white page, pure black text, one mid grey for secondary text and hairlines. NO accent hue at all — the accent token is black.",
    fonts: [["Inter Tight", "Inter Tight"], ["Hanken Grotesk", "Hanken Grotesk"], ["Manrope", "Manrope"]],
    style: st("sharp", "plain", "portrait", "sharp", "left", "link", "dense", true),
    radius: 0, headingWeight: 500, density: 0.95,
    spatial: "tight and product-first: edge-to-edge image grids with hairline gaps, small type tucked into corners, very little vertical padding between sections.",
    motif: "small uppercase index text in the corners of images and sections (a number, a category, a count) — type as a quiet label, never as a headline.",
    hero: "a split-screen of two tall product photos edge to edge with no gap, a small uppercase headline and link tucked in the bottom-left corner over the image.",
    header: "a minimal white bar with no border: small uppercase wordmark left, small uppercase nav right, lots of space.",
    motion: "almost none — quick 150ms opacity changes on hover, images swap on hover.",
  },
  {
    id: "sport-energy",
    name: "Sport energy",
    fits: /sport|gym|fitness|supplement|protein|cricket|football|run|bike|cycl|athlet|active|shoe|sneaker|outdoor|energy/i,
    cues: /\b(sport|sporty|athletic|energetic|dynamic|aggressive|power)\b/i,
    idea: "Matchday energy: slanted diagonal cuts between sections, heavy italic condensed capitals, speed stripes, black with one neon. Everything leans forward.",
    palette: "black and white with one high-energy neon from the brand (volt yellow, signal red, electric blue or hot orange) used as full diagonal fills and highlights.",
    fonts: [["Barlow Condensed", "Barlow"], ["Saira Condensed", "Saira"], ["Big Shoulders Display", "Inter"]],
    style: st("sharp", "overlay", "portrait", "sharp", "left", "button", "standard", true),
    radius: 0, headingWeight: 800, density: 1,
    spatial: "sections cut on a diagonal (clip-path slants) so each one leans into the next; full-bleed, high contrast, black and neon alternating.",
    motif: "a set of three slanted speed stripes, and italic skewed labels (transform: skewX) on tags and numbers.",
    hero: "a full-bleed action photo with a diagonal neon slab cutting across the bottom, the headline in huge italic condensed caps on the slab, a sharp button.",
    header: "a black bar with a slanted neon edge; italic condensed wordmark left, uppercase nav right.",
    motion: "slabs slide in along their diagonal; numbers count up fast; stripes streak past on scroll.",
  },
  {
    id: "doodle-play",
    name: "Hand-drawn doodle",
    fits: /kid|toy|craft|gift|bak|cake|cookie|pet|stationer|sticker|art supply|party|school|handmade/i,
    cues: /\b(hand[- ]drawn|doodle|sketch|whimsical|quirky|childlike)\b/i,
    idea: "A sketchbook page: wobbly hand-drawn outlines, marker underlines, arrows and little doodles pointing at things, photos pinned like prints. Personal and charming.",
    palette: "off-white paper page, soft black ink text, 3 crayon/marker colours from the products used as scribbled highlights and fills.",
    fonts: [["Caveat Brush", "Nunito"], ["Patrick Hand", "Poppins"], ["Chewy", "Quicksand"]],
    style: st("pill", "polaroid", "square", "sharp", "center", "button", "standard"),
    radius: 16, headingWeight: 600, density: 1.05,
    spatial: "a loose scrapbook: elements slightly rotated and overlapping, uneven but balanced; sections separated by a hand-drawn wavy line rather than a straight edge.",
    motif: "hand-drawn arrows and scribbles (inline SVG with wobbly paths) pointing at products and buttons, and marker-highlight swipes behind key words.",
    hero: "a pinned photo print tilted a few degrees with tape at the corner, a handwritten-style headline with a marker swipe behind one word, a doodled arrow pointing to the button.",
    header: "a paper bar with a wavy hand-drawn bottom edge; handwritten wordmark left, nav in the body font right.",
    motion: "doodles draw themselves; prints straighten on hover; highlights swipe in.",
  },
  {
    id: "glass-aurora",
    name: "Glass aurora",
    fits: /tech|gadget|phone|gaming|perfum|beauty device|skincare|app|digital|smart|led|light|vape|audio/i,
    cues: /\b(glass|glassmorphism|gradient|aurora|futuristic|neon|glow)\b/i,
    idea: "Frosted glass over an aurora: a deep background with large blurred colour glows, frosted translucent panels with thin luminous borders, crisp geometric type. Sleek and weightless.",
    palette: "a deep page (midnight navy, deep violet or deep teal) with 2-3 large blurred glow colours from the product, near-white text, panels as translucent white (8-14% white with backdrop blur) and a 1px lighter border.",
    fonts: [["Sora", "Inter"], ["Outfit", "Outfit"], ["Urbanist", "Manrope"]],
    style: st("pill", "tile", "square", "rounded", "left", "hover", "standard"),
    radius: 20, headingWeight: 600, density: 1,
    spatial: "floating frosted panels over one continuous aurora background that runs the whole page; panels overlap the glows; sections flow into each other with no hard edges.",
    motif: "large blurred radial glows drifting behind content, and a 1px luminous gradient border on every panel.",
    hero: "a tall hero on the aurora: headline with a soft gradient across the text, a frosted panel holding the product photo that floats and tilts slightly, a glowing pill button.",
    header: "a floating frosted pill header inset from the top with a luminous hairline border; wordmark left, nav centre.",
    motion: "glows drift slowly; panels float with gentle parallax; borders shimmer on hover.",
  },
  {
    id: "bazaar-dense",
    name: "Lively bazaar",
    fits: /grocer|general|wholesale|mart|store|deal|discount|mobile accessor|household|kitchen|plastic|crockery|kiryana|super|variety|bundle|cheap|budget/i,
    cues: /\b(marketplace|bazaar|deals|discount|busy|dense|lots of products|bargain)\b/i,
    idea: "A lively bazaar: dense and energetic, price tags and deal badges everywhere, a scrolling ticker, bold primary colours, lots of product visible at once. Built for browsing and bargain-hunting.",
    palette: "white page with strong primary colours — a red or orange for deals, a deep blue or green as the brand colour, a yellow for tags — and near-black text. Bright and legible.",
    fonts: [["Poppins", "Poppins"], ["Mukta", "Mukta"], ["Rubik", "Rubik"]],
    style: st("soft", "framed", "square", "rounded", "left", "button", "dense"),
    radius: 8, headingWeight: 700, density: 0.92,
    spatial: "tight and dense — small gutters, multi-column tile grids, coloured header strips above each product group; little empty space, lots to scan.",
    motif: "price-tag shapes (a rectangle with a notched corner and a hole) and bold starburst deal badges on products and section headers.",
    hero: "a banner grid, not one big hero: a wide deal banner on the left and two stacked smaller offer tiles on the right, each a different bright colour with a tag-shaped label.",
    header: "a two-row header: a coloured top strip with a scrolling ticker of store facts, then a white bar with wordmark left and a prominent search-style nav row.",
    motion: "the ticker scrolls; deal badges pulse once; tiles lift on hover.",
  },
  {
    id: "gallery-white",
    name: "Gallery wall",
    fits: /art|print|paint|decor|furnitur|ceramic|photo|frame|sculpt|jewel|lamp|rug|vase|calligraph/i,
    cues: /\b(gallery|museum|exhibition|art|curated)\b/i,
    idea: "An exhibition: white walls, each product hung alone like a work with a small museum caption (title, material, price), numbered works, serif italics. Reverent and curated.",
    palette: "gallery white page, soft black text, a warm grey for captions, and one restrained accent only for links (a deep blue or a red dot like a sold sticker).",
    fonts: [["Instrument Serif", "Inter"], ["Libre Caslon Text", "Work Sans"], ["Gilda Display", "Karla"]],
    style: st("outline", "plain", "tall", "sharp", "left", "link", "airy"),
    radius: 0, headingWeight: 400, density: 1.2,
    spatial: "wide margins and irregular hanging — images at different sizes and heights like a salon wall, each with space around it and a small caption below-left.",
    motif: "a museum caption block: a work number, an italic title, a line of small grey details — set beneath every image.",
    hero: "one large product photo hung off-centre on a white wall with its museum caption, and a quiet serif-italic headline in the opposite corner — mostly empty space.",
    header: "a nearly invisible header: small serif-italic wordmark left, small nav right, no line.",
    motion: "images fade in one at a time as if lit; captions follow 150ms later.",
  },
  {
    id: "earth-grain",
    name: "Earth and grain",
    fits: /organic|honey|ghee|dry fruit|nut|date|khajoor|grain|flour|atta|rice|oil|farm|desi|natural food|spice|masala|salt|herb/i,
    cues: /\b(earthy|organic|farm|rustic|natural|wholesome|village)\b/i,
    idea: "Straight from the land: clay, sand and moss tones, rough torn-paper edges, stamped labels like a sack or crate, a sturdy humanist type. Honest and unpolished.",
    palette: "sand or kraft-paper page, dark soil-brown text, clay red and moss green as fills, and a cream for labels. Slightly desaturated, like natural dyes.",
    fonts: [["Alegreya Sans", "Alegreya Sans"], ["Bitter", "Karla"], ["Zilla Slab", "Source Sans 3"]],
    style: st("soft", "tile", "landscape", "rounded", "left", "button", "standard"),
    radius: 6, headingWeight: 700, density: 1,
    spatial: "stacked earthy bands with rough, uneven edges (clip-path torn edges) between them; content in sturdy two-column blocks.",
    motif: "a stamped label — an uppercase word inside a rough rectangular or circular stamp outline, rotated slightly, like ink on a sack.",
    hero: "a wide landscape product photo with a torn-paper edge along the bottom, a sturdy headline over a sand band beneath, a stamped label overlapping the photo corner.",
    header: "a kraft-coloured bar with a rough bottom edge; stamped wordmark left, plain nav right.",
    motion: "stamps press in (scale 1.15 to 1 with a quick fade); bands rise; nothing glossy.",
  },
  {
    id: "art-deco",
    name: "Art deco",
    fits: /jewel|perfum|watch|bridal|chocolate|gift|hotel|cosmetic|gold|silver|ring|crystal|luxury/i,
    cues: /\b(art deco|deco|gatsby|1920s|glamorous|glam|gold)\b/i,
    idea: "Jazz-age glamour: stepped geometric frames, fan and sunburst shapes, tall elegant capitals, fine metallic lines on a deep field. Symmetrical, theatrical, precise.",
    palette: "a deep field (black, emerald, navy or burgundy — from the products) with fine champagne-gold lines and ivory text; ivory sections for relief.",
    fonts: [["Poiret One", "Josefin Sans"], ["Limelight", "Raleway"], ["Federo", "Lato"]],
    style: st("sharp", "framed", "tall", "arch", "center", "outline", "standard", true),
    radius: 0, headingWeight: 500, density: 1.05,
    spatial: "strict vertical symmetry — every section mirrored around a centre axis, framed by stepped gold lines; tall narrow proportions.",
    motif: "a stepped (ziggurat) frame corner and a fan/sunburst of fine gold lines radiating behind headings and products.",
    hero: "a centred hero on the deep field: a fan of fine gold lines radiating from behind an arched product photo, the headline in tall tracked capitals above, stepped frame corners.",
    header: "a centred deco header: wordmark in tall tracked caps between two small fan ornaments, nav in spaced small caps beneath, a double gold line under it.",
    motion: "the fan lines radiate out on load; frames step in corner by corner.",
  },
  {
    id: "y2k-gloss",
    name: "Y2K gloss",
    fits: /cosmetic|makeup|lip|nail|phone case|accessor|jewel|hair|gen ?z|teen|girl|bag|sunglass|press-?on|lash/i,
    cues: /\b(y2k|glossy|chrome|2000s|baddie|trendy|aesthetic)\b/i,
    idea: "Y2K gloss: shiny gradients, chrome-effect headlines, sparkles and four-point stars, bubbly pill shapes, sticker-book layering. Glossy, flirty, very online.",
    palette: "an icy light page with glossy gradients — hot pink into lilac, or ice blue into silver, picked from the products — plus chrome/silver for headline fills and a deep purple or black for text.",
    fonts: [["Syne", "Outfit"], ["Unbounded", "DM Sans"], ["Climate Crisis", "Plus Jakarta Sans"]],
    style: st("pill", "tile", "square", "rounded", "center", "button", "standard"),
    radius: 26, headingWeight: 800, density: 1,
    spatial: "layered and bubbly: rounded gradient panels overlapping each other, sparkles scattered in the gaps, content centred in glossy capsules.",
    motif: "four-point sparkle stars (inline SVG) in several sizes, and a glossy highlight streak across the top of pills and panels.",
    hero: "a glossy gradient capsule filling the hero with a chrome-gradient headline, the product floating with sparkles around it, a shiny pill button with a highlight streak.",
    header: "a glossy pill header with a gradient border; bubbly wordmark left, nav in small pills.",
    motion: "sparkles twinkle; panels bounce in softly; a shine sweeps across buttons on hover.",
  },
  {
    id: "cottage-floral",
    name: "Cottage floral",
    fits: /bak|cake|flor|flower|bouquet|candle|homemade|baby|modest|scarf|hijab|lawn|kurta|shawl|tea|linen|bedding|cushion|crochet|gift|soap/i,
    cues: /\b(floral|cottage|romantic|vintage floral|shabby|delicate|pretty)\b/i,
    idea: "A country cottage: scalloped edges, gingham and small floral patterns, cream and blush, a romantic serif with a script accent. Gentle, nostalgic, hand-wrapped.",
    palette: "cream page, warm brown-grey text, blush pink and sage green as fills, a soft butter yellow for small accents. Low saturation, like faded fabric.",
    fonts: [["Playfair Display", "Lora"], ["Cormorant Infant", "Nunito Sans"], ["Libre Baskerville", "Mulish"]],
    style: st("pill", "framed", "portrait", "rounded", "center", "outline", "standard"),
    radius: 14, headingWeight: 500, density: 1.05,
    spatial: "gentle bands with scalloped edges (repeating radial-gradient scallops) between them; content centred in rounded frames with a patterned border.",
    motif: "a scalloped edge on sections and cards, and a gingham or tiny-dot pattern (CSS gradients) as an accent band or frame.",
    hero: "a centred hero in a scalloped frame: a rounded product photo, a romantic serif headline with one word in a script accent font, a soft pill button, a gingham strip beneath.",
    header: "a cream bar with a scalloped bottom edge; serif wordmark centred with a tiny flower mark, nav either side.",
    motion: "frames fade up softly; scallops slide in; hover adds a gentle tilt.",
  },
  {
    id: "industrial-raw",
    name: "Industrial raw",
    fits: /hardware|tool|auto|car|bike|part|workwear|boot|outdoor|camp|construction|steel|machine|garage|paint|electric|sanitary|safety/i,
    cues: /\b(industrial|rugged|raw|heavy[- ]duty|tough|workshop|garage)\b/i,
    idea: "A workshop floor: concrete greys, hazard stripes, stencil capitals, bolt heads and crosshair marks, heavy rules. Tough, practical, built to be used.",
    palette: "concrete grey page or charcoal sections, near-black text, a safety colour (hazard yellow or safety orange) for stripes, labels and the primary button, and steel grey for rules.",
    fonts: [["Chakra Petch", "Inter"], ["Saira Stencil One", "Saira"], ["Oswald", "Roboto"]],
    style: st("sharp", "brutal", "square", "sharp", "left", "button", "dense", true),
    radius: 0, headingWeight: 700, density: 0.95,
    spatial: "heavy boxed panels separated by thick rules and hazard-stripe bands; dense, grid-aligned, no decorative whitespace.",
    motif: "a diagonal hazard-stripe band (repeating-linear-gradient in the safety colour and black) and small bolt-head circles in panel corners.",
    hero: "a charcoal hero with a stencil-caps headline, a hazard-stripe band across the bottom edge, product photo in a heavy bordered panel with bolt corners.",
    header: "a charcoal bar with a hazard-stripe line beneath; stencil wordmark left, uppercase nav right.",
    motion: "panels slam in fast (120ms) with a tiny shake; stripes slide; nothing soft.",
  },
  {
    id: "japandi-calm",
    name: "Japandi calm",
    fits: /tea|ceramic|homeware|home|skin|stationer|furnitur|incense|candle|linen|wood|bamboo|matcha|minimal|decor/i,
    cues: /\b(japandi|japanese|zen|calm|serene|scandinavian|scandi|wabi)\b/i,
    idea: "Japandi stillness: asymmetric whitespace, small quiet type, vertical text accents, thin lines, natural materials. Every element placed with intent; emptiness is part of the layout.",
    palette: "soft off-white (rice paper) page, charcoal text, a muted clay or indigo accent, and a warm grey-beige for panels. Very low contrast between surfaces.",
    fonts: [["Shippori Mincho", "Zen Kaku Gothic New"], ["Cormorant", "Jost"], ["Noto Serif Display", "Figtree"]],
    style: st("outline", "plain", "portrait", "sharp", "left", "link", "airy"),
    radius: 2, headingWeight: 500, density: 1.2,
    spatial: "deliberately asymmetric — content pushed to one third of the width with the rest left empty; images off-centre; vertical rhythm slow with very large gaps.",
    motif: "a vertical line of small text (writing-mode: vertical-rl) running down one edge of sections, and a single small filled circle as a mark.",
    hero: "an asymmetric hero: a portrait product photo in the right two-fifths, a small quiet headline low on the left with lots of empty space above it, a vertical text label on the far edge.",
    header: "a thin quiet header: small wordmark left, nav in small light type right, generous padding, no border.",
    motion: "very slow fades and 8px drifts; the circle mark moves down the page with scroll.",
  },
  {
    id: "street-poster",
    name: "Street poster",
    fits: /street|sneaker|skate|music|band|hoodie|t-?shirt|cap|urban|graffiti|merch|tattoo|vinyl|drop/i,
    cues: /\b(streetwear|poster|zine|grunge|urban|edgy|underground|hype)\b/i,
    idea: "A wall of gig posters: giant type cropped off the edge of the screen, halftone photo treatments, tape and torn-sticker elements, black with one loud ink. Raw, collaged, deliberate chaos.",
    palette: "black and off-white with ONE loud ink colour (safety orange, acid green, hot red or electric blue — from the brand) used for whole poster blocks and highlights.",
    fonts: [["Archivo Black", "Archivo"], ["Anton", "Inter"], ["Rubik Mono One", "Space Grotesk"]],
    style: st("sharp", "overlay", "portrait", "sharp", "left", "button", "standard", true),
    radius: 0, headingWeight: 900, density: 1,
    spatial: "collage — blocks overlap and bleed off the edges; type runs larger than the viewport and is cropped; sections collide rather than stack neatly.",
    motif: "strips of tape (semi-transparent rotated rectangles) holding photos, and oversized cropped words running behind content as texture.",
    hero: "a poster hero: one word set so large it is cropped by the screen edges, a product photo taped over it at an angle, small utilitarian details (date, drop number) in a corner.",
    header: "a black bar with a marquee strip of repeated words beneath; heavy wordmark left, uppercase nav right.",
    motion: "the marquee runs; taped photos swing slightly on reveal; big type slides sideways with scroll.",
  },
  {
    id: "clinic-clean",
    name: "Clinical clean",
    fits: /pharma|medic|supplement|vitamin|skin|derma|dental|health|care|hygien|baby care|sanit|clinic|serum|sunscreen/i,
    cues: /\b(clinical|medical|scientific|trustworthy|professional|pharmacy)\b/i,
    idea: "Clinical clarity: bright white, calm cool tints, ingredient and fact tables, fine line icons, rounded cards. Trust through precision and plain statements.",
    palette: "pure white page, deep navy or deep teal text, one cool tint (ice blue, mint or soft aqua) as panel fills, and a single confident accent for buttons.",
    fonts: [["Plus Jakarta Sans", "Plus Jakarta Sans"], ["Onest", "Onest"], ["Figtree", "Figtree"]],
    style: st("soft", "tile", "square", "rounded", "left", "button", "standard"),
    radius: 12, headingWeight: 600, density: 1,
    spatial: "clean contained panels on white — tinted rounded cards in an ordered grid, fact tables and labelled rows, consistent gutters.",
    motif: "a labelled fact row — a fine line icon, a short label and a value — repeated as tables and chips throughout.",
    hero: "a calm split hero: a plain-statement headline with three labelled fact chips beneath, product photo on a tinted rounded panel at the right.",
    header: "a clean white bar with a soft bottom shadow; wordmark left, nav centre, a filled cart button right.",
    motion: "cards fade up in order; fact values count up; nothing playful.",
  },
];

/** Directions that suit any kind of shop — used to widen the choice when few niche matches exist. */
const GENERAL = ["swiss-grid", "editorial-magazine", "mono-minimal", "warm-artisan", "retro-70s", "japandi-calm", "gallery-white", "bold-pop", "neo-brutal", "pastel-soft"];

export function getDirection(id: string | undefined | null): DesignDirection | undefined {
  return id ? DIRECTIONS.find((d) => d.id === id) : undefined;
}

export interface PickedDirection {
  direction: DesignDirection;
  fonts: [string, string];
  /** true when the brief is detailed enough that the direction should only fill gaps */
  soft: boolean;
}

/**
 * Choose a direction for one build. Order of preference: a style the brief asks for outright → the
 * niche's matching directions → anything. Directions in `avoid` (what this store had before) are
 * skipped whenever something else is available, so "rebuild" always changes the look.
 */
export function pickDirection(
  niche: string,
  brief: string,
  avoid: string[] = [],
  rng: () => number = Math.random,
): PickedDirection {
  const text = `${niche} ${brief}`;
  const notAvoided = (list: DesignDirection[]) => {
    const kept = list.filter((d) => !avoid.includes(d.id));
    return kept.length ? kept : list;
  };
  // A style word only counts when the seller is talking about the LOOK ("a dark, moody feel",
  // "make the design minimal") — "desi ghee", "power banks" and "glow serum" are products, not styles.
  const LOOK = "look|looks|looking|style|styled|design|designed|feel|feels|theme|vibe|aesthetic|mood|website|site|store";
  const cued = DIRECTIONS.filter((d) => {
    const c = d.cues.source;
    return (
      new RegExp(`${c}[^.!?\\n]{0,30}\\b(?:${LOOK})\\b`, "i").test(brief) ||
      new RegExp(`\\b(?:${LOOK})\\b[^.!?\\n]{0,30}${c}`, "i").test(brief)
    );
  });
  // match at a word start only, so "men" never matches "women" and "car" never matches "skincare"
  const fitted = DIRECTIONS.filter((d) => d.fits && new RegExp(`\\b(?:${d.fits.source})`, "i").test(text));
  let pool: DesignDirection[];
  if (cued.length) pool = notAvoided(cued);
  else if (fitted.length >= 3) pool = notAvoided(fitted);
  else {
    // too few niche matches to give real variety — widen with the directions that suit any shop
    // (never a niche-specific one like sport or industrial), niche matches weighted triple
    const general = DIRECTIONS.filter((d) => GENERAL.includes(d.id) && !fitted.includes(d));
    pool = notAvoided([...fitted, ...fitted, ...fitted, ...general]);
  }
  const direction = pool[Math.floor(rng() * pool.length) % pool.length];
  const fonts = direction.fonts[Math.floor(rng() * direction.fonts.length) % direction.fonts.length];
  // A brief that already pins colours / fonts / many specifics is the seller's own art direction.
  const soft = /#[0-9a-f]{6}\b/i.test(brief) || brief.length > 1200;
  return { direction, fonts, soft };
}

/** The block handed to the store planner. */
export function directionPrompt(p: PickedDirection): string {
  const d = p.direction;
  const lead = p.soft
    ? `SUGGESTED ART DIRECTION — "${d.name}". The seller's brief is detailed, so THEIR specifics come first; use this direction only for everything the brief leaves open.`
    : `ASSIGNED ART DIRECTION — "${d.name}". Every Orbit store is given a different direction so no two look alike. Build THIS store to it — adapted to this brand's products and personality, not copied generically. Anything the seller explicitly asked for in the brief (a colour, a font, a mood, a layout) overrides the matching line below.`;
  return `${lead}
- The idea: ${d.idea}
- Palette logic: ${d.palette} Choose the actual hex values yourself to suit THIS brand; make sure text reads clearly on every fill.
- Fonts: heading "${p.fonts[0]}", body "${p.fonts[1]}" (Google Fonts) — unless the brief names fonts.
- tokens.style (the shape of product cards + buttons the platform draws): ${JSON.stringify(d.style)} · radius ${d.radius} · headingWeight ${d.headingWeight} · density ${d.density}
- spatialSystem: ${d.spatial}
- Signature motif (recurs on every page): ${d.motif}
- Home hero: ${d.hero}
- headerBrief: ${d.header}
- Motion: ${d.motion}
Write concept + designDna so they carry this direction in concrete terms (sizes, colours by name, the motif, the shapes) — the section builders only see what you write there.`;
}
