"use client";

import { useRef, useState } from "react";
import { Upload, Loader2, X, Link2, Images } from "lucide-react";
import { MediaPicker } from "@/components/media/MediaPicker";
import { uploadMedia } from "@/lib/media-client";

/**
 * One image control used everywhere the seller sets a storefront image (logo, hero, section, tile).
 * Upload a file → POST /api/upload → it stores + returns a URL; or paste a URL directly. Either way
 * the parent just gets a string, so the design keeps referencing images by URL.
 */
export function ImageUpload({
  value,
  onChange,
  label,
  hint,
  compact = false,
  library = false,
}: {
  value: string;
  onChange: (url: string) => void;
  label?: string;
  hint?: string;
  compact?: boolean;
  /** Save uploads into the business's media library and offer "From library" (photos from chat too). */
  library?: boolean;
}) {
  const [picking, setPicking] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [urlMode, setUrlMode] = useState(false);

  async function upload(file: File) {
    setBusy(true);
    setErr(null);
    try {
      if (library) {
        onChange((await uploadMedia(file, { source: "store" })).url);
        return;
      }
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/upload", { method: "POST", body: fd });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.url) {
        setErr(data.error || "Upload failed.");
        return;
      }
      onChange(data.url);
    } catch (e) {
      setErr(library && e instanceof Error ? e.message : "Network error — try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid gap-1.5">
      {label && <span className="text-[12px] text-text-dim">{label}</span>}
      <div className="flex items-start gap-2.5">
        {value.trim() ? (
          <div className="relative shrink-0">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={value}
              alt=""
              className={`rounded-lg border border-border bg-panel-2 object-contain ${compact ? "h-10 w-10" : "h-16 w-16"}`}
            />
            <button
              type="button"
              onClick={() => onChange("")}
              className="absolute -right-1.5 -top-1.5 rounded-full bg-panel p-0.5 text-text-faint shadow ring-1 ring-border hover:text-bad"
              aria-label="Remove image"
            >
              <X className="h-3 w-3" />
            </button>
          </div>
        ) : (
          <div
            className={`flex shrink-0 items-center justify-center rounded-lg border border-dashed border-border text-text-faint ${compact ? "h-10 w-10" : "h-16 w-16"}`}
          >
            <Upload className="h-4 w-4" />
          </div>
        )}

        <div className="min-w-0 flex-1">
          {urlMode ? (
            <input
              value={value}
              onChange={(e) => onChange(e.target.value)}
              placeholder="https://…/photo.jpg"
              className="w-full rounded-md border border-border bg-panel-2 px-2.5 py-1.5 text-[12.5px] outline-none focus:border-accent/50"
              autoFocus
            />
          ) : (
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                disabled={busy}
                className="inline-flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1.5 text-[12.5px] font-medium text-text-dim hover:text-text disabled:opacity-50"
              >
                {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
                {busy ? "Uploading…" : value.trim() ? "Replace" : "Upload image"}
              </button>
              {library && (
                <button
                  type="button"
                  onClick={() => setPicking(true)}
                  className="inline-flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1.5 text-[12.5px] font-medium text-text-dim hover:text-text"
                >
                  <Images className="h-3.5 w-3.5" /> From library
                </button>
              )}
              <button
                type="button"
                onClick={() => setUrlMode(true)}
                className="inline-flex items-center gap-1 text-[12px] text-text-faint hover:text-text"
              >
                <Link2 className="h-3.5 w-3.5" /> paste URL
              </button>
            </div>
          )}
          {urlMode && (
            <button type="button" onClick={() => setUrlMode(false)} className="mt-1 text-[11.5px] text-text-faint underline hover:text-text">
              upload a file instead
            </button>
          )}
          {err && <p className="mt-1 text-[11.5px] text-bad">{err}</p>}
          {!err && hint && !urlMode && <p className="mt-1 text-[11px] text-text-faint">{hint}</p>}
        </div>
      </div>

      {library && <MediaPicker open={picking} onClose={() => setPicking(false)} onPick={(m) => onChange(m.url)} />}
      <input
        ref={fileRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/gif,image/avif"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void upload(f);
          e.target.value = "";
        }}
      />
    </div>
  );
}
