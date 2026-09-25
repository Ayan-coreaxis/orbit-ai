"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import { faqs } from "@/lib/mock-data";

export function Faq() {
  const [open, setOpen] = useState<number | null>(0);

  return (
    <div className="divide-y divide-zinc-800 rounded-2xl border border-zinc-800 bg-zinc-900/40">
      {faqs.map((f, i) => {
        const isOpen = open === i;
        return (
          <div key={f.q}>
            <button
              onClick={() => setOpen(isOpen ? null : i)}
              className="flex w-full items-center justify-between gap-4 px-6 py-5 text-left"
            >
              <span className="text-[15px] font-medium text-zinc-100">{f.q}</span>
              <Plus
                className={cn(
                  "h-4 w-4 shrink-0 text-zinc-500 transition-transform duration-300",
                  isOpen && "rotate-45 text-fuchsia-400",
                )}
              />
            </button>
            <div
              className="grid overflow-hidden transition-all duration-300 ease-out"
              style={{ gridTemplateRows: isOpen ? "1fr" : "0fr" }}
            >
              <div className="overflow-hidden">
                <p className="px-6 pb-5 text-[14px] leading-relaxed text-zinc-400">{f.a}</p>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
