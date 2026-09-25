import { createHash } from "crypto";
import { lookup } from "dns/promises";
import net from "net";
import sharp from "sharp";

/**
 * Pull product photos out of a catalog PDF so they can become real product images:
 *  1. images embedded in the pages (decoded by pdf.js, re-encoded as webp), and
 *  2. links in the PDF that point straight at an image file (some catalogs only link the photo),
 *     downloaded with SSRF guards (https, public hosts only, image content, size cap).
 * Logos / icons are skipped: tiny images and images repeated on 3+ pages.
 */

export type ExtractedImage = { page: number; webp: Buffer; width: number; height: number; from: "embedded" | "link"; sourceUrl?: string };

const MIN_SIDE = 150;
const MAX_IMAGES = 60;
const MAX_LINK_BYTES = 10 * 1024 * 1024;

type PdfImage = { width: number; height: number; kind?: number; data?: Uint8Array | Uint8ClampedArray };

async function loadPdf(buf: Buffer) {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const doc = await pdfjs.getDocument({ data: new Uint8Array(buf), disableFontFace: true, useSystemFonts: false, verbosity: 0 }).promise;
  return { pdfjs, doc };
}

async function toWebp(img: PdfImage): Promise<Buffer | null> {
  if (!img.data || !img.width || !img.height) return null;
  const px = img.width * img.height;
  // pdf.js ImageKind: 1 = 1-bit grayscale (packed), 2 = RGB 24bpp, 3 = RGBA 32bpp
  let channels: 1 | 3 | 4 | null = null;
  if (img.kind === 2 && img.data.length >= px * 3) channels = 3;
  else if (img.kind === 3 && img.data.length >= px * 4) channels = 4;
  if (!channels) return null;
  return sharp(Buffer.from(img.data.buffer, img.data.byteOffset, px * channels), { raw: { width: img.width, height: img.height, channels } })
    .resize({ width: 2000, height: 2000, fit: "inside", withoutEnlargement: true })
    .webp({ quality: 85 })
    .toBuffer();
}

function isPrivateIp(ip: string): boolean {
  if (net.isIPv6(ip)) {
    const v = ip.toLowerCase();
    return v === "::1" || v.startsWith("fc") || v.startsWith("fd") || v.startsWith("fe80") || v.startsWith("::ffff:127.") || v.startsWith("::ffff:10.") || v.startsWith("::ffff:192.168.");
  }
  const [a, b] = ip.split(".").map(Number);
  return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127);
}

/** Download an image a PDF links to — https, public host, real image, size-capped, few redirects. */
async function safeFetchImage(raw: string): Promise<Buffer | null> {
  let url = raw;
  for (let hop = 0; hop < 3; hop++) {
    let u: URL;
    try {
      u = new URL(url);
    } catch {
      return null;
    }
    if (u.protocol !== "https:") return null;
    try {
      const addrs = await lookup(u.hostname, { all: true });
      if (!addrs.length || addrs.some((a) => isPrivateIp(a.address))) return null;
    } catch {
      return null;
    }
    const res = await fetch(u, { redirect: "manual", signal: AbortSignal.timeout(15000), headers: { "User-Agent": "Mozilla/5.0 OrbitCatalogImport" } }).catch(() => null);
    if (!res) return null;
    if (res.status >= 300 && res.status < 400 && res.headers.get("location")) {
      url = new URL(res.headers.get("location")!, u).toString();
      continue;
    }
    if (!res.ok || !(res.headers.get("content-type") ?? "").startsWith("image/")) return null;
    if (Number(res.headers.get("content-length") ?? 0) > MAX_LINK_BYTES) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    return buf.length <= MAX_LINK_BYTES ? buf : null;
  }
  return null;
}

const looksLikeImageUrl = (u: string) => /\.(jpe?g|png|webp|gif|avif)(\?|#|$)/i.test(u) || /\/cdn\/shop\/files\//i.test(u);

export async function extractCatalogImages(buf: Buffer): Promise<ExtractedImage[]> {
  const { pdfjs, doc } = await loadPdf(buf);
  const found: (ExtractedImage & { hash: string })[] = [];
  const pagesByHash = new Map<string, Set<number>>();
  const linkTargets: { page: number; url: string }[] = [];

  try {
    for (let n = 1; n <= Math.min(doc.numPages, 100); n++) {
      const page = await doc.getPage(n);
      const ops = await page.getOperatorList();
      const seenOnPage = new Set<string>();
      for (let i = 0; i < ops.fnArray.length && found.length < MAX_IMAGES * 2; i++) {
        if (ops.fnArray[i] !== pdfjs.OPS.paintImageXObject) continue;
        const id = String(ops.argsArray[i][0]);
        const store = id.startsWith("g_") ? page.commonObjs : page.objs;
        const img = await new Promise<PdfImage | null>((res) => {
          try {
            store.get(id, (v: unknown) => res(v as PdfImage));
          } catch {
            res(null);
          }
        });
        if (!img?.data || img.width < MIN_SIDE || img.height < MIN_SIDE) continue;
        const hash = createHash("sha1").update(img.data).digest("hex");
        pagesByHash.set(hash, (pagesByHash.get(hash) ?? new Set()).add(n));
        if (seenOnPage.has(hash) || found.some((f) => f.hash === hash)) continue;
        seenOnPage.add(hash);
        const webp = await toWebp(img).catch(() => null);
        if (webp) found.push({ page: n, webp, width: img.width, height: img.height, from: "embedded", hash });
      }
      for (const a of (await page.getAnnotations()) as { url?: string }[]) {
        if (a.url && looksLikeImageUrl(a.url) && !linkTargets.some((l) => l.url === a.url)) linkTargets.push({ page: n, url: a.url });
      }
      page.cleanup();
    }
  } finally {
    await doc.cleanup().catch(() => {});
  }

  // Same picture on 3+ pages = a logo / header decoration, not a product photo.
  const images: ExtractedImage[] = found.filter((f) => (pagesByHash.get(f.hash)?.size ?? 0) < 3).map(({ hash: _h, ...rest }) => rest);

  // Linked photos only for pages that had no embedded photo of their own.
  const pagesWithPhoto = new Set(images.map((i) => i.page));
  for (const l of linkTargets) {
    if (images.length >= MAX_IMAGES) break;
    if (pagesWithPhoto.has(l.page)) continue;
    const raw = await safeFetchImage(l.url);
    if (!raw) continue;
    try {
      const pipeline = sharp(raw).rotate();
      const meta = await pipeline.metadata();
      if ((meta.width ?? 0) < MIN_SIDE || (meta.height ?? 0) < MIN_SIDE) continue;
      const webp = await pipeline.resize({ width: 2000, height: 2000, fit: "inside", withoutEnlargement: true }).webp({ quality: 85 }).toBuffer();
      images.push({ page: l.page, webp, width: meta.width ?? 0, height: meta.height ?? 0, from: "link", sourceUrl: l.url });
      pagesWithPhoto.add(l.page);
    } catch {
      // not a readable image
    }
  }
  return images.slice(0, MAX_IMAGES).sort((a, b) => a.page - b.page);
}
