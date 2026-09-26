import { randomUUID } from "crypto";
import sharp from "sharp";
import { prisma } from "@/lib/prisma";
import { putFile, readStoredFile } from "@/lib/storage";
import { sha256, parseList } from "@/lib/media";
import { STUDIO_AGENT_IDS, blockedReason, estimateCostUsd, studioConfig, studioStatus } from "@/lib/studio/config";
import { cleanInput, getFormat, missingNeeds, type StudioFormat, type StudioInput } from "@/lib/studio/formats";
import { planBrief, type StudioBrief } from "@/lib/studio/director";
import { collectRefs, brandFace, type StudioRef } from "@/lib/studio/refs";
import { StudioProviderError, checkVideo, downloadVideo, generateImage, submitVideo } from "@/lib/studio/providers";

/**
 * Orbit Studio's pipeline. A job goes:
 *   draft (director's plan, nothing spent) → queued → generating → finishing → done | failed.
 * Images finish in one call. Videos first get a still frame from the image model (with the real
 * product), then the video model renders for a few minutes; the job is checked by a background
 * loop AND by the Content page's polling, whichever sees it finish first saves it (once).
 * Every result lands in the media library, so the Orchestrator, Orbit Design and products can use it.
 */

export class StudioError extends Error {
  constructor(message: string, public status = 400) {
    super(message);
  }
}

type Job = NonNullable<Awaited<ReturnType<typeof prisma.studioJob.findFirst>>>;

export function parseBrief(raw: string | null | undefined): StudioBrief | null {
  try {
    const v = JSON.parse(raw ?? "null");
    return v && typeof v === "object" ? (v as StudioBrief) : null;
  } catch {
    return null;
  }
}

export function parseInput(raw: string | null | undefined): StudioInput {
  try {
    const v = JSON.parse(raw ?? "{}");
    return v && typeof v === "object" ? (v as StudioInput) : {};
  } catch {
    return {};
  }
}

/** Media ids must belong to this business; a person photo needs consent; "brand face" must exist. */
async function checkMaterial(businessId: string, format: StudioFormat, input: StudioInput): Promise<void> {
  const missing = missingNeeds(format, input);
  if (missing.length) throw new StudioError(`Still needed: ${missing.join(", ")}.`);
  if (input.productId) {
    const p = await prisma.product.findFirst({ where: { id: input.productId, businessId }, select: { imageUrl: true, name: true } });
    if (!p) throw new StudioError("That product isn't in your store any more.");
    const hasOwnPhotos = (input.media?.photos?.length ?? 0) > 0;
    if (!p.imageUrl && !hasOwnPhotos) throw new StudioError(`"${p.name}" has no photo yet — add one in Store > Products, or add a photo of it here.`);
  }
  const ids = Object.values(input.media ?? {}).flat();
  if (ids.length) {
    const found = await prisma.mediaAsset.count({ where: { businessId, id: { in: ids }, kind: "image" } });
    if (found !== new Set(ids).size) throw new StudioError("One of the photos is missing from your media library — pick it again.");
  }
  if (input.choice?.avatar === "brand" && !(input.media?.person?.length) && !(await brandFace(businessId))) {
    throw new StudioError("You haven't made a brand face yet — make one with \"Create your brand face\" first, or pick another person.");
  }
}

/** Plan a new piece. Costs only the director's thinking — nothing is generated yet. */
export async function createDraft(businessId: string, formatId: string, rawInput: unknown, source: "content" | "orchestrator" = "content", note?: string) {
  const format = getFormat(formatId);
  if (!format) throw new StudioError("Unknown content type.");
  const status = await studioStatus(businessId);
  const blocked = blockedReason(status, format.kind);
  if (blocked) throw new StudioError(blocked, 403);
  const input = cleanInput(format, rawInput);
  if (note?.trim()) input.text = { ...input.text, note: [input.text?.note, note.trim()].filter(Boolean).join(" · ").slice(0, 800) };
  await checkMaterial(businessId, format, input);
  const refs = await collectRefs(businessId, format, input);
  if (format.needs.some((n) => n.type === "product" && n.required) && !refs.some((r) => r.role === "product" || r.role === "photo")) {
    throw new StudioError("Couldn't open the product's photo — re-upload it in Store > Products and try again.");
  }
  const brief = await planBrief({ businessId, format, input, refs });
  return prisma.studioJob.create({
    data: { businessId, format: format.id, kind: format.kind, status: "draft", input: JSON.stringify(input), brief: JSON.stringify(brief), source },
  });
}

/** The seller wants the plan changed before paying for it. */
export async function replan(businessId: string, jobId: string, change: string) {
  const job = await prisma.studioJob.findFirst({ where: { id: jobId, businessId } });
  if (!job) throw new StudioError("Not found.", 404);
  if (job.status !== "draft" && job.status !== "failed") throw new StudioError("This one is already being made.");
  const format = getFormat(job.format);
  if (!format) throw new StudioError("Unknown content type.");
  const input = parseInput(job.input);
  const refs = await collectRefs(businessId, format, input);
  const brief = await planBrief({ businessId, format, input, refs, change: change.slice(0, 800), previous: parseBrief(job.brief) });
  return prisma.studioJob.update({ where: { id: job.id }, data: { brief: JSON.stringify(brief), status: "draft", error: null } });
}

/**
 * Seller pressed Generate: claim the job (so a double click can't pay twice), check the monthly
 * allowance, and hand back — the work runs via `runJob` in the background.
 */
export async function startJob(businessId: string, jobId: string) {
  const job = await prisma.studioJob.findFirst({ where: { id: jobId, businessId } });
  if (!job) throw new StudioError("Not found.", 404);
  if (job.status !== "draft" && job.status !== "failed") return job; // already running or done
  const blocked = blockedReason(await studioStatus(businessId), job.kind as StudioFormat["kind"]);
  if (blocked) throw new StudioError(blocked, 403);
  await prisma.studioJob.updateMany({
    where: { id: job.id, status: { in: ["draft", "failed"] } },
    data: { status: "queued", startedAt: new Date(), error: null, stage: null, providerTaskId: null },
  });
  return (await prisma.studioJob.findUnique({ where: { id: job.id } }))!;
}

async function fail(job: Pick<Job, "id" | "businessId" | "source">, reason: string) {
  await prisma.studioJob.update({ where: { id: job.id }, data: { status: "failed", error: reason.slice(0, 400), stage: null } });
  if (job.source === "orchestrator") {
    await prisma.orchestratorMessage.create({
      data: { businessId: job.businessId, role: "assistant", speaker: "orchestrator", content: `The content I was making couldn't be finished: ${reason}\n\nNothing was charged to your monthly allowance. Open Content to try again: /dashboard/content` },
    });
  }
}

async function logCost(businessId: string, kind: "image" | "video", model: string, costUsd: number) {
  await prisma.agentUsage.create({
    data: { businessId, agentId: kind === "image" ? STUDIO_AGENT_IDS.image : STUDIO_AGENT_IDS.video, model, inputTokens: 0, outputTokens: 0, costUsd },
  });
}

async function saveMedia(businessId: string, data: Buffer, opts: { kind: "image" | "video"; mime: string; ext: string; name: string; frames?: string[]; note?: string | null }) {
  const url = await putFile(`uploads/${businessId}/media/${randomUUID()}.${opts.ext}`, data, opts.mime);
  return prisma.mediaAsset.create({
    data: {
      businessId,
      kind: opts.kind,
      name: opts.name.slice(0, 160),
      mime: opts.mime,
      size: data.length,
      url,
      source: "studio",
      hash: sha256(data),
      frames: opts.frames?.length ? JSON.stringify(opts.frames) : null,
      note: opts.note ?? null,
    },
  });
}

async function makeImage(job: Job, format: StudioFormat, brief: StudioBrief, refs: StudioRef[], name: string) {
  const cfg = studioConfig();
  const out = await generateImage({ prompt: brief.imagePrompt, refs, aspect: brief.aspect });
  await logCost(job.businessId, "image", cfg.imageModel, cfg.imageCostUsd);
  const webp = await sharp(out.data).webp({ quality: 90 }).toBuffer();
  return saveMedia(job.businessId, webp, { kind: "image", mime: "image/webp", ext: "webp", name, note: format.kind === "video" ? "First frame made by Orbit Studio" : `Made by Orbit Studio · ${format.name}` });
}

async function tellOrchestrator(job: Job, text: string, mediaId: string) {
  if (job.source !== "orchestrator") return;
  await prisma.orchestratorMessage.create({
    data: { businessId: job.businessId, role: "assistant", speaker: "orchestrator", content: text, attachments: JSON.stringify([mediaId]) },
  });
}

/** Does the work for a queued job. Safe to call more than once — only a queued job is picked up. */
export async function runJob(jobId: string): Promise<void> {
  const picked = await prisma.studioJob.updateMany({ where: { id: jobId, status: "queued" }, data: { status: "generating" } });
  if (!picked.count) return;
  const job = (await prisma.studioJob.findUnique({ where: { id: jobId } }))!;
  const format = getFormat(job.format);
  const brief = parseBrief(job.brief);
  if (!format || !brief) return fail(job, "This plan is broken — make a new one.");
  const input = parseInput(job.input);
  try {
    const refs = await collectRefs(job.businessId, format, input);
    if (format.kind === "image") {
      await prisma.studioJob.update({ where: { id: job.id }, data: { stage: "image" } });
      const m = await makeImage(job, format, brief, refs, `${brief.title} · ${format.name}`);
      await prisma.studioJob.update({ where: { id: job.id }, data: { status: "done", stage: null, resultMediaId: m.id, costUsd: studioConfig().imageCostUsd } });
      await tellOrchestrator(job, `Your ${format.name.toLowerCase()} is ready — "${brief.title}". It's in Content and your media library.`, m.id);
      return;
    }

    // Video: first frame, then the video model.
    let frame: StudioRef;
    let keyframeMediaId: string | null = null;
    let cost = 0;
    if (format.keyframe) {
      await prisma.studioJob.update({ where: { id: job.id }, data: { stage: "keyframe" } });
      const kf = await makeImage(job, format, brief, refs, `${brief.title} · first frame`);
      keyframeMediaId = kf.id;
      cost += studioConfig().imageCostUsd;
      const buf = await sharp(await readStoredFile(kf.url)).jpeg({ quality: 92 }).toBuffer();
      frame = { label: "first frame", mime: "image/jpeg", data: buf, role: "photo", mediaId: kf.id };
    } else {
      const own = refs.find((r) => r.role === "photo");
      if (!own) return fail(job, "Couldn't open the photo to animate — pick it again.");
      frame = own;
      keyframeMediaId = own.mediaId ?? null;
    }
    await prisma.studioJob.update({ where: { id: job.id }, data: { stage: "video", keyframeMediaId, costUsd: cost } });
    const taskId = await submitVideo({ prompt: brief.videoPrompt ?? brief.imagePrompt, firstFrame: frame, seconds: brief.seconds ?? format.seconds ?? 8, aspect: brief.aspect, audio: true });
    await prisma.studioJob.update({ where: { id: job.id }, data: { providerTaskId: taskId } });

    // Watch it for a while; the Content page's polling picks it up if this loop ends first.
    const until = Date.now() + 4.5 * 60 * 1000;
    while (Date.now() < until) {
      await new Promise((r) => setTimeout(r, 8000));
      const fresh = await prisma.studioJob.findUnique({ where: { id: job.id } });
      if (!fresh || fresh.status !== "generating") return;
      if (await pollOnce(fresh)) return;
    }
  } catch (e) {
    const msg = e instanceof StudioProviderError ? e.message : `Something went wrong: ${e instanceof Error ? e.message.slice(0, 160) : "unknown error"}`;
    const now = await prisma.studioJob.findUnique({ where: { id: job.id }, select: { status: true } });
    if (now?.status === "generating") await fail(job, msg);
  }
}

/** One check on a rendering video. Returns true once the job is finished (done or failed). */
async function pollOnce(job: Job): Promise<boolean> {
  if (!job.providerTaskId) return false;
  const r = await checkVideo(job.providerTaskId);
  if (r.state === "working") {
    await prisma.studioJob.update({ where: { id: job.id }, data: { updatedAt: new Date() } });
    return false;
  }
  if (r.state === "failed") {
    const claimed = await prisma.studioJob.updateMany({ where: { id: job.id, status: "generating" }, data: { status: "finishing" } });
    if (claimed.count) await fail(job, r.reason);
    return true;
  }
  // Only one caller saves the finished video.
  const claimed = await prisma.studioJob.updateMany({ where: { id: job.id, status: "generating" }, data: { status: "finishing" } });
  if (!claimed.count) return true;
  try {
    const format = getFormat(job.format);
    const brief = parseBrief(job.brief);
    const video = await downloadVideo(r.url);
    const keyframe = job.keyframeMediaId ? await prisma.mediaAsset.findUnique({ where: { id: job.keyframeMediaId }, select: { url: true } }) : null;
    const m = await saveMedia(job.businessId, video, {
      kind: "video",
      mime: "video/mp4",
      ext: "mp4",
      name: `${brief?.title ?? "Reel"} · ${format?.name ?? "video"}`,
      frames: keyframe ? [keyframe.url] : [],
      note: brief?.script ? `Script: "${brief.script}"` : "Made by Orbit Studio",
    });
    const cfg = studioConfig();
    const seconds = brief?.seconds ?? format?.seconds ?? 8;
    const videoCost = seconds * cfg.videoCostPerSecUsd;
    await logCost(job.businessId, "video", cfg.videoModel, videoCost);
    await prisma.studioJob.update({ where: { id: job.id }, data: { status: "done", stage: null, resultMediaId: m.id, costUsd: job.costUsd + videoCost } });
    await tellOrchestrator(job, `Your ${format?.name.toLowerCase() ?? "video"} is ready — "${brief?.title ?? "reel"}". Watch it in Content: /dashboard/content`, m.id);
  } catch (e) {
    await fail(job, e instanceof StudioProviderError ? e.message : "Couldn't save the finished video — try again.");
  }
  return true;
}

/** Called when the Content page asks about a job: nudges a rendering video along. */
export async function refreshJob(job: Job): Promise<Job> {
  if (job.status === "generating" && job.stage === "video" && job.providerTaskId && Date.now() - job.updatedAt.getTime() > 5000) {
    await pollOnce(job);
    return (await prisma.studioJob.findUnique({ where: { id: job.id } })) ?? job;
  }
  // A job stuck in "queued" (server restarted before it ran) gets picked up again.
  if (job.status === "queued" && Date.now() - job.updatedAt.getTime() > 60000) {
    void runJob(job.id);
  }
  // Something died mid-way and nobody is watching it any more.
  if ((job.status === "generating" || job.status === "finishing") && !job.providerTaskId && Date.now() - job.updatedAt.getTime() > 10 * 60 * 1000) {
    await fail(job, "This took too long and was stopped — try again.");
    return (await prisma.studioJob.findUnique({ where: { id: job.id } })) ?? job;
  }
  return job;
}

// ---------- What the page sees ----------

export type JobView = {
  id: string;
  format: string;
  kind: "image" | "video";
  status: string;
  stage: string | null;
  brief: StudioBrief | null;
  input: StudioInput;
  error: string | null;
  source: string;
  createdAt: string;
  result: { id: string; url: string; kind: string; poster: string | null } | null;
  keyframeUrl: string | null;
  estimateUsd: number;
};

export async function jobViews(businessId: string, jobs: Job[]): Promise<JobView[]> {
  const ids = jobs.flatMap((j) => [j.resultMediaId, j.keyframeMediaId]).filter((x): x is string => !!x);
  const media = ids.length ? await prisma.mediaAsset.findMany({ where: { businessId, id: { in: ids } }, select: { id: true, url: true, kind: true, frames: true } }) : [];
  const byId = new Map(media.map((m) => [m.id, m]));
  return jobs.map((j) => {
    const r = j.resultMediaId ? byId.get(j.resultMediaId) : undefined;
    const format = getFormat(j.format);
    return {
      id: j.id,
      format: j.format,
      kind: j.kind as "image" | "video",
      status: j.status,
      stage: j.stage,
      brief: parseBrief(j.brief),
      input: parseInput(j.input),
      error: j.error,
      source: j.source,
      createdAt: j.createdAt.toISOString(),
      result: r ? { id: r.id, url: r.url, kind: r.kind, poster: parseList(r.frames)[0] ?? null } : null,
      keyframeUrl: j.keyframeMediaId ? (byId.get(j.keyframeMediaId)?.url ?? null) : null,
      estimateUsd: format ? estimateCostUsd(format.kind, format.seconds, !!format.keyframe) : 0,
    };
  });
}
