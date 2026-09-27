import { prisma } from "@/lib/prisma";
import { STUDIO_AGENT_IDS } from "@/lib/studio/config";

/**
 * Super Admin > Revenue & cost. Revenue = PlatformPayment rows (what sellers actually paid, net of
 * refunds). Cost = every AgentUsage row (Claude tokens, Brave searches, Studio images / video — all
 * logged per call) plus the payment processor's fees. Every period is compared with the one before it.
 * Not included (not logged anywhere yet): Twilio WhatsApp messages, hosting, R2 storage.
 */

export type FinancePeriod = "mtd" | "last_month" | "90d" | "ytd" | "all";

export const FINANCE_PERIODS: { id: FinancePeriod; label: string }[] = [
  { id: "mtd", label: "This month" },
  { id: "last_month", label: "Last month" },
  { id: "90d", label: "Last 90 days" },
  { id: "ytd", label: "This year" },
  { id: "all", label: "All time" },
];

export type CostKey = "claude" | "search" | "images" | "video" | "fees";

export const COST_LABELS: Record<CostKey, string> = {
  claude: "Claude AI (chat, plans, design, chatbot…)",
  search: "Web search (Brave)",
  images: "Studio images",
  video: "Studio reels (video)",
  fees: "Payment fees (Stripe)",
};

const DAY = 86400_000;

export function costKeyOf(agentId: string): Exclude<CostKey, "fees"> {
  if (agentId === "web-search") return "search";
  if (agentId === STUDIO_AGENT_IDS.image) return "images";
  if (agentId === STUDIO_AGENT_IDS.video) return "video";
  return "claude";
}

type Range = { from: Date | null; to: Date };

/** The period's range and the equally long range right before it (same days of the previous month for "this month"). */
export function periodRanges(period: FinancePeriod, now = new Date()): { current: Range; previous: Range | null; label: string; previousLabel: string | null } {
  const y = now.getFullYear();
  const m = now.getMonth();
  if (period === "mtd") {
    const from = new Date(y, m, 1);
    const prevFrom = new Date(y, m - 1, 1);
    // Same elapsed time into last month, capped at last month's end.
    const prevTo = new Date(Math.min(prevFrom.getTime() + (now.getTime() - from.getTime()), from.getTime()));
    return { current: { from, to: now }, previous: { from: prevFrom, to: prevTo }, label: "this month so far", previousLabel: `same days last month` };
  }
  if (period === "last_month") {
    const from = new Date(y, m - 1, 1);
    const to = new Date(y, m, 1);
    return { current: { from, to }, previous: { from: new Date(y, m - 2, 1), to: from }, label: from.toLocaleString("en", { month: "long" }), previousLabel: new Date(y, m - 2, 1).toLocaleString("en", { month: "long" }) };
  }
  if (period === "90d") {
    const from = new Date(now.getTime() - 90 * DAY);
    return { current: { from, to: now }, previous: { from: new Date(from.getTime() - 90 * DAY), to: from }, label: "last 90 days", previousLabel: "the 90 days before" };
  }
  if (period === "ytd") {
    const from = new Date(y, 0, 1);
    const prevFrom = new Date(y - 1, 0, 1);
    return { current: { from, to: now }, previous: { from: prevFrom, to: new Date(prevFrom.getTime() + (now.getTime() - from.getTime())) }, label: `${y} so far`, previousLabel: `same time in ${y - 1}` };
  }
  return { current: { from: null, to: now }, previous: null, label: "all time", previousLabel: null };
}

const inRange = (r: Range) => ({ ...(r.from ? { gte: r.from } : {}), lt: r.to });

export interface Totals {
  revenue: number; // net of refunds
  refunds: number; // positive number
  payments: number; // count of positive payments
  costs: Record<CostKey, number>;
  totalCost: number;
  profit: number;
  margin: number | null; // % of revenue, null when no revenue
}

function emptyCosts(): Record<CostKey, number> {
  return { claude: 0, search: 0, images: 0, video: 0, fees: 0 };
}

async function totalsFor(r: Range): Promise<Totals> {
  const [usage, pays] = await Promise.all([
    prisma.agentUsage.groupBy({ by: ["agentId"], where: { createdAt: inRange(r) }, _sum: { costUsd: true } }),
    prisma.platformPayment.findMany({ where: { paidAt: inRange(r) }, select: { amountUsd: true, feeUsd: true } }),
  ]);
  const costs = emptyCosts();
  for (const u of usage) costs[costKeyOf(u.agentId)] += u._sum.costUsd ?? 0;
  let revenue = 0;
  let refunds = 0;
  let payments = 0;
  for (const p of pays) {
    revenue += p.amountUsd;
    costs.fees += p.feeUsd;
    if (p.amountUsd < 0) refunds += -p.amountUsd;
    else payments += 1;
  }
  const totalCost = Object.values(costs).reduce((a, b) => a + b, 0);
  const profit = revenue - totalCost;
  return { revenue, refunds, payments, costs, totalCost, profit, margin: revenue > 0 ? (profit / revenue) * 100 : null };
}

export interface SellerPnl {
  id: string;
  name: string;
  plan: string;
  paying: boolean;
  revenue: number;
  costs: Record<CostKey, number>;
  totalCost: number;
  profit: number;
  margin: number | null;
}

async function sellersFor(r: Range): Promise<SellerPnl[]> {
  const [usage, pays, businesses] = await Promise.all([
    prisma.agentUsage.groupBy({ by: ["businessId", "agentId"], where: { createdAt: inRange(r) }, _sum: { costUsd: true } }),
    prisma.platformPayment.groupBy({ by: ["businessId"], where: { paidAt: inRange(r) }, _sum: { amountUsd: true, feeUsd: true } }),
    prisma.business.findMany({ select: { id: true, name: true, plan: true, subscriptionStatus: true } }),
  ]);
  const rows = new Map<string, SellerPnl>(
    businesses.map((b) => [b.id, { id: b.id, name: b.name || "(unnamed)", plan: b.plan, paying: b.subscriptionStatus === "active", revenue: 0, costs: emptyCosts(), totalCost: 0, profit: 0, margin: null }]),
  );
  for (const u of usage) {
    const row = rows.get(u.businessId);
    if (row) row.costs[costKeyOf(u.agentId)] += u._sum.costUsd ?? 0;
  }
  for (const p of pays) {
    const row = rows.get(p.businessId);
    if (!row) continue;
    row.revenue += p._sum.amountUsd ?? 0;
    row.costs.fees += p._sum.feeUsd ?? 0;
  }
  const out = [...rows.values()];
  for (const row of out) {
    row.totalCost = Object.values(row.costs).reduce((a, b) => a + b, 0);
    row.profit = row.revenue - row.totalCost;
    row.margin = row.revenue > 0 ? (row.profit / row.revenue) * 100 : null;
  }
  // Sellers with neither revenue nor cost in the period add nothing to compare.
  return out.filter((row) => row.revenue !== 0 || row.totalCost > 0);
}

export interface SeriesPoint {
  key: string;
  label: string;
  revenue: number;
  cost: number;
  profit: number;
}

/** Revenue vs cost over the period — by day for short periods, by month otherwise. */
async function seriesFor(r: Range): Promise<SeriesPoint[]> {
  const [usage, pays] = await Promise.all([
    prisma.agentUsage.findMany({ where: { createdAt: inRange(r) }, select: { createdAt: true, costUsd: true } }),
    prisma.platformPayment.findMany({ where: { paidAt: inRange(r) }, select: { paidAt: true, amountUsd: true, feeUsd: true } }),
  ]);
  const first = r.from ?? [...usage.map((u) => u.createdAt), ...pays.map((p) => p.paidAt)].reduce<Date | null>((a, d) => (!a || d < a ? d : a), null) ?? r.to;
  const daily = r.to.getTime() - first.getTime() <= 62 * DAY;
  const keyOf = (d: Date) => (daily ? `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}` : `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
  const points = new Map<string, SeriesPoint>();
  // Every bucket from start to end, so gaps show as zero instead of disappearing.
  const cursor = daily ? new Date(first.getFullYear(), first.getMonth(), first.getDate()) : new Date(first.getFullYear(), first.getMonth(), 1);
  while (cursor < r.to) {
    const key = keyOf(cursor);
    points.set(key, { key, label: daily ? cursor.toLocaleDateString("en", { day: "numeric", month: "short" }) : cursor.toLocaleDateString("en", { month: "short", year: "2-digit" }), revenue: 0, cost: 0, profit: 0 });
    if (daily) cursor.setDate(cursor.getDate() + 1);
    else cursor.setMonth(cursor.getMonth() + 1);
  }
  for (const u of usage) {
    const p = points.get(keyOf(u.createdAt));
    if (p) p.cost += u.costUsd;
  }
  for (const pay of pays) {
    const p = points.get(keyOf(pay.paidAt));
    if (!p) continue;
    p.revenue += pay.amountUsd;
    p.cost += pay.feeUsd;
  }
  const out = [...points.values()];
  for (const p of out) p.profit = p.revenue - p.cost;
  return out;
}

export async function getFinance(period: FinancePeriod) {
  const ranges = periodRanges(period);
  const [current, previous, sellers, series, payments, activeSubs] = await Promise.all([
    totalsFor(ranges.current),
    ranges.previous ? totalsFor(ranges.previous) : Promise.resolve(null),
    sellersFor(ranges.current),
    seriesFor(ranges.current),
    prisma.platformPayment.findMany({
      where: { paidAt: inRange(ranges.current) },
      orderBy: { paidAt: "desc" },
      take: 50,
      include: { business: { select: { name: true } } },
    }),
    prisma.business.count({ where: { subscriptionStatus: "active" } }),
  ]);
  const payingSellers = sellers.filter((s) => s.revenue > 0).length;
  const activeSellers = sellers.filter((s) => s.totalCost > 0).length;
  return {
    ranges,
    current,
    previous,
    sellers,
    series,
    payments,
    unit: {
      payingSellers,
      activeSellers,
      activeSubs,
      arpu: payingSellers ? current.revenue / payingSellers : null,
      costPerActiveSeller: activeSellers ? current.totalCost / activeSellers : null,
      costShare: current.revenue > 0 ? (current.totalCost / current.revenue) * 100 : null,
      losingSellers: sellers.filter((s) => s.profit < 0).length,
    },
  };
}

/** Stripe's standard card fee, used only when the real fee can't be read from Stripe. */
export function estimatedStripeFee(amountUsd: number): number {
  return amountUsd > 0 ? Math.round((amountUsd * 0.029 + 0.3) * 100) / 100 : 0;
}
