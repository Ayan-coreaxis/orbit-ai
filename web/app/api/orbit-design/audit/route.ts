import { NextResponse } from "next/server";
import { getActiveBusinessId } from "@/lib/get-active-business-id";
import { runStoreAudit } from "@/lib/orbit-design-generate";

export const maxDuration = 300; // screenshots every page (desktop+mobile) + one deep vision QA call

export async function POST() {
  const businessId = await getActiveBusinessId();
  if (!businessId) return NextResponse.json({ error: "No active business." }, { status: 400 });

  const result = await runStoreAudit(businessId);
  if (result.error) return NextResponse.json({ error: result.error }, { status: 500 });
  return NextResponse.json(result);
}
