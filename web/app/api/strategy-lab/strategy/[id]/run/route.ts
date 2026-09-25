import { NextResponse } from "next/server";
import { getActiveBusinessId } from "@/lib/get-active-business-id";
import { executeStrategy } from "@/lib/harness";
import { UsageCapExceededError } from "@/lib/usage-limit";

export const maxDuration = 180;

/** Seller asks Orbit to (re)run the Orbit steps of one running strategy. Tools skip what already exists. */
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const businessId = await getActiveBusinessId();
  if (!businessId) return NextResponse.json({ error: "No active business." }, { status: 400 });
  const { id } = await params;
  try {
    const n = await executeStrategy(businessId, id, { force: true });
    return NextResponse.json({ actions: n });
  } catch (e) {
    if (e instanceof UsageCapExceededError) return NextResponse.json({ error: e.message }, { status: 429 });
    return NextResponse.json({ error: e instanceof Error ? e.message : "Couldn't run it." }, { status: 500 });
  }
}
