import { NextRequest, NextResponse, after } from "next/server";
import { executeActivePlan } from "@/lib/harness";
import { getActiveBusinessId } from "@/lib/get-active-business-id";
import { resolveProposal } from "@/lib/strategy-chat";

// Applying can start Orbit Design work (design edits / publish) that finishes in the background.
export const maxDuration = 300;

/** Owner applies or dismisses a change the Orchestrator proposed for the ACTIVE growth plan. */
export async function POST(req: NextRequest, { params }: { params: Promise<{ messageId: string }> }) {
  const businessId = await getActiveBusinessId();
  if (!businessId) return NextResponse.json({ error: "No active business." }, { status: 400 });
  const { messageId } = await params;
  const { action } = (await req.json().catch(() => ({}))) as { action?: string };
  if (action !== "apply" && action !== "dismiss") return NextResponse.json({ error: "action must be apply or dismiss" }, { status: 400 });
  try {
    const applied = await resolveProposal(businessId, messageId, action);
    if (action === "apply") after(() => executeActivePlan(businessId));
    return NextResponse.json({ applied });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Couldn't update." }, { status: 400 });
  }
}
