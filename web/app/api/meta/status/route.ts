import { NextRequest, NextResponse } from "next/server";
import { getActiveBusinessId } from "@/lib/get-active-business-id";
import { chooseMetaAssets, metaHealth } from "@/lib/meta-health";

export async function GET() {
  const businessId = await getActiveBusinessId();
  if (!businessId) return NextResponse.json({ error: "No active business." }, { status: 400 });
  return NextResponse.json(await metaHealth(businessId));
}

/** { pageId?, adAccountId? } — pick which Page / ad account Orbit uses. */
export async function POST(req: NextRequest) {
  const businessId = await getActiveBusinessId();
  if (!businessId) return NextResponse.json({ error: "No active business." }, { status: 400 });
  const body = (await req.json().catch(() => ({}))) as { pageId?: unknown; adAccountId?: unknown };
  try {
    await chooseMetaAssets(businessId, {
      pageId: typeof body.pageId === "string" ? body.pageId : undefined,
      adAccountId: typeof body.adAccountId === "string" ? body.adAccountId : undefined,
    });
    return NextResponse.json(await metaHealth(businessId));
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Couldn't switch." }, { status: 400 });
  }
}
