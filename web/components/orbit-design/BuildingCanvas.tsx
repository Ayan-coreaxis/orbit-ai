"use client";

import { useEffect, useState } from "react";

/**
 * Shown on the canvas while the FIRST storefront is being generated — a skeleton wireframe whose
 * blocks snap in one after another so it reads as "assembling", never "stuck", and never leaks the
 * placeholder default store behind a blur.
 */
export function BuildingCanvas({
  label,
  variant = "grain",
  dark = false,
}: {
  label?: string;
  /** The small, deliberate difference between where this canvas shows up — Handoff gets a fine film-
   *  grain texture (wiring feels tactile/mechanical), Audit Design gets a soft blur (feels like a
   *  lens racking into focus as it inspects). Same skeleton underneath either way. */
  variant?: "grain" | "blur";
  /** Full-screen takeover context (Handoff / Audit) vs inline in the studio preview column. */
  dark?: boolean;
}) {
  const [n, setN] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setN((v) => (v + 1) % 9), 900);
    return () => clearInterval(t);
  }, []);

  const on = (i: number) => n >= i || n < 1;

  return (
    <div
      className={`od-bc-enter relative flex h-full w-full max-w-[1280px] flex-col overflow-hidden rounded-xl border ${dark ? "border-white/10 bg-white shadow-[0_40px_120px_-20px_rgba(0,0,0,.6)]" : "border-border bg-white"} ${variant === "blur" ? "od-bc-blur" : "od-bc-grain"}`}
    >
      {/* faux browser chrome */}
      <div className="flex items-center gap-1.5 border-b border-black/5 bg-[#faf9f7] px-3 py-2">
        <span className="h-2.5 w-2.5 rounded-full bg-black/10" />
        <span className="h-2.5 w-2.5 rounded-full bg-black/10" />
        <span className="h-2.5 w-2.5 rounded-full bg-black/10" />
        <div className="ml-3 h-4 flex-1 max-w-[220px] rounded bg-black/[.05]" />
      </div>

      <div className="flex-1 overflow-hidden p-6 sm:p-10">
        {/* header row */}
        <Row show={on(1)} className="mb-10 flex items-center justify-between">
          <div className="h-5 w-28 rounded bg-black/[.07]" />
          <div className="flex gap-4">
            <div className="h-3.5 w-14 rounded bg-black/[.05]" />
            <div className="h-3.5 w-14 rounded bg-black/[.05]" />
            <div className="h-3.5 w-14 rounded bg-black/[.05]" />
          </div>
        </Row>

        {/* hero */}
        <Row show={on(2)} className="mb-12 grid gap-8 md:grid-cols-[1.1fr_.9fr]">
          <div>
            <div className="mb-4 h-3 w-24 rounded bg-[color:var(--accent-soft,#e9d9d2)]" />
            <div className="mb-3 h-9 w-full rounded bg-black/[.08]" />
            <div className="mb-3 h-9 w-4/5 rounded bg-black/[.08]" />
            <div className="mb-6 h-4 w-3/4 rounded bg-black/[.05]" />
            <div className="h-11 w-40 rounded-lg bg-black/[.12]" />
          </div>
          <div className="h-52 rounded-xl bg-gradient-to-br from-black/[.06] to-black/[.03]" />
        </Row>

        {/* feature grid */}
        <Row show={on(4)} className="mb-12 grid gap-5 sm:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="rounded-xl border border-black/[.06] p-5">
              <div className="mb-4 h-9 w-9 rounded-lg bg-black/[.08]" />
              <div className="mb-2 h-4 w-3/4 rounded bg-black/[.07]" />
              <div className="h-3 w-full rounded bg-black/[.04]" />
              <div className="mt-1.5 h-3 w-5/6 rounded bg-black/[.04]" />
            </div>
          ))}
        </Row>

        {/* band */}
        <Row show={on(6)} className="mb-12 rounded-xl bg-black/[.03] p-8">
          <div className="mx-auto mb-3 h-6 w-1/2 rounded bg-black/[.07]" />
          <div className="mx-auto h-3 w-2/3 rounded bg-black/[.04]" />
          <div className="mx-auto mt-1.5 h-3 w-1/2 rounded bg-black/[.04]" />
        </Row>

        {/* card row */}
        <Row show={on(7)} className="grid gap-5 sm:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <div key={i}>
              <div className="mb-3 aspect-square rounded-lg bg-black/[.05]" />
              <div className="h-3.5 w-3/4 rounded bg-black/[.06]" />
            </div>
          ))}
        </Row>
      </div>

      {/* sweep */}
      <div className="pointer-events-none absolute inset-x-0 top-0 h-[3px] overflow-hidden">
        <div className="h-full w-1/4 animate-[od-sweep_1.3s_ease-in-out_infinite] bg-accent" />
      </div>

      {label && (
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 rounded-full border border-border bg-panel/95 px-3.5 py-1.5 text-[12px] font-medium text-text shadow-sm backdrop-blur">
          {label}
        </div>
      )}

      <style>{`
        @keyframes od-sweep{0%{transform:translateX(-100%)}100%{transform:translateX(500%)}}
        @keyframes od-skel{0%,100%{opacity:1}50%{opacity:.55}}
        @keyframes od-bc-rise{0%{opacity:0;transform:translateY(46px) scale(.98)}100%{opacity:1;transform:translateY(0) scale(1)}}
        .od-bc-enter{animation:od-bc-rise .7s cubic-bezier(.2,.8,.2,1) both}
        .od-bc-grain{position:relative}
        .od-bc-grain::after{content:"";position:absolute;inset:0;pointer-events:none;opacity:.05;mix-blend-mode:overlay;background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='120' height='120'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E")}
        .od-bc-blur{filter:blur(3px) saturate(1.05);animation:od-bc-rise .7s cubic-bezier(.2,.8,.2,1) both,od-bc-focus 1.6s .35s cubic-bezier(.2,.8,.2,1) both}
        @keyframes od-bc-focus{to{filter:blur(0) saturate(1)}}
        @media (prefers-reduced-motion:reduce){.od-bc-enter,.od-bc-blur{animation:none!important;filter:none!important}}
      `}</style>
    </div>
  );
}

function Row({ show, className, children }: { show: boolean; className?: string; children: React.ReactNode }) {
  return (
    <div
      className={className}
      style={{
        opacity: show ? 1 : 0,
        transform: show ? "none" : "translateY(14px)",
        transition: "opacity .5s cubic-bezier(.4,0,.2,1), transform .5s cubic-bezier(.4,0,.2,1)",
        animation: show ? "od-skel 1.8s ease-in-out infinite" : undefined,
      }}
    >
      {children}
    </div>
  );
}
