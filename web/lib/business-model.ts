export const VALID_BUSINESS_MODELS = ["own_products", "trending_products", "dropshipping", "mixed"];

/**
 * The seller's own real answer, picked at onboarding — the GOAL (real orders/growth) never
 * changes across these, only the shape of how to get there. Grounded in real retention/CAC/AOV
 * research (60% of DTC revenue comes from repeat customers; new-customer CAC runs 5-7x the cost
 * of retaining one), not a guess — each line points the Orchestrator at the lever that matters
 * most for that specific model, shared identically between the weekly cycle and the live chat.
 */
export const BUSINESS_MODEL_GUIDANCE: Record<string, string> = {
  own_products:
    "This seller makes/sources their OWN product line — they can build real brand equity and repeat-purchase loyalty around it. Lean into differentiation, quality/trust signals, and retention (repeat customers are worth far more than new ones for a real owned brand) — not just discount-driven traffic.",
  trending_products:
    "This seller chases whatever's actually trending right now — the specific product can and should change. Speed to market and riding real demand matters more than long-term brand-building on any one SKU; be honest that trend-chasing has a shorter shelf life, so the plan should keep testing what's next rather than over-investing in one product's long-term story.",
  dropshipping:
    "This seller dropships — a supplier holds and ships stock, so margins are typically thinner and shipping times are often the real weak point (slow shipping is a proven driver of lost repeat customers). Be honest about margin pressure when suggesting discounts, and consider whether setting realistic shipping-time expectations upfront (not overpromising) protects real repeat-order rate more than another acquisition push would.",
  mixed:
    "This seller runs a mix of their own products, trending items, and/or dropshipped items. Judge each recommendation against which of these is actually the most reliable, repeatable source of real orders right now, rather than treating the whole catalog as one strategy.",
};

export function businessModelGuidanceLine(businessModel: string | null | undefined): string {
  if (!businessModel || !BUSINESS_MODEL_GUIDANCE[businessModel]) return "";
  return BUSINESS_MODEL_GUIDANCE[businessModel];
}
