import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import sharp from "sharp";
import { prisma } from "@/lib/prisma";
import { putFile } from "@/lib/storage";
import { getActiveBusinessId } from "@/lib/get-active-business-id";

export const runtime = "nodejs";
export const maxDuration = 30;

const MAX_BYTES = 10 * 1024 * 1024; // 10 MB in
const OK = new Set(["image/jpeg", "image/png", "image/webp", "image/gif", "image/avif"]);

/**
 * Storefront image upload. Takes a raw image file, normalises it (auto-rotate, cap at 2000px,
 * convert to webp, strip metadata) and stores it via lib/storage (R2 or public/uploads/<businessId>/). Returns a
 * `{ url }` the seller's design references — same shape as a pasted image URL, so every image
 * control accepts either.
 */
export async function POST(req: NextRequest) {
  const businessId = await getActiveBusinessId();
  if (!businessId) return NextResponse.json({ error: "No active business." }, { status: 400 });

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "Send the image as multipart/form-data." }, { status: 400 });
  }
  const file = form.get("file");
  if (!(file instanceof File)) return NextResponse.json({ error: "No file." }, { status: 400 });
  if (!OK.has(file.type)) return NextResponse.json({ error: "Use a JPG, PNG, WebP, GIF or AVIF." }, { status: 415 });
  if (file.size > MAX_BYTES) return NextResponse.json({ error: "That image is over 10 MB — please compress it first." }, { status: 413 });

  const input = Buffer.from(await file.arrayBuffer());
  const id = randomUUID();

  try {
    let out: Buffer;
    let ext: string;
    if (file.type === "image/gif") {
      // keep animation — re-encode to animated webp, fall back to the raw gif
      try {
        out = await sharp(input, { animated: true }).webp({ quality: 80, effort: 4 }).toBuffer();
        ext = "webp";
      } catch {
        out = input;
        ext = "gif";
      }
    } else {
      out = await sharp(input)
        .rotate()
        .resize({ width: 2000, height: 2000, fit: "inside", withoutEnlargement: true })
        .webp({ quality: 82 })
        .toBuffer();
      ext = "webp";
    }
    const name = `${id}.${ext}`;
    // Stored by lib/storage (Cloudflare R2 when configured) and listed in the business's media library.
    const url = await putFile(`uploads/${businessId}/${name}`, out, ext === "gif" ? "image/gif" : "image/webp");
    await prisma.mediaAsset.create({
      data: { businessId, kind: "image", name: file.name?.slice(0, 160) || name, mime: ext === "gif" ? "image/gif" : "image/webp", size: out.length, url, source: "store" },
    });
    return NextResponse.json({ url });
  } catch (e) {
    console.warn("[upload] failed:", String(e).slice(0, 200));
    return NextResponse.json({ error: "Couldn't process that image — try a different file." }, { status: 500 });
  }
}
