"use client";

import { useEffect, useState } from "react";

const SECTIONS = [
  ["plan", "Plan"],
  ["social", "Facebook & Instagram"],
  ["domain", "Domain"],
  ["payments", "Payments"],
  ["store", "Checkout & tracking"],
  ["look", "Store widgets"],
  ["courier", "Courier"],
  ["delivery", "Delivery zones"],
  ["team", "Team"],
  ["whatsapp", "WhatsApp"],
] as const;

/** Sticky chips that jump to each settings section and highlight the one on screen. */
export function SettingsNav() {
  const [active, setActive] = useState<string>("plan");
  useEffect(() => {
    const els = SECTIONS.map(([id]) => document.getElementById(id)).filter(Boolean) as HTMLElement[];
    const obs = new IntersectionObserver(
      (entries) => {
        const visible = entries.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
        if (visible) setActive(visible.target.id);
      },
      { rootMargin: "-80px 0px -60% 0px" },
    );
    els.forEach((el) => obs.observe(el));
    return () => obs.disconnect();
  }, []);
  return (
    <nav aria-label="Settings sections" className="sticky top-0 z-20 -mx-5 border-b border-border bg-bg/85 px-5 py-2.5 backdrop-blur-xl sm:-mx-8 sm:px-8 lg:-mx-10 lg:px-10">
      <div className="scrollbar-thin flex gap-1.5 overflow-x-auto">
        {SECTIONS.map(([id, label]) => (
          <a
            key={id}
            href={`#${id}`}
            onClick={(e) => {
              e.preventDefault();
              document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
              setActive(id);
            }}
            className={`shrink-0 whitespace-nowrap rounded-full px-3 py-1.5 text-[12.5px] font-medium transition-colors ${
              active === id ? "bg-accent text-white" : "bg-panel-2 text-text-dim hover:text-text"
            }`}
          >
            {label}
          </a>
        ))}
      </div>
    </nav>
  );
}
