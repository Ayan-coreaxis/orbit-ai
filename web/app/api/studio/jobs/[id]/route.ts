import { NextRequest, NextResponse, after } from "next/server";
import { getActiveBusinessId } from "@/lib/get-active-business-id";
import { prisma } from "@/lib/prisma";
import { assertUnderUsageCap, UsageCapExceededError } from "@/lib/usage-limit";
import { StudioError, jobViews, refreshJob, replan, runJob, startJob } from "@/lib/studio/engine";

// Generating runs after the response; a video is watched for a few minutes in the background.
export const maxDuration = 300;

async function find(businessId: string, id: string) {
  return prisma.studioJob.findFirst({ where: { id, businessId } });
}

/** A job's current state — also nudges a rendering video along (the page polls this). */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const businessId = await getActiveBusinessId();
  if (!businessId) return NextResponse.json({ error: "No active business." }, { status: 400 });
  const job = await find(businessId, (await params).id);
  if (!job) return NextResponse.json({ error: "Not found." }, { status: 404 });
  const fresh = await refreshJob(job);
  return NextResponse.json({ job: (await jobViews(businessId, [fresh]))[0] });
}

/**
 * { action: "generate" } — make it (uses one from the monthly allowance).
 * { action: "replan", change } — the director rewrites the plan. { action: "delete" } — drop a draft / failed / finished job
 * (the finished file stays in the media library).
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const businessId = await getActiveBusinessId();
  if (!businessId) return NextResponse.json({ error: "No active business." }, { status: 400 });
  const id = (await params).id;
  const body = (await req.json().catch(() => ({}))) as { action?: string; change?: unknown };
  try {
    if (body.action === "generate") {
      const job = await startJob(businessId, id);
      if (job.status === "queued") after(() => runJob(job.id));
      return NextResponse.json({ job: (await jobViews(businessId, [job]))[0] });
    }
    if (body.action === "replan") {
      const change = typeof body.change === "string" ? body.change.trim() : "";
      if (!change) return NextResponse.json({ error: "Say what to change." }, { status: 400 });
      await assertUnderUsageCap(businessId);
      const job = await replan(businessId, id, change);
      return NextResponse.json({ job: (await jobViews(businessId, [job]))[0] });
    }
    if (body.action === "delete") {
      const job = await find(businessId, id);
      if (!job) return NextResponse.json({ error: "Not found." }, { status: 404 });
      if (["queued", "generating", "finishing"].includes(job.status)) return NextResponse.json({ error: "Wait until it's finished." }, { status: 409 });
      // A finished one still counts toward this month's allowance, so it's hidden, not deleted.
      if (job.status === "done") await prisma.studioJob.update({ where: { id: job.id }, data: { status: "hidden" } });
      else await prisma.studioJob.delete({ where: { id: job.id } });
      return NextResponse.json({ ok: true });
    }
    return NextResponse.json({ error: "Unknown action." }, { status: 400 });
  } catch (e) {
    if (e instanceof UsageCapExceededError) return NextResponse.json({ error: e.message }, { status: 402 });
    if (e instanceof StudioError) return NextResponse.json({ error: e.message }, { status: e.status });
    console.warn("[studio] action failed:", String(e).slice(0, 300));
    return NextResponse.json({ error: "Something went wrong — try again." }, { status: 500 });
  }
}
