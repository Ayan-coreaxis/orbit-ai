import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getActiveBusinessId } from "@/lib/get-active-business-id";
import { retireIdleAgents } from "@/lib/plan-agents";

// from -> allowed targets
const MOVES: Record<string, string[]> = {
  running: ["paused", "stopped", "done"],
  paused: ["running", "stopped"],
};

/** Seller controls on a single strategy in the active plan: pause / resume / stop / mark done. */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const businessId = await getActiveBusinessId();
  if (!businessId) return NextResponse.json({ error: "No active business." }, { status: 400 });
  const { id } = await params;
  const { status } = (await req.json().catch(() => ({}))) as { status?: string };

  const s = await prisma.strategy.findFirst({ where: { id, businessId }, select: { status: true } });
  if (!s) return NextResponse.json({ error: "Strategy not found." }, { status: 404 });
  if (!status || !(MOVES[s.status] ?? []).includes(status)) {
    return NextResponse.json({ error: `A ${s.status} strategy can't move to ${status ?? "nothing"}.` }, { status: 400 });
  }
  const ending = status === "stopped" || status === "done";
  await prisma.strategy.update({ where: { id }, data: { status, ...(ending ? { endedAt: new Date() } : {}) } });
  if (ending) await retireIdleAgents(businessId);
  return NextResponse.json({ ok: true });
}

/** Drop a strategy from a DRAFT plan before approving it. */
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const businessId = await getActiveBusinessId();
  if (!businessId) return NextResponse.json({ error: "No active business." }, { status: 400 });
  const { id } = await params;
  const s = await prisma.strategy.findFirst({ where: { id, businessId }, select: { plan: { select: { status: true } } } });
  if (!s) return NextResponse.json({ error: "Strategy not found." }, { status: 404 });
  if (s.plan.status !== "draft") return NextResponse.json({ error: "Only strategies in a draft plan can be removed." }, { status: 400 });
  await prisma.strategy.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
