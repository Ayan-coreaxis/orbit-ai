"use client";

import { useEffect, useRef } from "react";
import { gsap } from "gsap";

export interface RealFeedItem {
  id: string;
  agentLabel: string;
  when: string;
}

export function LiveFeed({ items }: { items: RealFeedItem[] }) {
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const first = listRef.current?.firstElementChild;
    if (!first) return;
    gsap.fromTo(
      first,
      { opacity: 0, y: -10 },
      { opacity: 1, y: 0, duration: 0.5, ease: "power2.out" },
    );
  }, [items]);

  return (
    <div>
      <div className="flex items-center gap-2">
        <span className="relative flex h-1.5 w-1.5">
          {items.length > 0 && (
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-good opacity-60" />
          )}
          <span className={`relative inline-flex h-1.5 w-1.5 rounded-full ${items.length > 0 ? "bg-good" : "bg-text-faint"}`} />
        </span>
        <span className="text-[13px] font-semibold uppercase tracking-[0.04em] text-text-dim">
          Real agent activity
        </span>
      </div>
      <div ref={listRef} className="mt-4 space-y-0.5">
        {items.length === 0 && (
          <p className="px-2.5 py-2.5 text-[13px] leading-snug text-text-faint">
            No agent calls yet — this fills in once your AI team starts working.
          </p>
        )}
        {items.map((item) => (
          <div key={item.id} className="rounded-lg px-2.5 py-2.5">
            <p className="text-[13px] leading-snug text-text">
              <span className="font-medium">{item.agentLabel}</span>
              <span className="text-text-dim"> did some work</span>
            </p>
            <p className="mt-0.5 text-[11px] text-text-faint">{item.when}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
