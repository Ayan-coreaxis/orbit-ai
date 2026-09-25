import { BRAND_GLYPHS } from "@/lib/connector-brand-glyphs";

/**
 * A connector's brand mark. Real Simple Icons glyph when we have one (rendered in the brand
 * colour on a neutral tile, or in near-white when the brand colour is too dark to read on the
 * dark UI), otherwise a tinted monogram tile. Always decorative — it sits next to the connector
 * name — so it's hidden from assistive tech.
 */

function isDark(hex: string): boolean {
  const h = hex.replace("#", "");
  const r = parseInt(h.slice(0, 2), 16) / 255;
  const g = parseInt(h.slice(2, 4), 16) / 255;
  const b = parseInt(h.slice(4, 6), 16) / 255;
  const lin = (c: number) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b) < 0.16;
}

export function ConnectorIcon({
  si,
  mono,
  color,
  size = 22,
}: {
  si?: string;
  mono: string;
  color: string;
  size?: number;
}) {
  const tile = Math.round(size * 1.55);
  const glyph = si ? BRAND_GLYPHS[si] : undefined;

  if (glyph) {
    return (
      <span
        aria-hidden
        className="inline-flex shrink-0 items-center justify-center rounded-[22%] border border-border bg-panel-2"
        style={{ width: tile, height: tile }}
      >
        <svg
          width={size}
          height={size}
          viewBox="0 0 24 24"
          fill={isDark(glyph.hex) ? "var(--icon-on-dark, #e8e8e8)" : glyph.hex}
        >
          <path d={glyph.p} />
        </svg>
      </span>
    );
  }

  return (
    <span
      aria-hidden
      className="inline-flex shrink-0 items-center justify-center rounded-[22%] font-semibold text-white"
      style={{ width: tile, height: tile, background: color, fontSize: tile * 0.4 }}
    >
      {mono}
    </span>
  );
}
