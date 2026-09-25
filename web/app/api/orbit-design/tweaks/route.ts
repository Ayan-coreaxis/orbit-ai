import { NextRequest, NextResponse } from "next/server";
import { getActiveBusinessId } from "@/lib/get-active-business-id";
import { runTweaksTurn } from "@/lib/orbit-design-generate";

export const maxDuration = 120;

/** Ask the AI to add bespoke adjustment controls ("Tweaks") to the design. */
export async function POST(req: NextRequest) {
  const businessId = await getActiveBusinessId();
  if (!businessId) return NextResponse.json({ error: "No active business." }, { status: 400 });

  const { request } = (await req.json()) as { request?: string };
  if (!request || !request.trim()) return NextResponse.json({ error: "Describe the control you want." }, { status: 400 });

  const result = await runTweaksTurn(businessId, request.trim().slice(0, 1000));
  return NextResponse.json(result);
}
