import { NextRequest, NextResponse, after } from "next/server";
import { getActiveBusinessId } from "@/lib/get-active-business-id";
import { prisma } from "@/lib/prisma";
import { queueSocialPost, socialReadiness, type Platform } from "@/lib/meta-graph";

// An Instagram Reel is processed by Meta for a few minutes before it can be published.
export const maxDuration = 300;

/** What can be posted where, and recent posts. ?mediaId= narrows to one file's posts. */
export async function GET(req: NextRequest) {
  const businessId = await getActiveBusinessId();
  if (!businessId) return NextResponse.json({ error: "No active business." }, { status: 400 });
  const mediaId = req.nextUrl.searchParams.get("mediaId");
  const [ready, posts] = await Promise.all([
    socialReadiness(businessId),
    prisma.socialPost.findMany({ where: { businessId, ...(mediaId ? { mediaId } : {}) }, orderBy: { createdAt: "desc" }, take: mediaId ? 10 : 30 }),
  ]);
  return NextResponse.json({
    ready,
    posts: posts.map((p) => ({ id: p.id, platform: p.platform, kind: p.kind, mediaId: p.mediaId, caption: p.caption, status: p.status, permalink: p.permalink, error: p.error, createdAt: p.createdAt.toISOString() })),
  });
}

/** { mediaId?, caption, platforms: ["facebook","instagram"] } — the owner's own Post button. */
export async function POST(req: NextRequest) {
  const businessId = await getActiveBusinessId();
  if (!businessId) return NextResponse.json({ error: "No active business." }, { status: 400 });
  const body = (await req.json().catch(() => ({}))) as { mediaId?: unknown; caption?: unknown; platforms?: unknown };
  try {
    const { rows, run } = await queueSocialPost(businessId, {
      mediaId: typeof body.mediaId === "string" ? body.mediaId : null,
      caption: typeof body.caption === "string" ? body.caption : "",
      platforms: Array.isArray(body.platforms) ? (body.platforms.filter((p) => typeof p === "string") as Platform[]) : [],
    });
    after(run);
    return NextResponse.json({ posts: rows.map((p) => ({ id: p.id, platform: p.platform, status: p.status })) });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Couldn't post." }, { status: 400 });
  }
}
