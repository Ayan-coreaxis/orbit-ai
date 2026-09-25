import { NextRequest, NextResponse } from "next/server";
import { runCompetitorAnalysis } from "@/lib/run-intelligence";
import { getActiveBusinessId } from "@/lib/get-active-business-id";
import { UsageCapExceededError } from "@/lib/usage-limit";

/** Manually triggered re-scan — the "Refresh analysis" button in the dashboard calls this. */
export async function POST(_req: NextRequest) {
  if (!process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_API_KEY === "paste_your_key_here") {
    return NextResponse.json({ error: "ANTHROPIC_API_KEY is not set in .env.local yet." }, { status: 400 });
  }

  const businessId = await getActiveBusinessId();
  if (!businessId) {
    return NextResponse.json({ error: "No business found for this session." }, { status: 400 });
  }

  try {
    const result = await runCompetitorAnalysis(businessId);
    return NextResponse.json(result);
  } catch (e) {
    if (e instanceof UsageCapExceededError) {
      return NextResponse.json({ error: e.message }, { status: 402 });
    }
    throw e;
  }
}
