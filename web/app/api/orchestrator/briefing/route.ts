import { NextRequest, NextResponse } from "next/server";
import { getActiveBusinessId } from "@/lib/get-active-business-id";
import { runDailyBriefing, setTaskState } from "@/lib/daily-briefing";

/** "Check my store now" — runs the daily store check immediately and replaces today's briefing. */
export async function POST() {
  const businessId = await getActiveBusinessId();
  if (!businessId) return NextResponse.json({ error: "No active business." }, { status: 400 });
  const r = await runDailyBriefing(businessId, { force: true });
  return NextResponse.json(r);
}

/** Mark one task done / skipped (it is then not suggested again for a week) or reopen it. */
export async function PATCH(req: NextRequest) {
  const businessId = await getActiveBusinessId();
  if (!businessId) return NextResponse.json({ error: "No active business." }, { status: 400 });
  const { messageId, taskId, state } = (await req.json().catch(() => ({}))) as { messageId?: string; taskId?: string; state?: string };
  if (!messageId || !taskId || !["done", "skipped", "open"].includes(String(state)))
    return NextResponse.json({ error: "messageId, taskId and state (done|skipped|open) are required." }, { status: 400 });
  const tasks = await setTaskState(businessId, messageId, taskId, state as "done" | "skipped" | "open");
  if (!tasks) return NextResponse.json({ error: "Briefing not found." }, { status: 404 });
  return NextResponse.json({ tasks });
}
