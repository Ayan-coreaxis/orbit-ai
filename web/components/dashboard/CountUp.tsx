"use client";

import { useEffect, useState } from "react";
import { money } from "@/lib/money";

/** Animates a number up from 0 when it first appears (formatted by `format`). */
export function CountUp({ value, format = "number", currency }: { value: number; format?: "number" | "money"; currency?: string }) {
  const [shown, setShown] = useState(0);
  useEffect(() => {
    // Safe to run twice (React dev mode): each run starts its own animation and cleans it up.
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches || value === 0) {
      const t = setTimeout(() => setShown(value), 0);
      return () => clearTimeout(t);
    }
    const t0 = performance.now();
    const dur = 900;
    let raf = 0;
    const tick = (t: number) => {
      const k = Math.min(1, (t - t0) / dur);
      setShown(value * (1 - Math.pow(1 - k, 3)));
      if (k < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value]);
  const n = Math.round(shown);
  if (format === "money") return <>{money(n, currency)}</>;
  return <>{n.toLocaleString()}</>;
}
