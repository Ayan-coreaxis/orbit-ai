"use client";

import { useRef, useState } from "react";
import { FileText, Film, Loader2, Trash2, Upload, Copy, Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { MEDIA_ACCEPT, formatSize, uploadMedia, type UploadedMedia } from "@/lib/media-client";

const TABS = [
  { key: "all", label: "All" },
  { key: "image", label: "Photos" },
  { key: "video", label: "Videos" },
  { key: "audio", label: "Audio" },
  { key: "pdf", label: "PDFs" },
] as const;

export function MediaLibrary({ initial }: { initial: UploadedMedia[] }) {
  const [items, setItems] = useState(initial);
  const [tab, setTab] = useState<(typeof TABS)[number]["key"]>("all");
  const [busy, setBusy] = useState(0);
  const [err, setErr] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  async function add(files: File[]) {
    setErr(null);
    for (const f of files.slice(0, 20)) {
      setBusy((b) => b + 1);
      try {
        const m = await uploadMedia(f, { source: "library" });
        setItems((xs) => [m, ...xs]);
      } catch (e) {
        setErr(`${f.name}: ${e instanceof Error ? e.message : "upload failed"}`);
      } finally {
        setBusy((b) => b - 1);
      }
    }
  }

  async function remove(m: UploadedMedia) {
    if (!confirm(`Delete "${m.name}"? Products or designs using it will lose this file.`)) return;
    const res = await fetch(`/api/media/${m.id}`, { method: "DELETE" });
    if (res.ok) setItems((xs) => xs.filter((x) => x.id !== m.id));
  }

  const shown = tab === "all" ? items : items.filter((m) => m.kind === tab);

  return (
    <div
      onDragOver={(e) => {
        if (e.dataTransfer.types.includes("Files")) {
          e.preventDefault();
          setDragging(true);
        }
      }}
      onDragLeave={(e) => !e.currentTarget.contains(e.relatedTarget as Node) && setDragging(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragging(false);
        add(Array.from(e.dataTransfer.files ?? []));
      }}
      className={cn("rounded-2xl border bg-panel p-5 transition-colors", dragging ? "border-accent bg-accent-soft/30" : "border-border")}
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-1 rounded-lg bg-panel-2 p-1">
          {TABS.map((t) => {
            const n = t.key === "all" ? items.length : items.filter((m) => m.kind === t.key).length;
            return (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                className={cn("rounded-md px-3 py-1.5 text-[12.5px] font-medium", tab === t.key ? "bg-panel text-text shadow-sm" : "text-text-faint hover:text-text")}
              >
                {t.label} <span className="text-text-faint">{n}</span>
              </button>
            );
          })}
        </div>
        <button onClick={() => inputRef.current?.click()} className="inline-flex items-center gap-1.5 rounded-lg gradient-fill px-3.5 py-2 text-[13px] font-semibold text-white">
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />} {busy ? `Uploading ${busy}…` : "Upload"}
        </button>
        <input
          ref={inputRef}
          type="file"
          multiple
          accept={MEDIA_ACCEPT}
          className="hidden"
          onChange={(e) => {
            add(Array.from(e.target.files ?? []));
            e.target.value = "";
          }}
        />
      </div>
      {err && <p className="mt-3 text-[12.5px] text-bad">{err}</p>}

      {shown.length === 0 ? (
        <div className="mt-6 rounded-xl border border-dashed border-border py-16 text-center text-[13px] text-text-faint">
          Nothing here yet. Drag files in, press Upload, or send them to your Orchestrator in chat with 📎.
        </div>
      ) : (
        <div className="mt-5 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
          {shown.map((m) => (
            <div key={m.id} className="group overflow-hidden rounded-xl border border-border bg-panel-2">
              <div className="relative aspect-square bg-panel">
                {m.kind === "image" ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={m.url} alt={m.name} className="h-full w-full object-cover" />
                ) : m.kind === "video" ? (
                  <video src={m.url} controls preload="metadata" poster={m.frames[0]} className="h-full w-full object-cover" />
                ) : m.kind === "audio" ? (
                  <div className="flex h-full flex-col justify-center gap-2 p-3">
                    <audio src={m.url} controls preload="metadata" className="w-full" />
                    <p className="line-clamp-4 text-[11.5px] italic text-text-dim">{m.text ? `“${m.text}”` : m.note}</p>
                  </div>
                ) : (
                  <a href={m.url} target="_blank" rel="noreferrer" className="flex h-full flex-col items-center justify-center gap-2 text-text-faint hover:text-text">
                    <FileText className="h-10 w-10 text-bad" />
                    <span className="text-[11.5px]">Open PDF</span>
                  </a>
                )}
                <div className="absolute right-1.5 top-1.5 flex gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                  <button
                    onClick={() => {
                      navigator.clipboard?.writeText(new URL(m.url, window.location.origin).toString());
                      setCopied(m.id);
                      setTimeout(() => setCopied(null), 1500);
                    }}
                    className="rounded-md bg-black/60 p-1.5 text-white"
                    title="Copy link"
                  >
                    {copied === m.id ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                  </button>
                  <button onClick={() => remove(m)} className="rounded-md bg-black/60 p-1.5 text-white hover:text-bad" title="Delete">
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
              <div className="px-2.5 py-2">
                <div className="flex items-center gap-1.5 truncate text-[12px] font-medium">
                  {m.kind === "video" && <Film className="h-3.5 w-3.5 shrink-0 text-text-faint" />}
                  <span className="truncate">{m.name}</span>
                </div>
                <div className="text-[11px] text-text-faint">
                  {formatSize(m.size)} · {m.source === "chat" ? "from chat" : m.source === "store" ? "store" : "uploaded"}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
