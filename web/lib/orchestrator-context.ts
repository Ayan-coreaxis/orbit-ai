import { prisma } from "@/lib/prisma";
import { getOrderGrowth } from "@/lib/get-order-growth";
import { businessModelGuidanceLine } from "@/lib/business-model";
import { sellerAnswersBlock } from "@/lib/onboarding-questions";
import { latestCompetitors } from "@/lib/competitor-intel";
import { money } from "@/lib/money";

/**
 * Builds the real, checkable context the Orchestrator chat is grounded in — same
 * "never fabricate a number" rule as everything else. Kept compact
 * on purpose: this is sent on every chat turn, not once per week.
 */
export async function buildOrchestratorContext(businessId: string): Promise<string> {
  const business = await prisma.business.findUnique({
    where: { id: businessId },
    include: {
      products: true,
      orders: true,
    },
  });
  if (!business) return "No business data available.";

  const { competitors } = await latestCompetitors(businessId);

  const lowStock = business.products.filter((p) => p.stock <= 5);
  const revenue = business.orders
    .filter((o) => o.status !== "cancelled")
    .reduce((sum, o) => sum + o.total, 0);
  const pendingOrders = business.orders.filter((o) => o.status === "pending").length;
  const orderGrowth = await getOrderGrowth(businessId);
  const businessModelGuidance = businessModelGuidanceLine(business.businessModel);

  return `Business: ${business.name} — sells ${business.niche}. The single metric this business exists to move is real orders, not traffic or vague brand awareness — ground every answer in that.${
    businessModelGuidance ? `\nHow this seller actually operates (shapes HOW you advise, not the goal itself): ${businessModelGuidance}` : ""
  }${sellerAnswersBlock(business.onboardingAnswers)}

Competitor notes on file (reference only — never the base of a plan): ${
    competitors.length ? competitors.map((c) => `${c.name}: ${c.gap}`).join(" | ") : "none scanned yet"
  }

REAL BUSINESS DATA (actually in the database right now — never contradict this with a made-up figure):
- Real existing website on file: ${business.website ?? "none given"}.
- Products actually listed in Orbit's own store/catalog: ${business.products.length} total, ${lowStock.length} low on stock${
    lowStock.length ? ` (${lowStock.map((p) => p.name).join(", ")})` : ""
  }.${
    business.products.length === 0 && business.website
      ? ` IMPORTANT: this business already has a real live website (${business.website}) — they are NOT starting from zero. Orbit's own catalog is just empty because nothing has been imported into it yet. Never tell them to "build a website" or "build a store from scratch," they already have one.`
      : ""
  }
- Orders: ${business.orders.length} total, ${pendingOrders} still pending fulfillment.
- Real revenue from actual orders placed: ${money(revenue, business.storeCurrency)} (this is the only real revenue figure — no other sales data exists in this system).
- Real order growth, week over week: ${orderGrowth.thisWeekOrders} order(s) in the last 7 days vs ${orderGrowth.lastWeekOrders} the week before${
    orderGrowth.orderGrowthPct !== null
      ? ` (${orderGrowth.orderGrowthPct >= 0 ? "+" : ""}${orderGrowth.orderGrowthPct.toFixed(0)}%)`
      : " (no real orders last week to compare against yet)"
  }.`;
}
