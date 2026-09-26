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
    q: "Is orbit.ai built on Shopify or another platform?",
    a: "No. Orbit is its own store builder — you're not renting space on someone else's platform. Your store, checkout, and data are yours.",
  },
  {
    q: "Do I need to already have a store to use orbit.ai?",
    a: "No. You can launch a brand-new store with orbit.ai, or connect an existing one during onboarding — the AI team works either way.",
  },
  {
    q: "How is this different from using separate tools for SEO, ads, content, etc.?",
    a: "Those tools don't talk to each other. Orbit's Strategy Orchestrator coordinates every specialist agent around one growth plan, so your SEO, content, and ads all point at the same goal instead of working in isolation.",
  },
  {
    q: "Is the competitor data real?",
    a: "Yes — orbit.ai actually visits competitor sites, social pages, and public ad libraries. If it can't verify something, it says so instead of making it up.",
  },
  {
    q: "What if I'm just starting out with no data yet?",
    a: "That's fine. The Competitor Intelligence agent builds your first plan from your competitors and niche, even before you have any sales history.",
  },
];

export const pricingTiers = [
  {
    name: "Starter",
    price: 50,
    desc: "Every agent, full growth plan and execution — the AI won't auto-build or auto-run paid ads and other spend-facing deliverables for you.",
    featured: false,
    features: [
      "Every agent included",
      "Full growth plan from the Strategy Orchestrator",
      "Real competitor intelligence",
      "SEO, content, and retention agents run for you",
      "Ads Agent gives recommendations — you approve and run them yourself",
      "Usage-limited, like a standard AI usage plan",
    ],
  },
  {
    name: "Growth",
    price: 75,
    desc: "Everything in Starter, plus the AI can build and execute ads and other deliverables for you directly.",
    featured: true,
    features: [
      "Everything in Starter",
      "AI builds and runs ad campaigns for you",
      "AI builds and sends content/deliverables directly, not just drafts",
      "Higher usage limit",
      "Priority support",
    ],
  },
  {
    name: "Scale",
    price: 150,
    desc: "Highest usage limit, for stores running heavy volume across every channel.",
    featured: false,
    features: [
      "Everything in Growth",
      "Highest usage limit",
      "Priority support",
    ],
  },
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
