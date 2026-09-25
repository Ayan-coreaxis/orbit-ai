import { prisma } from "@/lib/prisma";

export const PLAN_LABELS: Record<string, string> = {
  starter: "Starter",
  growth: "Growth",
  scale: "Scale",
};

export const PLAN_PRICE_USD: Record<string, number> = {
  starter: 50,
  growth: 75,
  scale: 150,
};

/**
 * Default real AI-cost cap per plan — set well under that plan's price so a business can never
 * cost more in real AI usage than it pays. Real observed usage is far below even these
 * (a heavy business used ~$0.50/month in testing), so this is a wide safety margin, not a tight
 * budget — it exists to catch bugs or abuse, not to constrain normal use. This is the outer,
 * calendar-month ceiling — see SESSION/WEEKLY below for the rolling windows that do the actual
 * day-to-day rate limiting, the same way Claude.ai's own 5-hour + weekly limits work.
 */
export const PLAN_DEFAULT_CAP_USD: Record<string, number> = {
  starter: 15, // 30% of $50 price — 70%+ gross margin guaranteed even at full cap usage
  growth: 25, // 33% of $75 price
  scale: 50, // 33% of $150 price
};

const SESSION_WINDOW_HOURS = 5;
const WEEKLY_WINDOW_DAYS = 7;
/** What share of the monthly cap a single rolling window may use — keeps any one burst from draining the whole month. */
const SESSION_CAP_FRACTION = 0.2;
const WEEKLY_CAP_FRACTION = 0.6;

export type UsageWindowId = "session" | "weekly" | "monthly";

export interface UsageWindowStatus {
  usedUsd: number;
  capUsd: number;
  atCap: boolean;
  resetsInHours: number;
}

export interface UsageStatus {
  plan: string;
  /** Headline numbers — the calendar-month view, same shape the UI showed before. */
  usedUsd: number;
  capUsd: number | null;
  remainingUsd: number | null;
  atCap: boolean;
  /** Which rolling window is actually blocking new activity right now, if any. */
  blockedWindow: UsageWindowId | null;
  session: UsageWindowStatus | null;
  weekly: UsageWindowStatus | null;
}

function hoursAgo(hours: number): Date {
  return new Date(Date.now() - hours * 60 * 60 * 1000);
}

function startOfMonth(): Date {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

async function getUsageSince(businessId: string, since: Date): Promise<number> {
  const result = await prisma.agentUsage.aggregate({
    where: { businessId, createdAt: { gte: since } },
    _sum: { costUsd: true },
  });
  return result._sum.costUsd ?? 0;
}

/** Real month-to-date AI cost for a business, summed from actual AgentUsage rows. */
export async function getMonthlyUsageUsd(businessId: string): Promise<number> {
  return getUsageSince(businessId, startOfMonth());
}

export async function getUsageStatus(businessId: string): Promise<UsageStatus> {
  const business = await prisma.business.findUnique({
    where: { id: businessId },
    select: { plan: true, monthlyUsageCapUsd: true },
  });
  const plan = business?.plan ?? "starter";
  const monthlyCapUsd = business?.monthlyUsageCapUsd ?? null;

  const [monthlyUsedUsd, sessionUsedUsd, weeklyUsedUsd] = await Promise.all([
    getMonthlyUsageUsd(businessId),
    getUsageSince(businessId, hoursAgo(SESSION_WINDOW_HOURS)),
    getUsageSince(businessId, hoursAgo(WEEKLY_WINDOW_DAYS * 24)),
  ]);

  const remainingUsd = monthlyCapUsd === null ? null : Math.max(0, monthlyCapUsd - monthlyUsedUsd);
  const monthlyAtCap = monthlyCapUsd !== null && monthlyUsedUsd >= monthlyCapUsd;

  let session: UsageWindowStatus | null = null;
  let weekly: UsageWindowStatus | null = null;
  let blockedWindow: UsageWindowId | null = null;

  if (monthlyCapUsd !== null) {
    const sessionCapUsd = monthlyCapUsd * SESSION_CAP_FRACTION;
    const weeklyCapUsd = monthlyCapUsd * WEEKLY_CAP_FRACTION;
    session = {
      usedUsd: sessionUsedUsd,
      capUsd: sessionCapUsd,
      atCap: sessionUsedUsd >= sessionCapUsd,
      resetsInHours: SESSION_WINDOW_HOURS,
    };
    weekly = {
      usedUsd: weeklyUsedUsd,
      capUsd: weeklyCapUsd,
      atCap: weeklyUsedUsd >= weeklyCapUsd,
      resetsInHours: WEEKLY_WINDOW_DAYS * 24,
    };
    // Report whichever window is actually blocking — soonest-resetting (least severe) first,
    // since that's the one the business should hear about: "wait a few hours," not "wait a month."
    if (session.atCap) blockedWindow = "session";
    else if (weekly.atCap) blockedWindow = "weekly";
    else if (monthlyAtCap) blockedWindow = "monthly";
  }

  return {
    plan,
    usedUsd: monthlyUsedUsd,
    capUsd: monthlyCapUsd,
    remainingUsd,
    atCap: blockedWindow !== null,
    blockedWindow,
    session,
    weekly,
  };
}

const WINDOW_LABEL: Record<UsageWindowId, string> = {
  session: `${SESSION_WINDOW_HOURS}-hour`,
  weekly: "weekly",
  monthly: "monthly",
};

export class UsageCapExceededError extends Error {
  constructor(
    public window: UsageWindowId,
    public usedUsd: number,
    public capUsd: number,
  ) {
    const resetMessage =
      window === "session"
        ? `This resets in a few hours — no need to wait for anything else.`
        : window === "weekly"
          ? `This resets on a rolling 7-day basis — you'll have room again within the week.`
          : `This is already flagged to the platform owner — they can raise your cap right away, no need to wait for next month.`;
    super(
      `You've hit your ${WINDOW_LABEL[window]} AI usage limit ($${usedUsd.toFixed(2)} of $${capUsd.toFixed(2)}). ${resetMessage}`,
    );
    this.name = "UsageCapExceededError";
  }
}

/**
 * Real gate — call before starting any new AI cycle. Throws (never silently overspends) if any
 * window is at cap. Checks the fast-resetting session window first, then weekly, then the
 * calendar-month outer bound — so the error a business sees always matches how long they'll
 * actually be waiting.
 */
export async function assertUnderUsageCap(businessId: string): Promise<void> {
  const status = await getUsageStatus(businessId);
  if (!status.blockedWindow) return;
  if (status.blockedWindow === "session" && status.session) {
    throw new UsageCapExceededError("session", status.session.usedUsd, status.session.capUsd);
  }
  if (status.blockedWindow === "weekly" && status.weekly) {
    throw new UsageCapExceededError("weekly", status.weekly.usedUsd, status.weekly.capUsd);
  }
  if (status.capUsd !== null) {
    throw new UsageCapExceededError("monthly", status.usedUsd, status.capUsd);
  }
}
