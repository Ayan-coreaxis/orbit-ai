"use client";

import { useEffect, useState } from "react";
import { Check, Clapperboard, Image as ImageIcon, Megaphone, MessageCircle, Sparkles } from "lucide-react";

/**
 * The hero's product demo: a scripted Orchestrator conversation that plays on a loop —
 * question → plan → a proposal the seller approves → the team gets to work.
 * Illustrative (labelled as such), no live data.
 */

const STEPS = 7;
const TIMING = [700, 1500, 1400, 1700, 1300, 1100, 3600]; // ms each step stays before the next

export function HeroDemo() {
  const [step, setStep] = useState(0);

  useEffect(() => {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce) {
      const t = setTimeout(() => setStep(STEPS - 1), 0);
      return () => clearTimeout(t);
    }
    const t = setTimeout(() => setStep((s) => (s + 1) % STEPS), TIMING[step]);
    return () => clearTimeout(t);
  }, [step]);

  const applied = step >= 4;

  return (
    <div className="relative mx-auto w-full max-w-[560px]">
      {/* glow */}
      <div className="pointer-events-none absolute -inset-10 rounded-[40px] bg-gradient-to-br from-violet-600/25 via-fuchsia-500/15 to-orange-400/20 blur-3xl" />

      <div className="relative overflow-hidden rounded-3xl border border-white/10 bg-zinc-950/80 shadow-[0_30px_80px_-20px_rgba(0,0,0,0.8)] backdrop-blur-xl">
        {/* window bar */}
        <div className="flex items-center justify-between border-b border-white/5 px-4 py-3">
          <div className="flex items-center gap-2">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-br from-violet-500 via-fuchsia-500 to-orange-400">
              <Sparkles className="h-3.5 w-3.5 text-white" />
            </span>
            <div>
              <div className="text-[12.5px] font-semibold text-white">Your Orchestrator</div>
              <div className="flex items-center gap-1 text-[10.5px] text-emerald-400">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse-dot" /> working on your store
              </div>
            </div>
          </div>
          <span className="rounded-full border border-white/10 px-2 py-0.5 text-[10px] text-zinc-500">demo</span>
        </div>

        <div className="flex min-h-[340px] flex-col gap-3 p-4 text-left">
          {/* seller */}
          <div className="orbit-fade-up ml-auto max-w-[80%] rounded-2xl rounded-br-md bg-white px-3.5 py-2.5 text-[13px] text-zinc-900">
            Eid aa rahi hai — lawn suits ki sale kaise barhayein?
          </div>

          {/* typing */}
          {step === 1 && (
            <div className="orbit-fade flex w-16 items-center justify-center gap-1 rounded-2xl rounded-bl-md bg-zinc-800/80 px-3 py-3">
              {[0, 1, 2].map((i) => (
                <span key={i} className="h-1.5 w-1.5 rounded-full bg-zinc-400 animate-pulse-dot" style={{ animationDelay: `${i * 0.2}s` }} />
              ))}
            </div>
          )}

          {step >= 2 && (
            <div className="orbit-fade-up max-w-[88%] rounded-2xl rounded-bl-md bg-zinc-800/80 px-3.5 py-2.5 text-[13px] leading-relaxed text-zinc-200">
              Your 3-piece lawn is your best seller — 41% of last month&apos;s orders. Let&apos;s push it as an <b className="text-white">Eid bundle</b>: new
              photos + a reel, posted on Instagram, and an ad for Lahore &amp; Karachi.
            </div>
          )}

          {step >= 3 && (
            <div className="orbit-scale-in max-w-[88%] rounded-2xl border border-fuchsia-500/30 bg-fuchsia-500/[0.07] p-3">
              <div className="text-[11px] font-semibold uppercase tracking-wide text-fuchsia-300">Ready when you are</div>
              <ul className="mt-2 space-y-1.5 text-[12.5px] text-zinc-300">
                <li className="flex items-center gap-2">
                  <ImageIcon className="h-3.5 w-3.5 text-fuchsia-300" /> 3 product photos, Eid theme
                </li>
                <li className="flex items-center gap-2">
                  <Clapperboard className="h-3.5 w-3.5 text-fuchsia-300" /> 15-second reel with voice-over
                </li>
                <li className="flex items-center gap-2">
                  <Megaphone className="h-3.5 w-3.5 text-fuchsia-300" /> Meta ad · Rs 1,500/day · <span className="text-zinc-500">paused</span>
                </li>
              </ul>
              <div className="mt-3 flex gap-2">
                <span
                  className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[12px] font-semibold transition-all duration-300 ${
                    applied ? "bg-emerald-500 text-white" : step === 3 ? "bg-white text-zinc-900 ring-4 ring-fuchsia-500/30" : "bg-white text-zinc-900"
                  }`}
                >
                  {applied ? (
                    <>
                      <Check className="h-3.5 w-3.5" /> Applied
                    </>
                  ) : (
                    "Apply"
                  )}
                </span>
                {!applied && <span className="rounded-lg border border-white/10 px-3 py-1.5 text-[12px] text-zinc-400">Change something</span>}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* what the team did after Apply */}
      <div className="relative mt-3 grid min-h-[56px] gap-2 sm:grid-cols-3">
        {step >= 5 && <Chip icon={<Clapperboard className="h-3.5 w-3.5" />} title="Reel ready" sub="Posted to Instagram" tone="violet" />}
        {step >= 5 && <Chip icon={<MessageCircle className="h-3.5 w-3.5" />} title="Order confirmed" sub="WhatsApp · Rs 7,450 COD" tone="green" />}
        {step >= 6 && <Chip icon={<Megaphone className="h-3.5 w-3.5" />} title="Ad built" sub="Paused — you activate" tone="amber" />}
      </div>
    </div>
  );
}

function Chip({ icon, title, sub, tone }: { icon: React.ReactNode; title: string; sub: string; tone: "violet" | "amber" | "green" }) {
  const c = tone === "violet" ? "bg-violet-500/15 text-violet-300" : tone === "amber" ? "bg-amber-500/15 text-amber-300" : "bg-emerald-500/15 text-emerald-300";
  return (
    <div className="orbit-scale-in flex items-center gap-2.5 rounded-2xl border border-white/10 bg-zinc-900/90 p-2.5 shadow-2xl backdrop-blur-xl">
      <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-xl ${c}`}>{icon}</span>
      <div className="min-w-0">
        <div className="truncate text-[12px] font-semibold text-white">{title}</div>
        <div className="truncate text-[11px] text-zinc-500">{sub}</div>
      </div>
    </div>
  );
}
