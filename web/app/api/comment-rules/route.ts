import { NextRequest, NextResponse } from "next/server";
import { getActiveBusinessId } from "@/lib/get-active-business-id";
import { createCommentRule, listCommentRules, type RuleInput } from "@/lib/comment-rules-data";

/** The seller's Instagram comment-to-DM rules. */
export async function GET() {
  const businessId = await getActiveBusinessId();
  if (!businessId) return NextResponse.json({ error: "No active business." }, { status: 400 });
  return NextResponse.json({ rules: await listCommentRules(businessId) });
}

export async function POST(req: NextRequest) {
  const businessId = await getActiveBusinessId();
  if (!businessId) return NextResponse.json({ error: "No active business." }, { status: 400 });
  const body = (await req.json().catch(() => ({}))) as RuleInput;
  try {
    return NextResponse.json({ rule: await createCommentRule(businessId, body) });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Couldn't save." }, { status: 400 });
  }
}
