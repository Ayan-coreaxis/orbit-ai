import { NextRequest, NextResponse } from "next/server";
import { getActiveBusinessId } from "@/lib/get-active-business-id";
import { planOrbitCode, runOrbitCode } from "@/lib/orbit-code";

export const maxDuration = 120;

/**
 * "Handoff" — Orbit Code writes the backend (a StoreBackendSpec) for every interactive part the
 * seller designed. Conversational: the first call may come back with clarifying `questions`; the
 * seller answers and calls again with `{ answers }` to actually wire.
 *
 * Body:
 *   {}                       → returns { questions } if any are genuinely needed, else wires now.
 *   { answers: {...} }       → wires using those answers.
 *   { skipQuestions: true }  → wires immediately, no questions.
 */
export async function POST(req: NextRequest) {
  const businessId = await getActiveBusinessId();
  if (!businessId) return NextResponse.json({ error: "No active business." }, { status: 400 });

  const body = (await req.json().catch(() => ({}))) as { answers?: Record<string, string>; skipQuestions?: boolean };

  if (!body.answers && !body.skipQuestions) {
    const { questions } = await planOrbitCode(businessId);
    if (questions.length) return NextResponse.json({ ok: true, questions });
  }

  const result = await runOrbitCode(businessId, { answers: body.answers });
  return NextResponse.json({ ok: true, summary: result.summary, spec: result.spec });
}
