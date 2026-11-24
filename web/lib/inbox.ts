/**
 * Inbox helpers: who a conversation is with, and the demo conversations that let a seller (or the
 * owner, testing) see a working Inbox before any real channel is connected. Demo threads are
 * ordinary ChatMessage rows whose customerRef starts with "demo:" — they are labelled in the UI,
 * a reply to them is saved but never sent anywhere, and one click removes them all.
 */
export const DEMO_PREFIX = "demo:";

export function isDemoRef(ref: string): boolean {
  return ref.startsWith(DEMO_PREFIX);
}

/** "demo:ayesha-khan" → "Ayesha Khan" */
export function demoName(ref: string): string {
  return ref
    .slice(DEMO_PREFIX.length)
    .split("-")
    .map((w) => (w ? w[0].toUpperCase() + w.slice(1) : w))
    .join(" ");
}

export function initials(name: string): string {
  const parts = name.replace(/[^\p{L}\s]/gu, "").trim().split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] ?? "?") + (parts[1]?.[0] ?? "")).toUpperCase();
}

export interface DemoMessage {
  role: "user" | "assistant";
  sender?: "bot" | "owner";
  content: string;
  /** minutes before "now" */
  ago: number;
}
export interface DemoConversation {
  channel: "whatsapp" | "instagram" | "messenger" | "website";
  ref: string;
  messages: DemoMessage[];
}

/** Six realistic COD-shop conversations, in the mix of Roman Urdu and English sellers actually get. */
export function demoConversations(products: string[]): DemoConversation[] {
  const [a, b, c] = [products[0] ?? "Raw Honey 500g", products[1] ?? "Desi Ghee 1kg", products[2] ?? "Dry Fruits Box"];
  return [
    {
      channel: "whatsapp",
      ref: "demo:sana-malik",
      messages: [
        { role: "user", content: "Assalam o alaikum, mera order kahan hai? 3 din ho gaye", ago: 14 },
      ],
    },
    {
      channel: "instagram",
      ref: "demo:hamza-ali",
      messages: [
        { role: "user", content: `Hi, is ${b} in stock? Karachi delivery ho jaye gi?`, ago: 190 },
        { role: "assistant", sender: "bot", content: `Yes, ${b} is in stock. We deliver to Karachi in 2–3 working days, cash on delivery. Would you like to order?`, ago: 189 },
        { role: "user", content: "Theek hai. Delivery charges kitne hain?", ago: 41 },
      ],
    },
    {
      channel: "whatsapp",
      ref: "demo:ayesha-khan",
      messages: [
        { role: "user", content: `${a} ka kya rate hai? COD hai?`, ago: 1500 },
        { role: "assistant", sender: "bot", content: `${a} is available. Cash on delivery is on for all of Pakistan. Shall I take your order?`, ago: 1499 },
        { role: "user", content: "Lahore, DHA Phase 5. 2 piece chahiye", ago: 1485 },
        { role: "assistant", sender: "owner", content: "Ji Ayesha, 2 piece note kar liye hain. Kal tak dispatch ho jayega, tracking number bhej dunga.", ago: 1470 },
        { role: "user", content: "Shukriya 🙏", ago: 1468 },
      ],
    },
    {
      channel: "messenger",
      ref: "demo:bilal-ahmed",
      messages: [
        { role: "user", content: `Mujhe ${c} ke 20 boxes chahiye shaadi ke liye. Koi bulk discount?`, ago: 320 },
        { role: "assistant", sender: "bot", content: "Thanks for asking! For bulk orders the owner will personally confirm the price. I've flagged your message — they'll reply here shortly.", ago: 319 },
      ],
    },
    {
      channel: "website",
      ref: "demo:visitor-4821",
      messages: [
        { role: "user", content: "Can I return it if I don't like the taste?", ago: 2900 },
        { role: "assistant", sender: "bot", content: "I don't have a returns policy on record for this store, so I don't want to promise something wrong — I'll pass your question to the owner.", ago: 2899 },
        { role: "assistant", sender: "owner", content: "Hi! Yes — message us on WhatsApp within 2 days of delivery and we'll sort it out.", ago: 2850 },
      ],
    },
    {
      channel: "whatsapp",
      ref: "demo:noor-fatima",
      messages: [
        { role: "user", content: `${a} bohat acha tha, ghar mein sab ko pasand aaya. Dobara order karna hai`, ago: 4300 },
        { role: "assistant", sender: "owner", content: "Shukriya Noor! 🌿 Bas batayein kitne chahiye, main aaj hi nikal deta hoon.", ago: 4280 },
      ],
    },
  ];
}

/** Short relative time for lists: "now", "14 m", "3 h", "2 d". */
export function ago(iso: string, now = Date.now()): string {
  const m = Math.max(0, Math.round((now - new Date(iso).getTime()) / 60000));
  if (m < 1) return "now";
  if (m < 60) return `${m} m`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} h`;
  return `${Math.round(h / 24)} d`;
}
