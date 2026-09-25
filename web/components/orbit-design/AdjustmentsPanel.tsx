"use client";

import { X } from "lucide-react";
import { FONT_PAIRS, type DesignTokens } from "@/lib/orbit-design";

/**
 * The "adjustment knobs" — retune the whole storefront live without asking the model.
 * Every change updates local token state immediately (instant preview) and is persisted
 * on a debounce by the parent.
 */
export function AdjustmentsPanel({
  tokens,
  onChange,
  onClose,
}: {
  tokens: DesignTokens;
  onChange: (patch: Partial<DesignTokens>) => void;
  onClose: () => void;
}) {
  const currentPair =
    FONT_PAIRS.find((p) => p.heading === tokens.fontHeading && p.body === tokens.fontBody)?.id ?? "";

  return (
    <div className="flex h-full w-[300px] shrink-0 flex-col border-l border-border bg-panel">
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <div className="text-[13px] font-semibold uppercase tracking-[0.04em] text-text-dim">Adjustments</div>
        <button onClick={onClose} className="text-text-faint hover:text-text" aria-label="Close adjustments">
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="flex-1 space-y-5 overflow-y-auto p-4">
        <Group title="Colors">
          <ColorRow label="Accent / buttons" value={tokens.accent} onChange={(v) => onChange({ accent: v })} />
          <ColorRow label="Button text" value={tokens.accentText} onChange={(v) => onChange({ accentText: v })} />
          <ColorRow label="Page background" value={tokens.bg} onChange={(v) => onChange({ bg: v })} />
          <ColorRow label="Surfaces" value={tokens.surface} onChange={(v) => onChange({ surface: v })} />
          <ColorRow label="Text" value={tokens.text} onChange={(v) => onChange({ text: v })} />
          <ColorRow label="Muted text" value={tokens.muted} onChange={(v) => onChange({ muted: v })} />
          <ColorRow label="Borders" value={tokens.border} onChange={(v) => onChange({ border: v })} />
        </Group>

        {!!tokens.palette?.length && (
          <Group title="Brand palette">
            {tokens.palette.map((p, i) => (
              <ColorRow
                key={p.name}
                label={p.name}
                value={p.value}
                onChange={(v) => {
                  const next = (tokens.palette ?? []).map((x, j) => (j === i ? { ...x, value: v } : x));
                  onChange({ palette: next });
                }}
              />
            ))}
            <p className="text-[11px] text-text-faint">Used as <code>var(--od-{tokens.palette[0].name})</code> across the sections.</p>
          </Group>
        )}

        <Group title="Shape & spacing">
          <SliderRow label="Corner radius" value={tokens.radius} min={0} max={28} step={1} suffix="px" onChange={(v) => onChange({ radius: v })} />
          <SliderRow label="Spacing" value={tokens.density} min={0.8} max={1.5} step={0.05} onChange={(v) => onChange({ density: v })} />
          <SliderRow label="Heading weight" value={tokens.headingWeight} min={500} max={800} step={100} onChange={(v) => onChange({ headingWeight: v })} />
        </Group>

        <Group title="Typography">
          <select
            value={currentPair}
            onChange={(e) => {
              const p = FONT_PAIRS.find((x) => x.id === e.target.value);
              if (p) onChange({ fontHeading: p.heading, fontBody: p.body, googleFonts: p.families });
            }}
            className="w-full rounded-lg border border-border bg-panel-2 px-2.5 py-2 text-[13px] outline-none focus:border-accent/50"
          >
            <option value="" disabled>
              Choose a font pairing…
            </option>
            {FONT_PAIRS.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label}
              </option>
            ))}
          </select>
        </Group>
      </div>
    </div>
  );
}

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-2 text-[12px] font-semibold text-text-faint">{title}</div>
      <div className="space-y-2">{children}</div>
    </div>
  );
}

function ColorRow({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  const hex = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(value) ? value : "#000000";
  return (
    <label className="flex items-center justify-between gap-2 text-[12.5px] text-text-dim">
      <span>{label}</span>
      <span className="flex items-center gap-2">
        <input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-[76px] rounded-md border border-border bg-panel-2 px-1.5 py-1 text-right font-mono text-[11.5px] outline-none focus:border-accent/50"
        />
        <input
          type="color"
          value={hex}
          onChange={(e) => onChange(e.target.value)}
          className="h-6 w-6 shrink-0 cursor-pointer rounded-md border border-border bg-transparent"
          aria-label={`${label} color picker`}
        />
      </span>
    </label>
  );
}

function SliderRow({
  label,
  value,
  min,
  max,
  step,
  suffix,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  suffix?: string;
  onChange: (v: number) => void;
}) {
  return (
    <label className="block text-[12.5px] text-text-dim">
      <span className="flex justify-between">
        <span>{label}</span>
        <span className="font-mono text-[11.5px] text-text-faint">
          {Number.isInteger(value) ? value : value.toFixed(2)}
          {suffix ?? ""}
        </span>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="mt-1.5 w-full accent-accent"
      />
    </label>
  );
}
