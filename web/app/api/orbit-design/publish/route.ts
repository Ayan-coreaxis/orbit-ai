import { NextRequest, NextResponse } from "next/server";
import { getActiveBusinessId } from "@/lib/get-active-business-id";
import { publishStore } from "@/lib/design-ops";

export const maxDuration = 240;

export async function POST(req: NextRequest) {
  const businessId = await getActiveBusinessId();
  if (!businessId) return NextResponse.json({ error: "No active business." }, { status: 400 });
  const { published } = (await req.json()) as { published?: boolean };
  return NextResponse.json(await publishStore(businessId, published === true));
}
