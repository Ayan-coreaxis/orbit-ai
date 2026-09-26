import sharp from "sharp";
import { prisma } from "@/lib/prisma";
import { readStoredFile } from "@/lib/storage";
import { parseList } from "@/lib/media";
import type { StudioFormat, StudioInput } from "@/lib/studio/formats";

/**
 * Reference photos for one job, in the order the director and the image model see them.
 * Edits and "animate a photo" put the seller's photo first (it IS the picture); everything else
 * leads with the real product photo so the product stays exact.
 */

export type StudioRef = { label: string; mime: string; data: Buffer; mediaId?: string; role: "product" | "photo" | "person" | "avatar" };

const MAX_REFS = 6;

/** Our own files, or a public https image (e.g. a product imported from the seller's old site) — never an internal address. */
export function safeUrl(url: string): boolean {
  if (url.startsWith("/uploads/")) return true;
  try {
    const u = new URL(url);
    if (u.protocol !== "https:") return false;
    const h = u.hostname;
    return !/^(localhost|0\.0\.0\.0|127\.|10\.|192\.168\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.|\[(::1|f[cd]))/i.test(h) && !h.endsWith(".internal") && !h.endsWith(".local");
  } catch {
    return false;
  }
}

async function load(url: string): Promise<{ mime: string; data: Buffer } | null> {
  if (!safeUrl(url)) return null;
  try {
    const raw = await readStoredFile(url);
    // One small, universally readable format for every model: JPEG, longest side 1536px.
    const data = await sharp(raw).rotate().resize({ width: 1536, height: 1536, fit: "inside", withoutEnlargement: true }).flatten({ background: "#ffffff" }).jpeg({ quality: 90 }).toBuffer();
    return { mime: "image/jpeg", data };
  } catch {
    return null;
  }
}

/** The seller's saved "brand face": the newest finished avatar. */
export async function brandFace(businessId: string) {
  const job = await prisma.studioJob.findFirst({ where: { businessId, format: "avatar", status: "done", resultMediaId: { not: null } }, orderBy: { createdAt: "desc" }, select: { resultMediaId: true } });
  return job?.resultMediaId ? prisma.mediaAsset.findFirst({ where: { id: job.resultMediaId, businessId, kind: "image" } }) : null;
}

export async function collectRefs(businessId: string, format: StudioFormat, input: StudioInput): Promise<StudioRef[]> {
  const refs: StudioRef[] = [];
  const add = async (url: string | null | undefined, label: string, role: StudioRef["role"], mediaId?: string) => {
    if (!url || refs.length >= MAX_REFS) return;
    const got = await load(url);
    if (got) refs.push({ ...got, label, role, mediaId });
  };
  const mediaRows = async (key: string) => {
    const ids = input.media?.[key] ?? [];
    if (!ids.length) return [];
    const rows = await prisma.mediaAsset.findMany({ where: { businessId, id: { in: ids }, kind: "image" } });
    return ids.map((id) => rows.find((r) => r.id === id)).filter((r): r is NonNullable<typeof r> => !!r);
  };

  const photosFirst = !!format.edit || (format.kind === "video" && !format.keyframe);
  if (photosFirst) for (const m of await mediaRows("photos")) await add(m.url, format.edit ? "the photo to edit" : "the photo to animate", "photo", m.id);

  if (input.productId) {
    const p = await prisma.product.findFirst({ where: { id: input.productId, businessId }, select: { name: true, imageUrl: true, galleryUrls: true } });
    if (p) {
      await add(p.imageUrl, `the product "${p.name}" (main photo)`, "product");
      for (const g of parseList(p.galleryUrls).slice(0, 2)) await add(g, `the product "${p.name}" (another angle)`, "product");
    }
  }
  if (!photosFirst) for (const m of await mediaRows("photos")) await add(m.url, "the product — extra photo from the seller", "photo", m.id);

  const person = (await mediaRows("person"))[0];
  if (person && input.consent) await add(person.url, "the person to feature (their face and look must match)", "person", person.id);
  else if (input.choice?.avatar === "brand") {
    const face = await brandFace(businessId);
    if (face) await add(face.url, "the brand's saved face — this exact person must appear", "avatar", face.id);
  }
  return refs;
}
