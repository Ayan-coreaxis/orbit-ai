"use client";

import { useMemo, useState } from "react";
import { X, Type as TypeIcon, Loader2, AlignLeft, AlignCenter, AlignRight, Eye, EyeOff, Trash2 } from "lucide-react";
import type { OrbitDesignDoc } from "@/lib/orbit-design";
import type { PickTarget as Pick } from "./PreviewPane";
import { ImageUpload } from "@/components/ImageUpload";

type Tab = "simple" | "pro" | "code";

/**
 * Claude-Design-style element editor. Pick an element in the preview (Edit mode) → this shows
 * visual controls for its inline style. Changes stream live to the preview iframe; Save parses the
 * section's stored HTML, walks the same nth-child path, writes the new style, and PATCHes it back.
 */
export function ElementInspector({
  doc,
  pick,
  onClose,
  onSaved,
}: {
  doc: OrbitDesignDoc;
  pick: Pick;
  onClose: () => void;
  onSaved: (doc: OrbitDesignDoc) => void;
}) {
  const editable = pick.block.startsWith("s:");
  const section = editable ? doc.pages.flatMap((p) => p.sections).find((s) => s.id === pick.block.slice(2)) : undefined;
  const [tab, setTab] = useState<Tab>("simple");
  const [style, setStyle] = useState<Record<string, string>>(() => parseStyle(pick.style));
  const [text, setText] = useState<string>(pick.fullText);
  const [videoSrc, setVideoSrc] = useState<string>(pick.videoSlot ? pick.curSrc : "");
  const [imgSrc, setImgSrc] = useState<string>(pick.imgSlot ? pick.curSrc : "");
  const [busy, setBusy] = useState(false);
  const canEditText = editable && !!pick.fullText;
  const isVideoSlot = editable && !!pick.videoSlot;
  const isImgSlot = editable && !!pick.imgSlot;
  const initSrc = pick.curSrc;
  const dirty = useMemo(
    () =>
      toStyle(style) !== normalise(pick.style) ||
      text !== pick.fullText ||
      (isVideoSlot && videoSrc.trim() !== initSrc) ||
      (isImgSlot && imgSrc.trim() !== initSrc),
    [style, pick.style, text, pick.fullText, videoSrc, imgSrc, isVideoSlot, isImgSlot, initSrc],
  );

  function push(next: Record<string, string>) {
    setStyle(next);
    const s = toStyle(next);
    previewWindow()?.postMessage({ __od: "setStyle", block: pick.block, path: pick.path, style: s }, "*");
  }
  const set = (prop: string, val: string) => push({ ...style, ...(val ? { [prop]: val } : {}), ...(val ? {} : { [prop]: "" }) });
  const g = (prop: string) => style[prop] ?? "";

  function pushText(v: string) {
    setText(v);
    previewWindow()?.postMessage({ __od: "setText", block: pick.block, path: pick.path, text: v }, "*");
  }

  async function save() {
    if (!editable) return;
    setBusy(true);
    try {
      const sid = pick.block.slice(2);
      const html = sectionHtml(doc, sid);
      if (html == null) return;
      let patched = writeByPath(html, pick.path, {
        style: toStyle(style),
        text: canEditText && text !== pick.fullText ? text : undefined,
        videoSrc: isVideoSlot && videoSrc.trim() !== initSrc ? videoSrc.trim() : undefined,
        imgSrc: isImgSlot && imgSrc.trim() !== initSrc ? imgSrc.trim() : undefined,
      });
      if (patched == null) {
        alert("Couldn't locate that element to save — try editing the section as HTML instead.");
        return;
      }
      patched = patched.slice(0, 20000);
      const res = await fetch("/api/orbit-design", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ blockHtml: { block: pick.block, html: patched } }),
      });
      const data = await res.json().catch(() => ({}));
      if (data.doc) onSaved(data.doc);
    } finally {
      setBusy(false);
    }
  }

  async function sectionOp(body: Record<string, unknown>, close = false) {
    setBusy(true);
    try {
      const res = await fetch("/api/orbit-design", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (data.doc) onSaved(data.doc);
      if (close) onClose();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex w-full shrink-0 flex-col border-l border-border bg-bg lg:w-[320px]">
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <div className="flex items-center gap-2">
          <TypeIcon className="h-3.5 w-3.5 text-text-faint" />
          <span className="text-[13px] font-semibold capitalize">{pick.role}</span>
          <span className="text-[11px] text-text-faint">&lt;{pick.tag}&gt;</span>
        </div>
        <button onClick={onClose} className="text-text-faint hover:text-text" aria-label="Close">
          <X className="h-4 w-4" />
        </button>
      </div>

      {!editable ? (
        <p className="p-4 text-[12.5px] text-text-dim">
          Elements inside the header, footer and auto-built grids are managed for you. Use Comment or a chat message to
          change them.
        </p>
      ) : (
        <>
          {section && pick.path.length === 0 && (
            <div className="flex items-center gap-3 border-b border-border px-4 py-2 text-[12px]">
              <button
                onClick={() => sectionOp({ sectionVisibility: [{ page: pageOf(doc, section.id), id: section.id, visible: section.visible === false }] })}
                className="flex items-center gap-1.5 text-text-dim hover:text-text"
              >
                {section.visible === false ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
                {section.visible === false ? "Show" : "Hide"} section
              </button>
              <button
                onClick={() => confirm("Delete this whole section?") && sectionOp({ blockDelete: pick.block }, true)}
                className="ml-auto flex items-center gap-1.5 text-bad hover:opacity-80"
              >
                <Trash2 className="h-3.5 w-3.5" /> Delete
              </button>
            </div>
          )}
          <div className="flex gap-1 border-b border-border px-3 py-2">
            {(["simple", "pro", "code"] as const).map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={`flex-1 rounded-md py-1.5 text-[12px] font-medium capitalize transition-colors ${
                  tab === t ? "bg-accent-soft text-accent-strong" : "text-text-dim hover:text-text"
                }`}
              >
                {t}
              </button>
            ))}
          </div>

          <div className="flex-1 space-y-4 overflow-y-auto p-4">
            {tab === "code" ? (
              <textarea
                value={toStyle(style, true)}
                onChange={(e) => push(parseStyle(e.target.value))}
                spellCheck={false}
                rows={16}
                className="w-full resize-none rounded-lg border border-border bg-panel p-3 font-mono text-[12px] leading-relaxed outline-none focus:border-accent/50"
                placeholder={"font-size: 20px;\ncolor: var(--od-text);"}
              />
            ) : (
              <>
                {canEditText && (
                  <Group label="Content">
                    <textarea
                      value={text}
                      onChange={(e) => pushText(e.target.value)}
                      spellCheck={false}
                      rows={3}
                      className="w-full resize-none rounded-lg border border-border bg-panel p-2.5 text-[12.5px] leading-relaxed outline-none focus:border-accent/50"
                    />
                  </Group>
                )}
                {isVideoSlot && (
                  <Group label="Background video">
                    <input
                      value={videoSrc}
                      onChange={(e) => setVideoSrc(e.target.value)}
                      placeholder="https://…/hero.mp4"
                      className={inputCls}
                    />
                    <p className="text-[11px] text-text-faint">Paste a direct MP4/WebM URL. Saved to this slot; plays muted &amp; looped on the live store.</p>
                  </Group>
                )}
                {isImgSlot && (
                  <Group label="Image">
                    <ImageUpload
                      compact
                      value={imgSrc}
                      onChange={setImgSrc}
                      hint="Replaces the placeholder here on the live store & preview."
                    />
                  </Group>
                )}
                <Group label="Text">
                  <Row label="Size">
                    <Unit value={g("font-size")} onChange={(v) => set("font-size", v)} />
                  </Row>
                  <Row label="Weight">
                    <Select value={g("font-weight")} onChange={(v) => set("font-weight", v)} opts={["", "300", "400", "500", "600", "700", "800", "900"]} />
                  </Row>
                  <Row label="Colour">
                    <Colour value={g("color")} onChange={(v) => set("color", v)} />
                  </Row>
                  <Row label="Align">
                    <div className="flex gap-1">
                      {([["left", AlignLeft], ["center", AlignCenter], ["right", AlignRight]] as const).map(([v, Ic]) => (
                        <button
                          key={v}
                          onClick={() => set("text-align", g("text-align") === v ? "" : v)}
                          className={`rounded-md border p-1.5 ${g("text-align") === v ? "border-accent bg-accent-soft text-accent-strong" : "border-border text-text-dim"}`}
                        >
                          <Ic className="h-3.5 w-3.5" />
                        </button>
                      ))}
                    </div>
                  </Row>
                  <Row label="Line height">
                    <Unit value={g("line-height")} onChange={(v) => set("line-height", v)} placeholder="1.4" />
                  </Row>
                  <Row label="Spacing">
                    <Unit value={g("letter-spacing")} onChange={(v) => set("letter-spacing", v)} placeholder="0" />
                  </Row>
                  <Row label="Case">
                    <Select value={g("text-transform")} onChange={(v) => set("text-transform", v)} opts={["", "none", "uppercase", "capitalize", "lowercase"]} />
                  </Row>
                </Group>

                <Group label="Fill & corners">
                  <Row label="Background">
                    <Colour value={g("background")} onChange={(v) => set("background", v)} />
                  </Row>
                  <Row label="Opacity">
                    <input
                      type="range"
                      min={0}
                      max={1}
                      step={0.05}
                      value={g("opacity") || "1"}
                      onChange={(e) => set("opacity", e.target.value === "1" ? "" : e.target.value)}
                      className="w-full accent-accent"
                    />
                  </Row>
                  <Row label="Radius">
                    <Unit value={g("border-radius")} onChange={(v) => set("border-radius", v)} placeholder="0" />
                  </Row>
                </Group>

                <Group label="Border">
                  <Row label="Width">
                    <Unit value={g("border-width")} onChange={(v) => set("border-width", v)} placeholder="0" />
                  </Row>
                  <Row label="Style">
                    <Select value={g("border-style")} onChange={(v) => set("border-style", v)} opts={["", "solid", "dashed", "dotted", "none"]} />
                  </Row>
                  <Row label="Colour">
                    <Colour value={g("border-color")} onChange={(v) => set("border-color", v)} />
                  </Row>
                </Group>

                {tab === "pro" && (
                  <>
                    <Group label="Spacing">
                      <Row label="Padding">
                        <Unit value={g("padding")} onChange={(v) => set("padding", v)} placeholder="0" />
                      </Row>
                      <Row label="Margin">
                        <Unit value={g("margin")} onChange={(v) => set("margin", v)} placeholder="0" />
                      </Row>
                    </Group>
                    <Group label="Size">
                      <Row label="Width">
                        <Unit value={g("width")} onChange={(v) => set("width", v)} placeholder="auto" />
                      </Row>
                      <Row label="Max width">
                        <Unit value={g("max-width")} onChange={(v) => set("max-width", v)} placeholder="none" />
                      </Row>
                      <Row label="Height">
                        <Unit value={g("height")} onChange={(v) => set("height", v)} placeholder="auto" />
                      </Row>
                    </Group>
                    <Group label="Layout">
                      <Row label="Display">
                        <Select value={g("display")} onChange={(v) => set("display", v)} opts={["", "block", "flex", "grid", "inline-block", "inline-flex", "none"]} />
                      </Row>
                      {/flex/.test(g("display")) && (
                        <>
                          <Row label="Direction">
                            <Select value={g("flex-direction")} onChange={(v) => set("flex-direction", v)} opts={["", "row", "column"]} />
                          </Row>
                          <Row label="Justify">
                            <Select value={g("justify-content")} onChange={(v) => set("justify-content", v)} opts={["", "flex-start", "center", "flex-end", "space-between"]} />
                          </Row>
                          <Row label="Align">
                            <Select value={g("align-items")} onChange={(v) => set("align-items", v)} opts={["", "stretch", "flex-start", "center", "flex-end"]} />
                          </Row>
                          <Row label="Gap">
                            <Unit value={g("gap")} onChange={(v) => set("gap", v)} placeholder="0" />
                          </Row>
                        </>
                      )}
                    </Group>
                  </>
                )}
              </>
            )}
          </div>

          <div className="border-t border-border p-3">
            <button
              onClick={save}
              disabled={busy || !dirty}
              className="w-full rounded-lg gradient-fill py-2 text-[13px] font-semibold text-white disabled:opacity-40"
            >
              {busy ? <Loader2 className="mx-auto h-4 w-4 animate-spin" /> : "Save changes"}
            </button>
          </div>
        </>
      )}
    </div>
  );
}

// ---- small controls ----
function Group({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="mb-2 text-[11px] font-medium uppercase tracking-wide text-text-faint">{label}</p>
      <div className="space-y-2">{children}</div>
    </div>
  );
}
function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3">
      <span className="w-[74px] shrink-0 text-[12px] text-text-dim">{label}</span>
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}
const inputCls = "w-full rounded-md border border-border bg-panel px-2 py-1.5 text-[12.5px] outline-none focus:border-accent/50";
function Unit({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder?: string }) {
  return <input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder ?? "—"} className={inputCls} />;
}
function Select({ value, onChange, opts }: { value: string; onChange: (v: string) => void; opts: string[] }) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)} className={inputCls}>
      {opts.map((o) => (
        <option key={o} value={o}>
          {o || "default"}
        </option>
      ))}
    </select>
  );
}
function Colour({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const hex = /^#[0-9a-f]{3,8}$/i.test(value.trim()) ? value.trim() : "#000000";
  return (
    <div className="flex items-center gap-2">
      <input type="color" value={hex} onChange={(e) => onChange(e.target.value)} className="h-7 w-8 shrink-0 rounded border border-border bg-transparent" />
      <input value={value} onChange={(e) => onChange(e.target.value)} placeholder="var(--od-text)" className={inputCls} />
    </div>
  );
}

// ---- style helpers ----
function parseStyle(s: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const decl of s.split(";")) {
    const i = decl.indexOf(":");
    if (i === -1) continue;
    const k = decl.slice(0, i).trim().toLowerCase();
    const v = decl.slice(i + 1).trim();
    if (k && v) out[k] = v;
  }
  return out;
}
function toStyle(o: Record<string, string>, pretty = false): string {
  const parts = Object.entries(o)
    .filter(([, v]) => v !== "")
    .map(([k, v]) => `${k}: ${v}`);
  return parts.join(pretty ? ";\n" : "; ") + (parts.length && !pretty ? ";" : "");
}
function normalise(s: string): string {
  return toStyle(parseStyle(s));
}
function previewWindow(): Window | null {
  if (typeof document === "undefined") return null;
  const f = document.querySelector<HTMLIFrameElement>('iframe[title="Storefront preview"]');
  return f?.contentWindow ?? null;
}

function pageOf(doc: OrbitDesignDoc, sectionId: string): string {
  return doc.pages.find((p) => p.sections.some((s) => s.id === sectionId))?.slug ?? "home";
}

function sectionHtml(doc: OrbitDesignDoc, id: string): string | null {
  for (const p of doc.pages) {
    const s = p.sections.find((x) => x.id === id);
    if (s) return s.html;
  }
  return null;
}

/** Parse the stored section HTML, walk the nth-child path, apply style / text / video-src to the target. */
function writeByPath(
  html: string,
  path: number[],
  edits: { style: string; text?: string; videoSrc?: string; imgSrc?: string },
): string | null {
  if (typeof document === "undefined") return null;
  const body = new DOMParser().parseFromString(`<body>${html}</body>`, "text/html").body;
  let node: Element | undefined = body;
  for (const idx of path) {
    node = node?.children[idx];
    if (!node) return null;
  }
  if (!node || node === body) return null;
  if (edits.style) node.setAttribute("style", edits.style);
  else node.removeAttribute("style");
  if (edits.text !== undefined && !node.querySelector("*")) node.textContent = edits.text;
  if (edits.videoSrc !== undefined) node.setAttribute("data-video-src", edits.videoSrc);
  if (edits.imgSrc !== undefined) node.setAttribute("data-img-src", edits.imgSrc);
  return body.innerHTML;
}
