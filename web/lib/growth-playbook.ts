import type { BusinessSnapshot } from "@/lib/strategy-lab";

/**
 * Growth playbook — proven patterns for small online stores in Pakistan (COD-first, WhatsApp-led,
 * trust-poor market). Given to the planner as IDEAS TO ADAPT, never to copy: the planner still has
 * to invent the specific version for this business. The planner gets only the plays that fit the
 * store's stage and niche, so the prompt stays small.
 *
 * These are field patterns, not Orbit's own measured results — those come from lib/growth-learning.
 */

export type Stage = "zero" | "first_sales" | "growing" | "scaling";
export type Niche = "food" | "health" | "beauty" | "fashion" | "home" | "gifts" | "electronics" | "kids" | "any";

type Play = { id: string; stages: Stage[]; niches: Niche[]; lever: string; play: string; why: string };

const PLAYS: Play[] = [
  // --- trust: the #1 blocker for a new COD store in Pakistan ---
  { id: "trust-proof", stages: ["zero", "first_sales"], niches: ["any"], lever: "trust", play: "Show real proof on the store: real photos/video of the product being packed, the owner's face and name, city, WhatsApp number, and 'check before you pay' / easy-return promise.", why: "Pakistani buyers fear fake products and ghost sellers more than price; visible humans and a return promise convert first-time visitors." },
  { id: "cod-confirm", stages: ["first_sales", "growing", "scaling"], niches: ["any"], lever: "operations", play: "Confirm every COD order on WhatsApp within an hour (Orbit's COD confirmation) and cancel silent ones before booking the courier.", why: "Unconfirmed COD orders are where most returns (RTO) and courier losses come from." },
  { id: "unboxing-note", stages: ["zero", "first_sales", "growing"], niches: ["any"], lever: "word_of_mouth", play: "Put a handwritten-style thank-you card with a small surprise (sample, sticker, recipe card) and a personal code to share with one friend.", why: "Unexpected touches get photographed and shared; a friend code makes the sharing measurable." },
  // --- first customers ---
  { id: "circle-50", stages: ["zero"], niches: ["any"], lever: "word_of_mouth", play: "Founders' circle: hand-pick 20-50 people from the owner's own network, give them the product at cost or a trial pack, and ask for an honest voice note/video review in return.", why: "At zero orders, paid ads burn cash with no proof; the first reviews and orders come from people who trust the owner." },
  { id: "whatsapp-status", stages: ["zero", "first_sales"], niches: ["any"], lever: "content", play: "A daily WhatsApp Status routine from the owner's own number: behind-the-scenes, one product, one customer reaction, one limited offer.", why: "WhatsApp is where Pakistani buyers already are; Status reaches every saved contact for free." },
  { id: "community-groups", stages: ["zero", "first_sales"], niches: ["food", "health", "beauty", "kids", "home"], lever: "partnership", play: "Offer a group-only deal or free samples to 3-5 active local Facebook / WhatsApp community groups (mothers', society, university, city food groups) through the group admin.", why: "Admins' endorsement borrows years of trust; group buyers also refer each other." },
  { id: "micro-creators", stages: ["first_sales", "growing"], niches: ["any"], lever: "partnership", play: "Send the product to 5-10 small local creators (2k-30k followers) for honest reels with their own code, instead of one big influencer.", why: "Small creators are cheaper, more trusted, and each code shows who actually sells." },
  // --- offers that protect margin ---
  { id: "bundle-ladder", stages: ["first_sales", "growing", "scaling"], niches: ["any"], lever: "offer", play: "Build a 'good / better / best' bundle ladder (single, family pack, gift box) priced so the middle one is the obvious choice.", why: "Raises average order value without discounting single items — and delivery cost is spread over more product." },
  { id: "free-delivery-threshold", stages: ["first_sales", "growing"], niches: ["any"], lever: "offer", play: "Set free delivery just above the current average order (about 20-30% above) and show 'Rs X away from free delivery' in the cart.", why: "Pushes basket size up; delivery is the fee Pakistani buyers resent most." },
  { id: "limited-drop", stages: ["first_sales", "growing", "scaling"], niches: ["food", "fashion", "beauty", "gifts"], lever: "offer", play: "A small limited batch (a flavour, colour or gift edition) announced 3 days ahead with a countdown and a waiting list.", why: "Scarcity plus a waiting list gives a reason to buy now and a list to message later." },
  // --- niche-specific ---
  { id: "health-education", stages: ["zero", "first_sales", "growing"], niches: ["health"], lever: "content", play: "Educate, never promise cures: short content on how to use the product, ingredients and origin, with 'ask your doctor for any condition'. Collect real testimonials about experience, not medical results.", why: "Herbal/health buyers need knowledge and trust; cure claims break Meta ad rules and destroy credibility." },
  { id: "health-subscription", stages: ["growing", "scaling"], niches: ["health", "beauty", "food"], lever: "retention", play: "A refill reminder: message customers on WhatsApp shortly before a pack usually runs out, with their usual order ready to confirm.", why: "Consumables are re-bought on a cycle; reminding at the right time wins the repeat order before a competitor does." },
  { id: "food-sampling", stages: ["zero", "first_sales"], niches: ["food"], lever: "partnership", play: "Sampling where the buyer is: office pantries, gyms, school events, weekend bazaars — with a QR/WhatsApp code on each sample.", why: "Taste sells food; a code turns a free sample into a trackable order." },
  { id: "gift-season", stages: ["first_sales", "growing", "scaling"], niches: ["food", "gifts", "beauty", "fashion", "health"], lever: "offer", play: "Gift boxes with a message card and delivery-date choice for Eid, weddings, Mother's Day and office gifting, promoted 2-3 weeks before the date.", why: "Gifting buyers pay more, care less about discounts and order in bulk." },
  { id: "fashion-size-trust", stages: ["zero", "first_sales", "growing"], niches: ["fashion", "kids"], lever: "operations", play: "Size guide with real measurements on real bodies, and an easy exchange (not refund) promise.", why: "Wrong size is the top reason for fashion returns and the top fear before ordering." },
  { id: "b2b-retail", stages: ["first_sales", "growing"], niches: ["food", "health", "beauty", "home"], lever: "partnership", play: "A small retailer starter pack (mixed case, trade price) pitched to 10-15 nearby shops, pharmacies or cafés.", why: "One retailer can equal dozens of online orders and puts the brand in front of offline buyers." },
  // --- retention / scaling ---
  { id: "second-order", stages: ["growing", "scaling"], niches: ["any"], lever: "retention", play: "A second-order offer sent with the first delivery (valid 30 days, only for that customer).", why: "The second order is the hardest; after it, customers usually stay." },
  { id: "referral-both", stages: ["growing", "scaling"], niches: ["any"], lever: "word_of_mouth", play: "Give-and-get referral: the friend gets a first-order gift, the customer gets credit only after the friend's order is delivered.", why: "Paying on delivery (not on sign-up) blocks fake referrals in a COD market." },
  { id: "rto-cities", stages: ["growing", "scaling"], niches: ["any"], lever: "operations", play: "Find the cities/areas with the most returned COD parcels and ask for advance delivery fee or confirmation calls only there.", why: "Returns cost two-way delivery; fixing the worst areas protects profit without hurting good cities." },
  { id: "paid-proof-first", stages: ["growing", "scaling"], niches: ["any"], lever: "ads", play: "Only run ads on the product that already sells organically, using real customer reviews as the creative, with a small daily budget and a Purchase-optimised pixel.", why: "Ads scale what works; they rarely create demand for an unproven product." },
];

const NICHE_WORDS: [Niche, RegExp][] = [
  ["health", /herbal|health|supplement|natural remed|ayurved|hakeem|honey|oil|wellness|vitamin|organic/i],
  ["food", /food|snack|spice|masala|sweet|bakery|tea|coffee|chips|corn|nuts|dry fruit|pickle|achar|chocolate/i],
  ["beauty", /beauty|skin|cosmetic|makeup|hair|perfume|fragrance|care/i],
  ["fashion", /fashion|cloth|dress|shoe|lawn|kurta|abaya|wear|jewel|bag/i],
  ["home", /home|kitchen|decor|furniture|bed|clean/i],
  ["gifts", /gift|hamper|flower|box/i],
  ["electronics", /electronic|gadget|mobile|phone|accessor|charger/i],
  ["kids", /kid|baby|toy|child/i],
];

export function nichesOf(niche: string, productNames: string[]): Niche[] {
  const text = `${niche} ${productNames.join(" ")}`;
  const found = NICHE_WORDS.filter(([, re]) => re.test(text)).map(([n]) => n);
  return found.length ? found : ["any"];
}

export function stageOf(s: Pick<BusinessSnapshot, "allTimeOrders" | "last30">): Stage {
  if (s.allTimeOrders === 0) return "zero";
  if (s.allTimeOrders < 30) return "first_sales";
  if (s.last30.orders < 150) return "growing";
  return "scaling";
}

/** The plays that fit this store, as a prompt block. */
export function playbookFor(s: BusinessSnapshot): { stage: Stage; niches: Niche[]; text: string } {
  const stage = stageOf(s);
  const niches = nichesOf(s.niche, s.products.map((p) => p.name));
  const plays = PLAYS.filter((p) => p.stages.includes(stage) && (p.niches.includes("any") || p.niches.some((n) => niches.includes(n))));
  const text = `PLAYBOOK — FOUNDATION CHECKLIST ONLY. Proven basics for small online stores in Pakistan at this stage (${stage.replace("_", " ")}) and niche (${niches.join(", ")}). Put the ones this store is missing into the single "Foundation" strategy. Do NOT turn any of these into a strategy of its own — they are the floor, not the plan:
${plays.map((p) => `- [${p.lever}] ${p.play} — ${p.why}`).join("\n")}`;
  return { stage, niches, text };
}
