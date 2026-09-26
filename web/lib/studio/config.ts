import { prisma } from "@/lib/prisma";
import type { StudioKind } from "@/lib/studio/formats";

/**
 * Orbit Studio settings: which image / video model runs, their keys, prices, and each plan's
 * monthly limits. Everything lives in .env.local and is edited in Super Admin > Studio.
 *
 * Images: Google "Nano Banana 2" (Gemini image model) — best at keeping a real product exact.
 * Videos: ByteDance Seedance 2.0 on BytePlus ModelArk — top-ranked, sound/voice included at no
 * extra cost. Both are called directly (no middleman) behind lib/studio/providers.ts, so either
 * can be swapped without touching the rest of the app.
 */

export const STUDIO_PLANS = ["growth", "scale"] as const; // $75 and $150 plans only

export const DEFAULT_LIMITS: Record<string, { images: number; videos: number }> = {
  starter: { images: 0, videos: 0 },
  growth: { images: 50, videos: 5 },
  scale: { images: 100, videos: 12 },
};

export const DEFAULTS = {
  imageModel: "gemini-3.1-flash-image-preview",
  imageBaseUrl: "https://generativelanguage.googleapis.com/v1beta",
  videoModel: "dreamina-seedance-2-0-fast",
  videoBaseUrl: "https://ark.ap-southeast.bytepluses.com/api/v3",
  videoResolution: "720p",
  imageCostUsd: 0.067, // Nano Banana 2, 1K image (Sep 2026)
  videoCostPerSecUsd: 0.161, // Seedance 2.0 Fast, 720p, audio included (Sep 2026)
};

export const STUDIO_AGENT_IDS = { image: "studio-image", video: "studio-video", director: "studio-director" } as const;

const int = (v: string | undefined, d: number) => {
  const n = Number(v);
  return v != null && v.trim() !== "" && Number.isFinite(n) && n >= 0 ? Math.floor(n) : d;
};
const num = (v: string | undefined, d: number) => {
  const n = Number(v);
  return v != null && v.trim() !== "" && Number.isFinite(n) && n >= 0 ? n : d;
};

export function studioConfig() {
  const env = process.env;
  return {
    enabled: env.STUDIO_ENABLED?.trim() !== "false",
    imageKey: env.GEMINI_API_KEY?.trim() || "",
    imageModel: env.STUDIO_IMAGE_MODEL?.trim() || DEFAULTS.imageModel,
    imageBaseUrl: (env.STUDIO_IMAGE_BASE_URL?.trim() || DEFAULTS.imageBaseUrl).replace(/\/+$/, ""),
    videoKey: env.SEEDANCE_API_KEY?.trim() || "",
    videoModel: env.STUDIO_VIDEO_MODEL?.trim() || DEFAULTS.videoModel,
    videoBaseUrl: (env.SEEDANCE_BASE_URL?.trim() || DEFAULTS.videoBaseUrl).replace(/\/+$/, ""),
    videoResolution: env.STUDIO_VIDEO_RESOLUTION?.trim() === "1080p" ? "1080p" : env.STUDIO_VIDEO_RESOLUTION?.trim() === "480p" ? "480p" : DEFAULTS.videoResolution,
    imageCostUsd: num(env.STUDIO_IMAGE_COST_USD, DEFAULTS.imageCostUsd),
    videoCostPerSecUsd: num(env.STUDIO_VIDEO_COST_PER_SEC_USD, DEFAULTS.videoCostPerSecUsd),
    limits: {
      starter: DEFAULT_LIMITS.starter,
      growth: { images: int(env.STUDIO_LIMIT_IMAGES_GROWTH, DEFAULT_LIMITS.growth.images), videos: int(env.STUDIO_LIMIT_VIDEOS_GROWTH, DEFAULT_LIMITS.growth.videos) },
      scale: { images: int(env.STUDIO_LIMIT_IMAGES_SCALE, DEFAULT_LIMITS.scale.images), videos: int(env.STUDIO_LIMIT_VIDEOS_SCALE, DEFAULT_LIMITS.scale.videos) },
    } as Record<string, { images: number; videos: number }>,
  };
}

const monthStart = () => {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), 1);
};

/** Jobs that use up the month's allowance: started or finished (hidden = finished, removed from the list). Failed ones are given back. */
export const COUNTED_STATUSES = ["queued", "generating", "finishing", "done", "hidden"];

export type StudioStatus = Awaited<ReturnType<typeof studioStatus>>;

/** Everything the Content page and the Orchestrator need to know before offering Studio. */
export async function studioStatus(businessId: string) {
  const cfg = studioConfig();
  const [biz, counts] = await Promise.all([
    prisma.business.findUnique({ where: { id: businessId }, select: { plan: true } }),
    prisma.studioJob.groupBy({
      by: ["kind"],
      where: { businessId, status: { in: COUNTED_STATUSES }, startedAt: { gte: monthStart() } },
      _count: { _all: true },
    }),
  ]);
  const plan = biz?.plan ?? "starter";
  const allowed = (STUDIO_PLANS as readonly string[]).includes(plan);
  const limit = cfg.limits[plan] ?? DEFAULT_LIMITS.starter;
  const used = { images: 0, videos: 0 };
  for (const c of counts) {
    if (c.kind === "image") used.images = c._count._all;
    if (c.kind === "video") used.videos = c._count._all;
  }
  const now = new Date();
  return {
    plan,
    allowed,
    enabled: cfg.enabled,
    imageReady: !!cfg.imageKey,
    videoReady: !!cfg.videoKey && !!cfg.imageKey, // videos start from a still frame made by the image model
    limit,
    used,
    left: { images: Math.max(0, limit.images - used.images), videos: Math.max(0, limit.videos - used.videos) },
    resetsOn: new Date(now.getFullYear(), now.getMonth() + 1, 1).toISOString(),
  };
}

/** Why this business can't make one more of `kind` right now — or null when it can. */
export function blockedReason(s: StudioStatus, kind: StudioKind): string | null {
  if (!s.enabled) return "Orbit Studio is switched off by the platform right now.";
  if (!s.allowed) return "Orbit Studio is part of the Growth ($75) and Scale ($150) plans.";
  if (kind === "image" && !s.imageReady) return "Image making isn't set up yet — the platform admin needs to add the image model key (Super Admin > Studio).";
  if (kind === "video" && !s.videoReady) return "Reels aren't set up yet — the platform admin needs to add the video model key (Super Admin > Studio).";
  if (kind === "image" && s.left.images <= 0) return `This month's ${s.limit.images} images are used up — they reset on the 1st.`;
  if (kind === "video" && s.left.videos <= 0) return `This month's ${s.limit.videos} reels are used up — they reset on the 1st.`;
  return null;
}

export function estimateCostUsd(kind: StudioKind, seconds = 0, withKeyframe = false): number {
  const cfg = studioConfig();
  return kind === "image" ? cfg.imageCostUsd : seconds * cfg.videoCostPerSecUsd + (withKeyframe ? cfg.imageCostUsd : 0);
}
