import { NextResponse } from "next/server";
import { getActiveBusinessId } from "@/lib/get-active-business-id";
import { OrchestratorTurnError, runOrchestratorTurn } from "@/lib/orchestrator-turn";

export const maxDuration = 180;

export async function POST(req: Request) {
  const businessId = await getActiveBusinessId();
  if (!businessId) {
    return NextResponse.json({ error: "No active business." }, { status: 400 });
  }
  const body = (await req.json()) as { message?: unknown; attachments?: unknown };
  try {
    return NextResponse.json(await runOrchestratorTurn(businessId, body));
  } catch (e) {
    if (e instanceof OrchestratorTurnError) return NextResponse.json({ error: e.message }, { status: e.status });
    throw e;
  }
}
