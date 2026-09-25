import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { reviewDueStrategies } from "@/lib/strategy-review";
import { executeActivePlan } from "@/lib/harness";

/**
 * Daily: for every business with an active growth plan, (1) carry out any Orbit steps that never
 * ran, and (2) open a review in the Orchestrator chat for strategies whose run is over (or every
 * 2 weeks for ongoing ones). Reviews only PROPOSE changes — the owner applies them.
 */
export const maxDuration = 300;

export async function GET(req: NextRequest) {
  const auth = req.headers.get("authorization");
  if (process.env.CRON_SECRET && auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const plans = await prisma.growthPlan.findMany({ where: { status: "active" }, select: { businessId: true }, take: 500 });
  let reviewed = 0;
  let failed = 0;
  for (const { businessId } of plans) {
    try {
      await executeActivePlan(businessId);
      if (await reviewDueStrategies(businessId)) reviewed++;
    } catch (e) {
      failed++;
      console.warn("[cron/strategy-review]", businessId, e);
    }
  }
  return NextResponse.json({ plans: plans.length, reviewed, failed });
}
