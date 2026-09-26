import { cronAllowed } from "@/lib/guard";
import { NextRequest, NextResponse } from "next/server";
import { syncCourierStatuses } from "@/lib/courier";

/** Reads every shipped order's status from its courier (delivered → fulfilled, returned → flagged). */
export async function GET(req: NextRequest) {
  if (!cronAllowed(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const results = await syncCourierStatuses();
  return NextResponse.json({ checked: results.length, results });
}
