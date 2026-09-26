import { NextRequest, NextResponse } from "next/server";
import { syncCourierStatuses } from "@/lib/courier";

/** Reads every shipped order's status from its courier (delivered → fulfilled, returned → flagged). */
export async function GET(req: NextRequest) {
  const auth = req.headers.get("authorization");
  if (process.env.CRON_SECRET && auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const results = await syncCourierStatuses();
  return NextResponse.json({ checked: results.length, results });
}
