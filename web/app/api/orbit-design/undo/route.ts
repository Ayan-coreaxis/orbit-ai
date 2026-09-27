import { NextResponse } from "next/server";
import { getActiveBusinessId } from "@/lib/get-active-business-id";
import { undoCount, undoDesign } from "@/lib/orbit-design-generate";
import { refreshStaticPages } from "@/lib/design-ops";

/** How many changes can be undone. */
export async function GET() {
  const businessId = await getActiveBusinessId();
  if (!businessId) return NextResponse.json({ error: "No active business." }, { status: 400 });
  return NextResponse.json({ left: await undoCount(businessId) });
}

/** Undo the last saved design change — the live store follows for content pages, as with any edit. */
export async function POST() {
  const businessId = await getActiveBusinessId();
  if (!businessId) return NextResponse.json({ error: "No active business." }, { status: 400 });
  const r = await undoDesign(businessId);
  if (!r) return NextResponse.json({ error: "Nothing to undo." }, { status: 404 });
  await refreshStaticPages(businessId, r.doc);
  return NextResponse.json({ doc: r.doc, left: r.left });
}
