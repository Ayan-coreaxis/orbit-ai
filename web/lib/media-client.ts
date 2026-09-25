"use client";

export type UploadedMedia = {
  id: string;
  kind: "image" | "video" | "audio" | "pdf";
  name: string;
  url: string;
  size: number;
  frames: string[];
  text: string | null;
  note: string | null;
  source: string;
  createdAt: string;
};

export const MEDIA_ACCEPT = "image/*,video/mp4,video/webm,video/quicktime,audio/*,application/pdf";

/** Grab evenly spaced stills from a video in the browser, so AI can "see" it without ffmpeg. */
async function captureFrames(file: File, count = 5): Promise<Blob[]> {
  const url = URL.createObjectURL(file);
  const video = document.createElement("video");
  video.muted = true;
  video.playsInline = true;
  video.preload = "auto";
  video.src = url;
  try {
    await new Promise<void>((res, rej) => {
      video.onloadedmetadata = () => res();
      video.onerror = () => rej(new Error("video"));
      setTimeout(() => rej(new Error("timeout")), 15000);
    });
    const d = Number.isFinite(video.duration) && video.duration > 0 ? video.duration : 0;
    if (!d) return [];
    const scale = Math.min(1, 768 / Math.max(video.videoWidth, video.videoHeight, 1));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(video.videoWidth * scale));
    canvas.height = Math.max(1, Math.round(video.videoHeight * scale));
    const ctx = canvas.getContext("2d");
    if (!ctx) return [];
    const out: Blob[] = [];
    for (let i = 0; i < count; i++) {
      const t = (d * (i + 0.5)) / count;
      await new Promise<void>((res) => {
        video.onseeked = () => res();
        video.currentTime = t;
        setTimeout(res, 4000);
      });
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, "image/jpeg", 0.8));
      if (blob) out.push(blob);
    }
    return out;
  } catch {
    return [];
  } finally {
    URL.revokeObjectURL(url);
  }
}

export async function uploadMedia(
  file: File | Blob,
  opts: { name?: string; source?: "chat" | "store" | "library"; transcript?: string } = {},
): Promise<UploadedMedia> {
  const fd = new FormData();
  const name = opts.name ?? (file instanceof File ? file.name : "file");
  fd.append("file", file, name);
  if (opts.source) fd.append("source", opts.source);
  if (opts.transcript) fd.append("transcript", opts.transcript);
  if (file.type.startsWith("video/") && file instanceof File) {
    (await captureFrames(file)).forEach((b, i) => fd.append("frames", b, `frame-${i}.jpg`));
  }
  const res = await fetch("/api/media", { method: "POST", body: fd });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "Upload failed.");
  return data.media as UploadedMedia;
}

export function formatSize(bytes: number) {
  return bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
