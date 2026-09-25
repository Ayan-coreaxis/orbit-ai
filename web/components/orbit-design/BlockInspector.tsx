"use client";

import { useRef, useState } from "react";
import { X, Loader2, Check } from "lucide-react";
import { SECTION_KINDS, type OrbitKind, type OrbitBlock } from "@/lib/orbit-sections";
import type { OrbitDesignDoc, DesignSection } from "@/lib/orbit-design";

/**
 * Edits a curated-component section directly — no AI. Swap the variant, rewrite the copy.
 * Changes save instantly (PATCH { blockEdit }) and the preview re-renders from the new doc.
 */
export function BlockInspector({
  doc,
  sectionId,
  onDoc,
  onClose,
}: {
  doc: OrbitDesignDoc;
  sectionId: string; // "s:<id>" or "<id>"
  onDoc: (d: OrbitDesignDoc) => void;
  onClose: () => void;
}) {
  const id = sectionId.replace(/^s:/, "");
  const section: DesignSection | undefined = doc.pages.flatMap((p) => p.sections).find((x) => x.id === id);
  const block: OrbitBlock | undefined = section?.block;

  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [itemsErr, setItemsErr] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  if (!section || !block) {
    return (
      <div className="flex w-full shrink-0 flex-col border-l border-border bg-bg lg:w-[320px]">
        <Header onClose={onClose} title="Section" />
        <p className="p-4 text-[12.5px] text-text-dim">This section isn&apos;t a component — use Comment to change it, or the Code tab in Edit.</p>
      </div>
    );
  }

  const kind = block.kind as OrbitKind;
  const variants = SECTION_KINDS[kind] ?? [];
  const props = block.props ?? {};

  function patch(next: { variant?: string; props?: Record<string, unknown> }) {
    // optimistic doc update
    const d: OrbitDesignDoc = JSON.parse(JSON.stringify(doc));
    for (const p of d.pages) {
      const s = p.sections.find((x) => x.id === id) as DesignSection | undefined;
      if (s?.block) {
        if (next.variant) s.block.variant = next.variant;
        if (next.props) s.block.props = { ...s.block.props, ...next.props };
      }
    }
    onDoc(d);
    setSaving(true);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(async () => {
      try {
        await fetch("/api/orbit-design", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ blockEdit: { section: id, ...next } }),
        });
        setSaved(true);
        setTimeout(() => setSaved(false), 1400);
      } finally {
        setSaving(false);
      }
    }, 350);
  }

  const setProp = (key: string, value: unknown) => patch({ props: { [key]: value } });

  const stringKeys = ["eyebrow", "heading", "body", "placeholder", "usLabel", "themLabel"].filter((k) => k in props || k === "heading" || k === "body");
  const cta = props.cta as { label?: string } | undefined;
  const cta2 = props.cta2 as { label?: string } | undefined;

  return (
    <div className="flex w-full shrink-0 flex-col border-l border-border bg-bg lg:w-[320px]">
      <Header onClose={onClose} title={section.label || kind} />

      <div className="flex-1 space-y-4 overflow-y-auto p-4">
        <Field label="Layout">
          <select
            value={block.variant}
            onChange={(e) => patch({ variant: e.target.value })}
            className="w-full rounded-md border border-border bg-panel px-2 py-1.5 text-[12.5px] capitalize outline-none focus:border-accent/50"
          >
            {variants.map((v) => (
              <option key={v} value={v}>
                {v}
              </option>
            ))}
          </select>
        </Field>

        {stringKeys.map((k) => (
          <Field key={k} label={k}>
            {k === "body" ? (
              <textarea
                defaultValue={String(props[k] ?? "")}
                onBlur={(e) => setProp(k, e.target.value)}
                rows={3}
                className="w-full resize-none rounded-md border border-border bg-panel px-2.5 py-2 text-[12.5px] outline-none focus:border-accent/50"
              />
            ) : (
              <input
                defaultValue={String(props[k] ?? "")}
                onBlur={(e) => setProp(k, e.target.value)}
                className="w-full rounded-md border border-border bg-panel px-2.5 py-1.5 text-[12.5px] outline-none focus:border-accent/50"
              />
            )}
          </Field>
        ))}

        {cta !== undefined && (
          <Field label="Button">
            <input
              defaultValue={cta?.label ?? ""}
              onBlur={(e) => setProp("cta", { ...(cta ?? {}), label: e.target.value })}
              className="w-full rounded-md border border-border bg-panel px-2.5 py-1.5 text-[12.5px] outline-none focus:border-accent/50"
            />
          </Field>
        )}
        {cta2 !== undefined && (
          <Field label="Second button">
            <input
              defaultValue={cta2?.label ?? ""}
              onBlur={(e) => setProp("cta2", { ...(cta2 ?? {}), label: e.target.value })}
              className="w-full rounded-md border border-border bg-panel px-2.5 py-1.5 text-[12.5px] outline-none focus:border-accent/50"
            />
          </Field>
        )}

        {Array.isArray(props.items) && (
          <Field label={`Items (${props.items.length}) — JSON`}>
            <textarea
              key={JSON.stringify(props.items).length}
              defaultValue={JSON.stringify(props.items, null, 1)}
              onChange={() => setItemsErr(false)}
              onBlur={(e) => {
                try {
                  const parsed = JSON.parse(e.target.value);
                  if (Array.isArray(parsed)) {
                    setItemsErr(false);
                    setProp("items", parsed);
                  } else setItemsErr(true);
                } catch {
                  setItemsErr(true);
                }
              }}
              rows={8}
              className={`w-full resize-none rounded-md border bg-panel px-2.5 py-2 font-mono text-[11px] outline-none ${itemsErr ? "border-bad" : "border-border focus:border-accent/50"}`}
            />
            {itemsErr && <p className="mt-1 text-[11px] text-bad">Not valid JSON — not saved.</p>}
          </Field>
        )}

        <p className="pt-1 text-[11px] leading-relaxed text-text-faint">
          For a bigger change, use <span className="text-text-dim">Comment</span> and describe it — Orbit rewrites this section.
        </p>
      </div>

      <div className="flex items-center gap-1.5 border-t border-border px-4 py-2.5 text-[11.5px] text-text-faint">
        {saving ? (
          <>
            <Loader2 className="h-3 w-3 animate-spin" /> Saving…
          </>
        ) : saved ? (
          <>
            <Check className="h-3 w-3 text-good" /> Saved
          </>
        ) : (
          <span>Changes save automatically</span>
        )}
      </div>
    </div>
  );
}

function Header({ title, onClose }: { title: string; onClose: () => void }) {
  return (
    <div className="flex items-center justify-between border-b border-border px-4 py-3">
      <span className="truncate text-[13px] font-semibold capitalize">{title}</span>
      <button onClick={onClose} className="text-text-faint hover:text-text" aria-label="Close">
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-text-faint">{label}</span>
      {children}
    </label>
  );
}
