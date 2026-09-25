import { NextRequest, NextResponse } from "next/server";
import { getActiveBusinessId } from "@/lib/get-active-business-id";
import { draftGrowthPlan } from "@/lib/strategy-planner";
import { UsageCapExceededError } from "@/lib/usage-limit";

export const maxDuration = 180;

/** Draft a fresh plan from the business's real snapshot. Replaces any existing draft; never touches the active plan. */
export async function POST(req: NextRequest) {
  const businessId = await getActiveBusinessId();
  if (!businessId) return NextResponse.json({ error: "No active business." }, { status: 400 });
  const { note } = (await req.json().catch(() => ({}))) as { note?: string };
  try {
    const { planId } = await draftGrowthPlan(businessId, note);
    return NextResponse.json({ planId });
  } catch (e) {
    if (e instanceof UsageCapExceededError) return NextResponse.json({ error: e.message }, { status: 429 });
    return NextResponse.json({ error: e instanceof Error ? e.message : "Couldn't draft a plan." }, { status: 500 });
  }
}
