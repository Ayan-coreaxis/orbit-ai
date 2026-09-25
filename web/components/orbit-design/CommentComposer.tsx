"use client";

import { useState } from "react";
import { X, Send, ImagePlus } from "lucide-react";
import type { CommentTarget } from "./PreviewPane";
import { useImageAttachments } from "./useImageAttachments";

export interface CommentSend {
  applyToSimilar?: boolean;
  images?: string[];
}

/**
 * The Claude-Design-style "leave a comment on this thing" box. Opens where the seller clicked in
 * the preview (Comment mode); on send it turns the note + the clicked element's context into a
 * scoped chat message so the AI edits exactly that spot. Quick-action chips, an "apply to all like
 * this" toggle and an optional reference image make small edits one tap instead of a paragraph.
 */

// Chips that send immediately (unambiguous) vs. ones that just prefill + focus the box.
const QUICK: { label: string; instruction: string; prefill?: boolean }[] = [
  { label: "Bigger", instruction: "make this noticeably bigger" },
  { label: "Smaller", instruction: "make this smaller" },
  { label: "Bolder", instruction: "make this bolder / heavier weight" },
  { label: "More space", instruction: "add more spacing / padding around this" },
  { label: "Less space", instruction: "tighten the spacing around this" },
  { label: "Centre it", instruction: "centre-align this" },
  { label: "Move up", instruction: "move this section up one position" },
  { label: "Move down", instruction: "move this section down one position" },
  { label: "Colour…", instruction: "change the colour of this to ", prefill: true },
  { label: "Reword…", instruction: "reword this to say: ", prefill: true },
  { label: "Different layout…", instruction: "use a different layout for this section: ", prefill: true },
  { label: "Remove it", instruction: "remove this element" },
];

export function CommentComposer({
  target,
  contextLabel,
  onCancel,
  onSend,
}: {
  target: CommentTarget;
  contextLabel: string; // human name of the section/component clicked in
  onCancel: () => void;
  onSend: (note: string, opts?: CommentSend) => void;
}) {
  const [note, setNote] = useState("");
  const [applyToSimilar, setApplyToSimilar] = useState(false);
  const attach = useImageAttachments();
  const preview = target.text ? `"${target.text.slice(0, 60)}${target.text.length > 60 ? "…" : ""}"` : target.role;

  function fire(text: string) {
    const t = text.trim();
    if (!t) return;
    onSend(t, {
      applyToSimilar,
      images: attach.items.length ? attach.items.map((a) => a.dataUrl) : undefined,
    });
  }

  function chip(c: (typeof QUICK)[number]) {
    if (c.prefill) {
      setNote((n) => (n ? n : c.instruction));
      const el = document.querySelector<HTMLTextAreaElement>("#od-comment-note");
      el?.focus();
      return;
    }
    fire(c.instruction);
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-start justify-center bg-black/30 p-4 pt-[10vh]" onClick={onCancel}>
      <div className="w-full max-w-sm rounded-2xl border border-border bg-bg p-4 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[13px] font-semibold text-text">Comment</p>
            <p className="mt-0.5 text-[12px] text-text-dim">
              {contextLabel} · <span className="text-text-faint">{preview}</span>
            </p>
          </div>
          <button onClick={onCancel} className="text-text-faint hover:text-text" aria-label="Close">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="mt-3 flex flex-wrap gap-1.5">
          {QUICK.map((c) => (
            <button
              key={c.label}
              onClick={() => chip(c)}
              className="rounded-full border border-border bg-panel px-2.5 py-1 text-[11.5px] text-text-dim transition-colors hover:border-accent/40 hover:text-text"
            >
              {c.label}
            </button>
          ))}
        </div>

        <textarea
          id="od-comment-note"
          autoFocus
          value={note}
          onChange={(e) => setNote(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) fire(note);
          }}
          rows={3}
          placeholder="…or describe the change. e.g. make this bigger, change the wording, use a different colour"
          className="mt-2.5 w-full resize-none rounded-lg border border-border bg-panel px-3 py-2 text-[13px] outline-none focus:border-accent/50"
        />

        {attach.items.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {attach.items.map((a) => (
              <div key={a.id} className="group relative h-12 w-12 overflow-hidden rounded-md border border-border">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={a.dataUrl} alt={a.name} className="h-full w-full object-cover" />
                <button
                  onClick={() => attach.remove(a.id)}
                  className="absolute right-0.5 top-0.5 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-black/60 text-white"
                  aria-label="Remove"
                >
                  <X className="h-2 w-2" />
                </button>
              </div>
            ))}
          </div>
        )}

        <label className="mt-2.5 flex cursor-pointer items-center gap-2 text-[12px] text-text-dim">
          <input
            type="checkbox"
            checked={applyToSimilar}
            onChange={(e) => setApplyToSimilar(e.target.checked)}
            className="h-3.5 w-3.5 accent-accent"
          />
          Apply to every element like this in the section
        </label>

        <div className="mt-3 flex items-center justify-between gap-2">
          <label className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-lg text-text-faint hover:bg-panel-2 hover:text-text" title="Attach a reference image">
            <ImagePlus className="h-4 w-4" />
            <input
              type="file"
              accept="image/*"
              multiple
              hidden
              onChange={(e) => {
                if (e.target.files?.length) attach.add(e.target.files);
                e.target.value = "";
              }}
            />
          </label>
          <div className="flex items-center gap-2">
            <button onClick={onCancel} className="rounded-lg px-3 py-2 text-[12.5px] font-medium text-text-faint hover:text-text">
              Cancel
            </button>
            <button
              onClick={() => fire(note)}
              disabled={!note.trim() && !attach.items.length}
              className="flex items-center gap-1.5 rounded-lg gradient-fill px-3.5 py-2 text-[12.5px] font-semibold text-white disabled:opacity-40"
            >
              <Send className="h-3.5 w-3.5" /> Send to Orbit
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
