import { NextResponse, after } from "next/server";
import { executeActivePlan } from "@/lib/harness";
import { prisma } from "@/lib/prisma";
import { getActiveBusinessId } from "@/lib/get-active-business-id";

/**
 * The seller's "yes, run it". Only a draft can be approved. The previous active plan is archived
 * (its still-running strategies are stopped, so nothing keeps running under an old plan), and every
 * strategy in the approved plan starts running now — measurement windows begin at this moment.
 */
export async function POST(_req: Request, { params }: { params: Promise<{ planId: string }> }) {
  const businessId = await getActiveBusinessId();
  if (!businessId) return NextResponse.json({ error: "No active business." }, { status: 400 });
  const { planId } = await params;

  const plan = await prisma.growthPlan.findFirst({ where: { id: planId, businessId }, select: { status: true } });
  if (!plan) return NextResponse.json({ error: "Plan not found." }, { status: 404 });
  if (plan.status !== "draft") return NextResponse.json({ error: "Only a draft plan can be approved." }, { status: 400 });

  const now = new Date();
  await prisma.$transaction([
    prisma.strategy.updateMany({
      where: { businessId, status: { in: ["running", "paused"] }, plan: { status: "active" } },
      data: { status: "stopped", endedAt: now },
    }),
    prisma.growthPlan.updateMany({ where: { businessId, status: "active" }, data: { status: "archived" } }),
    prisma.growthPlan.update({ where: { id: planId }, data: { status: "active", approvedAt: now } }),
    prisma.strategy.updateMany({ where: { planId, status: "proposed" }, data: { status: "running", startedAt: now } }),
  ]);
  // Orbit starts carrying out its own steps right away (coupons, settings, written material...).
  after(() => executeActivePlan(businessId));
  return NextResponse.json({ ok: true });
}
