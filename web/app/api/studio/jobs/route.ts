import { NextRequest, NextResponse } from "next/server";
import { getActiveBusinessId } from "@/lib/get-active-business-id";
import { assertUnderUsageCap, UsageCapExceededError } from "@/lib/usage-limit";
import { StudioError, createDraft, jobViews } from "@/lib/studio/engine";

export const maxDuration = 120;

/** { format, input } → the director's plan (a draft job). Nothing is generated or counted yet. */
export async function POST(req: NextRequest) {
  const businessId = await getActiveBusinessId();
  if (!businessId) return NextResponse.json({ error: "No active business." }, { status: 400 });
  const body = (await req.json().catch(() => ({}))) as { format?: unknown; input?: unknown };
  if (typeof body.format !== "string") return NextResponse.json({ error: "Pick what to make." }, { status: 400 });
  try {
    await assertUnderUsageCap(businessId); // the director is an AI call
    const job = await createDraft(businessId, body.format, body.input);
    return NextResponse.json({ job: (await jobViews(businessId, [job]))[0] });
  } catch (e) {
    if (e instanceof UsageCapExceededError) return NextResponse.json({ error: e.message }, { status: 402 });
    if (e instanceof StudioError) return NextResponse.json({ error: e.message }, { status: e.status });
    console.warn("[studio] plan failed:", String(e).slice(0, 300));
    return NextResponse.json({ error: "The director couldn't plan this right now — try again." }, { status: 500 });
  }
}
