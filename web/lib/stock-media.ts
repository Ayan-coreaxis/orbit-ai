/**
 * Dummy media for the design phase. The designer describes what a photo or video should show
 * (data-img-query / data-video-query) instead of guessing URLs from memory — guessed Unsplash ids
 * come back as the wrong subject (onions on a honey store). Here each description is searched on a
 * real stock library and swapped for a real, matching file.
 *
 *   PEXELS_API_KEY set (free at pexels.com/api) → Pexels photos AND videos (best quality).
 *   otherwise                                   → Openverse photos (no key; Creative Commons),
 *                                                  videos stay as a labelled slot the seller fills.
 */

type Found = { url: string; poster?: string };

async function pexelsPhoto(q: string, key: string, n: number): Promise<Found | null> {
  const r = await fetch(`https://api.pexels.com/v1/search?query=${encodeURIComponent(q)}&per_page=8&orientation=portrait`, {
    headers: { Authorization: key },
    signal: AbortSignal.timeout(8000),
  }).catch(() => null);
  if (!r?.ok) return null;
  const j = (await r.json().catch(() => null)) as { photos?: { src?: { large2x?: string; large?: string } }[] } | null;
  const list = j?.photos ?? [];
  const p = list[n % Math.max(1, list.length)];
  const url = p?.src?.large2x || p?.src?.large;
  return url ? { url } : null;
}

async function pexelsVideo(q: string, key: string, n: number): Promise<Found | null> {
  const r = await fetch(`https://api.pexels.com/videos/search?query=${encodeURIComponent(q)}&per_page=6`, {
    headers: { Authorization: key },
    signal: AbortSignal.timeout(8000),
  }).catch(() => null);
  if (!r?.ok) return null;
  const j = (await r.json().catch(() => null)) as {
    videos?: { image?: string; video_files?: { link: string; width?: number; file_type?: string }[] }[];
  } | null;
  const list = j?.videos ?? [];
  const v = list[n % Math.max(1, list.length)];
  // a ~1280px mp4 is plenty for a hero and keeps the page light
  const files = (v?.video_files ?? []).filter((f) => f.file_type === "video/mp4").sort((a, b) => Math.abs((a.width ?? 0) - 1280) - Math.abs((b.width ?? 0) - 1280));
  return files[0] ? { url: files[0].link, poster: v?.image } : null;
}

/** Professional stock first (StockSnap, Rawpixel, Nappy), then the whole Openverse index. */
const PRO_SOURCES = "stocksnap,rawpixel,nappy";

async function openverseSearch(q: string, sources?: string): Promise<string[]> {
  const r = await fetch(
    `https://api.openverse.org/v1/images/?q=${encodeURIComponent(q)}&page_size=12&license_type=commercial&mature=false${sources ? `&source=${sources}` : ""}`,
    { signal: AbortSignal.timeout(8000), headers: { "User-Agent": "OrbitStoreBuilder/1.0" } },
  ).catch(() => null);
  if (!r?.ok) return [];
  const j = (await r.json().catch(() => null)) as { results?: { url?: string; width?: number }[] } | null;
  return (j?.results ?? []).filter((x) => x.url && /^https:/.test(x.url) && (x.width ?? 1000) >= 700).map((x) => x.url!);
}

async function openversePhoto(q: string, n: number): Promise<Found | null> {
  let list = await openverseSearch(q, PRO_SOURCES);
  // a long, specific description often finds nothing — retry with its first few words
  if (list.length < 2) list = await openverseSearch(q.split(/[,;]/)[0].split(/\s+/).slice(0, 3).join(" "), PRO_SOURCES);
  if (list.length < 2) list = [...list, ...(await openverseSearch(q))];
  const url = list[n % Math.max(1, list.length)];
  return url ? { url } : null;
}

const attr = (s: string) => s.replace(/&/g, "&amp;").replace(/"/g, "&quot;");

/**
 * Resolve every data-img-query / data-video-query in the given HTML strings. Returns the strings
 * with real src attributes filled in. Queries that find nothing fall back to a seeded stand-in
 * photo, or (videos) a labelled data-video-slot the seller fills later.
 */
export async function resolveStockMedia(texts: string[]): Promise<string[]> {
  const key = process.env.PEXELS_API_KEY?.trim();
  const imgQ = new Map<string, number>();
  const vidQ = new Map<string, number>();
  for (const t of texts) {
    for (const m of t.matchAll(/data-img-query="([^"]{2,120})"/g)) imgQ.set(m[1], (imgQ.get(m[1]) ?? 0) + 1);
    for (const m of t.matchAll(/data-video-query="([^"]{2,120})"/g)) vidQ.set(m[1], (vidQ.get(m[1]) ?? 0) + 1);
  }
  // Same description used several times → different results for each use.
  const imgs = new Map<string, Found[]>();
  const vids = new Map<string, Found[]>();
  await Promise.all([
    ...[...imgQ].slice(0, 40).map(async ([q, count]) => {
      const found: Found[] = [];
      for (let i = 0; i < Math.min(count, 6); i++) {
        const f = (key ? await pexelsPhoto(q, key, i) : null) ?? (await openversePhoto(q, i));
        if (f) found.push(f);
      }
      imgs.set(q, found);
    }),
    ...[...vidQ].slice(0, 6).map(async ([q, count]) => {
      const found: Found[] = [];
      if (key) for (let i = 0; i < Math.min(count, 4); i++) {
        const f = await pexelsVideo(q, key, i);
        if (f) found.push(f);
      }
      vids.set(q, found);
    }),
  ]);

  const used = new Map<string, number>();
  let seed = 0;
  const next = (map: Map<string, Found[]>, q: string): Found | undefined => {
    const list = map.get(q) ?? [];
    const i = used.get(q) ?? 0;
    used.set(q, i + 1);
    return list.length ? list[i % list.length] : undefined;
  };

  return texts.map((t) =>
    t
      // <img ... data-img-query="..."> → real src (any existing src is replaced)
      .replace(/<img\b([^>]*?)data-img-query="([^"]+)"([^>]*)>/gi, (_m, a: string, q: string, b: string) => {
        const f = next(imgs, q);
        const src = f?.url ?? `https://picsum.photos/seed/orbit${++seed}/900/1100`;
        const rest = `${a}${b}`.replace(/\ssrc="[^"]*"/i, "");
        return `<img${rest} src="${attr(src)}" data-img-query="${q}">`;
      })
      // <video data-video-query="..."> → real mp4, or a labelled slot when no library/key
      .replace(/<video\b([^>]*?)data-video-query="([^"]+)"([^>]*)>([\s\S]*?)<\/video>/gi, (_m, a: string, q: string, b: string) => {
        const f = next(vids, q);
        const rest = `${a}${b}`.replace(/\s(src|poster)="[^"]*"/gi, "");
        return f
          ? `<video${rest} data-video-query="${q}" src="${attr(f.url)}"${f.poster ? ` poster="${attr(f.poster)}"` : ""} autoplay muted loop playsinline></video>`
          : `<div data-video-slot="${q}"${rest.replace(/\s(autoplay|muted|loop|playsinline|controls)(="[^"]*")?/gi, "").trimEnd()}></div>`;
      }),
  );
}
