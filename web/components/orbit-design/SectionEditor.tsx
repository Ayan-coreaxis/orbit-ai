"use client";

import { useMemo, useState } from "react";
import { X, Code2, Trash2, Eye, EyeOff } from "lucide-react";
import type { OrbitDesignDoc } from "@/lib/orbit-design";

/**
 * Inline block editor. Opens when a block is clicked in the preview while Edit mode is on.
 * `block` is "header", "footer", or "s:<sectionId>". Lets the seller edit the visible text
 * runs directly (no AI), drop into raw HTML, or hide / delete a section.
 */
export function SectionEditor({
  doc,
  block,
  onClose,
  onSaved,
}: {
  doc: OrbitDesignDoc;
  block: string;
  onClose: () => void;
  onSaved: (doc: OrbitDesignDoc) => void;
}) {
  const resolved = useMemo(() => resolveBlock(doc, block), [doc, block]);
  const [html, setHtml] = useState(resolved?.html ?? "");
  const [raw, setRaw] = useState(false);
  const [busy, setBusy] = useState(false);

  if (!resolved) {
    return (
      <Shell title="Edit block" onClose={onClose}>
        <p className="p-4 text-[13px] text-text-dim">This block can&apos;t be edited directly. Ask in chat to change it.</p>
      </Shell>
    );
  }

  const runs = splitTextRuns(html);

  async function patch(body: Record<string, unknown>) {
    setBusy(true);
    try {
      const res = await fetch("/api/orbit-design", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (data.doc) onSaved(data.doc);
    } finally {
      setBusy(false);
    }
  }

  const save = () => patch({ blockHtml: { block, html } });

  return (
    <Shell title={resolved.label} onClose={onClose}>
      <div className="flex items-center justify-between border-b border-border px-4 py-2">
        <button
          onClick={() => setRaw((r) => !r)}
          className={`flex items-center gap-1.5 text-[12px] font-medium ${raw ? "text-accent-strong" : "text-text-dim hover:text-text"}`}
        >
          <Code2 className="h-3.5 w-3.5" /> {raw ? "Text mode" : "Edit HTML"}
        </button>
        {resolved.kind === "section" && (
          <div className="flex items-center gap-3">
            <button
              onClick={() =>
                patch({ sectionVisibility: [{ page: resolved.page, id: resolved.id, visible: !resolved.visible }] })
              }
              className="flex items-center gap-1.5 text-[12px] text-text-dim hover:text-text"
            >
              {resolved.visible ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
              {resolved.visible ? "Hide" : "Show"}
            </button>
            <button
              onClick={() => {
                if (confirm("Delete this section?")) patch({ blockDelete: block }).then(onClose);
              }}
              className="flex items-center gap-1.5 text-[12px] text-bad hover:opacity-80"
            >
              <Trash2 className="h-3.5 w-3.5" /> Delete
            </button>
          </div>
        )}
      </div>

      <div className="flex-1 space-y-3 overflow-y-auto p-4">
        {raw ? (
          <textarea
            value={html}
            onChange={(e) => setHtml(e.target.value)}
            spellCheck={false}
            className="h-[60vh] w-full resize-none rounded-lg border border-border bg-panel p-3 font-mono text-[12px] leading-relaxed outline-none focus:border-accent/50"
          />
        ) : runs.length === 0 ? (
          <p className="text-[13px] text-text-dim">No editable text in this block. Switch to Edit HTML.</p>
        ) : (
          runs.map((r) => (
            <label key={r.index} className="block">
              <span className="mb-1 block text-[11px] uppercase tracking-wide text-text-faint">Text</span>
              <textarea
                value={r.text}
                onChange={(e) => setHtml((h) => replaceRun(h, r.index, e.target.value))}
                rows={r.text.length > 60 ? 3 : 1}
                className="w-full resize-none rounded-lg border border-border bg-panel px-3 py-2 text-[13px] outline-none focus:border-accent/50"
              />
            </label>
          ))
        )}
      </div>

      <div className="border-t border-border p-3">
        <button
          onClick={save}
          disabled={busy || html === resolved.html}
          className="w-full rounded-lg gradient-fill py-2 text-[13px] font-semibold text-white disabled:opacity-40"
        >
          {busy ? "Saving…" : "Save changes"}
        </button>
      </div>
    </Shell>
  );
}

function Shell({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="flex w-full shrink-0 flex-col border-l border-border bg-bg lg:w-[340px]">
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <span className="text-[13px] font-semibold">{title}</span>
        <button onClick={onClose} className="text-text-faint hover:text-text" aria-label="Close">
          <X className="h-4 w-4" />
        </button>
      </div>
      {children}
    </div>
  );
}

type Resolved =
  | { kind: "component"; label: string; html: string }
  | { kind: "section"; label: string; html: string; page: string; id: string; visible: boolean };

function resolveBlock(doc: OrbitDesignDoc, block: string): Resolved | null {
  if (block === "header") return { kind: "component", label: "Header", html: doc.components.header };
  if (block === "footer") return { kind: "component", label: "Footer", html: doc.components.footer };
  if (block.startsWith("s:")) {
    const id = block.slice(2);
    for (const p of doc.pages) {
      const s = p.sections.find((x) => x.id === id);
      if (s) return { kind: "section", label: s.label || "Section", html: s.html, page: p.slug, id, visible: s.visible !== false };
    }
  }
  return null;
}

interface Run {
  index: number; // ordinal among visible text runs — stable across edits, used to re-locate
  text: string; // human-readable, for the input
}

const RUN_RE = />([^<>]+)</g;

/** Visible text nodes: `>...<` chunks with non-whitespace. */
function splitTextRuns(html: string): Run[] {
  const runs: Run[] = [];
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
function replaceRun(html: string, index: number, next: string): string {
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

function decode(s: string): string {
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
