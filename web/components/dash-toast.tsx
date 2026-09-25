"use client";

import { useCallback, useRef, useState } from "react";
import { cn } from "@/lib/utils";

export interface DashToastItem {
  id: number;
  text: string;
  kind: "ok" | "err";
  leaving?: boolean;
}

/** Dashboard-side "Saved" / "Update failed" toast — replaces raw browser alert()s in the seller's own
 *  dashboard (OrdersManager, ReturnsManager, …). `push(text)` for success, `push(text, "err")` for an
 *  error; auto-dismisses after ~3.2s. Render `<DashToastHost items={items}/>` once near the panel root. */
export function useDashToast(): [DashToastItem[], (text: string, kind?: "ok" | "err") => void] {
  const [items, setItems] = useState<DashToastItem[]>([]);
  const nextId = useRef(0);

  const push = useCallback((text: string, kind: "ok" | "err" = "ok") => {
    const id = ++nextId.current;
    setItems((cur) => [...cur, { id, text, kind }]);
    setTimeout(() => {
      setItems((cur) => cur.map((t) => (t.id === id ? { ...t, leaving: true } : t)));
      setTimeout(() => setItems((cur) => cur.filter((t) => t.id !== id)), 180);
    }, 3200);
  }, []);

  return [items, push];
}

export function DashToastHost({ items }: { items: DashToastItem[] }) {
  if (!items.length) return null;
  return (
    <div className="fixed bottom-6 left-1/2 z-[9999] grid -translate-x-1/2 gap-2 justify-items-center" aria-live="polite">
      {items.map((t) => (
        <div
          key={t.id}
          className={cn(
            "rounded-lg px-4 py-2.5 text-[13px] font-medium shadow-lg transition-all",
            t.kind === "err" ? "bg-bad text-white" : "bg-text text-panel",
            t.leaving ? "translate-y-1.5 scale-[.97] opacity-0" : "translate-y-0 scale-100 opacity-100",
          )}
        >
          {t.text}
        </div>
      ))}
    </div>
  );
}
