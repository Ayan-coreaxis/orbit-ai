"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, Check, Clapperboard, Copy, Download, ImagePlus, Loader2, Mic, Music, RefreshCw, Sparkles, Upload, Wand2, X } from "lucide-react";
import { Button, Pill } from "@/components/ui";
import { MediaPicker } from "@/components/media/MediaPicker";
import { uploadMedia } from "@/lib/media-client";
import { cn } from "@/lib/utils";
import { CHOICES, missingNeeds, type Aspect, type Need, type StudioFormat, type StudioInput } from "@/lib/studio/formats";
import { WORKING, type StudioData, type StudioJobView } from "@/components/studio/types";

const ASPECT_LABEL: Record<Aspect, string> = { "1:1": "Square 1:1", "4:5": "Portrait 4:5", "9:16": "Reel 9:16", "16:9": "Wide 16:9" };

type Thumb = { id: string; url: string };

/**
 * One piece, start to finish: 1) the seller gives the material the format needs, 2) the director
 * shows the plan (storyboard, script, caption) — nothing is spent yet, 3) Generate, watch it being
 * made, get the result. Opening an existing job jumps straight to its step.
 */
export function Composer({
  format,
  data,
  job: initialJob,
  onClose,
  onChanged,
}: {
  format: StudioFormat;
  data: StudioData;
  job: StudioJobView | null;
  onClose: () => void;
  onChanged: (job: StudioJobView) => void;
}) {
  const [job, setJob] = useState<StudioJobView | null>(initialJob);
  const [input, setInput] = useState<StudioInput>(initialJob?.input ?? { aspect: format.aspects[0] });
  const [thumbs, setThumbs] = useState<Record<string, Thumb[]>>({});
  const [busy, setBusy] = useState<null | "plan" | "generate" | "replan">(null);
  const [err, setErr] = useState<string | null>(null);
  const [change, setChange] = useState("");
  const [showChange, setShowChange] = useState(false);

  const kind = format.kind;
  const left = kind === "image" ? data.status.left.images : data.status.left.videos;
  const limit = kind === "image" ? data.status.limit.images : data.status.limit.videos;
  const ready = kind === "image" ? data.status.imageReady : data.status.videoReady;
  const missing = useMemo(() => missingNeeds(format, input), [format, input]);
  const brandMissing = input.choice?.avatar === "brand" && !data.brandFace && !(input.media?.person?.length);

  // Photos picked earlier (reopening a job) need their thumbnails.
  useEffect(() => {
    const ids = Object.values(initialJob?.input.media ?? {}).flat();
    if (!ids.length) return;
    fetch("/api/media?kind=image")
      .then((r) => r.json())
      .then((d: { media?: Thumb[] }) => {
        const byId = new Map((d.media ?? []).map((m) => [m.id, m]));
        const next: Record<string, Thumb[]> = {};
        for (const [k, list] of Object.entries(initialJob?.input.media ?? {})) next[k] = list.map((id) => byId.get(id)).filter((x): x is Thumb => !!x);
        setThumbs(next);
      })
      .catch(() => {});
  }, [initialJob]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const update = useCallback(
    (j: StudioJobView) => {
      setJob(j);
      onChanged(j);
    },
    [onChanged],
  );

  // Watch a job that's being made.
  const working = !!job && WORKING.includes(job.status);
  useEffect(() => {
    if (!job || !WORKING.includes(job.status)) return;
    const t = setInterval(async () => {
      try {
        const d = await (await fetch(`/api/studio/jobs/${job.id}`)).json();
        if (d.job) update(d.job);
      } catch {
        /* next tick */
      }
    }, 4000);
    return () => clearInterval(t);
  }, [job, update]);

  async function plan() {
    setBusy("plan");
    setErr(null);
    try {
      const res = await fetch("/api/studio/jobs", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ format: format.id, input }) });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error || "Couldn't plan this.");
      update(d.job);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Couldn't plan this.");
    } finally {
      setBusy(null);
    }
  }

  async function act(action: "generate" | "replan") {
    if (!job) return;
    setBusy(action);
    setErr(null);
    try {
      const res = await fetch(`/api/studio/jobs/${job.id}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, change }) });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error || "Something went wrong.");
      update(d.job);
      if (action === "replan") {
        setChange("");
        setShowChange(false);
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setBusy(null);
    }
  }

  function startOver() {
    setJob(null);
    setErr(null);
  }

  const step = !job ? 1 : job.status === "draft" ? 2 : 3;

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/50" onClick={onClose}>
      <div
        className="flex h-full w-full max-w-[640px] flex-col border-l border-border bg-panel shadow-2xl"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label={format.name}
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-4 border-b border-border px-6 py-4">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              {kind === "video" ? <Clapperboard className="h-4 w-4 text-accent" /> : <ImagePlus className="h-4 w-4 text-accent" />}
              <h2 className="truncate text-[16px] font-semibold">{job?.brief?.title && step > 1 ? job.brief.title : format.name}</h2>
            </div>
            <p className="mt-0.5 text-[12.5px] text-text-faint">{format.tagline}</p>
          </div>
          <button onClick={onClose} className="rounded-md p-1 text-text-faint hover:text-text" aria-label="Close">
            <X className="h-5 w-5" />
          </button>
        </div>
        <Steps step={step} />

        <div className="scrollbar-thin flex-1 overflow-y-auto px-6 py-5">
          {step === 1 && (
            <div className="grid gap-5">
              <Look format={format} />
              {format.needs.map((n) =>
                n.type === "consent" && !(input.media?.person?.length) ? null : (
                  <NeedField
                    key={n.key}
                    need={n}
                    input={input}
                    setInput={setInput}
                    data={data}
                    thumbs={thumbs[n.key] ?? []}
                    setThumbs={(t) => setThumbs((x) => ({ ...x, [n.key]: t }))}
                  />
                ),
              )}
              {brandMissing && <Warn>You haven&apos;t made a brand face yet. Make one with &quot;Create your brand face&quot; first, or pick another person.</Warn>}
              {format.aspects.length > 1 && (
                <Field label="Size" hint="Where will you post it?">
                  <div className="flex flex-wrap gap-2">
                    {format.aspects.map((a) => (
                      <Chip key={a} on={(input.aspect ?? format.aspects[0]) === a} onClick={() => setInput((x) => ({ ...x, aspect: a }))}>
                        {ASPECT_LABEL[a]}
                      </Chip>
                    ))}
                  </div>
                </Field>
              )}
              {format.tip && <p className="rounded-lg bg-panel-2 px-3 py-2 text-[12.5px] text-text-dim">💡 {format.tip}</p>}
            </div>
          )}

          {step >= 2 && job?.brief && <Plan job={job} format={format} />}

          {step === 3 && job && <Progress job={job} format={format} />}

          {err && (
            <div className="mt-4">
              <Warn tone="bad">{err}</Warn>
            </div>
          )}
        </div>

        {/* Footer actions */}
        <div className="border-t border-border px-6 py-4">
          {step === 1 && (
            <>
              {!data.status.allowed ? (
                <Warn>Orbit Studio comes with the Growth ($75) and Scale ($150) plans — upgrade in Settings &amp; Billing to make this.</Warn>
              ) : !ready ? (
                <Warn>{kind === "video" ? "Reels" : "Images"} aren&apos;t switched on yet — the platform admin needs to add the model key in Super Admin &gt; Studio.</Warn>
              ) : left <= 0 ? (
                <Warn>This month&apos;s {limit} {kind === "video" ? "reels" : "images"} are used up — they reset on the 1st.</Warn>
              ) : missing.length ? (
                <p className="mb-3 text-[12.5px] text-text-faint">Still needed: {missing.join(" · ")}</p>
              ) : (
                <p className="mb-3 text-[12.5px] text-text-faint">Next the director shows you the plan — nothing is used from your allowance until you press Generate.</p>
              )}
              <Button className="w-full" disabled={!data.status.allowed || !ready || left <= 0 || missing.length > 0 || brandMissing || busy === "plan"} onClick={plan}>
                {busy === "plan" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wand2 className="h-4 w-4" />}
                {busy === "plan" ? "The director is planning… (about 15 seconds)" : "Plan it with the director"}
              </Button>
            </>
          )}

          {step === 2 && job && (
            <div className="grid gap-3">
              {showChange ? (
                <div className="grid gap-2">
                  <textarea
                    value={change}
                    onChange={(e) => setChange(e.target.value)}
                    rows={3}
                    autoFocus
                    placeholder="What should be different? e.g. make it more festive, she should say it's on sale, use a kitchen instead"
                    className="w-full resize-none rounded-lg border border-border bg-panel-2 px-3 py-2 text-[13.5px] outline-none focus:border-accent/60"
                  />
                  <div className="flex gap-2">
                    <Button variant="secondary" className="flex-1" onClick={() => setShowChange(false)}>
                      Cancel
                    </Button>
                    <Button className="flex-1" disabled={!change.trim() || busy === "replan"} onClick={() => act("replan")}>
                      {busy === "replan" ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                      Update the plan
                    </Button>
                  </div>
                </div>
              ) : (
                <>
                  <Button className="w-full" disabled={busy === "generate" || left <= 0} onClick={() => act("generate")}>
                    {busy === "generate" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                    Generate — uses 1 of your {left} {kind === "video" ? "reels" : "images"} left
                  </Button>
                  <div className="flex gap-2">
                    <Button variant="secondary" className="flex-1" onClick={() => setShowChange(true)}>
                      Change something
                    </Button>
                    <Button variant="ghost" className="flex-1" onClick={startOver}>
                      Back to material
                    </Button>
                  </div>
                </>
              )}
            </div>
          )}

          {step === 3 && job && (
            <div className="flex gap-2">
              {job.status === "failed" ? (
                <>
                  <Button className="flex-1" disabled={busy === "generate"} onClick={() => act("generate")}>
                    <RefreshCw className="h-4 w-4" /> Try again
                  </Button>
                  <Button variant="secondary" className="flex-1" onClick={() => setShowChange(true)}>
                    Change the plan
                  </Button>
                </>
              ) : job.status === "done" ? (
                <>
                  <Button variant="secondary" className="flex-1" onClick={startOver}>
                    Make another like this
                  </Button>
                  <Button className="flex-1" onClick={onClose}>
                    Done
                  </Button>
                </>
              ) : (
                <Button variant="secondary" className="w-full" onClick={onClose}>
                  Close — it keeps going and shows up in My creations
                </Button>
              )}
            </div>
          )}
          {step === 3 && job?.status === "failed" && showChange && (
            <div className="mt-3 grid gap-2">
              <textarea
                value={change}
                onChange={(e) => setChange(e.target.value)}
                rows={3}
                placeholder="What should be different?"
                className="w-full resize-none rounded-lg border border-border bg-panel-2 px-3 py-2 text-[13.5px] outline-none focus:border-accent/60"
              />
              <Button disabled={!change.trim() || busy === "replan"} onClick={() => act("replan")}>
                {busy === "replan" ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                Update the plan
              </Button>
            </div>
          )}
          {working && <p className="mt-2 text-center text-[11.5px] text-text-faint">Checking every few seconds…</p>}
        </div>
      </div>
    </div>
  );
}

function Steps({ step }: { step: number }) {
  const items = ["Your material", "Director's plan", "Made"];
  return (
    <div className="flex items-center gap-2 border-b border-border px-6 py-2.5">
      {items.map((label, i) => (
        <div key={label} className="flex items-center gap-2">
          <span
            className={cn(
              "flex h-5 w-5 items-center justify-center rounded-full text-[11px] font-semibold",
              step > i + 1 ? "bg-good text-white" : step === i + 1 ? "gradient-fill text-white" : "bg-panel-2 text-text-faint",
            )}
          >
            {step > i + 1 ? <Check className="h-3 w-3" /> : i + 1}
          </span>
          <span className={cn("text-[12px]", step === i + 1 ? "font-medium text-text" : "text-text-faint")}>{label}</span>
          {i < items.length - 1 && <span className="mx-1 h-px w-6 bg-border" />}
        </div>
      ))}
    </div>
  );
}

function Look({ format }: { format: StudioFormat }) {
  return (
    <div className="rounded-xl border border-accent-strong/40 bg-accent-soft/50 p-4">
      <div className="text-[11.5px] font-semibold uppercase tracking-[0.05em] text-accent-strong">What you&apos;ll get</div>
      <ul className="mt-2 grid gap-1.5">
        {format.look.map((l) => (
          <li key={l} className="flex gap-2 text-[13px] leading-relaxed text-text-dim">
            <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-accent" />
            {l}
          </li>
        ))}
      </ul>
      {format.kind === "video" && (
        <div className="mt-3 flex flex-wrap gap-2">
          <Pill tone="neutral">{format.seconds}s</Pill>
          <Pill tone="neutral">{format.audio === "voice" ? "Someone speaks" : "Music & sound"}</Pill>
          {format.keyframe && <Pill tone="neutral">Starts from your real product photo</Pill>}
        </div>
      )}
    </div>
  );
}

function Field({ label, hint, required, children }: { label: string; hint?: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div className="grid gap-1.5">
      <div>
        <span className="text-[13px] font-medium">{label}</span>
        {required ? <span className="ml-1 text-[12px] text-accent">*</span> : <span className="ml-1.5 text-[11.5px] text-text-faint">optional</span>}
        {hint && <p className="text-[12px] text-text-faint">{hint}</p>}
      </div>
      {children}
    </div>
  );
}

function Chip({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-full border px-3 py-1.5 text-[12.5px] transition-colors",
        on ? "border-accent bg-accent-soft font-medium text-accent-strong" : "border-border bg-panel-2 text-text-dim hover:border-accent/50",
      )}
    >
      {children}
    </button>
  );
}

function Warn({ children, tone = "warn" }: { children: React.ReactNode; tone?: "warn" | "bad" }) {
  return (
    <div className={cn("flex gap-2 rounded-lg px-3 py-2.5 text-[12.5px] leading-relaxed", tone === "bad" ? "bg-bad-soft text-bad" : "bg-warn-soft text-warn")}>
      <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
      <div>{children}</div>
    </div>
  );
}

function NeedField({
  need,
  input,
  setInput,
  data,
  thumbs,
  setThumbs,
}: {
  need: Need;
  input: StudioInput;
  setInput: React.Dispatch<React.SetStateAction<StudioInput>>;
  data: StudioData;
  thumbs: Thumb[];
  setThumbs: (t: Thumb[]) => void;
}) {
  const [picker, setPicker] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [upErr, setUpErr] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  if (need.type === "product") {
    const list = data.products.filter((p) => !q.trim() || p.name.toLowerCase().includes(q.trim().toLowerCase()));
    const picked = data.products.find((p) => p.id === input.productId);
    return (
      <Field label={need.label} hint={need.hint} required={need.required}>
        {data.products.length === 0 ? (
          <Warn>You have no products yet — add one in Store &gt; Products first{need.required ? "" : ", or skip this"}.</Warn>
        ) : (
          <>
            {data.products.length > 8 && (
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search products" className="rounded-lg border border-border bg-panel-2 px-3 py-2 text-[13px] outline-none focus:border-accent/60" />
            )}
            <div className="grid max-h-[220px] grid-cols-3 gap-2 overflow-y-auto sm:grid-cols-4">
              {list.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => setInput((x) => ({ ...x, productId: x.productId === p.id ? undefined : p.id }))}
                  className={cn("overflow-hidden rounded-lg border text-left", input.productId === p.id ? "border-accent ring-2 ring-accent/40" : "border-border hover:border-accent/50")}
                >
                  {p.imageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={p.imageUrl} alt="" className="aspect-square w-full bg-panel-2 object-cover" />
                  ) : (
                    <div className="flex aspect-square w-full items-center justify-center bg-panel-2 px-2 text-center text-[11px] text-text-faint">No photo</div>
                  )}
                  <div className="truncate px-2 py-1 text-[11.5px]">{p.name}</div>
                </button>
              ))}
            </div>
            {picked && !picked.imageUrl && <Warn>This product has no photo — add one below (or in Store &gt; Products) so the result looks like your real product.</Warn>}
          </>
        )}
      </Field>
    );
  }

  if (need.type === "photos") {
    const ids = input.media?.[need.key] ?? [];
    const set = (list: Thumb[]) => {
      setThumbs(list);
      setInput((x) => ({ ...x, media: { ...x.media, [need.key]: list.map((t) => t.id) } }));
    };
    const addOne = (t: Thumb) => {
      if (ids.includes(t.id) || ids.length >= need.max) return;
      set([...thumbs, t].slice(0, need.max));
    };
    const max = need.max;
    async function onFiles(files: FileList | null) {
      if (!files?.length) return;
      setUploading(true);
      setUpErr(null);
      let list = [...thumbs];
      for (const f of Array.from(files).slice(0, max - list.length)) {
        if (!f.type.startsWith("image/")) {
          setUpErr("Only photos work here.");
          continue;
        }
        try {
          const m = await uploadMedia(f, { source: "library" });
          if (!list.some((t) => t.id === m.id)) list = [...list, { id: m.id, url: m.url }];
        } catch (e) {
          setUpErr(e instanceof Error ? e.message : "Upload failed.");
        }
      }
      set(list.slice(0, max));
      setUploading(false);
    }
    return (
      <Field label={need.label} hint={need.hint} required={need.required}>
        <div className="flex flex-wrap items-center gap-2">
          {thumbs.map((t) => (
            <div key={t.id} className="relative h-20 w-20 overflow-hidden rounded-lg border border-border">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={t.url} alt="" className="h-full w-full object-cover" />
              <button
                type="button"
                onClick={() => set(thumbs.filter((x) => x.id !== t.id))}
                className="absolute right-1 top-1 rounded-full bg-black/60 p-0.5 text-white"
                aria-label="Remove photo"
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          ))}
          {thumbs.length < need.max && (
            <>
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                disabled={uploading}
                className="flex h-20 w-20 flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-border-strong text-[11px] text-text-faint hover:border-accent/60 hover:text-text"
              >
                {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                Upload
              </button>
              <button
                type="button"
                onClick={() => setPicker(true)}
                className="flex h-20 w-20 flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-border-strong text-[11px] text-text-faint hover:border-accent/60 hover:text-text"
              >
                <ImagePlus className="h-4 w-4" />
                From media
              </button>
            </>
          )}
          <input ref={fileRef} type="file" accept="image/*" multiple={need.max > 1} hidden onChange={(e) => onFiles(e.target.files).finally(() => (e.target.value = ""))} />
        </div>
        {upErr && <p className="text-[12px] text-bad">{upErr}</p>}
        <MediaPicker open={picker} onClose={() => setPicker(false)} onPick={(m) => addOne({ id: m.id, url: m.url })} />
      </Field>
    );
  }

  if (need.type === "text") {
    const v = input.text?.[need.key] ?? "";
    const on = (val: string) => setInput((x) => ({ ...x, text: { ...x.text, [need.key]: val } }));
    return (
      <Field label={need.label} hint={need.hint} required={need.required}>
        {need.long ? (
          <textarea value={v} onChange={(e) => on(e.target.value)} rows={3} placeholder={need.placeholder} className="resize-none rounded-lg border border-border bg-panel-2 px-3 py-2 text-[13.5px] outline-none focus:border-accent/60" />
        ) : (
          <input value={v} onChange={(e) => on(e.target.value)} placeholder={need.placeholder} className="rounded-lg border border-border bg-panel-2 px-3 py-2 text-[13.5px] outline-none focus:border-accent/60" />
        )}
      </Field>
    );
  }

  if (need.type === "choice") {
    const list = CHOICES[need.options] as readonly { id: string; label: string }[];
    const cur = input.choice?.[need.key] ?? list[0].id;
    return (
      <Field label={need.label} hint={need.hint}>
        <div className="flex flex-wrap gap-2">
          {list.map((c) => (
            <Chip key={c.id} on={cur === c.id} onClick={() => setInput((x) => ({ ...x, choice: { ...x.choice, [need.key]: c.id } }))}>
              {c.label}
              {c.id === "brand" && data.brandFace && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={data.brandFace.url} alt="" className="ml-1.5 inline h-4 w-4 rounded-full object-cover align-[-3px]" />
              )}
            </Chip>
          ))}
        </div>
      </Field>
    );
  }

  // consent
  return (
    <label className="flex items-start gap-2.5 rounded-lg border border-border bg-panel-2 px-3 py-2.5 text-[13px]">
      <input type="checkbox" checked={!!input.consent} onChange={(e) => setInput((x) => ({ ...x, consent: e.target.checked }))} className="mt-0.5 accent-[var(--accent)]" />
      <span>
        {need.label}
        <span className="block text-[12px] text-text-faint">Never use someone&apos;s face without their permission.</span>
      </span>
    </label>
  );
}

function Plan({ job, format }: { job: StudioJobView; format: StudioFormat }) {
  const b = job.brief!;
  const [copied, setCopied] = useState(false);
  return (
    <div className="grid gap-4">
      <div>
        <div className="text-[11.5px] font-semibold uppercase tracking-[0.05em] text-text-faint">The director&apos;s idea</div>
        <p className="mt-1 text-[14px] leading-relaxed">{b.concept}</p>
      </div>
      {b.shots.length > 0 && (
        <div>
          <div className="text-[11.5px] font-semibold uppercase tracking-[0.05em] text-text-faint">{format.kind === "video" ? "Storyboard" : "How it will look"}</div>
          <ol className="mt-2 grid gap-2">
            {b.shots.map((s, i) => (
              <li key={i} className="rounded-lg border border-border bg-panel-2 px-3 py-2.5">
                <div className="flex items-baseline gap-2">
                  {format.kind === "video" && <span className="shrink-0 rounded bg-accent-soft px-1.5 py-0.5 text-[11px] font-semibold text-accent-strong">{s.time || `Shot ${i + 1}`}</span>}
                  <span className="text-[13px] leading-relaxed">{s.what}</span>
                </div>
                {(s.camera || s.sound) && (
                  <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-[12px] text-text-faint">
                    {s.camera && <span>🎥 {s.camera}</span>}
                    {s.sound && (
                      <span className="inline-flex items-center gap-1">
                        <Music className="h-3 w-3" /> {s.sound}
                      </span>
                    )}
                  </div>
                )}
              </li>
            ))}
          </ol>
        </div>
      )}
      {b.script && (
        <div className="rounded-lg border border-border bg-panel-2 px-3 py-2.5">
          <div className="flex items-center gap-1.5 text-[11.5px] font-semibold uppercase tracking-[0.05em] text-text-faint">
            <Mic className="h-3 w-3" /> What they&apos;ll say
          </div>
          <p className="mt-1 text-[13.5px] italic leading-relaxed">&ldquo;{b.script}&rdquo;</p>
        </div>
      )}
      {b.caption && (
        <div>
          <div className="flex items-center justify-between">
            <div className="text-[11.5px] font-semibold uppercase tracking-[0.05em] text-text-faint">Caption for your post</div>
            <button
              type="button"
              onClick={() => {
                navigator.clipboard?.writeText(b.caption).then(() => {
                  setCopied(true);
                  setTimeout(() => setCopied(false), 1500);
                });
              }}
              className="inline-flex items-center gap-1 text-[12px] text-accent hover:underline"
            >
              {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />} {copied ? "Copied" : "Copy"}
            </button>
          </div>
          <p className="mt-1 whitespace-pre-wrap rounded-lg bg-panel-2 px-3 py-2.5 text-[13px] leading-relaxed text-text-dim">{b.caption}</p>
        </div>
      )}
      {b.headsUp && <Warn>{b.headsUp}</Warn>}
      {job.status === "draft" && (
        <p className="text-[12px] text-text-faint">
          Size {b.aspect}
          {b.seconds ? ` · ${b.seconds} seconds` : ""} · nothing has been used from your allowance yet.
        </p>
      )}
    </div>
  );
}

function Progress({ job, format }: { job: StudioJobView; format: StudioFormat }) {
  if (job.status === "done" && job.result) {
    return (
      <div className="mt-5 grid gap-3">
        <div className="text-[11.5px] font-semibold uppercase tracking-[0.05em] text-good">Ready</div>
        <div className="overflow-hidden rounded-xl border border-border bg-black/80">
          {job.result.kind === "video" ? (
            <video src={job.result.url} poster={job.result.poster ?? undefined} controls playsInline className="mx-auto max-h-[60vh] w-full" />
          ) : (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={job.result.url} alt={job.brief?.title ?? ""} className="mx-auto max-h-[60vh] w-full object-contain" />
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          <a href={job.result.url} download className="inline-flex items-center gap-1.5 rounded-lg border border-border-strong bg-panel px-3 py-2 text-[13px] hover:border-accent/50">
            <Download className="h-4 w-4" /> Download
          </a>
          <a href="/dashboard/media" className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-[13px] text-text-dim hover:bg-panel-2 hover:text-text">
            It&apos;s saved in your Media library
          </a>
        </div>
        <p className="text-[12px] text-text-faint">Tip: ask your Orchestrator to use it — e.g. &quot;set this as the product photo&quot; or &quot;put it on my home page&quot;.</p>
      </div>
    );
  }
  if (job.status === "failed") {
    return (
      <div className="mt-5">
        <Warn tone="bad">
          {job.error ?? "This couldn't be made."} <span className="block pt-1 text-[12px] opacity-80">Nothing was used from your allowance.</span>
        </Warn>
      </div>
    );
  }
  const video = format.kind === "video";
  const stages = video
    ? [
        ...(format.keyframe ? [{ id: "keyframe", label: "Making the first frame with your real product" }] : []),
        { id: "video", label: "Filming the reel with sound (usually 1–3 minutes)" },
        { id: "finishing", label: "Saving it to your library" },
      ]
    : [{ id: "image", label: "Making your image (about 20 seconds)" }];
  const current = job.status === "finishing" ? "finishing" : job.status === "queued" ? stages[0].id : (job.stage ?? stages[0].id);
  const at = Math.max(0, stages.findIndex((s) => s.id === current));
  return (
    <div className="mt-5 grid gap-4">
      <div className="text-[11.5px] font-semibold uppercase tracking-[0.05em] text-text-faint">Being made</div>
      <ol className="grid gap-2">
        {stages.map((s, i) => (
          <li key={s.id} className="flex items-center gap-2.5 text-[13px]">
            {i < at ? <Check className="h-4 w-4 text-good" /> : i === at ? <Loader2 className="h-4 w-4 animate-spin text-accent" /> : <span className="h-4 w-4 rounded-full border border-border" />}
            <span className={i === at ? "font-medium" : i < at ? "text-text-dim" : "text-text-faint"}>{s.label}</span>
          </li>
        ))}
      </ol>
      {job.keyframeUrl && video && (
        <div>
          <div className="mb-1.5 text-[12px] text-text-faint">First frame</div>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={job.keyframeUrl} alt="" className="max-h-[260px] rounded-lg border border-border object-contain" />
        </div>
      )}
      <p className="text-[12.5px] text-text-faint">You can close this — it keeps going, and shows up in My creations when it&apos;s ready.</p>
    </div>
  );
}
