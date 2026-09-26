import { studioConfig } from "@/lib/studio/config";
import type { Aspect } from "@/lib/studio/formats";

/**
 * The only file that talks to the image / video models. Everything else in Orbit Studio calls
 * these three functions, so a model can be swapped here without touching the rest of the app.
 *  - generateImage: Google Gemini image model ("Nano Banana 2") — text + reference photos → image.
 *  - submitVideo / checkVideo: ByteDance Seedance on BytePlus ModelArk — a still frame + prompt →
 *    a video task that renders for 1–3 minutes, with sound.
 * Errors are StudioProviderError with a message the seller can read.
 */

export class StudioProviderError extends Error {
  constructor(message: string, public retryable = false) {
    super(message);
  }
}

type Fetch = typeof fetch;
export type RefImage = { mime: string; data: Buffer };

// ---------- Images ----------

type GeminiPart = { text?: string; inlineData?: { mimeType?: string; data?: string }; inline_data?: { mime_type?: string; data?: string } };
type GeminiResponse = {
  candidates?: { content?: { parts?: GeminiPart[] }; finishReason?: string }[];
  promptFeedback?: { blockReason?: string };
  error?: { message?: string; status?: string };
};

export async function generateImage(
  opts: { prompt: string; refs?: RefImage[]; aspect: Aspect },
  f: Fetch = fetch,
): Promise<{ data: Buffer; mime: string; note: string | null }> {
  const cfg = studioConfig();
  if (!cfg.imageKey) throw new StudioProviderError("Image making isn't set up yet (no image model key).");
  const parts = [
    ...(opts.refs ?? []).slice(0, 6).map((r) => ({ inline_data: { mime_type: r.mime, data: r.data.toString("base64") } })),
    { text: opts.prompt },
  ];
  let res: Response;
  try {
    res = await f(`${cfg.imageBaseUrl}/models/${encodeURIComponent(cfg.imageModel)}:generateContent`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": cfg.imageKey },
      body: JSON.stringify({
        contents: [{ role: "user", parts }],
        generationConfig: { responseModalities: ["TEXT", "IMAGE"], imageConfig: { aspectRatio: opts.aspect } },
      }),
      signal: AbortSignal.timeout(120000),
    });
  } catch {
    throw new StudioProviderError("The image model didn't answer in time — try again.", true);
  }
  const body = (await res.json().catch(() => ({}))) as GeminiResponse;
  if (!res.ok) throw httpError("image", res.status, body.error?.message);
  if (body.promptFeedback?.blockReason) {
    throw new StudioProviderError("The image model refused this request (safety filter). Try different wording or photos.");
  }
  const cand = body.candidates?.[0];
  const outParts = cand?.content?.parts ?? [];
  const img = outParts.map((p) => p.inlineData ?? (p.inline_data && { mimeType: p.inline_data.mime_type, data: p.inline_data.data })).find((d) => d?.data);
  if (!img?.data) {
    if (/SAFETY|PROHIBITED|BLOCK/i.test(cand?.finishReason ?? "")) throw new StudioProviderError("The image model refused this request (safety filter). Try different wording or photos.");
    throw new StudioProviderError("The image model didn't return a picture — try again.", true);
  }
  const note = outParts.map((p) => p.text).filter(Boolean).join(" ").trim() || null;
  return { data: Buffer.from(img.data, "base64"), mime: img.mimeType || "image/png", note };
}

// ---------- Videos ----------

type ArkTask = {
  id?: string;
  status?: string;
  content?: { video_url?: string };
  error?: { code?: string; message?: string } | null;
  usage?: { completion_tokens?: number; total_tokens?: number };
};

export async function submitVideo(
  opts: { prompt: string; firstFrame: RefImage; seconds: number; aspect: Aspect; audio: boolean },
  f: Fetch = fetch,
): Promise<string> {
  const cfg = studioConfig();
  if (!cfg.videoKey) throw new StudioProviderError("Reels aren't set up yet (no video model key).");
  let res: Response;
  try {
    res = await f(`${cfg.videoBaseUrl}/contents/generations/tasks`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${cfg.videoKey}` },
      body: JSON.stringify({
        model: cfg.videoModel,
        content: [
          { type: "text", text: opts.prompt },
          { type: "image_url", image_url: { url: `data:${opts.firstFrame.mime};base64,${opts.firstFrame.data.toString("base64")}` }, role: "first_frame" },
        ],
        ratio: opts.aspect,
        duration: opts.seconds,
        resolution: cfg.videoResolution,
        generate_audio: opts.audio,
        watermark: false,
      }),
      signal: AbortSignal.timeout(60000),
    });
  } catch {
    throw new StudioProviderError("The video model didn't answer — try again.", true);
  }
  const body = (await res.json().catch(() => ({}))) as ArkTask & { error?: { message?: string } };
  if (!res.ok) throw httpError("video", res.status, body.error?.message);
  if (!body.id) throw new StudioProviderError("The video model didn't start the job — try again.", true);
  return body.id;
}

export type VideoCheck = { state: "working" } | { state: "done"; url: string } | { state: "failed"; reason: string };

export async function checkVideo(taskId: string, f: Fetch = fetch): Promise<VideoCheck> {
  const cfg = studioConfig();
  if (!cfg.videoKey) return { state: "failed", reason: "The video model key was removed." };
  let res: Response;
  try {
    res = await f(`${cfg.videoBaseUrl}/contents/generations/tasks/${encodeURIComponent(taskId)}`, {
      headers: { Authorization: `Bearer ${cfg.videoKey}` },
      signal: AbortSignal.timeout(30000),
    });
  } catch {
    return { state: "working" }; // a missed check is fine — we look again shortly
  }
  const body = (await res.json().catch(() => ({}))) as ArkTask;
  if (res.status === 404) return { state: "failed", reason: "The video job was lost on the model's side — try again." };
  if (!res.ok) return res.status >= 500 || res.status === 429 ? { state: "working" } : { state: "failed", reason: httpError("video", res.status, body.error?.message).message };
  const s = (body.status ?? "").toLowerCase();
  if (s === "succeeded") {
    return body.content?.video_url ? { state: "done", url: body.content.video_url } : { state: "failed", reason: "The video finished but no file came back — try again." };
  }
  if (s === "failed" || s === "cancelled" || s === "expired") {
    const msg = body.error?.message ?? "";
    return { state: "failed", reason: /sensitive|safety|policy|moderat/i.test(msg) ? "The video model refused this request (safety filter). Try different wording or photos." : `The video model couldn't make this${msg ? `: ${msg.slice(0, 160)}` : ""}.` };
  }
  return { state: "working" };
}

/** Fetch the finished video file (the model's link expires, so we keep our own copy). */
export async function downloadVideo(url: string, f: Fetch = fetch): Promise<Buffer> {
  const res = await f(url, { signal: AbortSignal.timeout(120000) });
  if (!res.ok) throw new StudioProviderError("Couldn't download the finished video — try again.", true);
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length > 200 * 1024 * 1024) throw new StudioProviderError("The finished video is too large to keep.");
  return buf;
}

function httpError(what: "image" | "video", status: number, detail?: string): StudioProviderError {
  const d = detail ? ` (${detail.slice(0, 160)})` : "";
  if (status === 401 || status === 403) return new StudioProviderError(`The ${what} model key was rejected — check it in Super Admin > Studio.${d}`);
  if (status === 429) return new StudioProviderError(`The ${what} model is busy or out of credit — try again in a minute.${d}`, true);
  if (status === 400) return new StudioProviderError(`The ${what} model didn't accept this request${d}.`);
  if (status === 404) return new StudioProviderError(`The ${what} model name wasn't found — check it in Super Admin > Studio.${d}`);
  return new StudioProviderError(`The ${what} model had a problem (${status}) — try again.${d}`, status >= 500);
}
