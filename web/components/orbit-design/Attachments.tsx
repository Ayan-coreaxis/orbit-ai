"use client";

import { useRef } from "react";
import { ImagePlus, X } from "lucide-react";
import type { Attachment } from "./useImageAttachments";

export function AttachButton({ onFiles, disabled }: { onFiles: (f: FileList) => void; disabled?: boolean }) {
  const ref = useRef<HTMLInputElement>(null);
  return (
    <>
      <input
        ref={ref}
        type="file"
        accept="image/*"
        multiple
        hidden
        onChange={(e) => {
          if (e.target.files?.length) onFiles(e.target.files);
          e.target.value = "";
        }}
      />
      <button
        type="button"
        onClick={() => ref.current?.click()}
        disabled={disabled}
        title="Attach reference images"
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-text-faint hover:bg-panel-2 hover:text-text disabled:opacity-40"
      >
        <ImagePlus className="h-4 w-4" />
      </button>
    </>
  );
}

export function AttachmentTray({ items, onRemove }: { items: Attachment[]; onRemove: (id: string) => void }) {
  if (!items.length) return null;
  return (
    <div className="flex flex-wrap gap-2 px-1 pb-2">
      {items.map((a) => (
        <div key={a.id} className="group relative h-14 w-14 overflow-hidden rounded-lg border border-border">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={a.dataUrl} alt={a.name} className="h-full w-full object-cover" />
          <button
            type="button"
            onClick={() => onRemove(a.id)}
            className="absolute right-0.5 top-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-black/60 text-white opacity-0 transition-opacity group-hover:opacity-100"
            aria-label="Remove"
          >
            <X className="h-2.5 w-2.5" />
          </button>
        </div>
      ))}
    </div>
  );
}
