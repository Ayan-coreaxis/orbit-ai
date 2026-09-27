import { prisma } from "@/lib/prisma";

/**
 * Strategy Lab — shared types + everything that is REAL CODE (never AI): the business snapshot the
 * planner reasons from, the per-strategy measurement, and the profit guard. The AI only writes the
 * ideas; every number a seller sees here is computed from real orders/products.
 */

export const STRATEGY_KINDS = [
  "word_of_mouth",
  "loyalty",
  "retention",
  "offer",
  "content",
  "partnership",
  "ads",
  "operations",
  "other",
] as const;
export type StrategyKind = (typeof STRATEGY_KINDS)[number];

export type StepOwner = "orbit" | "seller" | "not_possible";
export interface StrategyStep {
  text: string;
  owner: StepOwner;
  note?: string;
}

/** What real code can measure. `manual` = the seller tracks it (nothing in the DB captures it). */
export const METRIC_TYPES = {
  coupon_orders: "Orders that used a specific coupon code",
  orders: "Valid orders placed",
  revenue: "Revenue from valid orders",
  avg_order_value: "Average order value",
  new_customers: "First-time customers (by phone)",
  repeat_customers: "Returning customers (had an earlier order)",
  cancel_rate: "Share of orders cancelled (lower is better)",
  manual: "Tracked by the seller (Orbit has no data source for it)",
} as const;
export type MetricType = keyof typeof METRIC_TYPES;

export interface StrategyMetric {
  type: MetricType;
  label: string;
  couponCode?: string;
  target?: number;
}

export type StrategyStatus = "proposed" | "running" | "paused" | "stopped" | "done";

export function parseSteps(raw: string | null | undefined): StrategyStep[] {
  try {
    const v = JSON.parse(raw ?? "[]");
    if (!Array.isArray(v)) return [];
    return v
      .filter((s) => s && typeof s.text === "string")
      .map((s) => ({
        text: String(s.text),
        owner: (["orbit", "seller", "not_possible"].includes(s.owner) ? s.owner : "seller") as StepOwner,
        note: typeof s.note === "string" && s.note.trim() ? s.note : undefined,
      }));
  } catch {
    return [];
  }
}

export function parseMetric(raw: string | null | undefined): StrategyMetric {
  try {
    const v = JSON.parse(raw ?? "{}");
    const type = (v?.type in METRIC_TYPES ? v.type : "manual") as MetricType;
    return {
      type,
      label: typeof v?.label === "string" && v.label ? v.label : METRIC_TYPES[type],
      couponCode: typeof v?.couponCode === "string" && v.couponCode ? v.couponCode.toUpperCase() : undefined,
      target: typeof v?.target === "number" && Number.isFinite(v.target) ? v.target : undefined,
    };
  } catch {
    return { type: "manual", label: METRIC_TYPES.manual };
  }
}

// ---------------------------------------------------------------------------------------------
// Capabilities — what Orbit can honestly set up TODAY. The planner must tag each step against this
// list; anything outside it is "seller" or "not_possible". Keep this in sync as features ship.
// ---------------------------------------------------------------------------------------------

export const ORBIT_CAN = [
  "Create coupon codes (percent or fixed; first-order-only, per-customer limit, free shipping, auto-apply, minimum cart, product-specific, expiry)",
  "Create product bundles",
  "Add new products, edit prices / cost / stock / descriptions / photos / variants, or remove products (the owner presses Apply first)",
  "Change store settings: delivery fee, city delivery zones, free-delivery threshold, tax, currency (owner presses Apply)",
  "Turn on a loyalty points program, a referral program, or gift cards",
  "Add extra checkout fields (e.g. date of birth, name to print, delivery day) — answers saved on each order",
  "Design / add store pages, landing pages and forms with Orbit Design",
  "WhatsApp order confirmation for COD orders (needs WhatsApp connected; the message wording is fixed — Orbit cannot add custom lines to it yet)",
  "Abandoned-cart WhatsApp recovery (needs WhatsApp connected; fixed wording)",
  "Post-delivery review request",
  "Back-in-stock notifications",
  "Write captions, content ideas, product copy, messages for the seller to send",
  "Write SEO titles/descriptions for products and pages",
  "Publish a post to the seller's Facebook Page or Instagram (only if connected)",
  "Make product photos, posters and short product reels with Orbit Studio (Growth and Scale plans only)",
  "Answer shoppers in the store chat bubble, Messenger and Instagram DMs (DMs need the Page connected)",
  "Create a Meta ad campaign in PAUSED state (only if the Ad Account is connected; seller turns spend on)",
  "A/B test the storefront hero text",
];

export const ORBIT_CANNOT_YET = [
  "Send a WhatsApp/SMS/email broadcast to a custom customer segment (coming soon — for now Orbit writes it, the seller sends it)",
  "Start Instagram DMs to people, or read / reply to comments and mentions",
  "Subscriptions / recurring orders",
  "JazzCash / EasyPaisa or any payment method besides COD and Stripe",
  "Contact influencers/creators or other businesses on the seller's behalf",
  "Anything physical: printing, packaging, gifts, delivery, photography",
  "Hiring people, dealing with suppliers",
];

// ---------------------------------------------------------------------------------------------
// Snapshot — real numbers only.
// ---------------------------------------------------------------------------------------------

const DAY = 24 * 60 * 60 * 1000;
const validOrder = { status: { not: "cancelled" }, verified: true } as const;

export interface ProductMargin {
  name: string;
  price: number;
  costPrice: number | null;
  marginPct: number | null;
  stock: number;
}

export interface BusinessSnapshot {
  name: string;
  niche: string;
  businessModel: string | null;
  onboardingAnswers: string | null;
  plan: string;
  currency: string;
  last30: { orders: number; revenue: number; aov: number; cancelled: number; newCustomers: number; repeatCustomers: number };
  prev30: { orders: number; revenue: number };
  allTimeOrders: number;
  allTimeCustomers: number;
  visitors30: number;
  conversion30: number;
  products: ProductMargin[];
  connected: { facebook: boolean; instagram: boolean; adAccount: boolean; whatsapp: boolean; stripe: boolean; courier: boolean };
  featuresOn: string[];
  activeCoupons: string[];
  competitorNotes: string[]; // reference only
}

function orderPhones(orders: { customerPhone: string }[]) {
  return new Set(orders.map((o) => o.customerPhone.replace(/\D/g, "").slice(-10)).filter(Boolean));
}

export async function getBusinessSnapshot(businessId: string): Promise<BusinessSnapshot> {
  const now = Date.now();
  const since30 = new Date(now - 30 * DAY);
  const since60 = new Date(now - 60 * DAY);

  const [business, orders30, cancelled30, prevOrders, allTimeOrders, allPhones, products, coupons, report, visitors] = await Promise.all([
    prisma.business.findUniqueOrThrow({ where: { id: businessId } }),
    prisma.order.findMany({ where: { businessId, createdAt: { gte: since30 }, ...validOrder }, select: { total: true, customerPhone: true } }),
    prisma.order.count({ where: { businessId, createdAt: { gte: since30 }, status: "cancelled" } }),
    prisma.order.findMany({ where: { businessId, createdAt: { gte: since60, lt: since30 }, ...validOrder }, select: { total: true } }),
    prisma.order.count({ where: { businessId, ...validOrder } }),
    prisma.order.findMany({ where: { businessId, ...validOrder, createdAt: { lt: since30 } }, select: { customerPhone: true } }),
    prisma.product.findMany({ where: { businessId }, select: { name: true, price: true, costPrice: true, stock: true }, take: 60 }),
    prisma.coupon.findMany({ where: { businessId, active: true }, select: { code: true }, take: 20 }),
    prisma.growthReport.findFirst({ where: { businessId }, orderBy: { createdAt: "desc" }, select: { content: true } }),
    prisma.$queryRaw<{ c: bigint }[]>`SELECT COUNT(DISTINCT "sessionId") AS c FROM "StoreEvent" WHERE "businessId" = ${businessId} AND "type" = 'view_store' AND "createdAt" >= ${since30}`,
  ]);

  const earlier = orderPhones(allPhones);
  const phones30 = orderPhones(orders30);
  let repeat = 0;
  for (const p of phones30) if (earlier.has(p)) repeat++;

  const revenue30 = orders30.reduce((s, o) => s + o.total, 0);
  const visitors30 = Number(visitors[0]?.c ?? 0);

  let competitorNotes: string[] = [];
  try {
    const parsed = JSON.parse(report?.content ?? "{}");
    competitorNotes = (Array.isArray(parsed?.competitors) ? parsed.competitors : [])
      .slice(0, 5)
      .map((c: { name?: string; gap?: string; topProduct?: string }) => `${c.name ?? "competitor"}: ${c.gap ?? c.topProduct ?? ""}`.slice(0, 220));
  } catch {
    competitorNotes = [];
  }

  const featuresOn = [
    business.loyaltyEnabled && "loyalty points",
    business.referralEnabled && "referral program",
    business.giftCardsEnabled && "gift cards",
    business.codVerification && "COD WhatsApp confirmation",
  ].filter(Boolean) as string[];

  return {
    name: business.name,
    niche: business.niche,
    businessModel: business.businessModel,
    onboardingAnswers: business.onboardingAnswers,
    plan: business.plan,
    currency: business.storeCurrency,
    last30: {
      orders: orders30.length,
      revenue: Math.round(revenue30),
      aov: orders30.length ? Math.round(revenue30 / orders30.length) : 0,
      cancelled: cancelled30,
      newCustomers: phones30.size - repeat,
      repeatCustomers: repeat,
    },
    prev30: { orders: prevOrders.length, revenue: Math.round(prevOrders.reduce((s, o) => s + o.total, 0)) },
    allTimeOrders,
    allTimeCustomers: orderPhones([...allPhones, ...orders30]).size,
    visitors30,
    conversion30: visitors30 > 0 ? Math.round((orders30.length / visitors30) * 1000) / 10 : 0,
    products: products.map((p) => ({
      name: p.name,
      price: p.price,
      costPrice: p.costPrice,
      marginPct: p.costPrice != null && p.price > 0 ? Math.round(((p.price - p.costPrice) / p.price) * 100) : null,
      stock: p.stock,
    })),
    connected: {
      facebook: !!business.metaPageId,
      instagram: !!business.metaInstagramUserId,
      adAccount: !!business.metaAdAccountId,
      whatsapp: !!business.whatsappInboundNumber || !!process.env.TWILIO_WHATSAPP_FROM,
      stripe: business.paymentProvider !== "cod" && !!business.stripeSecretKey,
      courier: !!business.courierProvider,
    },
    featuresOn,
    activeCoupons: coupons.map((c) => c.code),
    competitorNotes,
  };
}

// ---------------------------------------------------------------------------------------------
// Profit guard — real code, not a model opinion.
// ---------------------------------------------------------------------------------------------

const MIN_HEALTHY_MARGIN_PCT = 15;

export function profitGuard(discountPct: number | null | undefined, products: ProductMargin[]): string | null {
  if (!discountPct || discountPct <= 0) return null;
  const withCost = products.filter((p) => p.marginPct != null);
  if (withCost.length === 0) {
    return `Gives ${discountPct}% off, but no product has a cost price yet — Orbit can't check whether this still makes a profit. Add cost prices in Store → Products.`;
  }
  const after = withCost.map((p) => ({ name: p.name, left: (p.marginPct as number) - discountPct }));
  const losing = after.filter((a) => a.left < 0);
  const thin = after.filter((a) => a.left >= 0 && a.left < MIN_HEALTHY_MARGIN_PCT);
  if (losing.length) {
    return `Loses money: after ${discountPct}% off, ${losing.length} product(s) sell below cost (e.g. ${losing[0].name}). Limit it to products with more margin or lower the discount.`;
  }
  if (thin.length) {
    return `Thin margin: after ${discountPct}% off, ${thin.length} product(s) keep under ${MIN_HEALTHY_MARGIN_PCT}% margin (e.g. ${thin[0].name}, ${Math.round(thin[0].left)}% left).`;
  }
  const worst = Math.min(...after.map((a) => a.left));
  return `Profit check OK: even after ${discountPct}% off, every product with a cost price keeps at least ${Math.round(worst)}% margin.`;
}

// ---------------------------------------------------------------------------------------------
// Measurement — compares the strategy's running window with the same-length window just before it.
// ---------------------------------------------------------------------------------------------

export interface StrategyResult {
  measurable: boolean;
  label: string;
  value: number | null;
  baseline: number | null; // same metric, same length window right before the strategy started
  unit: "count" | "money" | "percent";
  target?: number;
  windowDays: number;
  note?: string;
}

async function metricFor(
  businessId: string,
  metric: StrategyMetric,
  from: Date,
  to: Date,
): Promise<{ value: number | null; note?: string }> {
  const range = { gte: from, lt: to };
  switch (metric.type) {
    case "coupon_orders": {
      if (!metric.couponCode) return { value: null, note: "No coupon code set for this strategy." };
      const n = await prisma.order.count({ where: { businessId, createdAt: range, couponCode: metric.couponCode, ...validOrder } });
      return { value: n };
    }
    case "orders":
      return { value: await prisma.order.count({ where: { businessId, createdAt: range, ...validOrder } }) };
    case "revenue": {
      const agg = await prisma.order.aggregate({ where: { businessId, createdAt: range, ...validOrder }, _sum: { total: true } });
      return { value: Math.round(agg._sum.total ?? 0) };
    }
    case "avg_order_value": {
      const agg = await prisma.order.aggregate({ where: { businessId, createdAt: range, ...validOrder }, _avg: { total: true } });
      return { value: agg._avg.total != null ? Math.round(agg._avg.total) : null };
    }
    case "new_customers":
    case "repeat_customers": {
      const [inWindow, before] = await Promise.all([
        prisma.order.findMany({ where: { businessId, createdAt: range, ...validOrder }, select: { customerPhone: true } }),
        prisma.order.findMany({ where: { businessId, createdAt: { lt: from }, ...validOrder }, select: { customerPhone: true } }),
      ]);
      const earlier = orderPhones(before);
      const phones = orderPhones(inWindow);
      let repeat = 0;
      for (const p of phones) if (earlier.has(p)) repeat++;
      return { value: metric.type === "repeat_customers" ? repeat : phones.size - repeat };
    }
    case "cancel_rate": {
      const [total, cancelled] = await Promise.all([
        prisma.order.count({ where: { businessId, createdAt: range } }),
        prisma.order.count({ where: { businessId, createdAt: range, status: "cancelled" } }),
      ]);
      return { value: total > 0 ? Math.round((cancelled / total) * 1000) / 10 : null };
    }
    default:
      return { value: null, note: "Orbit has no data source for this — the seller tracks it." };
  }
}

export async function measureStrategy(
  businessId: string,
  s: { metric: string; startedAt: Date | null; endedAt: Date | null; durationDays: number | null },
): Promise<StrategyResult> {
  const metric = parseMetric(s.metric);
  const unit: StrategyResult["unit"] =
    metric.type === "revenue" || metric.type === "avg_order_value" ? "money" : metric.type === "cancel_rate" ? "percent" : "count";
  const base = { label: metric.label, unit, target: metric.target };

  if (metric.type === "manual") {
    return { ...base, measurable: false, value: null, baseline: null, windowDays: 0, note: METRIC_TYPES.manual };
  }
  if (!s.startedAt) {
    return { ...base, measurable: true, value: null, baseline: null, windowDays: 0, note: "Starts measuring once the plan is approved." };
  }

  const start = s.startedAt;
  const plannedEnd = s.durationDays ? new Date(start.getTime() + s.durationDays * DAY) : null;
  const endCandidates = [Date.now(), s.endedAt?.getTime(), plannedEnd?.getTime()].filter((x): x is number => typeof x === "number");
  const end = new Date(Math.min(...endCandidates));
  const windowMs = Math.max(end.getTime() - start.getTime(), 60 * 60 * 1000);
  const windowDays = Math.max(1, Math.round(windowMs / DAY));

  const [now, before] = await Promise.all([
    metricFor(businessId, metric, start, end),
    // A coupon made for this strategy didn't exist before it, so its "before" is zero by definition.
    metric.type === "coupon_orders"
      ? Promise.resolve({ value: 0 as number | null })
      : metricFor(businessId, metric, new Date(start.getTime() - windowMs), start),
  ]);

  return { ...base, measurable: true, value: now.value, baseline: before.value, windowDays, note: now.note };
}

// ---------------------------------------------------------------------------------------------
// Loader — what the Strategy Lab page and GET /api/strategy-lab show.
// ---------------------------------------------------------------------------------------------

export interface StrategyView {
  id: string;
  title: string;
  kind: string;
  audience: string;
  why: string;
  steps: StrategyStep[];
  durationDays: number | null;
  metric: StrategyMetric;
  costNote: string | null;
  discountPct: number | null;
  profitNote: string | null;
  status: StrategyStatus;
  startedAt: string | null;
  endedAt: string | null;
  executedAt: string | null;
  result: StrategyResult | null;
  actions: ActionView[];
}

export interface ActionView {
  id: string;
  tool: string;
  status: "done" | "skipped" | "failed" | "needs_connection" | "deliverable";
  summary: string;
  output: string | null;
  createdAt: string;
}

export interface AgentView {
  id: string;
  name: string;
  role: string;
  tools: string[];
  dataScopes: string[];
  budgetUsd: number;
  spentUsd: number;
  status: "active" | "retired";
  strategyTitles: string[];
}

export interface PlanView {
  id: string;
  title: string;
  diagnosis: string;
  status: "draft" | "active" | "archived";
  approvedAt: string | null;
  createdAt: string;
  strategies: StrategyView[];
  agents: AgentView[];
}

type PlanRow = Awaited<ReturnType<typeof findPlans>>[number];

function findPlans(businessId: string, status: "active" | "draft") {
  return prisma.growthPlan.findMany({
    where: { businessId, status },
    orderBy: status === "active" ? { approvedAt: "desc" } : { createdAt: "desc" },
    take: 1,
    include: {
      strategies: { orderBy: { position: "asc" }, include: { actions: { orderBy: { createdAt: "asc" } } } },
      agents: { orderBy: { createdAt: "asc" }, include: { strategies: { select: { title: true } } } },
    },
  });
}

async function toPlanView(businessId: string, plan: PlanRow): Promise<PlanView> {
  const strategies = await Promise.all(
    plan.strategies.map(async (s) => ({
      id: s.id,
      title: s.title,
      kind: s.kind,
      audience: s.audience,
      why: s.why,
      steps: parseSteps(s.steps),
      durationDays: s.durationDays,
      metric: parseMetric(s.metric),
      costNote: s.costNote,
      discountPct: s.discountPct,
      profitNote: s.profitNote,
      status: s.status as StrategyStatus,
      startedAt: s.startedAt?.toISOString() ?? null,
      endedAt: s.endedAt?.toISOString() ?? null,
      executedAt: s.executedAt?.toISOString() ?? null,
      result: plan.status === "draft" ? null : await measureStrategy(businessId, s),
      actions: s.actions.map((a) => ({
        id: a.id,
        tool: a.tool,
        status: a.status as ActionView["status"],
        summary: a.summary,
        output: a.output,
        createdAt: a.createdAt.toISOString(),
      })),
    })),
  );
  return {
    id: plan.id,
    title: plan.title,
    diagnosis: plan.diagnosis,
    status: plan.status as PlanView["status"],
    approvedAt: plan.approvedAt?.toISOString() ?? null,
    createdAt: plan.createdAt.toISOString(),
    strategies,
    agents: plan.agents.map((a) => ({
      id: a.id,
      name: a.name,
      role: a.role,
      tools: jsonList(a.tools),
      dataScopes: jsonList(a.dataScopes),
      budgetUsd: a.budgetUsd,
      spentUsd: Math.round(a.spentUsd * 100) / 100,
      status: a.status as AgentView["status"],
      strategyTitles: a.strategies.map((x) => x.title),
    })),
  };
}

function jsonList(raw: string | null | undefined): string[] {
  try {
    const v = JSON.parse(raw ?? "[]");
    return Array.isArray(v) ? v.map(String) : [];
  } catch {
    return [];
  }
}

export async function loadStrategyLab(businessId: string): Promise<{ active: PlanView | null; draft: PlanView | null; canHire: boolean }> {
  const [[active], [draft], business] = await Promise.all([
    findPlans(businessId, "active"),
    findPlans(businessId, "draft"),
    prisma.business.findUnique({ where: { id: businessId }, select: { plan: true } }),
  ]);
  return {
    active: active ? await toPlanView(businessId, active) : null,
    draft: draft ? await toPlanView(businessId, draft) : null,
    canHire: business?.plan === "scale",
  };
}
