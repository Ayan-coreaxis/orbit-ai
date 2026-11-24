"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Check, Loader2, Sparkles, Wand2 } from "lucide-react";
import { Button, Pill } from "@/components/ui";
import type { StudioFormat } from "@/lib/studio/formats";
import { DEMO_VIDEO, previewImage } from "@/lib/studio/previews";

export type DemoStage = "plan" | "making" | "done";

const MAKING = ["Reading your product…", "Setting the scene…", "Composing the shot…", "Final touches…"];

/**
 * A free, offline walk-through of one format: the director's plan → being made → the result. It uses
 * sample media and sample words, spends nothing and calls no AI — so anyone can see how Studio works
 * before they have a plan or a product photo.
 */
export function DemoBody({ format, stage, onDone }: { format: StudioFormat; stage: DemoStage; onDone: () => void }) {
  const [pct, setPct] = useState(0);
  useEffect(() => {
    if (stage !== "making") return;
    setPct(0);
    const t = setInterval(() => setPct((p) => Math.min(100, p + 4 + Math.random() * 5)), 220);
    return () => clearInterval(t);
  }, [stage]);
  useEffect(() => {
    if (stage === "making" && pct >= 100) {
      const t = setTimeout(onDone, 350);
      return () => clearTimeout(t);
    }
  }, [stage, pct, onDone]);

  const isVideo = format.kind === "video";
  const banner = (
    <div className="flex items-start gap-3 rounded-2xl bg-tomato-soft px-4 py-3 text-[14px] text-text">
      <Pill tone="warn">Demo</Pill>
      <span>Sample media and sample words — nothing is made, charged or sent. A real one uses your own product photos.</span>
    </div>
  );

  if (stage === "plan") {
    return (
      <div className="grid gap-5">
        {banner}
        <div className="overflow-hidden rounded-2xl border border-border bg-panel">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={previewImage(format.id)} alt="" className="aspect-[4/3] w-full object-cover" />
          <div className="grid gap-4 p-5">
            <div>
              <div className="text-[13.5px] font-medium text-text-dim">The director&apos;s plan</div>
              <h3 className="mt-1 text-[18px] font-semibold tracking-tight">{format.name} — sample plan</h3>
            </div>
            <ul className="grid gap-2">
              {format.look.map((l) => (
                <li key={l} className="flex gap-2.5 text-[14.5px] leading-relaxed text-text-dim">
                  <Check className="mt-1 h-4 w-4 shrink-0 text-accent" />
                  {l}
                </li>
              ))}
              {isVideo && (
                <li className="flex gap-2.5 text-[14.5px] leading-relaxed text-text-dim">
                  <Check className="mt-1 h-4 w-4 shrink-0 text-accent" />
                  {format.seconds} seconds · {format.audio === "voice" ? "someone speaks" : "music and sound"}
                </li>
              )}
            </ul>
            <div className="rounded-xl bg-panel-2 p-4 text-[14.5px] leading-relaxed">
              <div className="text-[13.5px] font-medium text-text-dim">Caption (sample)</div>
              <p className="mt-1">Fresh batch just landed. Pay cash on delivery, delivered to your door in 2–4 days. Order today.</p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (stage === "making") {
    const idx = Math.min(MAKING.length - 1, Math.floor((pct / 100) * MAKING.length));
    return (
      <div className="grid gap-5">
        {banner}
        <div className="flex flex-col items-center gap-4 rounded-2xl border border-border bg-panel px-6 py-14 text-center">
          <Loader2 className="h-8 w-8 animate-spin text-accent" />
          <div className="text-[17px] font-semibold">{MAKING[idx]}</div>
          <div className="h-2 w-full max-w-sm overflow-hidden rounded-full bg-panel-2">
            <div className="h-full rounded-full bg-accent transition-[width] duration-200" style={{ width: `${pct}%` }} />
          </div>
          <p className="text-[14px] text-text-dim">A real {isVideo ? "reel takes about 2 minutes" : "image takes about 20 seconds"}.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="grid gap-5">
      {banner}
      <div className="overflow-hidden rounded-2xl border border-border bg-panel">
        <div className="relative">
          {isVideo ? (
            <video src={DEMO_VIDEO} poster={previewImage(format.id)} autoPlay muted loop playsInline controls className="aspect-[4/3] w-full bg-black object-cover" />
          ) : (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={previewImage(format.id)} alt="" className="aspect-[4/3] w-full object-cover" />
          )}
          <span className="absolute left-3 top-3 rounded-full bg-black/70 px-3 py-1 text-[13px] font-medium text-white">Demo result</span>
        </div>
        <div className="grid gap-3 p-5">
          <div className="flex items-center gap-2 text-[15px] font-semibold">
            <Sparkles className="h-4 w-4 text-accent" /> Ready
          </div>
          <p className="text-[14.5px] leading-relaxed text-text-dim">
            This is how a finished {isVideo ? "reel" : "image"} appears here. You can post it to Facebook / Instagram straight from this panel, or use it in Orbit Design.
          </p>
        </div>
      </div>
    </div>
  );
}

export function DemoFooter({ stage, onGenerate, onExit, onClose }: { stage: DemoStage; onGenerate: () => void; onExit: () => void; onClose: () => void }) {
  if (stage === "plan")
    return (
      <div className="grid gap-2.5">
        <Button className="w-full" onClick={onGenerate}>
          <Wand2 className="h-4 w-4" /> Generate the demo
        </Button>
        <Button variant="ghost" className="w-full" onClick={onExit}>
          Back
        </Button>
      </div>
    );
  if (stage === "making")
    return (
      <Button variant="secondary" className="w-full" onClick={onExit} disabled>
        Making the demo…
      </Button>
    );
  return (
    <div className="flex gap-2.5">
      <Button variant="secondary" className="flex-1" onClick={onClose}>
        Try another type
      </Button>
      <Link href="/dashboard/settings/plan" className="btn-primary flex flex-1 items-center justify-center text-center">
        Make a real one
      </Link>
    </div>
  );
}
