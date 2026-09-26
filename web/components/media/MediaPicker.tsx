"use client";

import { useEffect, useState } from "react";
import { Loader2, X } from "lucide-react";
import type { UploadedMedia } from "@/lib/media-client";

/** Pick an existing photo from the business's media library (chat attachments + store uploads). */
export function MediaPicker({ open, onClose, onPick }: { open: boolean; onClose: () => void; onPick: (m: UploadedMedia) => void }) {
  const [items, setItems] = useState<UploadedMedia[] | null>(null);

  const [wasOpen, setWasOpen] = useState(open);
  if (wasOpen !== open) {
    setWasOpen(open);
    if (open) setItems(null); // show the spinner while re-loading on every open
  }

  useEffect(() => {
    if (!open) return;
    let alive = true;
    fetch("/api/media?kind=image")
      .then((r) => r.json())
      .then((d) => alive && setItems((d.media as UploadedMedia[]) ?? []))
      .catch(() => alive && setItems([]));
    return () => {
      alive = false;
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div className="max-h-[80vh] w-full max-w-2xl overflow-hidden rounded-2xl border border-border bg-panel shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-border px-5 py-3.5">
          <div>
            <div className="text-[14px] font-semibold">Media library</div>
            <div className="text-[12px] text-text-faint">Photos you&apos;ve uploaded here or sent in the Orchestrator chat</div>
          </div>
          <button onClick={onClose} className="rounded-md p-1 text-text-faint hover:text-text" aria-label="Close">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="scrollbar-thin max-h-[60vh] overflow-y-auto p-4">
          {items === null ? (
            <div className="flex justify-center py-10 text-text-faint">
              <Loader2 className="h-5 w-5 animate-spin" />
            </div>
          ) : items.length === 0 ? (
            <p className="py-10 text-center text-[13px] text-text-faint">No photos yet — upload one, or send photos to your Orchestrator in chat.</p>
          ) : (
            <div className="grid grid-cols-3 gap-3 sm:grid-cols-4">
              {items.map((m) => (
                <button
                  key={m.id}
                  onClick={() => {
                    onPick(m);
                    onClose();
                  }}
                  className="group overflow-hidden rounded-lg border border-border bg-panel-2 text-left hover:border-accent/60"
                  title={m.name}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={m.url} alt={m.name} className="aspect-square w-full object-cover transition-transform group-hover:scale-105" />
                  <div className="truncate px-2 py-1 text-[11px] text-text-faint">{m.name}</div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
