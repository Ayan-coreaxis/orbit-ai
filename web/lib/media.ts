import { createHash, randomUUID } from "crypto";
import sharp from "sharp";
import type Anthropic from "@anthropic-ai/sdk";
import { prisma } from "@/lib/prisma";
import { deleteFile, putFile, readStoredFile } from "@/lib/storage";
import { extractCatalogImages } from "@/lib/pdf-extract";

/**
 * The business's media library: every photo / video / audio / PDF the owner gives Orbit, from the
 * Orchestrator chat or the store. Files are stored by lib/storage.ts under uploads/<businessId>/media/
 * (Cloudflare R2 when configured, else this server's public/ folder). Agents reach them by ref (M1, M2…) — the
 * Orchestrator sees images and PDFs directly, videos through still frames the browser captured,
 * and audio through its transcript.
 */

export type MediaKind = "image" | "video" | "audio" | "pdf";

const LIMITS: Record<MediaKind, { mimes: string[]; maxBytes: number; label: string }> = {
  image: { mimes: ["image/jpeg", "image/png", "image/webp", "image/gif", "image/avif", "image/heic", "image/heif"], maxBytes: 15 * 1024 * 1024, label: "15 MB" },
  pdf: { mimes: ["application/pdf"], maxBytes: 20 * 1024 * 1024, label: "20 MB" },
  audio: { mimes: ["audio/webm", "audio/ogg", "audio/mpeg", "audio/mp3", "audio/mp4", "audio/x-m4a", "audio/m4a", "audio/wav", "audio/x-wav", "audio/aac"], maxBytes: 25 * 1024 * 1024, label: "25 MB" },
  video: { mimes: ["video/mp4", "video/webm", "video/quicktime", "video/x-m4v"], maxBytes: 100 * 1024 * 1024, label: "100 MB" },
};

export function kindOf(mime: string): MediaKind | null {
  const m = mime.toLowerCase().split(";")[0].trim();
  for (const k of Object.keys(LIMITS) as MediaKind[]) if (LIMITS[k].mimes.includes(m)) return k;
  return null;
}

const EXT: Record<string, string> = {
  "application/pdf": "pdf",
  "audio/webm": "webm", "audio/ogg": "ogg", "audio/mpeg": "mp3", "audio/mp3": "mp3", "audio/mp4": "m4a", "audio/x-m4a": "m4a", "audio/m4a": "m4a", "audio/wav": "wav", "audio/x-wav": "wav", "audio/aac": "aac",
  "video/mp4": "mp4", "video/webm": "webm", "video/quicktime": "mov", "video/x-m4v": "m4v",
};

async function saveImage(input: Buffer, dir: string, id: string): Promise<{ url: string; bytes: number }> {
  const out = await sharp(input, { animated: true })
    .rotate()
    .resize({ width: 2000, height: 2000, fit: "inside", withoutEnlargement: true })
    .webp({ quality: 82 })
    .toBuffer();
  return { url: await putFile(`${dir}/${id}.webp`, out, "image/webp"), bytes: out.length };
}

/** Speech-to-text for an uploaded audio file. Uses OpenAI Whisper when OPENAI_API_KEY is set. */
async function transcribe(buf: Buffer, mime: string, name: string): Promise<{ text: string | null; note: string | null }> {
  const key = process.env.OPENAI_API_KEY;
  if (!key) return { text: null, note: "No speech-to-text key set up yet (OPENAI_API_KEY), so this audio has no transcript — record a voice note in the chat instead, which the browser transcribes." };
  try {
    const fd = new FormData();
    fd.append("file", new Blob([new Uint8Array(buf)], { type: mime }), name);
    fd.append("model", "whisper-1");
    const res = await fetch("https://api.openai.com/v1/audio/transcriptions", { method: "POST", headers: { Authorization: `Bearer ${key}` }, body: fd, signal: AbortSignal.timeout(120000) });
    if (!res.ok) return { text: null, note: `Transcription failed (${res.status}).` };
    const data = (await res.json()) as { text?: string };
    return { text: data.text?.trim() || null, note: data.text ? null : "The audio had no speech in it." };
  } catch {
    return { text: null, note: "Transcription failed — try again." };
  }
}

export function sha256(buf: Buffer) {
  return createHash("sha256").update(buf).digest("hex");
}

/** The library row already holding exactly these bytes (a re-upload), if any. */
export async function findDuplicate(businessId: string, hash: string) {
  return prisma.mediaAsset.findFirst({ where: { businessId, hash }, orderBy: { createdAt: "desc" } });
}

export class MediaError extends Error {
  constructor(message: string, public status = 400) {
    super(message);
  }
}

/**
 * Save one uploaded file. `frames` are still images of a video the browser captured; `transcript`
 * is what the browser's own speech recognition heard while a voice note was recorded.
 * The same bytes uploaded again return the existing row (`duplicate: true`) instead of a copy —
 * so a catalog PDF sent twice doesn't pull all its photos out twice.
 */
export async function saveMedia(
  businessId: string,
  file: File,
  opts: { frames?: File[]; transcript?: string; source?: string } = {},
) {
  const kind = kindOf(file.type);
  if (!kind) throw new MediaError("That file type isn't supported — use a photo, video, audio file or PDF.", 415);
  if (file.size > LIMITS[kind].maxBytes) throw new MediaError(`That ${kind} is over ${LIMITS[kind].label}.`, 413);

  const dir = `uploads/${businessId}/media`;
  const id = randomUUID();
  const input = Buffer.from(await file.arrayBuffer());
  const hash = sha256(input);
  const existing = await findDuplicate(businessId, hash);
  if (existing) return { ...existing, duplicate: true };
  let stored: { url: string; bytes: number };
  let frames: string[] = [];
  let text: string | null = null;
  let note: string | null = null;

  if (kind === "image") {
    try {
      stored = await saveImage(input, dir, id);
    } catch {
      throw new MediaError("Couldn't read that image — try a JPG or PNG.", 415);
    }
  } else {
    const mime = file.type.split(";")[0];
    stored = { url: await putFile(`${dir}/${id}.${EXT[mime] ?? "bin"}`, input, mime), bytes: input.length };
  }

  if (kind === "video") {
    for (const [i, f] of (opts.frames ?? []).slice(0, 6).entries()) {
      if (!f.type.startsWith("image/") || f.size > 3 * 1024 * 1024) continue;
      try {
        const s = await saveImage(Buffer.from(await f.arrayBuffer()), dir, `${id}-f${i}`);
        frames.push(s.url);
      } catch {
        // a bad frame just means the AI sees one fewer still
      }
    }
    if (!frames.length) note = "No still frames were captured, so AI can't see what's in this video — it can still be used as-is.";
  }

  if (kind === "audio") {
    const heard = opts.transcript?.trim();
    if (heard) text = heard.slice(0, 20000);
    else ({ text, note } = await transcribe(input, file.type.split(";")[0], file.name || `${id}.webm`));
  }

  const name = (file.name || `${kind}-${new Date().toISOString().slice(0, 10)}`).slice(0, 160);

  // Catalog PDFs: every product photo inside (or linked from) the PDF becomes its own library image,
  // named by page, so the Orchestrator can attach the right photo to the right product.
  if (kind === "pdf") {
    try {
      const imgs = await extractCatalogImages(input);
      for (const [i, img] of imgs.entries()) {
        // A photo already in the library (same image in another catalog, or twice in this one) is reused.
        const imgHash = sha256(img.webp);
        const same = await findDuplicate(businessId, imgHash);
        if (same) {
          if (!frames.includes(same.url)) frames.push(same.url);
          continue;
        }
        const url = await putFile(`${dir}/${id}-p${img.page}-${i}.webp`, img.webp, "image/webp");
        await prisma.mediaAsset.create({
          data: { businessId, kind: "image", name: `${name.replace(/\.pdf$/i, "")} · page ${img.page}`.slice(0, 160), mime: "image/webp", size: img.webp.length, url, source: "catalog", hash: imgHash, note: img.from === "link" ? `Downloaded from the link on page ${img.page}` : `Taken from page ${img.page}` },
        });
        frames.push(url);
      }
      note = imgs.length ? `${imgs.length} product photo${imgs.length === 1 ? "" : "s"} pulled out of this PDF into the media library.` : "No product photos found inside this PDF.";
    } catch (e) {
      console.warn("[media] pdf image extraction failed:", String(e).slice(0, 200));
      note = "Couldn't pull photos out of this PDF.";
    }
  }

  const created = await prisma.mediaAsset.create({
    data: {
      businessId,
      kind,
      name,
      mime: kind === "image" ? "image/webp" : file.type.split(";")[0],
      size: stored.bytes,
      url: stored.url,
      frames: frames.length ? JSON.stringify(frames) : null,
      text,
      note,
      source: opts.source === "store" || opts.source === "library" ? opts.source : "chat",
      hash,
    },
  });
  return { ...created, duplicate: false };
}

export async function deleteMedia(businessId: string, id: string) {
  const m = await prisma.mediaAsset.findFirst({ where: { id, businessId } });
  if (!m) throw new MediaError("Not found.", 404);
  // A PDF's "frames" are its extracted photos — separate library items (maybe on products, maybe
  // shared with another catalog), so they stay. A video's frames belong to it alone.
  const files = [m.url, ...(m.kind === "video" ? parseList(m.frames) : [])];
  await Promise.all(files.map((u) => deleteFile(u)));
  await prisma.mediaAsset.delete({ where: { id: m.id } });
}

export function parseList(raw: string | null | undefined): string[] {
  try {
    const v = JSON.parse(raw ?? "[]");
    return Array.isArray(v) ? v.filter((x) => typeof x === "string") : [];
  } catch {
    return [];
  }
}

export type MediaView = {
  id: string;
  kind: MediaKind;
  name: string;
  url: string;
  size: number;
  frames: string[];
  text: string | null;
  note: string | null;
  source: string;
  createdAt: string;
};

export function toView(m: Awaited<ReturnType<typeof prisma.mediaAsset.findFirst>> & object): MediaView {
  return {
    id: m.id,
    kind: m.kind as MediaKind,
    name: m.name,
    url: m.url,
    size: m.size,
    frames: parseList(m.frames),
    text: m.text,
    note: m.note,
    source: m.source,
    createdAt: m.createdAt.toISOString(),
  };
}

export async function listMedia(businessId: string, opts: { kind?: MediaKind; take?: number } = {}) {
  const rows = await prisma.mediaAsset.findMany({
    where: { businessId, ...(opts.kind && { kind: opts.kind }) },
    orderBy: { createdAt: "desc" },
    take: opts.take ?? 200,
  });
  return rows.map(toView);
}

// ---------- What agents see ----------

const MEDIA_IN_PROMPT = 80;

export const OPEN_MEDIA_TOOL: Anthropic.Messages.Tool = {
  name: "open_media",
  description:
    "Open a file from the MEDIA LIBRARY again to look at it (photo, PDF catalog, video frames, voice-note transcript) — e.g. to add the rest of a catalog's products, or check a photo before using it. Only when you really need the file's contents; files attached to THIS message are already in front of you.",
  input_schema: { type: "object", properties: { ref: { type: "string", description: "Media ref, e.g. 'M4'." } }, required: ["ref"] },
};

/** Refs M1, M2… are the newest-first order of this list (the same list is used to resolve them). */
export async function mediaRefs(businessId: string) {
  return prisma.mediaAsset.findMany({ where: { businessId }, orderBy: { createdAt: "desc" }, take: MEDIA_IN_PROMPT });
}

function ago(d: Date) {
  const m = Math.round((Date.now() - d.getTime()) / 60000);
  return m < 60 ? `${m} min ago` : m < 1440 ? `${Math.round(m / 60)} h ago` : `${Math.round(m / 1440)} days ago`;
}

/** MEDIA section of the Orchestrator prompt. */
export async function mediaContext(businessId: string): Promise<string> {
  const rows = await mediaRefs(businessId);
  if (!rows.length) return "\nMEDIA LIBRARY: empty. If you or a specialist need photos, videos, voice notes or documents from the owner, ask them to attach it with the 📎 button in this chat.";
  const lines = rows.map((m, i) => {
    const extra = m.kind === "audio" ? (m.text ? ` — transcript: "${m.text.slice(0, 160)}${m.text.length > 160 ? "…" : ""}"` : ` — no transcript`) : m.kind === "video" ? ` — ${parseList(m.frames).length} still frames` : "";
    return `M${i + 1} ${m.kind} "${m.name}" (${m.source}, ${ago(m.createdAt)})${extra}`;
  });
  return `
MEDIA LIBRARY (files the owner gave you; newest first). A product photo can be set with product_changes image: "M3" (main image) or add_to_gallery: "M3" — only images. If you or a specialist need more files, ask the owner to attach them with the 📎 button in this chat.
${lines.join("\n")}`;
}

export async function resolveMediaRef(businessId: string, ref: string) {
  const r = ref.trim().toUpperCase();
  if (/^M\d+$/.test(r)) {
    const rows = await mediaRefs(businessId);
    return rows[Number(r.slice(1)) - 1] ?? null;
  }
  return prisma.mediaAsset.findFirst({ where: { id: ref.trim(), businessId } });
}

async function base64Of(url: string) {
  return (await readStoredFile(url)).toString("base64");
}

/**
 * Claude content blocks for files attached to THIS message: images and video frames as images,
 * PDFs as documents, audio as its transcript. Budgeted so one message can't blow up the context.
 */
export async function attachmentBlocks(businessId: string, ids: string[]): Promise<Anthropic.Messages.ContentBlockParam[]> {
  if (!ids.length) return [];
  const rows = await prisma.mediaAsset.findMany({ where: { businessId, id: { in: ids.slice(0, 10) } } });
  const refs = await mediaRefs(businessId);
  const refOf = (id: string) => {
    const i = refs.findIndex((r) => r.id === id);
    return i >= 0 ? `M${i + 1}` : id;
  };
  const blocks: Anthropic.Messages.ContentBlockParam[] = [];
  let images = 0;
  for (const m of rows) {
    const label = `[Owner attached ${m.kind} ${refOf(m.id)} "${m.name}"]`;
    try {
      if (m.kind === "image" && images < 8) {
        blocks.push({ type: "text", text: label });
        blocks.push({ type: "image", source: { type: "base64", media_type: "image/webp", data: await base64Of(m.url) } });
        images++;
      } else if (m.kind === "pdf" && m.size <= 20 * 1024 * 1024) {
        blocks.push({ type: "text", text: label });
        blocks.push({ type: "document", source: { type: "base64", media_type: "application/pdf", data: await base64Of(m.url) } });
        const photos = parseList(m.frames);
        if (photos.length) {
          const kids = refs.map((r, i) => ({ r, ref: `M${i + 1}` })).filter(({ r }) => photos.includes(r.url));
          blocks.push({ type: "text", text: `Product photos pulled out of this PDF (use these refs as each new product's image — match by page): ${kids.map(({ r, ref }) => `${ref} = ${r.name}`).join("; ") || "none in the current list"}` });
        }
      } else if (m.kind === "video") {
        const frames = parseList(m.frames).slice(0, Math.max(0, 8 - images));
        blocks.push({ type: "text", text: `${label} — ${frames.length ? `${frames.length} still frames from it follow, in order` : "no frames captured, so you can't see it"}.` });
        for (const f of frames) {
          blocks.push({ type: "image", source: { type: "base64", media_type: "image/webp", data: await base64Of(f) } });
          images++;
        }
      } else if (m.kind === "audio") {
        blocks.push({ type: "text", text: `${label} — ${m.text ? `transcript: "${m.text}"` : `no transcript (${m.note ?? "unavailable"})`}` });
      } else {
        blocks.push({ type: "text", text: `${label} (too large to show you)` });
      }
    } catch {
      blocks.push({ type: "text", text: `${label} (file missing on the server)` });
    }
  }
  return blocks;
}

/** One-line text note for history / specialists, who don't get the raw files. */
export async function attachmentNote(businessId: string, ids: string[]): Promise<string> {
  if (!ids.length) return "";
  const rows = await prisma.mediaAsset.findMany({ where: { businessId, id: { in: ids } }, select: { kind: true, name: true, text: true, note: true, frames: true } });
  return rows
    .map((m) => {
      const extra =
        m.kind === "audio" && m.text
          ? `: "${m.text.slice(0, 300)}"`
          : m.kind === "pdf" && parseList(m.frames).length
            ? ` — a catalog/document; ${m.note ?? "its product photos were extracted"} The Orchestrator reads its full contents`
            : "";
      return `[attached ${m.kind} "${m.name}"${extra}]`;
    })
    .join(" ");
}

/** Attachments of many chat messages at once, for rendering (message id → files). */
export async function attachmentViews(businessId: string, messages: { id: string; attachments: string | null }[]): Promise<Map<string, MediaView[]>> {
  const idsByMsg = messages.map((m) => [m.id, parseList(m.attachments)] as const).filter(([, ids]) => ids.length);
  const all = [...new Set(idsByMsg.flatMap(([, ids]) => ids))];
  if (!all.length) return new Map();
  const rows = await prisma.mediaAsset.findMany({ where: { businessId, id: { in: all } } });
  const byId = new Map(rows.map((r) => [r.id, toView(r)]));
  return new Map(idsByMsg.map(([id, ids]) => [id, ids.map((x) => byId.get(x)).filter((v): v is MediaView => !!v)]));
}
