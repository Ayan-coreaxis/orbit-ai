import { prisma } from "@/lib/prisma";

export type SpecialistId = "seo" | "content" | "ads" | "retention" | "inventory" | "pricing";

export interface AgentSettings {
  /** Which specialist agents are allowed to run and produce a task this cycle. */
  enabledAgents: SpecialistId[];
  /** Send the weekly plan to WhatsApp when a real number is on file. */
  notifyWhatsApp: boolean;
  /** Free-text brand voice/guidelines, used by SEO, Content, Ads, and Retention. */
  brandVoice: string;
  /** Free-text advisory spend ceiling the Ads Agent is told to respect. Not enforced — no real ad spend happens today. */
  adsBudgetCap: string;
  /** Free-text advisory margin floor the Retention Agent is told to respect in any discount-based flow it proposes. */
  marginFloor: string;
  /** How aggressive the Orchestrator should be when setting this cycle's targets. */
  orchestratorRiskTolerance: "conservative" | "balanced" | "aggressive";
  /** How strict Manager/QA should be when deciding whether to rewrite a specialist's task. */
  qaStrictness: "lenient" | "standard" | "strict";
  /** Off by default — real money impact, so the owner must consciously opt in before Pricing Agent writes a real Product.price. */
  autoApplyPricing: boolean;
  /** On by default — SEO field changes are low-risk (metadata only, no financial/checkout impact), reversible, and safe to auto-apply. */
  autoApplySeo: boolean;
  /** Hard, code-enforced minimum margin (%) over real cost price — a price change is refused, not just discouraged, if it would go below this. */
  minMarginPercent: number;
  /** Off by default — lets Content Agent actually publish its caption to the connected real Facebook Page. */
  autoApplyContent: boolean;
  /** Off by default — lets Ads Agent actually create a real (PAUSED) Meta campaign. Activating real spend is always a separate, manual step regardless of this setting. */
  autoApplyAds: boolean;
  /** Real, Meta-enforced daily budget cap (USD) — required before Ads Agent can create a real campaign. */
  adsDailyBudgetUsd: number;
  /**
   * Off by default — COD has no payment guarantee, so even a fraud-clear COD order waits for a real
   * human to confirm it. Online-paid orders always auto-confirm once payment is verified, regardless
   * of this setting — real money already changed hands there.
   */
  autoConfirmCod: boolean;
}

export const DEFAULT_AGENT_SETTINGS: AgentSettings = {
  enabledAgents: ["seo", "content", "ads", "retention", "inventory", "pricing"],
  notifyWhatsApp: true,
  brandVoice: "",
  adsBudgetCap: "",
  marginFloor: "",
  orchestratorRiskTolerance: "balanced",
  qaStrictness: "standard",
  autoApplyPricing: false,
  autoApplySeo: true,
  minMarginPercent: 15,
  autoApplyContent: false,
  autoApplyAds: false,
  adsDailyBudgetUsd: 5,
  autoConfirmCod: false,
};

export function parseAgentSettings(raw: string | null | undefined): AgentSettings {
  if (!raw) return DEFAULT_AGENT_SETTINGS;
  try {
    const parsed = JSON.parse(raw);
    return { ...DEFAULT_AGENT_SETTINGS, ...parsed };
  } catch {
    return DEFAULT_AGENT_SETTINGS;
  }
}

export async function getAgentSettings(businessId: string): Promise<AgentSettings> {
  const business = await prisma.business.findUnique({
    where: { id: businessId },
    select: { agentSettings: true },
  });
  return parseAgentSettings(business?.agentSettings);
}

const RISK_TOLERANCE_LINE: Record<AgentSettings["orchestratorRiskTolerance"], string> = {
  conservative: "The business owner has asked you to be conservative — set modest, highly achievable targets rather than stretch goals.",
  balanced: "",
  aggressive: "The business owner has asked you to be aggressive — set ambitious, stretch targets rather than safe ones.",
};

export function orchestratorRiskLine(settings: AgentSettings): string {
  return RISK_TOLERANCE_LINE[settings.orchestratorRiskTolerance] ?? "";
}

const QA_STRICTNESS_LINE: Record<AgentSettings["qaStrictness"], string> = {
  lenient: "Only rewrite a task if there's a genuine, clear contradiction — leave minor stylistic differences alone.",
  standard: "",
  strict: "Be strict: also flag and tighten vague or unspecific tasks, not just outright contradictions.",
};

export function qaStrictnessLine(settings: AgentSettings): string {
  return QA_STRICTNESS_LINE[settings.qaStrictness] ?? "";
}

export function specialistExtraContext(specialistId: SpecialistId, settings: AgentSettings): string {
  const lines: string[] = [];
  if (settings.brandVoice.trim()) {
    lines.push(`Brand voice & guidelines from the business owner — follow these: ${settings.brandVoice.trim()}`);
  }
  if (specialistId === "ads" && settings.adsBudgetCap.trim()) {
    lines.push(`Advisory spend ceiling from the business owner — any campaign structure you propose should respect this: ${settings.adsBudgetCap.trim()}`);
  }
  if ((specialistId === "retention" || specialistId === "pricing") && settings.marginFloor.trim()) {
    lines.push(`Margin floor from the business owner — any discount, offer, or price match you propose must not go below this: ${settings.marginFloor.trim()}`);
  }
  return lines.join("\n");
}
