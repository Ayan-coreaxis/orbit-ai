import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { runCompetitorAnalysis } from "@/lib/run-intelligence";

/**
 * Re-runs Competitor Intelligence + the Strategy Orchestrator for every business.
 * This is what makes the loop from the plan doc real: instead of a one-time onboarding
 * snapshot, the plan updates itself on a schedule.
 *
 * Triggered automatically by Vercel Cron once deployed (see vercel.json) — locally this
 * only runs when called directly, since there's no scheduler running on a dev machine.
 */
export async function GET(req: NextRequest) {
  const auth = req.headers.get("authorization");
  if (process.env.CRON_SECRET && auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_API_KEY === "paste_your_key_here") {
    return NextResponse.json({ error: "ANTHROPIC_API_KEY is not set." }, { status: 400 });
  }

  const businesses = await prisma.business.findMany({ select: { id: true, name: true } });
  const results = [];
  for (const b of businesses) {
    try {
      const r = await runCompetitorAnalysis(b.id);
      results.push({ business: b.name, ok: true, reportId: r.reportId });
    } catch (e) {
      results.push({ business: b.name, ok: false, error: e instanceof Error ? e.message : "unknown error" });
    }
  }

  return NextResponse.json({ scanned: results.length, results });
}
