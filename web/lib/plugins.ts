import { getConnector } from "@/lib/known-mcp-connectors";

/**
 * Curated PLUGINS — one-click bundles. Installing one provisions its MCP connections (into the
 * shared pool) and its skills in a single step. `mcp[].connectorId` pulls the real server URL and
 * auth type from lib/known-mcp-connectors.ts; a plugin can also be skills-only. OAuth/API-key
 * connections still need the seller to finish signing in / paste a key afterwards — the install
 * just creates the entries and wires the skills.
 */

export interface PluginMcp {
  connectorId: string; // must exist in KNOWN_MCP_CONNECTORS and not need a shop domain
  skill?: string; // usage notes written onto the created connection
}
export interface PluginSkill {
  name: string;
  description: string;
  instructions: string;
  alwaysOn?: boolean;
}
export interface PluginDef {
  id: string;
  name: string;
  description: string;
  mono: string;
  color: string;
  mcp: PluginMcp[];
  skills: PluginSkill[];
}

export const PLUGINS: PluginDef[] = [
  {
    id: "email-sms-marketing",
    name: "Email & SMS Marketing",
    description: "Klaviyo wired in, plus playbooks for win-back flows and promotional copy.",
    mono: "@",
    color: "#1F3A5F",
    mcp: [
      {
        connectorId: "klaviyo",
        skill:
          "Pull real segment sizes, flow performance and campaign metrics from Klaviyo before proposing any email/SMS work. Never invent an open or click rate.",
      },
    ],
    skills: [
      {
        name: "Win-back flow playbook",
        description: "Any task that designs a lapsed-customer or abandoned-cart flow.",
        instructions:
          "Trigger on real inactivity windows (30 / 60 / 90 days). Message 1 = reminder + social proof, no discount. Message 2 = soft incentive only if margin allows. Message 3 = last-chance with urgency. Always give an unsubscribe-friendly tone; never more than 3 messages in a win-back.",
      },
      {
        name: "Promotional email copy rules",
        description: "Any task writing a marketing email or SMS.",
        instructions:
          "One offer per email. Subject line under 45 chars, no ALL CAPS, no emoji spam (max 1). Lead with the benefit, not the product name. One clear CTA button. SMS under 160 chars with a real opt-out line.",
      },
    ],
  },
  {
    id: "creative-studio",
    name: "Creative Studio",
    description: "AI video (Higgsfield) and voice (ElevenLabs), plus a product-video brief format.",
    mono: "▷",
    color: "#0a0a0a",
    mcp: [
      {
        connectorId: "higgsfield",
        skill: "Generate a real short product video or image whenever the plan calls for a video/creative asset.",
      },
      {
        connectorId: "elevenlabs",
        skill: "Generate a real voiceover track when a video needs narration or for a voice ad.",
      },
    ],
    skills: [
      {
        name: "Product video brief format",
        description: "Any task that plans or generates a product video or Reel.",
        instructions:
          "Structure every brief as: Hook (0-2s, pattern interrupt) → Problem (2-5s) → Product in use (5-12s) → Proof/result (12-18s) → CTA (18-20s). Vertical 9:16. On-screen captions always. Name the exact real product and its real key benefit.",
      },
    ],
  },
  {
    id: "support-autopilot",
    name: "Support Autopilot",
    description: "Intercom connected, plus reply-tone and refund-policy guidance for the chatbot.",
    mono: "◍",
    color: "#1F8DED",
    mcp: [
      {
        connectorId: "intercom",
        skill:
          "Look up the real customer's past conversations and order context in Intercom before drafting a reply. Never promise something the account history contradicts.",
      },
    ],
    skills: [
      {
        name: "Support reply tone",
        description: "Any task drafting a reply to a customer question or complaint.",
        instructions:
          "Acknowledge the specific issue in the first sentence. No corporate filler ('we sincerely apologize for any inconvenience'). Give a concrete next step and a real timeframe. One paragraph unless steps are needed. Sign off as a person, not 'The Team'.",
      },
      {
        name: "Refund & returns policy",
        description: "Any task about a refund, return, exchange or dispute.",
        instructions:
          "Returns accepted within 30 days, unused, with proof of purchase. Refunds to the original payment method within 5-7 business days of receiving the item. Store credit offered as an alternative, never forced. Faulty items: replacement or full refund including shipping. Escalate anything over $200 or older than 30 days to a human.",
      },
    ],
  },
  {
    id: "seo-command",
    name: "SEO Command",
    description: "Search Console + Semrush wired in, plus a metadata formula and a content-brief playbook.",
    mono: "◎",
    color: "#458CF5",
    mcp: [
      {
        connectorId: "google-search-console",
        skill:
          "Before proposing any SEO change, pull the page's real queries, impressions, clicks and average position from Search Console. Never cite a keyword or volume that isn't in the data.",
      },
      {
        connectorId: "semrush",
        skill: "Use Semrush for keyword difficulty, related terms and competitor gaps when planning a page or article.",
      },
    ],
    skills: [
      {
        name: "SEO metadata formula",
        description: "Any task that writes a page/product title tag or meta description.",
        instructions:
          "Title: primary keyword first, brand last, under 60 chars, no keyword stuffing. Meta description: 140-155 chars, lead with the benefit, include the primary keyword once naturally, end with a soft CTA. One H1 per page matching search intent.",
      },
      {
        name: "Content brief playbook",
        description: "Any task that plans an article, buying guide or category page.",
        instructions:
          "Start from the real top query. Cover the questions People-Also-Ask raises. Match the dominant SERP format (listicle / guide / comparison). Target the keyword + 3-5 semantic variants. Internal-link to 2-3 related products or pages. Aim for genuinely more useful than what currently ranks, not just longer.",
      },
    ],
  },
  {
    id: "video-studio",
    name: "Video Studio",
    description: "Runway and HeyGen connected, plus a short-form structure and a hook-writing playbook.",
    mono: "▶",
    color: "#6E00FF",
    mcp: [
      { connectorId: "runway", skill: "Generate real b-roll or a product clip when the plan calls for original video footage." },
      { connectorId: "heygen", skill: "Generate a real AI-presenter video when a script needs a talking spokesperson." },
    ],
    skills: [
      {
        name: "Short-form video structure",
        description: "Any task planning a Reel, TikTok or YouTube Short.",
        instructions:
          "Hook in 0-2s (visual + on-screen text). One idea only. Cut every 1-3s. Show the product in use by 5s. Payoff/result by 15s. CTA in the last 2s. Vertical 9:16, captions burned in, safe margins for the UI overlay.",
      },
      {
        name: "Hook-writing playbook",
        description: "Any task that needs opening lines for video, ads or email.",
        instructions:
          "A hook names a specific person, number or moment in the first 5 words. No 'In today's world'. Three variants minimum. Test: could this line only be about this product? If it could be about anything, rewrite it.",
      },
    ],
  },
  {
    id: "ads-copywriter",
    name: "Ads Copywriter",
    description: "Skills-only — a Facebook/Instagram ad copy formula, hook rules and offer framing.",
    mono: "◆",
    color: "#4285F4",
    mcp: [],
    skills: [
      {
        name: "Facebook ad copy formula",
        description: "Any task writing paid social ad copy.",
        instructions:
          "Primary text: hook line (a specific claim or question) → 2-3 lines of benefit-led body → 1 line of proof → CTA. Headline under 40 chars, benefit-focused. No 'Buy now!!!'. Avoid words Meta flags (guarantee, cure, 100%). Write 3 hook variants per ad.",
      },
      {
        name: "Hook-writing rules",
        description: "Any task that needs opening lines for ads, Reels or emails.",
        instructions:
          "A hook names a specific person, number, or moment in the first 5 words. No throat-clearing ('In today's world…'). Test: could this line only be about this product? If it could be about anything, rewrite it.",
      },
      {
        name: "Offer framing",
        description: "Any task that presents a discount, bundle or promotion.",
        instructions:
          "Frame value before price (what they get, then what it costs). Anchor against the real full price. Bundles beat percentage-off where margin is tight. Always give the offer a real reason (seasonal, new launch, overstock) — never a permanent 'sale'.",
      },
    ],
  },
  {
    id: "brand-kit",
    name: "Brand Kit",
    description: "Skills-only — brand voice, visual style notes and a banned-words list, always on.",
    mono: "✦",
    color: "#7D2AE7",
    mcp: [],
    skills: [
      {
        name: "Brand voice",
        description: "Any task producing customer-facing text.",
        instructions:
          "Warm, plain-spoken, confident. Short sentences. Address the customer as 'you'. No hype words, no exclamation marks. Sound like a knowledgeable friend, not a brochure.",
        alwaysOn: true,
      },
      {
        name: "Visual style notes",
        description: "Any task that briefs an image, video, banner or storefront design.",
        instructions:
          "Generous whitespace, one focal point per composition. Natural light, real product-in-context over studio-on-white. Muted, warm palette. Type: one serif for headlines, one clean sans for body. Avoid stocky, over-saturated, or cluttered layouts.",
      },
      {
        name: "Words we never use",
        description: "Any task producing copy — check output against this.",
        instructions:
          "Never use: revolutionary, game-changer, world-class, cutting-edge, unlock, elevate, curated, artisanal (unless literally true), 'the perfect', 'look no further', 'say goodbye to'.",
        alwaysOn: true,
      },
    ],
  },
];

export function getPlugin(id: string): PluginDef | undefined {
  return PLUGINS.find((p) => p.id === id);
}

/** A plugin is installable only if every connector it references really exists and needs no shop domain. */
export function pluginIsValid(p: PluginDef): boolean {
  return p.mcp.every((m) => {
    const c = getConnector(m.connectorId);
    return c && !c.needsShopDomain;
  });
}

export interface PluginSummary {
  id: string;
  name: string;
  description: string;
  mono: string;
  color: string;
  toolCount: number;
  skillCount: number;
  connectors: { name: string; authType: string; si?: string; mono: string; color: string }[];
}

export function pluginSummary(p: PluginDef): PluginSummary {
  return {
    id: p.id,
    name: p.name,
    description: p.description,
    mono: p.mono,
    color: p.color,
    toolCount: p.mcp.length,
    skillCount: p.skills.length,
    connectors: p.mcp.map((m) => {
      const c = getConnector(m.connectorId);
      return {
        name: c?.name ?? m.connectorId,
        authType: c?.authType ?? "none",
        si: c?.si,
        mono: c?.mono ?? "?",
        color: c?.color ?? "#5b5b6b",
      };
    }),
  };
}
