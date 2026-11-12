import { NextRequest, NextResponse } from "next/server";
import { getActiveBusinessId } from "@/lib/get-active-business-id";
import { deleteCommentRule, updateCommentRule, type RuleInput } from "@/lib/comment-rules-data";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const businessId = await getActiveBusinessId();
  if (!businessId) return NextResponse.json({ error: "No active business." }, { status: 400 });
  const { id } = await params;
  const body = (await req.json().catch(() => ({}))) as RuleInput;
  try {
    const rule = await updateCommentRule(businessId, id, body);
    return rule ? NextResponse.json({ rule }) : NextResponse.json({ error: "Not found." }, { status: 404 });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Couldn't save." }, { status: 400 });
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const businessId = await getActiveBusinessId();
  if (!businessId) return NextResponse.json({ error: "No active business." }, { status: 400 });
  const { id } = await params;
  return (await deleteCommentRule(businessId, id)) ? NextResponse.json({ ok: true }) : NextResponse.json({ error: "Not found." }, { status: 404 });
}
