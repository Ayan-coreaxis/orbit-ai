import { NextRequest, NextResponse } from "next/server";
import { getActiveBusinessId } from "@/lib/get-active-business-id";
import { applyAuditFindings, type AuditFinding } from "@/lib/orbit-design-generate";

export async function POST(req: NextRequest) {
  const businessId = await getActiveBusinessId();
  if (!businessId) return NextResponse.json({ error: "No active business." }, { status: 400 });

  const { findings, approvedIds } = (await req.json()) as { findings?: AuditFinding[]; approvedIds?: string[] };
  if (!Array.isArray(findings) || !Array.isArray(approvedIds) || !approvedIds.length) {
    return NextResponse.json({ error: "Nothing selected to fix." }, { status: 400 });
  }

  const doc = await applyAuditFindings(businessId, findings.slice(0, 100), approvedIds.slice(0, 100));
  return NextResponse.json({ doc });
}
