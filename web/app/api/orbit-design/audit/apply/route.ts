import { NextRequest, NextResponse } from "next/server";
import { getActiveBusinessId } from "@/lib/get-active-business-id";
import { applyAuditFindings, type AuditFinding } from "@/lib/orbit-design-generate";
import { refreshStaticPages } from "@/lib/design-ops";

// Fixes without a ready patch go through the design editor, which takes a minute or two.
export const maxDuration = 300;

export async function POST(req: NextRequest) {
  const businessId = await getActiveBusinessId();
  if (!businessId) return NextResponse.json({ error: "No active business." }, { status: 400 });

  const { findings, approvedIds } = (await req.json()) as { findings?: AuditFinding[]; approvedIds?: string[] };
  if (!Array.isArray(findings) || !Array.isArray(approvedIds) || !approvedIds.length) {
    return NextResponse.json({ error: "Nothing selected to fix." }, { status: 400 });
  }

  const doc = await applyAuditFindings(businessId, findings.slice(0, 100), approvedIds.slice(0, 100));
  // Once the store is live it serves the wired copy — carry the fixes there too.
  await refreshStaticPages(businessId, doc);
  return NextResponse.json({ doc });
}
