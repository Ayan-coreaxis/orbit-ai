import { mkdir, readFile, readdir, stat, unlink, writeFile } from "fs/promises";
import path from "path";
import { AwsClient } from "aws4fetch";
import { prisma } from "@/lib/prisma";

/**
 * Where uploaded files live. With Cloudflare R2 configured (Super Admin > Storage) new files go to
 * the R2 bucket and are served from its public URL; otherwise they're written to
 * public/uploads/ on this server (fine locally, not on a VPS). Keys are the same either way —
 * `uploads/<businessId>/…` — so moving local files to R2 is a straight copy + URL prefix swap.
 */

const PUBLIC_DIR = path.join(process.cwd(), "public");

export type R2Config = { accountId: string; accessKeyId: string; secretAccessKey: string; bucket: string; publicUrl: string };

export function r2Config(): R2Config | null {
  const c = {
    accountId: process.env.R2_ACCOUNT_ID?.trim() ?? "",
    accessKeyId: process.env.R2_ACCESS_KEY_ID?.trim() ?? "",
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY?.trim() ?? "",
    bucket: process.env.R2_BUCKET?.trim() ?? "",
    publicUrl: (process.env.R2_PUBLIC_URL?.trim() ?? "").replace(/\/+$/, ""),
  };
  return Object.values(c).every(Boolean) ? c : null;
}

export function storageMode(): "r2" | "local" {
  return r2Config() ? "r2" : "local";
}

function client(c: R2Config) {
  return new AwsClient({ accessKeyId: c.accessKeyId, secretAccessKey: c.secretAccessKey, service: "s3", region: "auto" });
}

const objectUrl = (c: R2Config, key: string) =>
  `https://${c.accountId}.r2.cloudflarestorage.com/${encodeURIComponent(c.bucket)}/${key.split("/").map(encodeURIComponent).join("/")}`;

/** Save a file under `key` (e.g. "uploads/<biz>/media/x.webp"); returns the URL pages should use. */
export async function putFile(key: string, body: Buffer, contentType: string): Promise<string> {
  const clean = key.replace(/^\/+/, "");
  const c = r2Config();
  if (c) {
    const res = await client(c).fetch(objectUrl(c, clean), {
      method: "PUT",
      body: new Uint8Array(body),
      headers: { "Content-Type": contentType, "Cache-Control": "public, max-age=31536000, immutable" },
    });
    if (!res.ok) throw new Error(`R2 upload failed (${res.status}): ${(await res.text()).slice(0, 200)}`);
    return `${c.publicUrl}/${clean}`;
  }
  if (serverlessHost()) {
    // Vercel / Lambda disks are read-only and wiped between requests — a file saved here would vanish.
    throw new Error("File storage isn't set up: this server can't keep files. Connect Cloudflare R2 in Super Admin > Storage.");
  }
  const full = path.join(PUBLIC_DIR, clean);
  await mkdir(path.dirname(full), { recursive: true });
  await writeFile(full, body);
  return `/${clean}`;
}

/** Running where local disk doesn't persist (so R2 is required for uploads). */
export function serverlessHost(): boolean {
  return !!(process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME || process.env.NETLIFY);
}

/**
 * A locally stored upload, for the /uploads/… route (Next only serves files that were in public/
 * at build time in production). Null if it doesn't exist or the path tries to leave uploads/.
 */
export async function readLocalUpload(parts: string[]): Promise<Buffer | null> {
  if (!parts.length || parts.some((p) => !p || p === "." || p === ".." || p.includes("\\") || p.includes("\0"))) return null;
  const root = path.join(PUBLIC_DIR, "uploads");
  const full = path.join(root, ...parts);
  if (!full.startsWith(root + path.sep)) return null;
  try {
    return await readFile(full);
  } catch {
    return null;
  }
}

/** Key of a stored file from its URL, whether local ("/uploads/…") or on R2 ("https://pub…/uploads/…"). */
function keyOf(url: string): { where: "local" | "r2"; key: string } | null {
  if (url.startsWith("/uploads/")) return { where: "local", key: url.slice(1) };
  const c = r2Config();
  if (c && url.startsWith(`${c.publicUrl}/`)) return { where: "r2", key: url.slice(c.publicUrl.length + 1) };
  return null;
}

export async function deleteFile(url: string): Promise<void> {
  const k = keyOf(url);
  if (!k) return;
  if (k.where === "local") {
    await unlink(path.join(PUBLIC_DIR, k.key)).catch(() => {});
    return;
  }
  const c = r2Config()!;
  await client(c).fetch(objectUrl(c, k.key), { method: "DELETE" }).catch(() => {});
}

/** File bytes (for sending to Claude). Works for local and R2 files. */
export async function readStoredFile(url: string): Promise<Buffer> {
  const k = keyOf(url);
  if (k?.where === "local") return readFile(path.join(PUBLIC_DIR, k.key));
  if (k?.where === "r2") {
    const c = r2Config()!;
    const res = await client(c).fetch(objectUrl(c, k.key));
    if (!res.ok) throw new Error(`R2 read failed (${res.status})`);
    return Buffer.from(await res.arrayBuffer());
  }
  const res = await fetch(url, { signal: AbortSignal.timeout(20000) });
  if (!res.ok) throw new Error(`fetch failed (${res.status})`);
  return Buffer.from(await res.arrayBuffer());
}

/** Upload a probe file, read it back through the PUBLIC url, delete it — every step reported. */
export async function testR2(): Promise<{ ok: boolean; steps: { step: string; ok: boolean; detail?: string }[] }> {
  const c = r2Config();
  const steps: { step: string; ok: boolean; detail?: string }[] = [];
  if (!c) return { ok: false, steps: [{ step: "Settings", ok: false, detail: "Fill in all five R2 fields first." }] };
  const key = `orbit-healthcheck/${Date.now()}.txt`;
  const body = `orbit ok ${new Date().toISOString()}`;
  try {
    const res = await client(c).fetch(objectUrl(c, key), { method: "PUT", body, headers: { "Content-Type": "text/plain" } });
    steps.push({ step: "Upload to bucket", ok: res.ok, detail: res.ok ? undefined : `${res.status} — check the Account ID, bucket name and that the token has Object Read & Write on this bucket. ${(await res.text()).slice(0, 160)}` });
    if (!res.ok) return { ok: false, steps };
  } catch (e) {
    steps.push({ step: "Upload to bucket", ok: false, detail: e instanceof Error ? e.message : String(e) });
    return { ok: false, steps };
  }
  try {
    const res = await fetch(`${c.publicUrl}/${key}`, { cache: "no-store", signal: AbortSignal.timeout(15000) });
    const text = res.ok ? await res.text() : "";
    const good = res.ok && text === body;
    steps.push({ step: "Open through the public URL", ok: good, detail: good ? undefined : `${res.status} — turn on public access for the bucket (r2.dev subdomain or a custom domain) and paste that exact URL.` });
  } catch (e) {
    steps.push({ step: "Open through the public URL", ok: false, detail: e instanceof Error ? e.message : String(e) });
  }
  const del = await client(c).fetch(objectUrl(c, key), { method: "DELETE" }).catch(() => null);
  steps.push({ step: "Delete test file", ok: !!del?.ok, detail: del?.ok ? undefined : "Couldn't delete the test file — the token may be read-only." });
  return { ok: steps.every((s) => s.ok), steps };
}

// ---------- Usage & cost ----------

/** Cloudflare R2 Standard pricing (Sep 2026): first 10 GB-month, 1M Class A and 10M Class B ops free; egress free. */
export const R2_PRICING = { freeGb: 10, perGbMonth: 0.015, classAPerMillion: 4.5, classBPerMillion: 0.36, freeClassA: 1_000_000, freeClassB: 10_000_000 };

async function dirSize(dir: string): Promise<{ bytes: number; files: number }> {
  let bytes = 0;
  let files = 0;
  let entries: import("fs").Dirent[] = [];
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return { bytes, files };
  }
  for (const e of entries) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) {
      const s = await dirSize(p);
      bytes += s.bytes;
      files += s.files;
    } else {
      bytes += (await stat(p)).size;
      files++;
    }
  }
  return { bytes, files };
}

export async function storageUsage() {
  const c = r2Config();
  const [byBiz, byKind, local, businesses, uploadsThisMonth] = await Promise.all([
    prisma.mediaAsset.groupBy({ by: ["businessId"], _sum: { size: true }, _count: { _all: true } }),
    prisma.mediaAsset.groupBy({ by: ["kind"], _sum: { size: true }, _count: { _all: true } }),
    dirSize(path.join(PUBLIC_DIR, "uploads")),
    prisma.business.findMany({ select: { id: true, name: true } }),
    prisma.mediaAsset.count({ where: { createdAt: { gte: new Date(new Date().getFullYear(), new Date().getMonth(), 1) } } }),
  ]);
  const onR2 = c ? await prisma.mediaAsset.aggregate({ where: { url: { startsWith: c.publicUrl } }, _sum: { size: true }, _count: { _all: true } }) : null;
  const name = new Map(businesses.map((b) => [b.id, b.name]));
  const totalBytes = Math.max(local.bytes, byBiz.reduce((a, b) => a + (b._sum.size ?? 0), 0));
  const gb = totalBytes / 1024 ** 3;
  const storageCost = Math.max(0, gb - R2_PRICING.freeGb) * R2_PRICING.perGbMonth;
  return {
    mode: c ? ("r2" as const) : ("local" as const),
    publicUrl: c?.publicUrl ?? null,
    bucket: c?.bucket ?? null,
    local,
    onR2: onR2 ? { bytes: onR2._sum.size ?? 0, files: onR2._count._all } : null,
    totalBytes,
    uploadsThisMonth,
    estMonthlyUsd: Number(storageCost.toFixed(2)),
    byKind: byKind.map((k) => ({ kind: k.kind, bytes: k._sum.size ?? 0, files: k._count._all })),
    byBusiness: byBiz
      .map((b) => ({ businessId: b.businessId, name: name.get(b.businessId) ?? b.businessId, bytes: b._sum.size ?? 0, files: b._count._all }))
      .sort((a, b) => b.bytes - a.bytes),
  };
}

// ---------- Move local files to R2 ----------

async function listFiles(dir: string, base = ""): Promise<string[]> {
  let entries: import("fs").Dirent[] = [];
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return [];
  }
  const out: string[] = [];
  for (const e of entries) {
    const rel = base ? `${base}/${e.name}` : e.name;
    if (e.isDirectory()) out.push(...(await listFiles(path.join(dir, e.name), rel)));
    else out.push(rel);
  }
  return out;
}

const MIME: Record<string, string> = {
  webp: "image/webp", png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", gif: "image/gif", avif: "image/avif", svg: "image/svg+xml",
  mp4: "video/mp4", webm: "video/webm", mov: "video/quicktime", m4v: "video/x-m4v",
  mp3: "audio/mpeg", m4a: "audio/mp4", ogg: "audio/ogg", wav: "audio/wav", aac: "audio/aac", pdf: "application/pdf",
};

/**
 * Copy every file in public/uploads to R2 (same keys) and point the database at the R2 copies.
 * Local files are kept as a backup. Safe to run again — already-moved URLs aren't touched twice.
 */
export async function migrateLocalToR2(): Promise<{ copied: number; failed: string[]; rowsUpdated: number }> {
  const c = r2Config();
  if (!c) throw new Error("R2 isn't configured yet.");
  const files = await listFiles(path.join(PUBLIC_DIR, "uploads"));
  const failed: string[] = [];
  let copied = 0;
  for (const rel of files) {
    const key = `uploads/${rel}`;
    try {
      const buf = await readFile(path.join(PUBLIC_DIR, key));
      await putFile(key, buf, MIME[rel.split(".").pop()?.toLowerCase() ?? ""] ?? "application/octet-stream");
      copied++;
    } catch (e) {
      failed.push(`${rel}: ${e instanceof Error ? e.message : String(e)}`.slice(0, 200));
    }
  }
  if (failed.length) return { copied, failed, rowsUpdated: 0 };

  // Point stored URLs at R2. Plain columns start with "/uploads/"; JSON / HTML columns contain it after a quote or "(".
  const pub = c.publicUrl.replace(/'/g, "''");
  const plain: [string, string][] = [["MediaAsset", "url"], ["Product", "imageUrl"], ["ProductVariant", "imageUrl"], ["Bundle", "imageUrl"]];
  const embedded: [string, string][] = [["MediaAsset", "frames"], ["Product", "galleryUrls"], ["Product", "description"], ["StoreDesign", "doc"], ["StoreDesign", "wired"]];
  let rowsUpdated = 0;
  for (const [t, col] of plain) {
    rowsUpdated += await prisma.$executeRawUnsafe(`UPDATE "${t}" SET "${col}" = '${pub}' || "${col}" WHERE "${col}" LIKE '/uploads/%'`);
  }
  for (const [t, col] of embedded) {
    rowsUpdated += await prisma.$executeRawUnsafe(
      `UPDATE "${t}" SET "${col}" = REPLACE(REPLACE(REPLACE("${col}", '"/uploads/', '"${pub}/uploads/'), '(/uploads/', '(${pub}/uploads/'), '''/uploads/', '''${pub}/uploads/') WHERE "${col}" LIKE '%/uploads/%'`,
    );
  }
  return { copied, failed, rowsUpdated };
}
