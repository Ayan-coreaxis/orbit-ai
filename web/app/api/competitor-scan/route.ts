import { NextResponse } from "next/server";
import { scanCompetitors } from "@/lib/competitor-intel";
import { getActiveBusinessId } from "@/lib/get-active-business-id";
import { UsageCapExceededError } from "@/lib/usage-limit";

/** "Refresh" on the Competitors page — re-reads the seller's competitors (reference notes only). */
export async function POST() {
  if (!process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_API_KEY === "paste_your_key_here") {
    return NextResponse.json({ error: "ANTHROPIC_API_KEY is not set yet." }, { status: 400 });
  }
  const businessId = await getActiveBusinessId();
  if (!businessId) return NextResponse.json({ error: "No business found for this session." }, { status: 400 });
  try {
    return NextResponse.json(await scanCompetitors(businessId));
  } catch (e) {
    if (e instanceof UsageCapExceededError) return NextResponse.json({ error: e.message }, { status: 402 });
    throw e;
  }
}
