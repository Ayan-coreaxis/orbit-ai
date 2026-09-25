"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Monitor, Smartphone, ExternalLink, Sparkles } from "lucide-react";
import { renderPageDocument, type OrbitDesignDoc, type StorefrontProduct } from "@/lib/orbit-design";
import { BuildingCanvas } from "./BuildingCanvas";

export interface CommentTarget {
  block: string | null; // nearest data-od-block section id (e.g. "s:hero" / "header")
  tag: string;
  role: string; // "heading" | "button/link" | "image" | "text" | …
  text: string; // up to 120 chars of the element's text / image brief
}

export interface PickTarget {
  block: string; // "s:<id>" | "header" | "footer"
  path: number[]; // nth-child indices from the block wrapper
  tag: string;
  role: string;
  style: string; // the element's current inline style string
  text: string; // short label text
  fullText: string; // the element's full text content — "" when it has element children (not directly text-editable)
  videoSlot: string; // the video-slot brief when the picked element is a data-video-slot placeholder, else ""
  imgSlot: string; // the image-slot brief when the picked element is a data-img-slot placeholder, else ""
  curSrc: string; // the current image/video src on the picked media element, if any
}

export function PreviewPane({
  doc,
  products,
  businessId,
  published,
  pageSlug,
  currency,
  onNavigate,
  editMode,
  onPick,
  commentMode,
  onComment,
  busy,
  hasDesign = true,
  freshBuild,
}: {
  doc: OrbitDesignDoc;
  products: StorefrontProduct[];
  businessId: string;
  published: boolean;
  pageSlug: string;
  currency?: string;
  onNavigate?: (slug: string) => void;
  editMode?: boolean;
  onPick?: (p: PickTarget) => void;
  commentMode?: boolean;
  onComment?: (t: CommentTarget) => void;
  /** a chat turn is generating right now */
  busy?: boolean;
  /** at least one design pass has completed — false means show the empty state instead of the default doc */
  hasDesign?: boolean;
  /** a whole-store (re)build is in flight right now — show the assembling skeleton even if there's
   *  older content still sitting in `doc`, since that content is about to be entirely replaced and a
   *  stale page behind a thin sweep bar reads as broken/half-finished rather than "building". */
  freshBuild?: boolean;
}) {
  const [view, setView] = useState<"desktop" | "mobile">("desktop");
  const iframeRef = useRef<HTMLIFrameElement | null>(null);

  const srcDoc = useMemo(
    () => renderPageDocument(doc, { products, businessId, pageSlug, currency, preview: true }),
    [doc, products, businessId, pageSlug, currency],
  );

  // The preview iframe posts here when a nav link inside it is clicked.
  useEffect(() => {
    function onMsg(e: MessageEvent) {
      const d = e.data as
        | { __odPreview?: string; slug?: string; block?: string; path?: number[]; tag?: string; role?: string; text?: string; style?: string; fullText?: string; videoSlot?: string; imgSlot?: string; curSrc?: string }
        | null;
      if (!d) return;
      if (d.__odPreview === "nav" && typeof d.slug === "string") onNavigate?.(d.slug);
      if (d.__odPreview === "pick" && typeof d.block === "string" && Array.isArray(d.path))
        onPick?.({ block: d.block, path: d.path, tag: d.tag ?? "", role: d.role ?? "element", style: d.style ?? "", text: d.text ?? "", fullText: d.fullText ?? "", videoSlot: d.videoSlot ?? "", imgSlot: d.imgSlot ?? "", curSrc: d.curSrc ?? "" });
      if (d.__odPreview === "comment")
        onComment?.({ block: d.block ?? null, tag: d.tag ?? "", role: d.role ?? "element", text: d.text ?? "" });
    }
    window.addEventListener("message", onMsg);
    return () => window.removeEventListener("message", onMsg);
  }, [onNavigate, onPick, onComment]);

  // Push the current picking mode into the iframe whenever it changes (or the doc re-renders).
  const mode = editMode ? "edit" : commentMode ? "comment" : "";
  useEffect(() => {
    iframeRef.current?.contentWindow?.postMessage({ __od: "mode", mode }, "*");
  }, [mode, srcDoc]);

  const liveHref = pageSlug === "home" ? `/store/${businessId}` : `/store/${businessId}/p/${pageSlug}`;

  return (
    <div className="flex h-full flex-col bg-panel-2">
      <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-2.5">
        <div className="flex items-center gap-2">
          <select
            value={pageSlug}
            onChange={(e) => onNavigate?.(e.target.value)}
            className="max-w-[160px] rounded-lg border border-border bg-panel px-2.5 py-1.5 text-[12.5px] font-medium text-text outline-none focus:border-accent/50"
            aria-label="Preview page"
          >
            {doc.pages.map((p) => (
              <option key={p.slug} value={p.slug}>
                {p.title}
              </option>
            ))}
          </select>
          <div className="flex items-center gap-1 rounded-lg border border-border bg-panel p-0.5">
          {(["desktop", "mobile"] as const).map((v) => {
            const Icon = v === "desktop" ? Monitor : Smartphone;
            return (
              <button
                key={v}
                onClick={() => setView(v)}
                aria-pressed={view === v}
                className={`flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-[12.5px] font-medium capitalize transition-colors ${
                  view === v ? "bg-accent-soft text-accent-strong" : "text-text-dim hover:text-text"
                }`}
              >
                <Icon className="h-3.5 w-3.5" /> {v}
              </button>
            );
          })}
          </div>
        </div>
        <div className="flex items-center gap-3">
          {commentMode && <span className="text-[12px] font-medium text-accent-strong">Click anything to comment</span>}
          {published && (
            <a href={liveHref} target="_blank" rel="noreferrer" className="flex items-center gap-1.5 text-[12.5px] font-medium text-text-dim hover:text-text">
              Open live <ExternalLink className="h-3.5 w-3.5" />
            </a>
          )}
        </div>
      </div>

      <div className="relative flex flex-1 items-start justify-center overflow-auto p-4 sm:p-6">
        {!hasDesign && !busy ? (
          <div className="flex h-full w-full max-w-md flex-col items-center justify-center gap-3 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl border border-border bg-panel">
              <Sparkles className="h-5 w-5 text-text-faint" />
            </div>
            <p className="text-[14px] font-medium text-text">Your storefront will appear here</p>
            <p className="text-[12.5px] text-text-dim">Describe it in the chat — a screenshot or a link to a site you like works too.</p>
          </div>
        ) : busy && (!hasDesign || freshBuild) ? (
          <BuildingCanvas label="Designing your storefront…" />
        ) : (
          <div
            className="relative overflow-hidden rounded-xl border border-border bg-white shadow-lg transition-all"
            style={{ width: view === "mobile" ? 390 : "100%", maxWidth: view === "mobile" ? 390 : 1280, height: "100%" }}
          >
            <iframe
              ref={iframeRef}
              title="Storefront preview"
              srcDoc={srcDoc}
              onLoad={() => iframeRef.current?.contentWindow?.postMessage({ __od: "mode", mode }, "*")}
              className="h-full w-full"
              sandbox="allow-same-origin allow-scripts allow-popups"
            />
            {busy && (
              <div className="pointer-events-none absolute inset-x-0 top-0 h-1 overflow-hidden">
                <div className="h-full w-1/3 animate-[od-sweep_1.3s_ease-in-out_infinite] bg-accent" />
              </div>
            )}
          </div>
        )}
      </div>
      <style>{`@keyframes od-sweep{0%{transform:translateX(-100%)}100%{transform:translateX(400%)}}`}</style>
    </div>
  );
}
