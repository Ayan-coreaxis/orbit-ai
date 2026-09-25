import { NextRequest, NextResponse } from "next/server";
import { getActiveBusinessId } from "@/lib/get-active-business-id";
import { extractDesignSystem } from "@/lib/orbit-design-generate";

export const maxDuration = 120;

export async function POST(req: NextRequest) {
  const businessId = await getActiveBusinessId();
  if (!businessId) return NextResponse.json({ error: "No active business." }, { status: 400 });

  const { url } = (await req.json()) as { url?: string };
  if (!url || !url.trim()) return NextResponse.json({ error: "Enter your website URL." }, { status: 400 });

  const result = await extractDesignSystem(businessId, url.trim());
  return NextResponse.json(result);
}
