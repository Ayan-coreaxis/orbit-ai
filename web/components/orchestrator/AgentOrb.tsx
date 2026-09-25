"use client";

import { useEffect, useState } from "react";
import { ThinkingOrb, type OrbState } from "thinking-orbs";

export type { OrbState };

/** The app marks light mode with data-theme="light" on <html>; dark has no attribute. */
function useAppTheme(): "dark" | "light" {
  const [theme, setTheme] = useState<"dark" | "light">("dark");
  useEffect(() => {
    const el = document.documentElement;
    const read = () => setTheme(el.getAttribute("data-theme") === "light" ? "light" : "dark");
    read();
    const obs = new MutationObserver(read);
    obs.observe(el, { attributes: true, attributeFilter: ["data-theme"] });
    return () => obs.disconnect();
  }, []);
  return theme;
}

/** Dotted "thinking" orb tinted with Orbit's accent, following the app's own light/dark toggle. */
export function AgentOrb({ state, size = 32, label }: { state: OrbState; size?: 64 | 32 | 20; label?: string }) {
  const theme = useAppTheme();
  return (
    <ThinkingOrb
      state={state}
      size={size}
      theme={theme}
      color={theme === "light" ? "#a21caf" : "#e879f9"}
      aria-label={label}
      style={{ width: size, height: size, flex: "none" }}
    />
  );
}
