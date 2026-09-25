"use client";

import { useState } from "react";
import { X, Plus, Trash2, Loader2 } from "lucide-react";
import type { NavShow, OrbitDesignDoc } from "@/lib/orbit-design";

const CORE = ["home", "store", "about", "contact", "cart", "checkout", "product", "account", "login"];
const NAV_OPTS: { value: NavShow; label: string }[] = [
  { value: "always", label: "Always" },
  { value: "afterLogin", label: "After login" },
  { value: "never", label: "Hidden" },
];

/**
 * "Pages" panel — per-page nav visibility (always / after login / hidden), rename, and
 * add / delete custom pages. All edits are LLM-free PATCHes to /api/orbit-design.
 * Setting nav visibility locks the choice so a future regen won't override it.
 */
export function PagesPanel({
  doc,
  onDoc,
  onClose,
  onBuildPage,
}: {
  doc: OrbitDesignDoc;
  onDoc: (d: OrbitDesignDoc) => void;
  onClose: () => void;
  /** hand a custom page's build brief to the chat/generator */
  onBuildPage?: (slug: string, title: string, prompt: string) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [buildPrompt, setBuildPrompt] = useState<Record<string, string>>({});

  async function patch(body: Record<string, unknown>) {
    setBusy(true);
    try {
      const res = await fetch("/api/orbit-design", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (data.doc) onDoc(data.doc);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex h-full w-[320px] shrink-0 flex-col border-l border-border bg-panel">
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <div className="text-[13px] font-semibold uppercase tracking-[0.04em] text-text-dim">Pages</div>
        <button onClick={onClose} className="text-text-faint hover:text-text" aria-label="Close pages panel">
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="flex-1 space-y-4 overflow-y-auto p-4">
        {doc.pages.map((p) => {
          const core = CORE.includes(p.slug) || p.pageType !== "custom";
          const navShow: NavShow = p.navShow ?? (p.nav ? "always" : "never");
          return (
            <div key={p.slug} className="rounded-lg border border-border bg-panel-2 p-3">
              <div className="flex items-center gap-2">
                <input
                  defaultValue={p.title}
                  onBlur={(e) => {
                    const t = e.target.value.trim();
                    if (t && t !== p.title) patch({ pageNav: { slug: p.slug, navShow, title: t } });
                  }}
                  className="min-w-0 flex-1 rounded-md border border-transparent bg-transparent px-1 py-0.5 text-[13px] font-medium outline-none hover:border-border focus:border-accent/50"
                />
                {!core && (
                  <button
                    onClick={() => confirm(`Delete the "${p.title}" page?`) && patch({ pageDelete: p.slug })}
                    className="text-text-faint hover:text-bad"
                    aria-label="Delete page"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
              <div className="mt-0.5 px-1 text-[11px] text-text-faint">
                /{p.slug === "home" ? "" : p.slug} · {p.pageType ?? "page"}
              </div>
              <div className="mt-2 flex gap-1">
                {NAV_OPTS.map((o) => (
                  <button
                    key={o.value}
                    disabled={busy}
                    onClick={() => patch({ pageNav: { slug: p.slug, navShow: o.value } })}
                    className={`flex-1 rounded-md border px-1.5 py-1 text-[11.5px] font-medium transition-colors ${
                      navShow === o.value
                        ? "border-accent/40 bg-accent-soft text-accent-strong"
                        : "border-border text-text-dim hover:text-text"
                    }`}
                  >
                    {o.label}
                  </button>
                ))}
              </div>
              {p.navLocked && (
                <div className="mt-1.5 flex items-center gap-2 px-1 text-[10.5px] text-text-faint">
                  <span>Locked — regen won&apos;t change this</span>
                  <button onClick={() => patch({ pageNavAuto: p.slug })} className="underline hover:text-text">
                    Reset to auto
                  </button>
                </div>
              )}

              {!core && onBuildPage && p.sections.length <= 1 && (
                <div className="mt-2.5 border-t border-border pt-2.5">
                  <textarea
                    value={buildPrompt[p.slug] ?? ""}
                    onChange={(e) => setBuildPrompt((b) => ({ ...b, [p.slug]: e.target.value }))}
                    rows={2}
                    placeholder={`What should the ${p.title} page show? e.g. a hero, all men's-wear products, a sizing guide…`}
                    className="w-full resize-none rounded-lg border border-border bg-panel px-2.5 py-2 text-[12px] outline-none focus:border-accent/50"
                  />
                  <button
                    disabled={!(buildPrompt[p.slug] ?? "").trim()}
                    onClick={() => {
                      onBuildPage(p.slug, p.title, (buildPrompt[p.slug] ?? "").trim());
                      onClose();
                    }}
                    className="mt-1.5 rounded-lg gradient-fill px-3 py-1.5 text-[12px] font-semibold text-white disabled:opacity-40"
                  >
                    Build with Orbit
                  </button>
                </div>
              )}
            </div>
          );
        })}

        <div className="rounded-lg border border-dashed border-border p-3">
          <div className="mb-2 text-[12px] font-semibold text-text-faint">Add a page</div>
          <div className="flex gap-2">
            <input
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              placeholder="e.g. Men's Wear"
              className="min-w-0 flex-1 rounded-lg border border-border bg-panel-2 px-2.5 py-2 text-[13px] outline-none focus:border-accent/50"
            />
            <button
              disabled={busy || !newTitle.trim()}
              onClick={() => {
                patch({ pageAdd: { title: newTitle.trim() } });
                setNewTitle("");
              }}
              className="flex items-center gap-1 rounded-lg gradient-fill px-2.5 text-[12.5px] font-semibold text-white disabled:opacity-40"
            >
              {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
            </button>
          </div>
          <p className="mt-2 text-[11px] leading-relaxed text-text-faint">
            A blank page is created and added to the nav. Describe it in chat and Orbit will build it.
          </p>
        </div>
      </div>
    </div>
  );
}
