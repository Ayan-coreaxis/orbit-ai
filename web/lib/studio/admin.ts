import sharp from "sharp";
import { prisma } from "@/lib/prisma";
import { DEFAULTS, DEFAULT_LIMITS, STUDIO_AGENT_IDS, studioConfig } from "@/lib/studio/config";
import { StudioProviderError, checkVideo, generateImage, submitVideo } from "@/lib/studio/providers";

/** Super Admin > Studio: settings (secrets masked), this month's spend, and live key tests. */

const monthStart = () => {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), 1);
};

export async function studioAdminReport() {
  const cfg = studioConfig();
  const since = monthStart();
  const [spend, jobs, businesses] = await Promise.all([
    prisma.agentUsage.groupBy({ by: ["businessId", "agentId"], where: { agentId: { in: Object.values(STUDIO_AGENT_IDS) }, createdAt: { gte: since } }, _sum: { costUsd: true }, _count: { _all: true } }),
    prisma.studioJob.groupBy({ by: ["businessId", "kind", "status"], where: { createdAt: { gte: since } }, _count: { _all: true } }),
    prisma.business.findMany({ select: { id: true, name: true, plan: true } }),
  ]);
  const sellers = businesses
    .map((b) => {
      const s = spend.filter((r) => r.businessId === b.id);
      const j = jobs.filter((r) => r.businessId === b.id);
      const count = (kind: string, statuses: string[]) => j.filter((r) => r.kind === kind && statuses.includes(r.status)).reduce((a, r) => a + r._count._all, 0);
      return {
        id: b.id,
        name: b.name,
        plan: b.plan,
        images: count("image", ["queued", "generating", "finishing", "done", "hidden"]),
        videos: count("video", ["queued", "generating", "finishing", "done", "hidden"]),
        failed: count("image", ["failed"]) + count("video", ["failed"]),
        costUsd: Number(s.reduce((a, r) => a + (r._sum.costUsd ?? 0), 0).toFixed(3)),
      };
    })
    .filter((x) => x.images || x.videos || x.failed || x.costUsd)
    .sort((a, b) => b.costUsd - a.costUsd);
  return {
    config: {
      enabled: cfg.enabled,
      imageKeySet: !!cfg.imageKey,
      videoKeySet: !!cfg.videoKey,
      imageModel: cfg.imageModel,
      videoModel: cfg.videoModel,
      videoBaseUrl: cfg.videoBaseUrl,
      videoResolution: cfg.videoResolution,
      imageCostUsd: cfg.imageCostUsd,
      videoCostPerSecUsd: cfg.videoCostPerSecUsd,
      limits: { growth: cfg.limits.growth, scale: cfg.limits.scale },
    },
    defaults: { ...DEFAULTS, limits: DEFAULT_LIMITS },
    usage: { totalUsd: Number(sellers.reduce((a, s) => a + s.costUsd, 0).toFixed(2)), sellers },
  };
}

/** One real, cheap image — proves the key, model name and billing work. */
export async function testImage(): Promise<{ ok: boolean; message: string; preview?: string }> {
  try {
    const out = await generateImage({ prompt: "A single ripe mango on a plain white studio background, soft light, product photo.", aspect: "1:1" });
    const small = await sharp(out.data).resize(256).jpeg({ quality: 80 }).toBuffer();
    return { ok: true, message: `Works — ${studioConfig().imageModel} returned an image.`, preview: `data:image/jpeg;base64,${small.toString("base64")}` };
  } catch (e) {
    return { ok: false, message: e instanceof StudioProviderError ? e.message : `Failed: ${String(e).slice(0, 200)}` };
  }
}

/** Starts a real, short video task and checks it once (it keeps rendering on the model's side). */
export async function testVideo(): Promise<{ ok: boolean; message: string }> {
  try {
    const frame = await sharp({ create: { width: 720, height: 1280, channels: 3, background: { r: 245, g: 200, b: 60 } } }).jpeg().toBuffer();
    const id = await submitVideo({ prompt: "Soft golden light slowly moves across the frame; gentle calm music.", firstFrame: { mime: "image/jpeg", data: frame }, seconds: 5, aspect: "9:16", audio: true });
    const check = await checkVideo(id);
    if (check.state === "failed") return { ok: false, message: `The job started but failed: ${check.reason}` };
    return { ok: true, message: `Works — ${studioConfig().videoModel} accepted a job (id ${id}). This test costs about ${(5 * studioConfig().videoCostPerSecUsd).toFixed(2)} USD.` };
  } catch (e) {
    return { ok: false, message: e instanceof StudioProviderError ? e.message : `Failed: ${String(e).slice(0, 200)}` };
  }
}
