/**
 * LLM-free helpers for the direct-editing surfaces (Section editor, Store Control page):
 * pull out the visible text runs and image slots of a section's authored HTML, and write edits
 * back into the same string. No DOM required — pure string ops so they run server- or client-side.
 */

const RUN_RE = />([^<>]+)</g;

export interface TextRun {
  index: number; // ordinal among visible runs — stable across edits
  text: string; // decoded, human-readable
}

/** Visible text nodes: `>…<` chunks with non-whitespace content. */
export function splitTextRuns(html: string): TextRun[] {
  const runs: TextRun[] = [];
  let m: RegExpExecArray | null;
  let ordinal = 0;
  RUN_RE.lastIndex = 0;
  while ((m = RUN_RE.exec(html))) {
    if (!m[1].trim()) continue;
    runs.push({ index: ordinal++, text: decode(m[1].trim()) });
  }
  return runs;
}

/** Replace the Nth visible text run (by ordinal), keeping its surrounding whitespace. */
export function replaceRun(html: string, index: number, next: string): string {
  let ordinal = 0;
  RUN_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = RUN_RE.exec(html))) {
    const raw = m[1];
    if (!raw.trim()) continue;
    if (ordinal === index) {
      const lead = raw.match(/^\s*/)?.[0] ?? "";
      const trail = raw.match(/\s*$/)?.[0] ?? "";
      const start = m.index + 1;
      return html.slice(0, start) + lead + encode(next) + trail + html.slice(start + raw.length);
    }
    ordinal++;
  }
  return html;
}

export interface ImgSlot {
  index: number; // ordinal among <div data-img-slot> in the section
  brief: string; // the art-direction brief the model wrote
  src: string; // current data-img-src, or ""
}

const IMG_RE = /<div\s+data-img-slot="([^"]*)"([^>]*)>\s*<\/div>/gi;

/** Every image placeholder in the section, with its current source (if the seller set one). */
export function scanImages(html: string): ImgSlot[] {
  const out: ImgSlot[] = [];
  let m: RegExpExecArray | null;
  let i = 0;
  IMG_RE.lastIndex = 0;
  while ((m = IMG_RE.exec(html))) {
    const src = /data-(?:od-)?img-src="([^"]+)"/i.exec(m[2])?.[1] ?? "";
    out.push({ index: i++, brief: decode(m[1]), src });
  }
  return out;
}

/** Set (or clear) the Nth image slot's src. */
export function setImageSrc(html: string, index: number, url: string): string {
  let i = 0;
  IMG_RE.lastIndex = 0;
  return html.replace(IMG_RE, (full, brief: string, attrs: string) => {
    if (i++ !== index) return full;
    const cleaned = attrs.replace(/\s*data-(?:od-)?img-src="[^"]*"/gi, "");
    return url.trim()
      ? `<div data-img-slot="${brief}"${cleaned} data-img-src="${escapeAttr(url.trim())}"></div>`
      : `<div data-img-slot="${brief}"${cleaned}></div>`;
  });
}

export function decode(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&nbsp;/g, " ");
}
function encode(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
function escapeAttr(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
}
