"use client";

import { useEffect, useRef, useState } from "react";
import { Box, Check, ImagePlus, Sparkles, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { INTAKE, composeIntake, emptyAnswers, type IntakeAnswers, type IntakeSection } from "@/lib/design-intake";
import { useImageAttachments } from "./useImageAttachments";

/* ------------------------------------------------------------------ wireframes (tiny pictures of each choice) */
const INK = "#1f4a3a";
const SOFT = "#cfd8cf";
const ACC = "#f2462e";
type Shape = [number, number, number, number, string?, number?];
function Wire({ shapes, dark = false }: { shapes: Shape[]; dark?: boolean }) {
  return (
    <svg viewBox="0 0 88 60" className="h-full w-full" aria-hidden>
      <rect width="88" height="60" rx="5" fill={dark ? "#14241c" : "#f7f3ea"} />
      {shapes.map(([x, y, w, h, f = SOFT, r = 2], i) => (
        <rect key={i} x={x} y={y} width={w} height={h} rx={r} fill={f} />
      ))}
    </svg>
  );
}
const bars = (x: number, y: number, w: number, n: number, f = INK): Shape[] => Array.from({ length: n }, (_, k) => [x, y + k * 5, k === n - 1 ? w * 0.6 : w, 2.4, f, 1.2] as Shape);

const WIRES: Record<string, Record<string, React.ReactNode>> = {
  hero: {
    photo: <Wire shapes={[[0, 0, 88, 60, "#b9c9bd", 5], ...bars(8, 36, 40, 2, "#fff"), [8, 48, 20, 6, ACC, 3]]} />,
    slider: <Wire shapes={[[4, 4, 80, 44, "#b9c9bd", 4], ...bars(10, 28, 36, 2, "#fff"), [34, 53, 4, 4, INK, 2], [42, 53, 4, 4, SOFT, 2], [50, 53, 4, 4, SOFT, 2], [78, 22, 6, 6, "#fff", 3]]} />,
    video: <Wire dark shapes={[[0, 0, 88, 60, "#27402f", 5], [38, 21, 14, 14, "#ffffffaa", 7], ...bars(8, 44, 36, 2, "#fff")]} />,
    videos: <Wire dark shapes={[[4, 6, 26, 48, "#27402f", 4], [32, 6, 26, 48, "#34523f", 4], [60, 6, 24, 48, "#27402f", 4], [13, 26, 8, 8, "#ffffffaa", 4], [41, 26, 8, 8, "#ffffffaa", 4], [69, 26, 8, 8, "#ffffffaa", 4]]} />,
    type: <Wire shapes={[[8, 12, 70, 9, INK, 2], [8, 25, 52, 9, INK, 2], [8, 42, 22, 7, ACC, 3.5]]} />,
    split: <Wire shapes={[...bars(8, 14, 32, 4), [8, 42, 20, 6, ACC, 3], [48, 4, 36, 52, "#b9c9bd", 4]]} />,
  },
  header: {
    classic: <Wire shapes={[[6, 8, 14, 5, INK, 2], [44, 9, 8, 3, SOFT], [56, 9, 8, 3, SOFT], [68, 9, 12, 3, SOFT], [0, 18, 88, 1, SOFT, 0], [6, 28, 76, 26, "#e8e2d3", 4]]} />,
    centered: <Wire shapes={[[34, 6, 20, 6, INK, 2], [18, 17, 10, 3, SOFT], [32, 17, 10, 3, SOFT], [46, 17, 10, 3, SOFT], [60, 17, 10, 3, SOFT], [0, 25, 88, 1, SOFT, 0], [6, 33, 76, 21, "#e8e2d3", 4]]} />,
    overlay: <Wire dark shapes={[[0, 0, 88, 60, "#27402f", 5], [6, 8, 14, 5, "#fff", 2], [48, 9, 8, 3, "#ffffffaa"], [60, 9, 8, 3, "#ffffffaa"], [72, 9, 10, 3, "#ffffffaa"]]} />,
    side: <Wire shapes={[[6, 8, 14, 5, INK, 2], [70, 7, 12, 2.4, INK, 1], [70, 12, 12, 2.4, INK, 1], [60, 24, 28, 36, "#14241c", 0], [64, 32, 18, 3, "#fff", 1.5], [64, 40, 14, 3, "#ffffffaa", 1.5]]} />,
    bold: <Wire shapes={[[0, 0, 88, 8, ACC, 0], [28, 3, 32, 2, "#fff", 1], [0, 8, 88, 14, INK, 0], [6, 12, 14, 5, "#fff", 2], [52, 13, 8, 3, "#ffffffaa"], [64, 13, 8, 3, "#ffffffaa"], [6, 30, 76, 24, "#e8e2d3", 4]]} />,
  },
  splash: {
    none: <Wire shapes={[[14, 14, 60, 32, "none", 4], [14, 14, 60, 32, "#e8e2d3", 4], [30, 28, 28, 4, SOFT, 2]]} />,
    fade: <Wire dark shapes={[[0, 0, 88, 60, "#14241c", 5], [28, 26, 32, 8, "#ffffffdd", 3], [20, 22, 48, 16, "#ffffff22", 8]]} />,
    counter: <Wire dark shapes={[[0, 0, 88, 60, "#14241c", 5], [44, 24, 10, 22, "#fff", 2], [58, 24, 10, 22, "#fff", 2], [70, 44, 12, 3, ACC, 1.5]]} />,
    curtain: <Wire shapes={[[0, 0, 44, 60, INK, 0], [44, 0, 44, 60, "#2d6a53", 0], [38, 26, 12, 8, "#fff", 3]]} />,
  },
  cards: {
    minimal: <Wire shapes={[[8, 8, 32, 34, "#d9e2da", 3], [48, 8, 32, 34, "#d9e2da", 3], ...bars(8, 46, 26, 2), ...bars(48, 46, 26, 2)]} />,
    boxed: <Wire shapes={[[6, 6, 36, 48, "#fff", 4], [6, 6, 36, 48, "none", 4], [9, 9, 30, 24, "#d9e2da", 3], ...bars(10, 36, 22, 2), [10, 46, 26, 5, INK, 2.5], [46, 6, 36, 48, "#fff", 4], [49, 9, 30, 24, "#d9e2da", 3], [50, 46, 26, 5, INK, 2.5]]} />,
    overlay: <Wire shapes={[[6, 6, 36, 48, "#9fb5a6", 4], [6, 36, 36, 18, "#14241c", 4], [10, 41, 20, 2.4, "#fff", 1.2], [10, 46, 12, 2.4, "#ffffffaa", 1.2], [46, 6, 36, 48, "#b9c9bd", 4], [46, 36, 36, 18, "#14241c", 4]]} />,
    editorial: <Wire shapes={[[8, 4, 34, 42, "#d9e2da", 2], [8, 50, 22, 2.4, INK, 1.2], [46, 4, 34, 42, "#c3cfc6", 2], [46, 50, 22, 2.4, INK, 1.2]]} />,
    compact: <Wire shapes={[[6, 6, 76, 14, "#fff", 3], [9, 9, 8, 8, "#d9e2da", 2], ...bars(21, 9, 44, 2), [6, 24, 76, 14, "#fff", 3], [9, 27, 8, 8, "#d9e2da", 2], ...bars(21, 27, 44, 2), [6, 42, 76, 14, "#fff", 3], [9, 45, 8, 8, "#d9e2da", 2], ...bars(21, 45, 44, 2)]} />,
  },
};

/* ------------------------------------------------------------------ reference upload */
function RefUpload({ label, onChange }: { label: string; onChange: (urls: string[]) => void }) {
  const attach = useImageAttachments();
  const last = useRef("");
  useEffect(() => {
    const key = attach.items.map((i) => i.id).join(",");
    if (key !== last.current) {
      last.current = key;
      onChange(attach.items.map((i) => i.dataUrl));
    }
  }, [attach.items, onChange]);
  const inputRef = useRef<HTMLInputElement>(null);
  return (
    <div className="mt-3" {...attach.dropHandlers}>
      <div className="flex flex-wrap items-center gap-2.5">
        <input ref={inputRef} type="file" accept="image/*" multiple hidden onChange={(e) => { if (e.target.files?.length) void attach.add(e.target.files); e.target.value = ""; }} />
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={attach.atMax}
          className={cn("inline-flex items-center gap-2 rounded-full border border-dashed px-4 py-2 text-[14px] font-medium transition-colors disabled:opacity-40", attach.dragging ? "border-accent bg-accent-soft text-accent" : "border-border text-text-dim hover:border-accent hover:text-text")}
        >
          <ImagePlus className="h-4 w-4" /> {attach.items.length ? "Add another" : label}
        </button>
        {attach.items.map((a) => (
          <span key={a.id} className="group relative h-12 w-12 overflow-hidden rounded-xl border border-border">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={a.dataUrl} alt="" className="h-full w-full object-cover" />
            <button type="button" onClick={() => attach.remove(a.id)} className="absolute right-0.5 top-0.5 flex h-5 w-5 items-center justify-center rounded-full bg-black/65 text-white" aria-label="Remove reference">
              <X className="h-3 w-3" />
            </button>
          </span>
        ))}
      </div>
    </div>
  );
}

function ModelUpload({ models, setModels }: { models: string[]; setModels: (m: string[]) => void }) {
  const input = useRef<HTMLInputElement>(null);
  const [state, setState] = useState("");
  async function up(file: File) {
    setState("Uploading…");
    const fd = new FormData();
    fd.append("file", file);
    const r = await fetch("/api/orbit-design/site/model", { method: "POST", body: fd }).then((x) => x.json()).catch(() => ({ error: "Network error." }));
    if (r.url) setModels([...models, r.url].slice(0, 4));
    setState(r.url ? `${r.name} added` : (r.error ?? "Upload failed."));
  }
  return (
    <div className="mt-3 flex flex-wrap items-center gap-3">
      <input ref={input} type="file" accept=".glb,model/gltf-binary" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) void up(f); e.target.value = ""; }} />
      <button type="button" onClick={() => input.current?.click()} disabled={models.length >= 4} className="inline-flex items-center gap-2 rounded-full border border-dashed border-border px-4 py-2 text-[14px] font-medium text-text-dim hover:border-accent hover:text-text disabled:opacity-40">
        <Box className="h-4 w-4" /> Upload a 3D model (.glb)
      </button>
      {state && <span className="text-[13.5px] text-text-dim" role="status">{state}</span>}
    </div>
  );
}

/* ------------------------------------------------------------------ the intake */
function Section({ s, a, setA }: { s: IntakeSection; a: IntakeAnswers; setA: React.Dispatch<React.SetStateAction<IntakeAnswers>> }) {
  const chosen = a.picks[s.id] ?? [];
  const wire = WIRES[s.id];
  const toggle = (id: string) =>
    setA((x) => {
      const cur = x.picks[s.id] ?? [];
      const next = s.multi ? (cur.includes(id) ? cur.filter((c) => c !== id) : [...cur, id]) : cur[0] === id ? [] : [id];
      return { ...x, picks: { ...x.picks, [s.id]: next } };
    });
  return (
    <section className="rounded-[24px] border border-border bg-panel p-5 sm:p-6">
      <h3 className="text-[18px] font-semibold tracking-tight">{s.title}</h3>
      <p className="mt-0.5 text-[14.5px] text-text-dim">{s.why}{s.multi ? " Pick as many as you like." : ""}</p>
      <div className={cn("mt-4 grid gap-3", wire ? "sm:grid-cols-2 xl:grid-cols-3" : "grid-cols-2 sm:grid-cols-3 xl:grid-cols-5")}>
        {s.options.map((o) => {
          const on = chosen.includes(o.id);
          return (
            <button
              key={o.id}
              type="button"
              onClick={() => toggle(o.id)}
              aria-pressed={on}
              className={cn("group relative flex flex-col overflow-hidden rounded-2xl border text-left transition-all", on ? "border-accent ring-2 ring-accent/30" : "border-border hover:border-accent/50")}
            >
              {wire?.[o.id] && <span className="block aspect-[88/60] w-full bg-panel-2">{wire[o.id]}</span>}
              <span className="flex flex-1 flex-col p-3.5">
                <span className="flex items-center gap-2 text-[15px] font-semibold">
                  {o.label}
                  {on && <Check className="ml-auto h-4 w-4 text-accent" />}
                </span>
                <span className="mt-0.5 text-[13.5px] leading-snug text-text-dim">{o.hint}</span>
              </span>
            </button>
          );
        })}
      </div>
      <input
        value={a.notes[s.id] ?? ""}
        onChange={(e) => setA((x) => ({ ...x, notes: { ...x.notes, [s.id]: e.target.value } }))}
        placeholder="Anything specific? (optional — in your own words)"
        className="mt-4 w-full rounded-full border border-border bg-panel px-4 py-2.5 text-[14.5px] outline-none focus:border-accent"
      />
      {s.id === "threeD" && <ModelUpload models={a.models ?? []} setModels={(m) => setA((x) => ({ ...x, models: m }))} />}
      {s.reference && <RefUpload label="Upload a reference image" onChange={(urls) => setA((x) => ({ ...x, refs: { ...x.refs, [s.id]: urls } }))} />}
    </section>
  );
}

export function DesignIntake({ brief, onBuild, onSkip }: { brief: string; onBuild: (message: string, images: string[]) => void; onSkip: () => void }) {
  const [a, setA] = useState<IntakeAnswers>(emptyAnswers());
  const decided = Object.values(a.picks).filter((v) => v.length).length + Object.values(a.refs).filter((v) => v.length).length;
  return (
    <div className="mx-auto grid max-w-4xl gap-5 pb-10">
      <div>
        <h2 className="text-[24px] font-semibold tracking-tight">Let&apos;s design it your way</h2>
        <p className="mt-1 text-[15px] leading-relaxed text-text-dim">
          Choose what you want, or skip anything — the designer decides the rest. For any part you can upload a picture of what you like and it will follow it.
        </p>
        <p className="mt-2 rounded-2xl bg-panel-2 px-4 py-2.5 text-[14.5px] text-text-dim">
          <b className="text-text">Your brief:</b> {brief.length > 220 ? `${brief.slice(0, 220)}…` : brief}
        </p>
      </div>

      {INTAKE.map((s) => (
        <Section key={s.id} s={s} a={a} setA={setA} />
      ))}

      <section className="rounded-[24px] border border-border bg-panel p-5 sm:p-6">
        <h3 className="text-[18px] font-semibold tracking-tight">Brand colours, and a site you love</h3>
        <p className="mt-0.5 text-[14.5px] text-text-dim">Colours to keep, or upload a screenshot of a whole store you like — the whole design will follow its feel.</p>
        <input
          value={a.brand}
          onChange={(e) => setA((x) => ({ ...x, brand: e.target.value }))}
          placeholder="e.g. forest green and honey gold — keep my logo colours"
          className="mt-4 w-full rounded-full border border-border bg-panel px-4 py-2.5 text-[14.5px] outline-none focus:border-accent"
        />
        <RefUpload label="Upload a whole-site reference" onChange={(urls) => setA((x) => ({ ...x, refs: { ...x.refs, site: urls } }))} />
      </section>

      <div className="sticky bottom-0 -mx-1 flex flex-wrap items-center gap-3 rounded-[24px] border border-border bg-panel/95 px-4 py-3 backdrop-blur">
        <span className="text-[14.5px] text-text-dim">{decided ? `${decided} choice${decided === 1 ? "" : "s"} made` : "Nothing chosen yet — the designer will decide everything"}</span>
        <button type="button" onClick={onSkip} className="ml-auto rounded-full px-4 py-2.5 text-[14.5px] font-medium text-text-dim hover:bg-panel-2 hover:text-text">
          Decide for me
        </button>
        <button
          type="button"
          onClick={() => {
            const c = composeIntake(brief, a);
            onBuild(c.message, c.images);
          }}
          className="btn-primary inline-flex items-center gap-2"
        >
          <Sparkles className="h-4 w-4" /> Build my store
        </button>
      </div>
    </div>
  );
}
