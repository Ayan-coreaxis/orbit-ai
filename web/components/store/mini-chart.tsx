"use client";

/**
 * Dependency-free, theme-aware SVG charts for the store dashboard. `Sparkline` is the tiny
 * trend line inside a KPI tile; `AreaChart` is the revenue panel with a gradient fill,
 * a baseline, and hover tooltips.
 */

export function Sparkline({ values, className = "" }: { values: number[]; className?: string }) {
  const w = 96;
  const h = 28;
  const pts = normalize(values, w, h, 2);
  if (pts.length < 2) return <div className={className} style={{ width: w, height: h }} />;
  const d = `M ${pts.map((p) => `${p.x},${p.y}`).join(" L ")}`;
  const up = values[values.length - 1] >= values[0];
  return (
    <svg viewBox={`0 0 ${w} ${h}`} width={w} height={h} className={className} aria-hidden preserveAspectRatio="none">
      <path d={d} fill="none" stroke={up ? "var(--color-good)" : "var(--color-bad)"} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function AreaChart({
  points,
  format,
  height = 108,
}: {
  points: { label: string; value: number; sub?: string }[];
  format: (n: number) => string;
  height?: number;
}) {
  const w = 640;
  const h = height;
  const pad = { t: 8, r: 4, b: 4, l: 4 };
  const inner = { w: w - pad.l - pad.r, h: h - pad.t - pad.b };
  const max = Math.max(1, ...points.map((p) => p.value));
  const n = points.length;
  const x = (i: number) => pad.l + (n <= 1 ? inner.w / 2 : (i / (n - 1)) * inner.w);
  const y = (v: number) => pad.t + inner.h - (v / max) * inner.h;

  const line = points.map((p, i) => `${x(i)},${y(p.value)}`).join(" L ");
  const area = `M ${x(0)},${pad.t + inner.h} L ${line} L ${x(n - 1)},${pad.t + inner.h} Z`;
  const peak = points.reduce((a, b) => (b.value > a.value ? b : a), points[0]);

  return (
    <div className="relative">
      <svg viewBox={`0 0 ${w} ${h}`} width="100%" height={h} preserveAspectRatio="none" className="overflow-visible">
        <defs>
          <linearGradient id="od-area" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--color-accent-strong)" stopOpacity={0.28} />
            <stop offset="100%" stopColor="var(--color-accent-strong)" stopOpacity={0} />
          </linearGradient>
        </defs>
        {/* baseline */}
        <line x1={pad.l} y1={pad.t + inner.h} x2={w - pad.r} y2={pad.t + inner.h} stroke="var(--color-border)" strokeWidth={1} />
        <path d={area} fill="url(#od-area)" />
        <path d={`M ${line}`} fill="none" stroke="var(--color-accent-strong)" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" />
        {/* hover targets */}
        {points.map((p, i) => (
          <rect key={i} x={x(i) - inner.w / n / 2} y={0} width={inner.w / n} height={h} fill="transparent">
            <title>{`${p.label} · ${format(p.value)}${p.sub ? ` · ${p.sub}` : ""}`}</title>
          </rect>
        ))}
        {peak.value > 0 && <circle cx={x(points.indexOf(peak))} cy={y(peak.value)} r={2.5} fill="var(--color-accent-strong)" />}
      </svg>
      <div className="mt-1 flex justify-between text-[10.5px] tabular-nums text-text-faint">
        <span>{points[0]?.label}</span>
        <span>peak {format(peak.value)}</span>
        <span>{points[n - 1]?.label}</span>
      </div>
    </div>
  );
}

function normalize(values: number[], w: number, h: number, pad: number) {
  if (!values.length) return [];
  const max = Math.max(...values);
  const min = Math.min(...values);
  const span = max - min || 1;
  return values.map((v, i) => ({
    x: values.length <= 1 ? w / 2 : (i / (values.length - 1)) * w,
    y: pad + (h - pad * 2) * (1 - (v - min) / span),
  }));
}
