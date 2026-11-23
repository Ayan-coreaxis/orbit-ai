"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { AlertTriangle, Bell, ClipboardCheck, MessageCircle, PackageX, ShoppingBag, Sparkles } from "lucide-react";
import type { Notice } from "@/lib/notifications";

const ICON = { order: ShoppingBag, flag: AlertTriangle, stock: PackageX, briefing: ClipboardCheck, proposal: Sparkles, message: MessageCircle };
const KEY = "orbit.notices.seen";

function ago(iso: string) {
  const m = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (m < 1) return "just now";
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} h ago`;
  return `${Math.round(h / 24)} d ago`;
}

/** Bell in the top bar: new orders, checks, stock, the daily store check, waiting proposals, messages. */
export function NotificationBell() {
  const [items, setItems] = useState<Notice[]>([]);
  const [open, setOpen] = useState(false);
  const [seen, setSeen] = useState<string>("");
  const ref = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    const r = await fetch("/api/notifications", { cache: "no-store" }).catch(() => null);
    if (r?.ok) setItems(((await r.json()) as { items: Notice[] }).items ?? []);
  }, []);

  useEffect(() => {
    try {
      setSeen(localStorage.getItem(KEY) ?? "");
    } catch {
      /* private mode */
    }
    void load();
    const t = setInterval(() => {
      if (!document.hidden) void load();
    }, 60_000);
    return () => clearInterval(t);
  }, [load]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const unread = items.filter((i) => i.at > seen).length;

  function markRead() {
    const latest = items[0]?.at ?? new Date().toISOString();
    setSeen(latest);
    try {
      localStorage.setItem(KEY, latest);
    } catch {
      /* private mode */
    }
  }

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className="relative flex h-10 w-10 items-center justify-center rounded-full text-text-dim transition-colors hover:bg-panel hover:text-text"
        aria-label={`Notifications${unread ? ` (${unread} new)` : ""}`}
        aria-expanded={open}
      >
        <Bell className={`h-[18px] w-[18px] ${unread ? "origin-top animate-[orbit-ring_1.2s_ease-in-out_1]" : ""}`} />
        {unread > 0 && (
          <span className="absolute right-1 top-1 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-tomato px-1 text-[11px] font-bold text-white ring-2 ring-[var(--panel)]">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>
      {open && (
        <div className="glass-solid orbit-scale-in absolute right-0 top-[calc(100%+10px)] z-50 w-[min(92vw,380px)] overflow-hidden rounded-[24px]">
          <div className="flex items-center justify-between px-5 pb-2 pt-4">
            <span className="text-[16px] font-semibold">Notifications</span>
            {unread > 0 && (
              <button onClick={markRead} className="text-[13.5px] font-medium text-text-dim hover:text-text">
                Mark all read
              </button>
            )}
          </div>
          {items.length === 0 ? (
            <p className="px-5 pb-6 pt-3 text-[14.5px] text-text-dim">You&apos;re all caught up.</p>
          ) : (
            <ul className="scrollbar-thin max-h-[60vh] overflow-y-auto px-2 pb-2">
              {items.map((n) => {
                const Icon = ICON[n.kind];
                const isNew = n.at > seen;
                return (
                  <li key={n.id}>
                    <Link href={n.href} onClick={() => setOpen(false)} className="flex items-start gap-3 rounded-[16px] px-3 py-3 transition-colors hover:bg-panel">
                      <span className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${n.kind === "flag" || n.kind === "stock" ? "bg-tomato-soft text-tomato-strong" : "bg-panel-2 text-accent"}`}>
                        <Icon className="h-4 w-4" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-2">
                          <span className="truncate text-[14.5px] font-semibold">{n.title}</span>
                          {isNew && <span className="h-2 w-2 shrink-0 rounded-full bg-tomato" />}
                        </span>
                        <span className="mt-0.5 block truncate text-[13.5px] text-text-dim">{n.body}</span>
                        <span className="mt-0.5 block text-[12.5px] text-text-faint">{ago(n.at)}</span>
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
