/**
 * Dummy media for the Content page (Orbit Studio): every format card shows what it makes.
 * Artwork is drawn by scripts/gen-studio-previews.mjs (one style, the dashboard palette):
 * public/studio/<format id>.svg. Re-run the script after editing it.
 * Reel cards play this CC0 clip from MDN on hover; the demo result uses it too.
 */
export const DEMO_VIDEO = "https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4";

export function previewImage(formatId: string): string {
  return `/studio/${formatId}.svg`;
}
