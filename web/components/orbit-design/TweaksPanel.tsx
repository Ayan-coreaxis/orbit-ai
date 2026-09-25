"use client";

import { useRef, useState } from "react";
import { X, Loader2, Sparkles } from "lucide-react";
import { TWEAK_TOKEN_MAP, type DesignTweak, type OrbitDesignDoc } from "@/lib/orbit-design";

/**
 * Claude-Design-style "Tweaks" — bespoke sliders/selects/colours the AI wired into THIS design,
 * each bound to a --tw-<key> CSS variable. Dragging streams the value straight into the preview
 * iframe; on release it's persisted.
 */
export function TweaksPanel({
  doc,
  onDoc,
  onClose,
}: {
  doc: OrbitDesignDoc;
  onDoc: (d: OrbitDesignDoc) => void;
  onClose: () => void;
}) {
  const tweaks = doc.tweaks ?? [];
  const [local, setLocal] = useState<Record<string, string>>(() =>
    Object.fromEntries(tweaks.map((t) => [t.key, t.value])),
  );
  const [request, setRequest] = useState("");
  const [adding, setAdding] = useState(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  function live(t: DesignTweak, value: string) {
    setLocal((m) => ({ ...m, [t.key]: value }));
    const win = typeof document !== "undefined" ? document.querySelector<HTMLIFrameElement>('iframe[title="Storefront preview"]') : null;
    try {
      const mapped = TWEAK_TOKEN_MAP[t.cssVar];
      for (const el of [win?.contentDocument?.documentElement, win?.contentDocument?.body]) {
        el?.style.setProperty(t.cssVar, value);
        if (mapped) el?.style.setProperty(mapped, value);
      }
    } catch {
      /* cross-origin guard — falls back to the re-render below */
    }
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => persist(t.key, value), 450);
  }

  async function persist(key: string, value: string) {
    onDoc({ ...doc, tweaks: (doc.tweaks ?? []).map((x) => (x.key === key ? { ...x, value } : x)) });
    fetch("/api/orbit-design", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tweak: { key, value } }),
    }).catch(() => {});
  }

  async function remove(key: string) {
    onDoc({ ...doc, tweaks: (doc.tweaks ?? []).filter((x) => x.key !== key) });
    fetch("/api/orbit-design", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ tweakRemove: key }) }).catch(() => {});
  }

  async function addControl() {
    if (!request.trim() || adding) return;
    setAdding(true);
    try {
      const res = await fetch("/api/orbit-design/tweaks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ request: request.trim() }),
      });
      const data = await res.json().catch(() => ({}));
      if (data.doc) {
        onDoc(data.doc);
        setLocal(Object.fromEntries((data.doc.tweaks ?? []).map((t: DesignTweak) => [t.key, t.value])));
        setRequest("");
      }
    } finally {
      setAdding(false);
    }
  }

  return (
    <div className="flex w-full shrink-0 flex-col border-l border-border bg-bg lg:w-[300px]">
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <span className="text-[13px] font-semibold">Tweaks</span>
        <button onClick={onClose} className="text-text-faint hover:text-text" aria-label="Close">
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="flex-1 space-y-5 overflow-y-auto p-4">
        {tweaks.length === 0 && (
          <p className="text-[12.5px] leading-relaxed text-text-dim">
            No controls yet. Describe what you want to be able to adjust and Orbit builds sliders for it —
            <span className="text-text-faint"> e.g. “let me change the hero height and the gap between product cards”.</span>
          </p>
        )}

        {tweaks.map((t) => {
          const v = local[t.key] ?? t.value;
          return (
            <div key={t.key}>
              <div className="mb-1.5 flex items-center justify-between">
                <span className="text-[12.5px] font-medium text-text">{t.label}</span>
                <div className="flex items-center gap-2">
                  <span className="text-[11px] tabular-nums text-text-faint">{v}</span>
                  <button onClick={() => remove(t.key)} className="text-text-faint hover:text-bad" aria-label="Remove">
                    <X className="h-3 w-3" />
                  </button>
                </div>
              </div>
              {t.type === "slider" && (
                <input
                  type="range"
                  min={t.min ?? 0}
                  max={t.max ?? 100}
                  step={t.step ?? 1}
                  value={parseFloat(v) || 0}
                  onChange={(e) => live(t, `${e.target.value}${t.unit ?? ""}`)}
                  className="w-full accent-accent"
                />
              )}
              {t.type === "select" && (
                <select
                  value={v}
                  onChange={(e) => live(t, e.target.value)}
                  className="w-full rounded-md border border-border bg-panel px-2 py-1.5 text-[12.5px] outline-none focus:border-accent/50"
                >
                  {(t.options ?? []).map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              )}
              {t.type === "color" && (
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    value={/^#[0-9a-f]{3,8}$/i.test(v) ? v : "#000000"}
                    onChange={(e) => live(t, e.target.value)}
                    className="h-7 w-8 shrink-0 rounded border border-border bg-transparent"
                  />
                  <input
                    value={v}
                    onChange={(e) => live(t, e.target.value)}
                    className="w-full rounded-md border border-border bg-panel px-2 py-1.5 text-[12.5px] outline-none focus:border-accent/50"
                  />
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="border-t border-border p-3">
        <textarea
          value={request}
          onChange={(e) => setRequest(e.target.value)}
          rows={2}
          placeholder="Add a control…"
          className="w-full resize-none rounded-lg border border-border bg-panel px-2.5 py-2 text-[12.5px] outline-none focus:border-accent/50"
        />
        <button
          onClick={addControl}
          disabled={adding || !request.trim()}
          className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-lg gradient-fill py-2 text-[12.5px] font-semibold text-white disabled:opacity-40"
        >
          {adding ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
          {adding ? "Building…" : "Add control"}
        </button>
      </div>
    </div>
  );
}
