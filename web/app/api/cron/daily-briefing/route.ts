import { cronAllowed } from "@/lib/guard";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { runDailyBriefing } from "@/lib/daily-briefing";

/**
 * Every morning (09:00 Pakistan time): check each store that has products and post the day's
 * ranked tasks in its Orchestrator chat. Pure database checks — no AI call, so it is cheap to run
 * for every store. Tasks only suggest; the owner presses Prepare, then Apply.
 */
export const maxDuration = 300;

export async function GET(req: NextRequest) {
  if (!cronAllowed(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const businesses = await prisma.business.findMany({
    where: { products: { some: {} } },
    select: { id: true },
    take: 2000,
  });
  let posted = 0;
  let failed = 0;
  for (const { id } of businesses) {
    try {
      const r = await runDailyBriefing(id);
      if (r.messageId) posted++;
    } catch (e) {
      failed++;
      console.warn("[cron/daily-briefing]", id, e);
    }
  }
  return NextResponse.json({ stores: businesses.length, posted, failed });
}
