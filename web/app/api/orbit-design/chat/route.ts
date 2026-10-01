import { NextRequest, NextResponse } from "next/server";
import { getActiveBusinessId } from "@/lib/get-active-business-id";
import type { DesignRef } from "@/lib/orbit-design-generate";
import { runDesignEdit } from "@/lib/design-ops";
import { screenshotSite, firstSiteUrl } from "@/lib/screenshot";

export const maxDuration = 300; // reference screenshot + generation + text verify + visual (screenshot) review loop

const OK_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"] as const;

/** Parse a data: URL into an Anthropic-ready image ref, or null if unsupported / too big. */
function parseDataUrl(s: string): DesignRef | null {
  const m = /^data:(image\/[a-z+]+);base64,(.+)$/i.exec(s.trim());
  if (!m) return null;
  const mediaType = m[1].toLowerCase();
  if (!OK_TYPES.includes(mediaType as (typeof OK_TYPES)[number])) return null;
  const data = m[2];
  if (data.length > 7_000_000) return null; // ~5MB decoded — Anthropic's per-image limit
  return { data, mediaType: mediaType as DesignRef["mediaType"] };
}

export async function POST(req: NextRequest) {
  const businessId = await getActiveBusinessId();
  if (!businessId) return NextResponse.json({ error: "No active business." }, { status: 400 });

  const { message, images } = (await req.json()) as { message?: string; images?: string[] };
  if (!message || !message.trim()) return NextResponse.json({ error: "Say what you'd like to change." }, { status: 400 });

  const refImages: DesignRef[] = Array.isArray(images)
    ? images.slice(0, 4).map(parseDataUrl).filter((x): x is DesignRef => x !== null)
    : [];

  // If the seller pasted a URL, render it so the model can actually see the site they mean.
  let siteUrl: string | undefined;
  let siteHint: string | undefined;
  const url = firstSiteUrl(message);
  if (url) {
    const shot = await screenshotSite(url).catch(() => null);
    if (shot) {
      refImages.push({ data: shot.data, mediaType: shot.mediaType });
      siteUrl = url;
      siteHint = shot.hint || undefined;
    }
  }

  const result = await runDesignEdit(businessId, message.trim().slice(0, 4000), { images: refImages, siteUrl, siteHint });
  return NextResponse.json(result);
}
