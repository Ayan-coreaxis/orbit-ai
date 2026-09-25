import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { isAdminAuthenticated } from "@/lib/auth";
import { PLAN_PRICE_USD, PLAN_DEFAULT_CAP_USD } from "@/lib/usage-limit";

const VALID_PLANS = ["starter", "growth", "scale"];

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const authed = await isAdminAuthenticated();
  if (!authed) return NextResponse.json({ error: "Not authorized." }, { status: 401 });

  const { id } = await params;
  const body = (await req.json()) as { plan?: string; monthlyUsageCapUsd?: number | null; whatsappInboundNumber?: string | null };

  const data: { plan?: string; monthlyUsageCapUsd?: number | null; whatsappInboundNumber?: string | null } = {};

  if (body.whatsappInboundNumber !== undefined) {
    data.whatsappInboundNumber = body.whatsappInboundNumber?.trim() || null;
  }

  if (body.plan !== undefined) {
    if (!VALID_PLANS.includes(body.plan)) {
      return NextResponse.json({ error: "Invalid plan." }, { status: 400 });
    }
    data.plan = body.plan;
    // Changing plan and not also setting a cap in the same request: apply that plan's safe
    // default so the cap always tracks the plan, instead of silently keeping a stale number.
    if (body.monthlyUsageCapUsd === undefined) {
      data.monthlyUsageCapUsd = PLAN_DEFAULT_CAP_USD[body.plan];
    }
  }

  if (body.monthlyUsageCapUsd !== undefined) {
    const cap = body.monthlyUsageCapUsd === null ? null : Number(body.monthlyUsageCapUsd);
    const plan = data.plan ?? (await prisma.business.findUnique({ where: { id }, select: { plan: true } }))?.plan ?? "starter";
    const priceUsd = PLAN_PRICE_USD[plan];
    // Hard guarantee: a business can never be configured to cost more in real AI usage than it
    // pays. This is enforced here, not just suggested as a default.
    if (cap !== null && priceUsd !== undefined && cap >= priceUsd) {
      return NextResponse.json(
        { error: `Usage cap must be below the ${plan} plan's $${priceUsd}/mo price — it can't cost more than it pays.` },
        { status: 400 },
      );
    }
    data.monthlyUsageCapUsd = cap;
  }

  const business = await prisma.business.update({ where: { id }, data });
  return NextResponse.json({
    plan: business.plan,
    monthlyUsageCapUsd: business.monthlyUsageCapUsd,
    whatsappInboundNumber: business.whatsappInboundNumber,
  });
}
