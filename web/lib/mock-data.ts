export type AgentStatus = "active" | "idle" | "never";

export interface Agent {
  id: string;
  name: string;
  layer: string;
  /** true = this agent has real backend logic today; false = illustrative preview only */
  live: boolean;
  description: string;
}

export const faqs = [
  {
    q: "Is Orbit built on Shopify?",
    a: "No. Orbit is its own store platform — your store, checkout, customers and data live in Orbit. You can bring your products over from your existing website during setup.",
  },
  {
    q: "Do I need a store or website already?",
    a: "No. Tell Orbit what you sell and it builds the store with you. If you already have a website, Orbit reads it and imports your products.",
  },
  {
    q: "Does it work for cash on delivery?",
    a: "Yes — Orbit is built COD-first: customers can confirm their order on WhatsApp, suspicious orders are flagged, and you can book PostEx, Leopards or TCS right from the order.",
  },
  {
    q: "Will the AI change my store or spend money without asking?",
    a: "Never. Every change the Orchestrator suggests — prices, products, store design, posts, ads — waits for you to press Apply. Ads are always created paused; spending only starts when you press Activate.",
  },
  {
    q: "What does the AI actually do day to day?",
    a: "It plans your growth with you, builds and edits your store, makes product photos and reels (Growth and Scale), posts to Facebook and Instagram, builds Meta ads, answers customers on WhatsApp, Messenger and Instagram, and follows up on carts, reviews and deliveries.",
  },
  {
    q: "What happens when I hit my plan's limit?",
    a: "The AI pauses until the limit resets — your store keeps selling normally. You can move to a bigger plan any time from Settings.",
  },
  {
    q: "Can I use my own domain?",
    a: "Yes. Add your domain in Settings, copy the two DNS records we show you, and your store goes live on it with https.",
  },
];

export const pricingTiers = [
  {
    name: "Starter",
    price: 50,
    desc: "Everything to run and grow your store with your AI Orchestrator.",
    featured: false,
    features: [
      "AI store builder + your own domain",
      "Orchestrator chat & growth plan",
      "WhatsApp, Messenger & Instagram replies",
      "Facebook & Instagram posting, Meta ads",
      "COD confirmation, couriers, delivery zones",
      "Standard AI allowance",
    ],
  },
  {
    name: "Growth",
    price: 75,
    desc: "Adds Orbit Studio — AI product photos and reels made from your real products.",
    featured: true,
    features: [
      "Everything in Starter",
      "Orbit Studio: 50 images + 5 reels a month",
      "UGC, try-on, ad creatives and more",
      "Higher AI allowance",
      "More web research per month",
    ],
  },
  {
    name: "Scale",
    price: 150,
    desc: "For stores running heavy volume — more content, more AI, extra specialist agents.",
    featured: false,
    features: [
      "Everything in Growth",
      "Orbit Studio: 100 images + 12 reels a month",
      "Orchestrator can hire extra specialist agents",
      "Highest AI allowance",
      "Most web research per month",
    ],
  },
];

/** Feature table on /pricing — only what the code actually does. */
export const planMatrix: { label: string; values: [string, string, string] }[] = [
  { label: "AI store builder (Orbit Design) + custom domain", values: ["✓", "✓", "✓"] },
  { label: "Orchestrator chat & growth plan", values: ["✓", "✓", "✓"] },
  { label: "WhatsApp chatbot, order updates & COD confirmation", values: ["✓", "✓", "✓"] },
  { label: "Messenger & Instagram DM replies", values: ["✓", "✓", "✓"] },
  { label: "Facebook & Instagram posting, Meta ads (you activate)", values: ["✓", "✓", "✓"] },
  { label: "PostEx / Leopards / TCS booking & tracking", values: ["✓", "✓", "✓"] },
  { label: "Meta Pixel + Conversions API", values: ["✓", "✓", "✓"] },
  { label: "Orbit Studio images / reels per month", values: ["—", "50 / 5", "100 / 12"] },
  { label: "Extra specialist agents hired by the Orchestrator", values: ["—", "—", "✓"] },
  { label: "AI allowance", values: ["Standard", "Higher", "Highest"] },
  { label: "Web research per month", values: ["300", "600", "1,500"] },
];

export const agents: Agent[] = [
  { id: "orchestrator", name: "Strategy Orchestrator", layer: "Planning", live: true, description: "The senior business-growth and sales expert — decides the single highest-leverage focus each cycle, and honestly reviews whether last cycle's plan seems to be working before deciding what's next. Doesn't write execution tasks — that's the specialists' job." },
  { id: "competitor", name: "Competitor Intelligence", layer: "Planning", live: true, description: "Scrapes each competitor's website, Instagram, TikTok, and Meta Ad Library for real pricing, trending content, and ad activity — never fabricates a number it can't verify." },
  { id: "qa", name: "Manager / QA", layer: "Planning", live: true, description: "Reads every specialist's draft task together and catches contradictions — conflicting prices, offers, or timing — before anything ships." },
  { id: "seo", name: "SEO Agent", layer: "Marketing & Sales", live: true, description: "Senior SEO strategist — picks one real product or page each cycle and writes its real SEO title/description directly (auto-apply on by default, low risk, fully reversible). Never cites an invented search-volume number." },
  { id: "content", name: "Content Agent", layer: "Marketing & Sales", live: true, description: "Social-first creative strategist who writes shootable-today Reels, captions, and copy based on what's actually trending for your niche. Can also publish a real caption to your connected Facebook Page once you connect it and turn on auto-apply — off by default." },
  { id: "ads", name: "Ads & Growth", layer: "Marketing & Sales", live: true, description: "Performance-marketing specialist — proposes real campaign structures and test/kill rules, never a fabricated CPA or ROAS forecast. Can create a real Meta campaign (always PAUSED, with a real Meta-enforced daily budget cap) once you connect Ads access and turn on auto-apply — off by default; activating real spend is always a separate manual step." },
  { id: "pricing", name: "Pricing Agent", layer: "Marketing & Sales", live: true, description: "Watches real competitor pricing from every cycle's scan against your own real product prices. Can write the real price directly, but only once you turn on \"auto-apply\" — off by default since real money is involved. Hard-blocked from ever going below your real margin floor, even when on." },
  { id: "personalization", name: "Personalization", layer: "Marketing & Sales", live: true, description: "Shows real \"customers who viewed this also viewed\" recommendations on every product page, computed from real visitor session co-occurrence — not an AI agent, no invented pairings." },
  { id: "experimentation", name: "Experimentation (A/B)", layer: "Marketing & Sales", live: true, description: "Runs a real A/B test on your storefront's hero text — real deterministic visitor split, real conversion tracking from actual completed orders, no fake statistical significance shown on low traffic." },
  { id: "chatbot", name: "Omnichannel Chatbot", layer: "Customer Support", live: true, description: "Answers real customer questions grounded in your real product catalog — never invents a price, stock level, or policy. Live on your website chat widget, and on real WhatsApp once the platform owner assigns your business a real number. Instagram DM isn't connected yet." },
  { id: "voice", name: "Voice / Calling", layer: "Customer Support", live: false, description: "Planned: calls high-value abandoned carts and support escalations." },
  { id: "handoff", name: "Human Handoff", layer: "Customer Support", live: false, description: "Planned: routes conversations the chatbot can't handle to a real person on your team." },
  { id: "retention", name: "Retention Agent", layer: "Keeping Customers Happy", live: true, description: "Lifecycle/CRM specialist — designs behavioral, trigger-based win-back and retention flows grounded in real marketing psychology. Also sends the real weekly plan to your WhatsApp via Twilio — the first agent action that actually reaches you, not just a suggestion in the dashboard." },
  { id: "reviews", name: "Reviews & Reputation", layer: "Keeping Customers Happy", live: true, description: "Sends a real WhatsApp review request when you mark a real order fulfilled, and flags any 2-star-or-below response for your attention. Not an AI agent — real code and a real Twilio send." },
  { id: "inventory", name: "Inventory & Fulfillment", layer: "Orders & Inventory", live: true, description: "Watches real stock levels and real 30-day sales velocity every cycle, and flags products running low before they oversell. Doesn't pause ads yet — no ad-execution channel exists to pause." },
  { id: "returns", name: "Returns & Disputes", layer: "Orders & Inventory", live: true, description: "Real return-request workflow — customers request a return from their real order's tracking page, you approve/reject/refund in the dashboard. Not automated, not AI — a real, honest workflow." },
  { id: "tax", name: "Tax & Compliance", layer: "Money & Safety", live: true, description: "Real tax owed — your real revenue × the real rate you enter. No jurisdiction-specific rules or filing (this platform doesn't have real tax-law data to ground that in, so it's honestly left out)." },
  { id: "fraud", name: "Fraud & Risk", layer: "Money & Safety", live: true, description: "Runs a real, deterministic screen on every real order placed (unusual quantity, rapid repeat orders from one phone number, order value far above this store's real average) and flags it for manual review — never blocks a real customer's checkout automatically." },
  { id: "finance", name: "Finance Dashboard", layer: "Money & Safety", live: true, description: "Reconciles real daily sales and real gross margin (from the cost price you enter per product) into one dashboard. Ad spend isn't tracked anywhere in the platform yet, so it's honestly left out rather than estimated." },
];
