import { prisma } from "@/lib/prisma";
import { money } from "@/lib/money";
import { totalStock } from "@/lib/variants";
import { replyLanguage } from "@/lib/chatbot";

/**
 * Daily store check ("Observe"). Every morning Orbit looks at the store's real data, finds the few
 * things worth doing today, ranks them by likely impact, and posts them in the Orchestrator chat.
 * Each task carries a ready instruction: pressing "Prepare it" sends that instruction to the
 * Orchestrator, which drafts the fix as a normal proposal the owner Applies. Nothing here changes
 * the store by itself, and every number in a task comes from the database — never estimated.
 */

export type Lang = "en" | "ur";

export interface BriefingTask {
  id: string; // stable per kind + subject, so a skipped task isn't repeated for a while
  kind: string;
  impact: number; // 0-100, higher first
  title: string;
  why: string;
  /** sent to the Orchestrator when the owner presses Prepare */
  prompt: string;
  /** a dashboard page where the owner can do it by hand */
  href?: string;
  state?: "open" | "done" | "skipped";
}

export interface Occasion {
  id: string;
  name: string;
  nameUr: string;
  date: string; // YYYY-MM-DD (Islamic dates are approximate, moon-dependent)
  approx?: boolean;
}

/** Pakistan selling calendar. Islamic dates are expected dates and can move a day either way. */
export const OCCASIONS: Occasion[] = [
  { id: "black-friday-2026", name: "Black Friday", nameUr: "Black Friday", date: "2026-11-27" },
  { id: "12-12-2026", name: "12.12 sale day", nameUr: "12.12 sale", date: "2026-12-12" },
  { id: "new-year-2027", name: "New Year", nameUr: "Naya saal", date: "2026-12-31" },
  { id: "valentines-2027", name: "Valentine's Day", nameUr: "Valentine's Day", date: "2027-02-14" },
  { id: "ramadan-2027", name: "Ramadan", nameUr: "Ramzan", date: "2027-02-08", approx: true },
  { id: "summer-lawn-2027", name: "summer lawn season", nameUr: "summer lawn season", date: "2027-03-01" },
  { id: "eid-ul-fitr-2027", name: "Eid ul Fitr", nameUr: "Eid ul Fitr (Choti Eid)", date: "2027-03-10", approx: true },
  { id: "mothers-day-2027", name: "Mother's Day", nameUr: "Mother's Day", date: "2027-05-09" },
  { id: "eid-ul-adha-2027", name: "Eid ul Adha", nameUr: "Eid ul Adha (Bari Eid)", date: "2027-05-17", approx: true },
  { id: "fathers-day-2027", name: "Father's Day", nameUr: "Father's Day", date: "2027-06-20" },
  { id: "independence-2027", name: "Independence Day (14 August)", nameUr: "14 August", date: "2027-08-14" },
  { id: "winter-2027", name: "winter season", nameUr: "sardi ka season", date: "2027-10-15" },
  { id: "wedding-2027", name: "wedding season", nameUr: "shaadiyon ka season", date: "2027-11-01" },
  { id: "11-11-2027", name: "11.11 sale day", nameUr: "11.11 sale", date: "2027-11-11" },
  { id: "black-friday-2027", name: "Black Friday", nameUr: "Black Friday", date: "2027-11-26" },
  { id: "12-12-2027", name: "12.12 sale day", nameUr: "12.12 sale", date: "2027-12-12" },
];

export interface ProductSnap {
  id: string;
  name: string;
  stock: number; // total sellable stock (variants summed)
  hasImage: boolean;
  galleryCount: number;
  descriptionLength: number; // plain-text length
}

export interface OrderSnap {
  status: string;
  total: number;
  createdAt: Date;
  confirmedAt: Date | null;
  shippedAt?: Date | null;
  items: { productId?: string; qty: number }[];
}

export interface Snapshot {
  now: Date;
  currency: string;
  published: boolean;
  products: ProductSnap[];
  orders: OrderSnap[]; // last ~60 days
  abandoned: { total: number; createdAt: Date }[]; // not recovered, last 3 days
  events: { type: string; createdAt: Date }[]; // last 7 days
  activeCoupons: number;
  /** task ids the owner skipped recently — not shown again for a week */
  skipped: string[];
}

const DAY = 86_400_000;
const H = 3_600_000;

const T = (lang: Lang, en: string, ur: string) => (lang === "ur" ? ur : en);
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** Pure: the store's data in, ranked tasks out. Tested directly. */
export function findTasks(s: Snapshot, lang: Lang = "en"): BriefingTask[] {
  const tasks: BriefingTask[] = [];
  const m = (n: number) => money(n, s.currency);
  const live = s.orders.filter((o) => o.status !== "cancelled");
  const since = (d: number) => new Date(s.now.getTime() - d);

  // --- the store isn't live ---
  if (!s.published && s.products.length > 0) {
    tasks.push({
      id: "publish",
      kind: "publish",
      impact: 95,
      title: T(lang, "Your store isn't live yet", "Aap ka store abhi live nahi hai"),
      why: T(
        lang,
        `${plural(s.products.length, "product is", "products are")} ready, but shoppers can't see the store. Nothing can sell until it's published.`,
        `${s.products.length} products tayyar hain, lekin customers store nahi dekh sakte. Publish ke baghair koi sale nahi hogi.`,
      ),
      prompt: T(lang, "Check my store is ready and help me publish it.", "Mera store check karo ke publish ke liye tayyar hai, aur publish karne mein madad karo."),
      href: "/dashboard/orbit-design",
    });
  }

  // --- orders waiting on the owner ---
  const pending = live.filter((o) => o.status === "pending" && s.now.getTime() - o.createdAt.getTime() > 12 * H);
  if (pending.length) {
    const value = pending.reduce((a, o) => a + o.total, 0);
    tasks.push({
      id: "pending-orders",
      kind: "orders",
      impact: Math.min(92, 78 + pending.length * 3),
      title: T(lang, `Confirm ${plural(pending.length, "order", "orders")} waiting since yesterday`, `${pending.length} orders kal se confirmation ka intezar kar rahe hain`),
      why: T(
        lang,
        `${m(value)} of cash-on-delivery orders are unconfirmed for over 12 hours. COD buyers cancel or refuse when nobody confirms quickly.`,
        `${m(value)} ke COD orders 12 ghante se zyada se confirm nahi hue. Jaldi confirm na ho to COD customer cancel ya refuse kar dete hain.`,
      ),
      prompt: T(lang, "Show me the unconfirmed orders older than 12 hours and help me confirm them.", "12 ghante se purane unconfirmed orders dikhao aur confirm karne mein madad karo."),
      href: "/dashboard/store#orders",
    });
  }
  const unshipped = live.filter((o) => o.status === "confirmed" && o.confirmedAt && s.now.getTime() - o.confirmedAt.getTime() > 48 * H);
  if (unshipped.length) {
    tasks.push({
      id: "unshipped-orders",
      kind: "orders",
      impact: 76,
      title: T(lang, `Ship ${plural(unshipped.length, "order", "orders")} confirmed 2+ days ago`, `${unshipped.length} confirmed orders 2 din se ship nahi hue`),
      why: T(
        lang,
        "Late dispatch is the most common reason COD parcels are refused at the door.",
        "Der se bheja gaya COD parcel aksar darwaze par wapas kar diya jata hai.",
      ),
      prompt: T(lang, "List confirmed orders not shipped for 2+ days and help me book them with my courier.", "2 din se zyada purane confirmed lekin unshipped orders dikhao aur courier par book karne mein madad karo."),
      href: "/dashboard/store#orders",
    });
  }

  // --- stock: bestsellers running out ---
  const sold30 = new Map<string, number>();
  for (const o of live) {
    if (o.createdAt < since(30 * DAY)) continue;
    for (const it of o.items) if (it.productId) sold30.set(it.productId, (sold30.get(it.productId) ?? 0) + (Number(it.qty) || 0));
  }
  const byId = new Map(s.products.map((p) => [p.id, p]));
  const running = [...sold30.entries()]
    .map(([id, n]) => ({ p: byId.get(id), n }))
    .filter((x): x is { p: ProductSnap; n: number } => !!x.p && x.n >= 3 && x.p.stock <= Math.max(3, Math.ceil(x.n / 4)))
    .sort((a, b) => a.p.stock - b.p.stock || b.n - a.n);
  for (const { p, n } of running.slice(0, 2)) {
    const out = p.stock <= 0;
    tasks.push({
      id: `restock-${p.id}`,
      kind: "stock",
      impact: out ? 90 : 82,
      title: out
        ? T(lang, `Bestseller sold out: ${p.name}`, `Bestseller khatam: ${p.name}`)
        : T(lang, `Bestseller almost out: ${p.name}`, `Bestseller khatam hone wala: ${p.name}`),
      why: T(
        lang,
        `${n} sold in the last 30 days, ${out ? "none left" : `only ${p.stock} left`}.`,
        `Pichle 30 din mein ${n} bike, ${out ? "ab ek bhi nahi bacha" : `ab sirf ${p.stock} bache hain`}.`,
      ),
      prompt: T(
        lang,
        `${p.name} is ${out ? "sold out" : "almost sold out"} (${n} sold in 30 days). How much should I restock, and should I pause any ads for it until it's back?`,
        `${p.name} ${out ? "khatam ho gaya hai" : "khatam hone wala hai"} (30 din mein ${n} bike). Kitna stock mangwaun, aur wapas aane tak iske ads rokne chahiyein?`,
      ),
      href: "/dashboard/store#products",
    });
  }

  // --- sales trend ---
  const rev = (from: number, to: number) =>
    live.filter((o) => o.createdAt >= since(from) && o.createdAt < since(to)).reduce((a, o) => a + o.total, 0);
  const cnt = (from: number, to: number) => live.filter((o) => o.createdAt >= since(from) && o.createdAt < since(to)).length;
  const thisWeek = rev(7 * DAY, 0);
  const lastWeek = rev(14 * DAY, 7 * DAY);
  if (cnt(14 * DAY, 7 * DAY) >= 3 && lastWeek > 0 && thisWeek <= lastWeek * 0.7) {
    const drop = Math.round((1 - thisWeek / lastWeek) * 100);
    tasks.push({
      id: "sales-dip",
      kind: "sales",
      impact: 74,
      title: T(lang, `Sales are down ${drop}% this week`, `Is hafte sales ${drop}% kam hain`),
      why: T(lang, `${m(thisWeek)} in the last 7 days vs ${m(lastWeek)} the week before.`, `Pichle 7 din ${m(thisWeek)}, us se pehle wale hafte ${m(lastWeek)}.`),
      prompt: T(
        lang,
        `My sales dropped ${drop}% this week (${m(thisWeek)} vs ${m(lastWeek)}). Find the likely reason in my data and propose what to do.`,
        `Is hafte meri sales ${drop}% giri hain (${m(thisWeek)} vs ${m(lastWeek)}). Mere data se wajah dhoondo aur kya karna chahiye uska proposal do.`,
      ),
    });
  } else if (s.published && live.length > 0 && cnt(14 * DAY, 0) === 0) {
    tasks.push({
      id: "no-orders-14d",
      kind: "sales",
      impact: 68,
      title: T(lang, "No orders in the last 2 weeks", "2 hafte se koi order nahi aaya"),
      why: T(lang, "The store has sold before, so something changed — traffic, stock or an offer ending.", "Store pehle bik chuka hai, to kuch badla hai: traffic, stock, ya koi offer khatam hua."),
      prompt: T(lang, "I haven't had an order in 2 weeks. Check my traffic, stock and offers and propose a plan to restart sales.", "2 hafte se koi order nahi aaya. Mera traffic, stock aur offers check karo aur sales dobara shuru karne ka plan do."),
    });
  }

  // --- checkout drop-off (real store events) ---
  const starts = s.events.filter((e) => e.type === "checkout_start").length;
  const done = s.events.filter((e) => e.type === "order_complete").length;
  if (starts >= 6 && done / starts < 0.35) {
    tasks.push({
      id: "checkout-dropoff",
      kind: "conversion",
      impact: 66,
      title: T(lang, "Most shoppers leave at checkout", "Zyada tar customers checkout par chhor jate hain"),
      why: T(
        lang,
        `This week ${starts} shoppers started checkout and ${done} finished. A surprise fee or a long form are the usual causes.`,
        `Is hafte ${starts} logon ne checkout shuru kiya aur sirf ${done} ne order mukammal kiya. Aksar wajah achanak lagne wala charge ya lamba form hota hai.`,
      ),
      prompt: T(lang, "Most shoppers drop off at my checkout. Review my checkout (fees, fields, delivery info) and propose fixes.", "Mere checkout par customers chhor jate hain. Checkout (charges, fields, delivery info) check karo aur fix ka proposal do."),
    });
  }

  // --- abandoned carts ---
  if (s.abandoned.length >= 2) {
    const value = s.abandoned.reduce((a, c) => a + c.total, 0);
    tasks.push({
      id: "abandoned-carts",
      kind: "recovery",
      impact: 58,
      title: T(lang, `${plural(s.abandoned.length, "cart", "carts")} left behind (${m(value)})`, `${s.abandoned.length} carts chhor diye gaye (${m(value)})`),
      why: T(lang, "Shoppers added items and left in the last 3 days. A short WhatsApp nudge with an offer often brings some back.", "Pichle 3 din mein logon ne cart bhara aur chale gaye. WhatsApp par chhota sa yaad-dihani message aur offer aksar kuch ko wapas le aata hai."),
      prompt: T(lang, "Draft a win-back offer for shoppers who left carts in the last 3 days.", "Pichle 3 din mein cart chhorne walon ke liye wapas bulane wala offer tayyar karo."),
      href: "/dashboard/store#customers",
    });
  }

  // --- listings ---
  const noPhoto = s.products.filter((p) => !p.hasImage);
  if (noPhoto.length) {
    tasks.push({
      id: "no-photos",
      kind: "listings",
      impact: Math.min(72, 55 + noPhoto.length * 3),
      title: T(lang, `${plural(noPhoto.length, "product has", "products have")} no photo`, `${noPhoto.length} products ki koi photo nahi`),
      why: T(lang, `Shoppers rarely buy what they can't see: ${noPhoto.slice(0, 3).map((p) => p.name).join(", ")}${noPhoto.length > 3 ? "…" : ""}.`, `Jo cheez nazar na aaye wo kam bikti hai: ${noPhoto.slice(0, 3).map((p) => p.name).join(", ")}${noPhoto.length > 3 ? "…" : ""}.`),
      prompt: T(lang, "Some products have no photo. Help me get photos for them — I can send phone pictures to turn into studio shots.", "Kuch products ki photo nahi hai. Unki photos banane mein madad karo — main phone se tasveerein bhej sakta hoon jinhein studio shots bana do."),
      href: "/dashboard/store#products",
    });
  }
  const onePhoto = s.products.filter((p) => p.hasImage && p.galleryCount === 0);
  if (onePhoto.length >= 3) {
    tasks.push({
      id: "one-photo",
      kind: "listings",
      impact: 38,
      title: T(lang, `${onePhoto.length} products have only one photo`, `${onePhoto.length} products ki sirf ek photo hai`),
      why: T(lang, "More angles and an in-use shot answer questions shoppers would otherwise ask.", "Zyada angles aur istemal hote hue photo customer ke sawal pehle hi jawab de deti hain."),
      prompt: T(lang, "Make extra product photos (other angles, in use) for my products that have only one photo.", "Jin products ki sirf ek photo hai unke liye aur photos banao (doosre angles, istemal mein)."),
      href: "/dashboard/content",
    });
  }
  const thin = s.products.filter((p) => p.descriptionLength < 60);
  if (thin.length >= 2) {
    tasks.push({
      id: "thin-descriptions",
      kind: "listings",
      impact: 36,
      title: T(lang, `${thin.length} products have little or no description`, `${thin.length} products ki description bohat choti ya khaali hai`),
      why: T(lang, "A clear description (size, material, what's included) cuts questions and returns, and helps Google find the product.", "Saaf description (size, material, kya milega) sawal aur returns kam karti hai, aur Google par product dhoondne mein madad karti hai."),
      prompt: T(lang, "Write proper descriptions for my products that have little or no description. Use only facts I've given — ask me if something is missing.", "Jin products ki description choti ya khaali hai unki achi description likho. Sirf wo baatein likho jo main ne batayi hain — kuch missing ho to mujh se poocho."),
      href: "/dashboard/store#products",
    });
  }

  // --- occasions in the next 3 weeks ---
  for (const o of OCCASIONS) {
    const days = Math.ceil((new Date(o.date + "T00:00:00Z").getTime() - s.now.getTime()) / DAY);
    if (days < 3 || days > 21) continue;
    tasks.push({
      id: `occasion-${o.id}`,
      kind: "occasion",
      impact: days <= 10 ? 64 : 50,
      title: T(lang, `${o.name} is ${days} days away`, `${o.nameUr} mein ${days} din reh gaye`),
      why: T(
        lang,
        `Shoppers start buying for ${o.name} early${o.approx ? " (date depends on the moon)" : ""}. A themed collection and offer prepared now catches that demand.`,
        `${o.nameUr} ki shopping pehle se shuru ho jati hai${o.approx ? " (tareekh chand par depend karti hai)" : ""}. Abhi tayyar ki gayi collection aur offer us demand ko pakarte hain.`,
      ),
      prompt: T(
        lang,
        `${o.name} is in ${days} days. Prepare a ${o.name} plan for my store: which products to feature, an offer, a homepage banner and a WhatsApp message — as proposals I can Apply.`,
        `${o.nameUr} mein ${days} din hain. Mere store ke liye ${o.nameUr} ka plan tayyar karo: kaun se products dikhane hain, offer, homepage banner aur WhatsApp message — proposals ki shakal mein jinhein main Apply kar sakoon.`,
      ),
    });
    break; // one occasion at a time
  }

  // --- no offer at all for a store that sells ---
  if (s.activeCoupons === 0 && live.length >= 3) {
    tasks.push({
      id: "no-offer",
      kind: "offer",
      impact: 30,
      title: T(lang, "No active offer in the store", "Store mein koi offer active nahi"),
      why: T(lang, "A first-order code or free delivery above a set amount gives hesitant first-time COD buyers a reason to order.", "Pehle order ka code ya ek had se upar free delivery, jhijhakne wale naye COD customer ko order ki wajah deti hai."),
      prompt: T(lang, "Suggest one simple offer for my store based on my order values, as a proposal.", "Mere order values dekh kar store ke liye ek seedha sa offer suggest karo, proposal ki shakal mein."),
      href: "/dashboard/store#discounts",
    });
  }

  return tasks
    .filter((t) => !s.skipped.includes(t.id))
    .sort((a, b) => b.impact - a.impact)
    .slice(0, 5)
    .map((t) => ({ ...t, state: "open" as const }));
}

export function briefingIntro(tasks: BriefingTask[], lang: Lang): string {
  if (!tasks.length) return T(lang, "Store check: nothing needs you today.", "Store check: aaj aap ke liye koi zaroori kaam nahi.");
  return T(
    lang,
    `Good morning — I checked the store. ${plural(tasks.length, "thing is", "things are")} worth doing today, most important first. Press **Prepare** on any of them and I'll draft it for you to Apply.`,
    `Subah bakhair — maine store check kiya. Aaj ${tasks.length} kaam karne layak hain, sab se zaroori pehle. Kisi par bhi **Prepare** dabayein, main usay tayyar kar dunga, phir aap Apply karein.`,
  );
}

function plainLength(html: string | null | undefined): number {
  return (html ?? "").replace(/<[^>]+>/g, " ").replace(/&[a-z#0-9]+;/gi, " ").replace(/\s+/g, " ").trim().length;
}

/** The language the owner writes to the Orchestrator in, from their recent messages. */
async function ownerLang(businessId: string): Promise<Lang> {
  const recent = await prisma.orchestratorMessage.findMany({
    where: { businessId, role: "user" },
    orderBy: { createdAt: "desc" },
    take: 6,
    select: { content: true },
  });
  let ur = 0;
  let en = 0;
  for (const r of recent) {
    const l = replyLanguage(r.content);
    if (l === "roman-urdu" || l === "urdu") ur++;
    else if (l === "english") en++;
  }
  return ur > en ? "ur" : "en";
}

function parseTasks(raw: string | null | undefined): BriefingTask[] {
  if (!raw) return [];
  try {
    const v = JSON.parse(raw);
    return Array.isArray(v) ? (v as BriefingTask[]) : [];
  } catch {
    return [];
  }
}

export { parseTasks as parseBriefingTasks };

async function loadSnapshot(businessId: string, now: Date): Promise<Snapshot | null> {
  const business = await prisma.business.findUnique({ where: { id: businessId }, select: { storeCurrency: true } });
  if (!business) return null;
  const [products, orders, abandoned, events, activeCoupons, design, recentBriefings] = await Promise.all([
    prisma.product.findMany({
      where: { businessId },
      select: { id: true, name: true, stock: true, optionTypes: true, imageUrl: true, galleryUrls: true, description: true, variants: { select: { stock: true } } },
      take: 1000,
    }),
    prisma.order.findMany({
      where: { businessId, createdAt: { gte: new Date(now.getTime() - 60 * DAY) } },
      select: { status: true, total: true, createdAt: true, confirmedAt: true, items: true },
      take: 5000,
    }),
    prisma.abandonedCart.findMany({
      where: { businessId, recovered: false, createdAt: { gte: new Date(now.getTime() - 3 * DAY) } },
      select: { total: true, createdAt: true },
    }),
    prisma.storeEvent.findMany({
      where: { businessId, createdAt: { gte: new Date(now.getTime() - 7 * DAY) }, type: { in: ["checkout_start", "order_complete"] } },
      select: { type: true, createdAt: true },
      take: 20000,
    }),
    prisma.coupon.count({ where: { businessId, active: true, OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] } }),
    prisma.storeDesign.findUnique({ where: { businessId }, select: { published: true } }),
    prisma.orchestratorMessage.findMany({
      where: { businessId, speaker: "briefing", createdAt: { gte: new Date(now.getTime() - 7 * DAY) } },
      select: { tasks: true },
    }),
  ]);
  const skipped = recentBriefings.flatMap((b) => parseTasks(b.tasks).filter((t) => t.state === "skipped" || t.state === "done").map((t) => t.id));
  return {
    now,
    currency: business.storeCurrency ?? "pkr",
    published: !!design?.published,
    products: products.map((p) => {
      let gallery = 0;
      try {
        const g = JSON.parse(p.galleryUrls ?? "[]");
        gallery = Array.isArray(g) ? g.length : 0;
      } catch {
        /* ignore */
      }
      return {
        id: p.id,
        name: p.name,
        stock: totalStock(p, p.variants),
        hasImage: !!p.imageUrl,
        galleryCount: gallery,
        descriptionLength: plainLength(p.description),
      };
    }),
    orders: orders.map((o) => {
      let items: { productId?: string; qty: number }[] = [];
      try {
        const v = JSON.parse(o.items);
        if (Array.isArray(v)) items = v.map((i: { productId?: string; qty?: number }) => ({ productId: i.productId, qty: Number(i.qty) || 0 }));
      } catch {
        /* ignore */
      }
      return { status: o.status, total: o.total, createdAt: o.createdAt, confirmedAt: o.confirmedAt, items };
    }),
    abandoned,
    events,
    activeCoupons,
    skipped,
  };
}

/** Start of the owner's day in Pakistan time, so "one briefing a day" means their day. */
function pkDayStart(now: Date): Date {
  const pk = new Date(now.getTime() + 5 * H);
  pk.setUTCHours(0, 0, 0, 0);
  return new Date(pk.getTime() - 5 * H);
}

/**
 * Run the check for one store and post it in the Orchestrator chat. Once a day unless `force`
 * (the owner pressed "Check my store now", which replaces today's briefing). Returns the message
 * id, or null when there was nothing to post.
 */
export async function runDailyBriefing(businessId: string, opts: { force?: boolean; now?: Date } = {}): Promise<{ messageId: string | null; tasks: BriefingTask[] }> {
  const now = opts.now ?? new Date();
  const today = await prisma.orchestratorMessage.findFirst({
    where: { businessId, speaker: "briefing", createdAt: { gte: pkDayStart(now) } },
    select: { id: true },
  });
  if (today && !opts.force) return { messageId: null, tasks: [] };
  const snap = await loadSnapshot(businessId, now);
  if (!snap) return { messageId: null, tasks: [] };
  const lang = await ownerLang(businessId);
  const tasks = findTasks(snap, lang);
  // The automatic morning run stays quiet on a day with nothing to do; a manual check always answers.
  if (!tasks.length && !opts.force) return { messageId: null, tasks };
  if (today) await prisma.orchestratorMessage.delete({ where: { id: today.id } }).catch(() => {});
  const msg = await prisma.orchestratorMessage.create({
    data: { businessId, role: "assistant", speaker: "briefing", content: briefingIntro(tasks, lang), tasks: JSON.stringify(tasks) },
  });
  return { messageId: msg.id, tasks };
}

/** The owner marked a task done or skipped it — it won't be suggested again for a week. */
export async function setTaskState(businessId: string, messageId: string, taskId: string, state: "done" | "skipped" | "open"): Promise<BriefingTask[] | null> {
  const msg = await prisma.orchestratorMessage.findFirst({ where: { id: messageId, businessId, speaker: "briefing" }, select: { tasks: true } });
  if (!msg) return null;
  const tasks = parseTasks(msg.tasks).map((t) => (t.id === taskId ? { ...t, state } : t));
  await prisma.orchestratorMessage.update({ where: { id: messageId }, data: { tasks: JSON.stringify(tasks) } });
  return tasks;
}
