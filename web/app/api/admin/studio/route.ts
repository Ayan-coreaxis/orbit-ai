import { NextRequest, NextResponse } from "next/server";
import { isAdminAuthenticated } from "@/lib/auth";
import { setKey } from "@/lib/env-file";
import { studioAdminReport, testImage, testVideo } from "@/lib/studio/admin";

export const maxDuration = 150;

export async function GET() {
  if (!(await isAdminAuthenticated())) return NextResponse.json({ error: "Not authorized." }, { status: 401 });
  return NextResponse.json(await studioAdminReport());
}

/**
 * { action: "save", enabled, imageModel, videoModel, videoBaseUrl, videoResolution, imageCostUsd, videoCostPerSecUsd, limits }
 * { action: "test_image" } / { action: "test_video" } — one real call each. Keys are saved via /api/admin/settings.
 */
export async function POST(req: NextRequest) {
  if (!(await isAdminAuthenticated())) return NextResponse.json({ error: "Not authorized." }, { status: 401 });
  const b = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  if (b.action === "test_image") return NextResponse.json(await testImage());
  if (b.action === "test_video") return NextResponse.json(await testVideo());
  if (b.action !== "save") return NextResponse.json({ error: "Unknown action." }, { status: 400 });

  const text = (v: unknown, re: RegExp) => (typeof v === "string" && re.test(v.trim()) ? v.trim() : null);
  const n = (v: unknown, max: number, float = false) => {
    const x = float ? Number(v) : Math.floor(Number(v));
    return Number.isFinite(x) && x >= 0 && x <= max ? String(x) : null;
  };
  if (typeof b.enabled === "boolean") await setKey("studio_enabled", b.enabled ? "true" : "false");
  const im = text(b.imageModel, /^[\w.\-]{3,80}$/);
  if (im) await setKey("studio_image_model", im);
  const vm = text(b.videoModel, /^[\w.\-]{3,80}$/);
  if (vm) await setKey("studio_video_model", vm);
  const url = text(b.videoBaseUrl, /^https:\/\/[\w.\-]+(\/[\w.\-\/]*)?$/);
  if (url) await setKey("studio_video_base_url", url);
  const res = text(b.videoResolution, /^(480p|720p|1080p)$/);
  if (res) await setKey("studio_video_resolution", res);
  const ic = n(b.imageCostUsd, 5, true);
  if (ic) await setKey("studio_image_cost", ic);
  const vc = n(b.videoCostPerSecUsd, 5, true);
  if (vc) await setKey("studio_video_cost_per_sec", vc);
  const limits = (b.limits && typeof b.limits === "object" ? b.limits : {}) as Record<string, { images?: unknown; videos?: unknown }>;
  for (const plan of ["growth", "scale"] as const) {
    const i = n(limits[plan]?.images, 100000);
    if (i !== null) await setKey(`studio_limit_images_${plan}`, i);
    const v = n(limits[plan]?.videos, 100000);
    if (v !== null) await setKey(`studio_limit_videos_${plan}`, v);
  }
  return NextResponse.json({ ok: true });
}
