"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Clapperboard, ImagePlus, Loader2, Lock, Mic, Music, Play, Sparkles } from "lucide-react";
import { Card, Pill } from "@/components/ui";
import { cn } from "@/lib/utils";
import { FORMATS, GROUPS, getFormat, type FormatGroup, type StudioFormat, type StudioKind } from "@/lib/studio/formats";
import { Composer } from "@/components/studio/Composer";
import { WORKING, type StudioData, type StudioJobView } from "@/components/studio/types";

type Tab = StudioKind | "mine";

/** Orbit Studio on the Content page: allowance, every format with what it makes, and past work. */
export function Studio() {
  const [data, setData] = useState<StudioData | null>(null);
  const [loadErr, setLoadErr] = useState(false);
  const [tab, setTab] = useState<Tab>("image");
  const [open, setOpen] = useState<{ format: StudioFormat; job: StudioJobView | null } | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/studio");
      if (!res.ok) throw new Error();
      setData(await res.json());
      setLoadErr(false);
    } catch {
      setLoadErr(true);
    }
  }, []);
  useEffect(() => {
    let alive = true;
    fetch("/api/studio")
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d: StudioData) => alive && setData(d))
      .catch(() => alive && setLoadErr(true));
    return () => {
      alive = false;
    };
  }, []);

  // Keep "My creations" live while something is being made.
  const busyIds = useMemo(() => (data?.jobs ?? []).filter((j) => WORKING.includes(j.status)).map((j) => j.id), [data]);
  useEffect(() => {
    if (!busyIds.length || open) return;
    const t = setInterval(async () => {
      const fresh = await Promise.all(busyIds.map((id) => fetch(`/api/studio/jobs/${id}`).then((r) => r.json()).catch(() => null)));
      if (fresh.some((d) => d?.job && !WORKING.includes(d.job.status))) load();
    }, 6000);
    return () => clearInterval(t);
  }, [busyIds, open, load]);

  const onChanged = useCallback((job: StudioJobView) => {
    setData((d) => {
      if (!d) return d;
      const exists = d.jobs.some((j) => j.id === job.id);
      return { ...d, jobs: exists ? d.jobs.map((j) => (j.id === job.id ? job : j)) : [job, ...d.jobs] };
    });
  }, []);

  function close() {
    setOpen(null);
    load(); // allowance + list
  }

  if (loadErr) {
    return (
      <Card className="p-6 text-[13px] text-text-faint">
        Couldn&apos;t load Orbit Studio.{" "}
        <button onClick={load} className="text-accent hover:underline">
          Try again
        </button>
      </Card>
    );
  }
  if (!data) {
    return (
      <Card className="flex items-center justify-center p-10 text-text-faint">
        <Loader2 className="h-5 w-5 animate-spin" />
      </Card>
    );
  }

  const s = data.status;
  const mine = data.jobs.filter((j) => j.status !== "draft" || j.brief);

  return (
    <div className="grid gap-5">
      <Card className="overflow-hidden p-0">
        <div className="flex flex-wrap items-start justify-between gap-4 p-6">
          <div className="max-w-xl">
            <div className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-accent" />
              <h2 className="text-[17px] font-semibold">Orbit Studio</h2>
              {s.allowed && <Pill tone="accent">{s.plan === "scale" ? "Scale" : "Growth"} plan</Pill>}
            </div>
            <p className="mt-1.5 text-[13.5px] leading-relaxed text-text-dim">
              Photos, posts, reels and ads made from your real products. Pick what you want, give the photos it asks for, and the director shows you exactly how it
              will look before anything is made.
            </p>
          </div>
          {s.allowed && (
            <div className="grid min-w-[220px] gap-2.5">
              <Meter label="Images" used={s.used.images} limit={s.limit.images} />
              <Meter label="Reels & videos" used={s.used.videos} limit={s.limit.videos} />
              <p className="text-[11.5px] text-text-faint">Resets on {new Date(s.resetsOn).toLocaleDateString(undefined, { day: "numeric", month: "short" })}</p>
            </div>
          )}
        </div>
        {!s.allowed ? (
          <div className="flex items-start gap-3 border-t border-border bg-panel-2 px-6 py-4">
            <Lock className="mt-0.5 h-4 w-4 shrink-0 text-text-faint" />
            <div className="text-[13px] leading-relaxed text-text-dim">
              Orbit Studio comes with the <b>Growth ($75)</b> plan — 50 images + 5 reels a month — and the <b>Scale ($150)</b> plan — 100 images + 12 reels. You can
              look around below; upgrade in <a href="/dashboard/settings" className="text-accent hover:underline">Settings &amp; Billing</a> to start making.
            </div>
          </div>
        ) : !s.enabled ? (
          <Notice>Orbit Studio is switched off by the platform right now.</Notice>
        ) : !s.imageReady ? (
          <Notice>Almost ready — the platform admin still needs to add the image and video model keys (Super Admin &gt; Studio).</Notice>
        ) : !s.videoReady ? (
          <Notice>Images are ready. Reels switch on once the video model key is added (Super Admin &gt; Studio).</Notice>
        ) : null}
      </Card>

      <div className="flex gap-1 rounded-xl border border-border bg-panel p-1">
        <TabBtn on={tab === "image"} onClick={() => setTab("image")} icon={<ImagePlus className="h-4 w-4" />}>
          Images
        </TabBtn>
        <TabBtn on={tab === "video"} onClick={() => setTab("video")} icon={<Clapperboard className="h-4 w-4" />}>
          Reels &amp; ads
        </TabBtn>
        <TabBtn on={tab === "mine"} onClick={() => setTab("mine")} icon={<Play className="h-4 w-4" />}>
          My creations{mine.length ? ` · ${mine.length}` : ""}
          {busyIds.length > 0 && <Loader2 className="h-3.5 w-3.5 animate-spin text-accent" />}
        </TabBtn>
      </div>

      {tab === "mine" ? (
        <Creations jobs={mine} onOpen={(j) => { const f = getFormat(j.format); if (f) setOpen({ format: f, job: j }); }} />
      ) : (
        (Object.keys(GROUPS) as FormatGroup[])
          .filter((g) => GROUPS[g].kind === tab)
          .map((g) => (
            <section key={g}>
              <h3 className="mb-2.5 text-[12px] font-semibold uppercase tracking-[0.05em] text-text-faint">{GROUPS[g].label}</h3>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {FORMATS.filter((f) => f.group === g).map((f) => (
                  <FormatCard key={f.id} format={f} locked={!s.allowed} onOpen={() => setOpen({ format: f, job: null })} />
                ))}
              </div>
            </section>
          ))
      )}

      {open && <Composer format={open.format} job={open.job} data={data} onClose={close} onChanged={onChanged} />}
    </div>
  );
}

function Meter({ label, used, limit }: { label: string; used: number; limit: number }) {
  const pct = limit ? Math.min(100, (used / limit) * 100) : 100;
  return (
    <div>
      <div className="flex justify-between text-[12px]">
        <span className="text-text-dim">{label}</span>
        <span className={cn("font-medium", used >= limit ? "text-bad" : "text-text")}>
          {used} / {limit}
        </span>
      </div>
      <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-panel-2">
        <div className={cn("h-full rounded-full", used >= limit ? "bg-bad" : "gradient-fill")} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function Notice({ children }: { children: React.ReactNode }) {
  return <div className="border-t border-border bg-warn-soft px-6 py-3 text-[13px] text-warn">{children}</div>;
}

function TabBtn({ on, onClick, icon, children }: { on: boolean; onClick: () => void; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={cn("flex flex-1 items-center justify-center gap-2 rounded-lg px-3 py-2 text-[13px] transition-colors", on ? "bg-panel-2 font-medium text-text" : "text-text-faint hover:text-text")}
    >
      {icon}
      {children}
    </button>
  );
}

function FormatCard({ format, locked, onOpen }: { format: StudioFormat; locked: boolean; onOpen: () => void }) {
  return (
    <button onClick={onOpen} className="group flex h-full flex-col rounded-xl border border-border bg-panel p-4 text-left transition-colors hover:border-accent/50">
      <div className="flex items-start justify-between gap-2">
        <div className="text-[14px] font-semibold">{format.name}</div>
        {locked && <Lock className="h-3.5 w-3.5 shrink-0 text-text-faint" />}
      </div>
      <p className="mt-0.5 text-[12.5px] text-text-faint">{format.tagline}</p>
      <p className="mt-2.5 flex-1 text-[12.5px] leading-relaxed text-text-dim">{format.look[0]}</p>
      <div className="mt-3 flex flex-wrap items-center gap-1.5">
        {format.kind === "video" ? (
          <>
            <Pill tone="neutral">{format.seconds}s</Pill>
            <Pill tone="neutral">
              {format.audio === "voice" ? <Mic className="mr-1 h-3 w-3" /> : <Music className="mr-1 h-3 w-3" />}
              {format.audio === "voice" ? "Voice" : "Music"}
            </Pill>
          </>
        ) : (
          <Pill tone="neutral">1 image</Pill>
        )}
        <span className="ml-auto text-[12px] font-medium text-accent opacity-0 transition-opacity group-hover:opacity-100">Start →</span>
      </div>
    </button>
  );
}

const STATUS: Record<string, { label: string; tone: "neutral" | "good" | "warn" | "bad" | "accent" }> = {
  draft: { label: "Plan ready", tone: "neutral" },
  queued: { label: "Starting", tone: "accent" },
  generating: { label: "Being made", tone: "accent" },
  finishing: { label: "Saving", tone: "accent" },
  done: { label: "Ready", tone: "good" },
  failed: { label: "Didn't work", tone: "bad" },
};

const DOT: Record<string, string> = { neutral: "bg-white/60", good: "bg-good", warn: "bg-warn", bad: "bg-bad", accent: "bg-accent animate-pulse" };

function Creations({ jobs, onOpen }: { jobs: StudioJobView[]; onOpen: (j: StudioJobView) => void }) {
  if (!jobs.length) {
    return (
      <Card className="flex flex-col items-center gap-2 p-12 text-center">
        <Sparkles className="h-6 w-6 text-text-faint" />
        <p className="max-w-sm text-[13.5px] text-text-faint">Nothing made yet. Pick an image or reel type to start — or ask your Orchestrator to make one for you.</p>
      </Card>
    );
  }
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
      {jobs.map((j) => {
        const f = getFormat(j.format);
        const st = STATUS[j.status] ?? STATUS.draft;
        const thumb = j.result?.kind === "image" ? j.result.url : (j.result?.poster ?? j.keyframeUrl);
        return (
          <button key={j.id} onClick={() => onOpen(j)} className="overflow-hidden rounded-xl border border-border bg-panel text-left hover:border-accent/50">
            <div className="relative aspect-square bg-panel-2">
              {thumb ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={thumb} alt="" className="h-full w-full object-cover" />
              ) : (
                <div className="flex h-full items-center justify-center text-text-faint">
                  {WORKING.includes(j.status) ? <Loader2 className="h-5 w-5 animate-spin" /> : j.kind === "video" ? <Clapperboard className="h-5 w-5" /> : <ImagePlus className="h-5 w-5" />}
                </div>
              )}
              {j.kind === "video" && j.status === "done" && (
                <span className="absolute inset-0 flex items-center justify-center">
                  <span className="rounded-full bg-black/55 p-2.5 text-white">
                    <Play className="h-4 w-4" />
                  </span>
                </span>
              )}
              {/* Solid backdrop so the status reads on any picture. */}
              <span className="absolute left-2 top-2 inline-flex items-center gap-1.5 rounded-full bg-black/70 px-2.5 py-1 text-[11.5px] font-medium text-white backdrop-blur-sm">
                <span className={cn("h-1.5 w-1.5 rounded-full", DOT[st.tone])} />
                {st.label}
              </span>
            </div>
            <div className="px-3 py-2">
              <div className="truncate text-[13px] font-medium">{j.brief?.title ?? f?.name ?? "Untitled"}</div>
              <div className="truncate text-[11.5px] text-text-faint">
                {f?.name}
                {j.source === "orchestrator" ? " · by Orchestrator" : ""}
              </div>
            </div>
          </button>
        );
      })}
    </div>
  );
}
