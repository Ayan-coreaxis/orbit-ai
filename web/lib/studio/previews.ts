/**
 * Example media for the Content page (Orbit Studio): every format card shows a real photo or clip
 * of the kind of thing it makes, so a seller sees the quality before they start.
 * Photos: Unsplash (free licence), saved in public/studio/<format id>.jpg.
 * Reel clips: Mixkit free stock video (free licence), streamed from their CDN; the poster frame is
 * saved locally so the card looks right before the clip loads.
 */
const CLIPS: Record<string, number> = {
  "product-reel": 20766,
  "animate-photo": 39877,
  unboxing: 42122,
  "ugc-review": 12843,
  tutorial: 370,
  "talking-avatar": 14855,
  "try-on-video": 41663,
  "cgi-showcase": 44070,
  cinematic: 44542,
  "tv-spot": 21694,
};

export function previewImage(formatId: string): string {
  return `/studio/${formatId}.jpg`;
}

/** A short example clip for a reel format (null for image formats). */
export function previewVideo(formatId: string, size: 360 | 720 = 720): string | null {
  const id = CLIPS[formatId];
  return id ? `https://assets.mixkit.co/videos/${id}/${id}-${size}.mp4` : null;
}

/** Plays in the free demo result when a format has no clip of its own. */
export const DEMO_VIDEO = previewVideo("product-reel")!;
