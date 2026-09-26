import { randomUUID } from "crypto";
import sharp from "sharp";
import { prisma } from "@/lib/prisma";
import { GRAPH_BASE, GRAPH_VIDEO_BASE } from "@/lib/meta-oauth";
import { putFile, readStoredFile } from "@/lib/storage";
import { NOT_PUBLIC_REASON, publicFileUrl } from "@/lib/public-url";

/**
 * Real posts to the seller's connected Facebook Page and Instagram professional account.
 *  - Facebook: text, photo or video — the file is uploaded straight to Meta, so it works from any server.
 *  - Instagram: photo (must be a JPEG) or Reel — Instagram fetches the file from a PUBLIC https link,
 *    so it needs R2 or a public Orbit domain; Reels are processed by Meta before they can be published.
 * Every attempt is a SocialPost row, so the seller sees exactly what went out and what failed.
 */

export interface GraphResult {
  ok: boolean;
  id?: string;
  error?: string;
}

type Fetch = typeof fetch;

async function call<T>(url: string, init: RequestInit, f: Fetch): Promise<T> {
  let res: Response;
  try {
    res = await f(url, { ...init, signal: AbortSignal.timeout(180000) });
  } catch {
    throw new Error("Couldn't reach Meta — try again.");
  }
  const data = (await res.json().catch(() => ({}))) as T & { error?: { message?: string; code?: number; error_user_msg?: string } };
  if (!res.ok || data.error) {
    const e = data.error;
    if (e?.code === 190) throw new Error("Your Meta connection expired — reconnect Facebook/Instagram in Settings.");
    throw new Error(e?.error_user_msg || e?.message || `Meta error ${res.status}`);
  }
  return data;
}

const json = (body: Record<string, unknown>): RequestInit => ({ method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

/** Real text post to a real connected Facebook Page. */
export async function publishFacebookPost(pageId: string, pageAccessToken: string, message: string, f: Fetch = fetch): Promise<GraphResult> {
  try {
    const d = await call<{ id: string }>(`${GRAPH_BASE}/${pageId}/feed`, json({ message, access_token: pageAccessToken }), f);
    return { ok: true, id: d.id };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Unknown error posting to Facebook" };
  }
}

async function facebookPhoto(pageId: string, token: string, data: Buffer, caption: string, f: Fetch) {
  const jpeg = await sharp(data).rotate().flatten({ background: "#ffffff" }).jpeg({ quality: 92 }).toBuffer();
  const fd = new FormData();
  fd.set("source", new Blob([new Uint8Array(jpeg)], { type: "image/jpeg" }), "photo.jpg");
  fd.set("caption", caption);
  fd.set("access_token", token);
  const d = await call<{ id: string; post_id?: string }>(`${GRAPH_BASE}/${pageId}/photos`, { method: "POST", body: fd }, f);
  return d.post_id ?? d.id;
}

async function facebookVideo(pageId: string, token: string, data: Buffer, caption: string, f: Fetch) {
  const fd = new FormData();
  fd.set("source", new Blob([new Uint8Array(data)], { type: "video/mp4" }), "video.mp4");
  fd.set("description", caption);
  fd.set("access_token", token);
  const d = await call<{ id: string }>(`${GRAPH_VIDEO_BASE}/${pageId}/videos`, { method: "POST", body: fd }, f);
  return d.id;
}

async function permalink(id: string, token: string, field: "permalink_url" | "permalink", f: Fetch): Promise<string | null> {
  try {
    const d = await call<Record<string, string>>(`${GRAPH_BASE}/${id}?fields=${field}&access_token=${encodeURIComponent(token)}`, { method: "GET" }, f);
    const link = d[field];
    return link ? (link.startsWith("http") ? link : `https://www.facebook.com${link}`) : null;
  } catch {
    return null;
  }
}

/** Instagram needs a JPEG it can download — keep a public JPEG copy next to the original. */
async function instagramImageUrl(businessId: string, url: string): Promise<string> {
  const jpeg = await sharp(await readStoredFile(url)).rotate().resize({ width: 1440, height: 1800, fit: "inside", withoutEnlargement: true }).flatten({ background: "#ffffff" }).jpeg({ quality: 92 }).toBuffer();
  const stored = await putFile(`uploads/${businessId}/social/${randomUUID()}.jpg`, jpeg, "image/jpeg");
  const pub = publicFileUrl(stored);
  if (!pub) throw new Error(NOT_PUBLIC_REASON);
  return pub;
}

async function instagramPublish(igId: string, token: string, container: Record<string, unknown>, isVideo: boolean, f: Fetch) {
  const c = await call<{ id: string }>(`${GRAPH_BASE}/${igId}/media`, json({ ...container, access_token: token }), f);
  // Instagram processes the file first; a Reel can take a few minutes.
  for (let i = 0; i < (isVideo ? 60 : 15); i++) {
    const s = await call<{ status_code?: string; status?: string }>(`${GRAPH_BASE}/${c.id}?fields=status_code,status&access_token=${encodeURIComponent(token)}`, { method: "GET" }, f);
    if (s.status_code === "FINISHED") break;
    if (s.status_code === "ERROR" || s.status_code === "EXPIRED") throw new Error(`Instagram couldn't process this ${isVideo ? "video" : "photo"}${s.status ? ` (${s.status})` : ""}.`);
    if (i === (isVideo ? 59 : 14)) throw new Error("Instagram is still processing it — try again in a few minutes.");
    await new Promise((r) => setTimeout(r, Number(process.env.META_POLL_MS ?? 5000)));
  }
  const p = await call<{ id: string }>(`${GRAPH_BASE}/${igId}/media_publish`, json({ creation_id: c.id, access_token: token }), f);
  return p.id;
}

export type Platform = "facebook" | "instagram";

/** Which platforms can take a post right now, and why not. */
export async function socialReadiness(businessId: string) {
  const b = await prisma.business.findUnique({ where: { id: businessId }, select: { metaPageId: true, metaPageName: true, metaAccessToken: true, metaInstagramUserId: true } });
  const fb = b?.metaPageId && b.metaAccessToken ? null : "Connect your Facebook Page in Settings.";
  const ig = !b?.metaInstagramUserId
    ? "No Instagram professional account is linked to your Facebook Page — link it in the Instagram app (Settings > Account type > Professional, then link the Page), then reconnect."
    : null;
  return { facebook: fb, instagram: ig, instagramNeedsPublicFiles: publicFileUrl("/x") === null, pageName: b?.metaPageName ?? null };
}

/**
 * Post one piece to the chosen platforms. Creates a SocialPost per platform right away (status
 * "posting") and returns them; `run()` does the actual publishing (call it in the background).
 */
export async function queueSocialPost(
  businessId: string,
  opts: { mediaId?: string | null; caption: string; platforms: Platform[]; source?: "owner" | "orchestrator" | "content-agent" },
) {
  const caption = opts.caption.trim().slice(0, 2200);
  const media = opts.mediaId ? await prisma.mediaAsset.findFirst({ where: { id: opts.mediaId, businessId } }) : null;
  if (opts.mediaId && !media) throw new Error("That file isn't in your media library any more.");
  if (media && media.kind !== "image" && media.kind !== "video") throw new Error("Only photos and videos can be posted.");
  if (!media && !caption) throw new Error("Write something to post.");
  const kind = media?.kind === "video" ? "video" : media ? "image" : "text";
  const ready = await socialReadiness(businessId);
  const platforms = [...new Set(opts.platforms)].filter((p) => p === "facebook" || p === "instagram");
  if (!platforms.length) throw new Error("Pick Facebook or Instagram.");
  for (const p of platforms) {
    if (ready[p]) throw new Error(ready[p]!);
    if (p === "instagram" && kind === "text") throw new Error("Instagram needs a photo or video — text-only posts aren't possible there.");
  }
  const rows = await Promise.all(
    platforms.map((platform) => prisma.socialPost.create({ data: { businessId, platform, kind, mediaId: media?.id ?? null, caption, source: opts.source ?? "owner" } })),
  );
  return { rows, run: () => runSocialPosts(businessId, rows.map((r) => r.id)) };
}

export async function runSocialPosts(businessId: string, ids: string[], f: Fetch = fetch): Promise<void> {
  const b = await prisma.business.findUnique({ where: { id: businessId }, select: { metaPageId: true, metaAccessToken: true, metaInstagramUserId: true } });
  for (const id of ids) {
    const post = await prisma.socialPost.findFirst({ where: { id, businessId, status: "posting" } });
    if (!post) continue;
    try {
      if (!b?.metaPageId || !b.metaAccessToken) throw new Error("Facebook isn't connected any more.");
      const token = b.metaAccessToken;
      const media = post.mediaId ? await prisma.mediaAsset.findFirst({ where: { id: post.mediaId, businessId } }) : null;
      let externalId: string;
      let link: string | null = null;
      if (post.platform === "facebook") {
        if (!media) {
          const r = await publishFacebookPost(b.metaPageId, token, post.caption, f);
          if (!r.ok || !r.id) throw new Error(r.error ?? "Facebook didn't accept the post.");
          externalId = r.id;
        } else {
          const file = await readStoredFile(media.url);
          externalId = media.kind === "video" ? await facebookVideo(b.metaPageId, token, file, post.caption, f) : await facebookPhoto(b.metaPageId, token, file, post.caption, f);
        }
        link = await permalink(externalId, token, "permalink_url", f);
      } else {
        if (!b.metaInstagramUserId) throw new Error("Instagram isn't linked any more.");
        if (!media) throw new Error("Instagram needs a photo or video.");
        const container =
          media.kind === "video"
            ? { media_type: "REELS", video_url: publicFileUrl(media.url) ?? "", caption: post.caption, share_to_feed: true }
            : { image_url: await instagramImageUrl(businessId, media.url), caption: post.caption };
        if (media.kind === "video" && !container.video_url) throw new Error(NOT_PUBLIC_REASON);
        externalId = await instagramPublish(b.metaInstagramUserId, token, container, media.kind === "video", f);
        link = await permalink(externalId, token, "permalink", f);
      }
      await prisma.socialPost.update({ where: { id: post.id }, data: { status: "posted", externalId, permalink: link, error: null } });
    } catch (e) {
      await prisma.socialPost.update({ where: { id: post.id }, data: { status: "failed", error: (e instanceof Error ? e.message : "Unknown error").slice(0, 400) } });
    }
  }
}
