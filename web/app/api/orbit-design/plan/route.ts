import { NextRequest, NextResponse } from "next/server";
import { getActiveBusinessId } from "@/lib/get-active-business-id";
import { runDesignPlan, type DesignRef } from "@/lib/orbit-design-generate";

export const maxDuration = 60;

const OK_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"] as const;

function parseDataUrl(s: string): DesignRef | null {
  const m = /^data:(image\/[a-z+]+);base64,(.+)$/i.exec(s.trim());
  if (!m) return null;
  const mediaType = m[1].toLowerCase();
  if (!OK_TYPES.includes(mediaType as (typeof OK_TYPES)[number])) return null;
  if (m[2].length > 7_000_000) return null;
  return { data: m[2], mediaType: mediaType as DesignRef["mediaType"] };
}

/** The "ask before building" step — clarifying questions for the seller's opening brief. */
export async function POST(req: NextRequest) {
  const businessId = await getActiveBusinessId();
  if (!businessId) return NextResponse.json({ error: "No active business." }, { status: 400 });

  const { message, images } = (await req.json()) as { message?: string; images?: string[] };
  if (!message || !message.trim()) return NextResponse.json({ error: "Describe the store first." }, { status: 400 });

  const refImages: DesignRef[] = Array.isArray(images)
    ? images.slice(0, 4).map(parseDataUrl).filter((x): x is DesignRef => x !== null)
    : [];

  const plan = await runDesignPlan(businessId, message.trim().slice(0, 4000), refImages);
  return NextResponse.json(plan);
}
