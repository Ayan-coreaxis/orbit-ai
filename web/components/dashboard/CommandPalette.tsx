"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowRight, Clapperboard, Globe, MessageSquarePlus, Package, Search, Truck } from "lucide-react";
import { NAV_ITEMS } from "@/components/dashboard/nav";

type Entry = { label: string; hint: string; href: string; icon: React.ComponentType<{ className?: string }>; keywords: string };

const ACTIONS: Entry[] = [
  { label: "Ask the Orchestrator", hint: "Action", href: "/dashboard/orchestrator", icon: MessageSquarePlus, keywords: "ask chat question plan" },
  { label: "Make a photo or reel", hint: "Action", href: "/dashboard/content", icon: Clapperboard, keywords: "studio create reel image video" },
  { label: "Add a product", hint: "Action", href: "/dashboard/store", icon: Package, keywords: "new product add item" },
  { label: "Connect a courier", hint: "Action", href: "/dashboard/settings", icon: Truck, keywords: "postex leopards tcs courier" },
  { label: "Connect your domain", hint: "Action", href: "/dashboard/settings", icon: Globe, keywords: "domain dns website address" },
];

/** ⌘K / Ctrl+K: jump to any page or common action. Arrow keys + Enter, Esc to close. */
export function CommandPalette({ open, onClose }: { open: boolean; onClose: () => void }) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [sel, setSel] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const entries = useMemo<Entry[]>(() => {
    const pages: Entry[] = NAV_ITEMS.map((n) => ({ label: n.label, hint: "Page", href: n.href, icon: n.icon, keywords: n.keywords ?? "" }));
    const all = [...pages, ...ACTIONS];
    const t = q.trim().toLowerCase();
    if (!t) return all;
    return all.filter((e) => `${e.label} ${e.keywords}`.toLowerCase().includes(t));
  }, [q]);

  // Reset the query / selection each time it opens (render-time, no effect needed).
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setQ("");
      setSel(0);
    }
  }
  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 10);
  }, [open]);

  if (!open) return null;

  function go(e: Entry | undefined) {
    if (!e) return;
    onClose();
    router.push(e.href);
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-start justify-center px-4 pt-[12vh]" role="dialog" aria-modal="true" aria-label="Search">
      <button className="orbit-fade absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} aria-label="Close search" />
      <div className="orbit-scale-in relative w-full max-w-lg overflow-hidden rounded-2xl border border-border bg-panel shadow-2xl">
        <div className="flex items-center gap-3 border-b border-border px-4">
          <Search className="h-4.5 w-4.5 text-text-faint" />
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setSel(0);
            }}
            onKeyDown={(e) => {
              if (e.key === "Escape") onClose();
              else if (e.key === "ArrowDown") {
                e.preventDefault();
                setSel((s) => Math.min(s + 1, entries.length - 1));
              } else if (e.key === "ArrowUp") {
                e.preventDefault();
                setSel((s) => Math.max(s - 1, 0));
              } else if (e.key === "Enter") go(entries[sel]);
            }}
            placeholder="Search pages and actions…"
            className="h-12 flex-1 bg-transparent text-[15px] outline-none placeholder:text-text-faint"
          />
          <kbd className="rounded-md border border-border px-1.5 py-0.5 text-[10.5px] text-text-faint">Esc</kbd>
        </div>
        <ul className="scrollbar-thin max-h-[50vh] overflow-y-auto p-2">
          {entries.length === 0 && <li className="px-3 py-6 text-center text-[13.5px] text-text-faint">Nothing matches “{q}”.</li>}
          {entries.map((e, i) => {
            const Icon = e.icon;
            return (
              <li key={`${e.hint}-${e.label}`}>
                <button
                  onMouseEnter={() => setSel(i)}
                  onClick={() => go(e)}
                  className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-[14px] transition-colors ${i === sel ? "bg-accent-soft text-accent-strong" : "text-text-dim"}`}
                >
                  <Icon className="h-4 w-4 shrink-0" />
                  <span className="flex-1">{e.label}</span>
                  <span className="text-[11px] text-text-faint">{e.hint}</span>
                  {i === sel && <ArrowRight className="h-3.5 w-3.5" />}
                </button>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
