"use client";

import { useEffect, useState } from "react";
import { Topbar } from "@/components/Topbar";
import { Card, SectionLabel, Pill, Button } from "@/components/ui";
import { ArrowUpRight, Check, Eye, EyeOff, Loader2, Play, RefreshCw } from "lucide-react";

type Limits = { images: number; videos: number };
type Data = {
  config: {
    enabled: boolean;
    imageKeySet: boolean;
    videoKeySet: boolean;
    imageModel: string;
    videoModel: string;
    videoBaseUrl: string;
    videoResolution: string;
    imageCostUsd: number;
    videoCostPerSecUsd: number;
    limits: { growth: Limits; scale: Limits };
  };
  usage: { totalUsd: number; sellers: { id: string; name: string; plan: string; images: number; videos: number; failed: number; costUsd: number }[] };
};

const PLANS = [
  { id: "growth", label: "Growth ($75)" },
  { id: "scale", label: "Scale ($150)" },
] as const;

export default function StudioAdminPage() {
  const [data, setData] = useState<Data | null>(null);
  const [imageKey, setImageKey] = useState("");
  const [videoKey, setVideoKey] = useState("");
  const [show, setShow] = useState(false);
  const [form, setForm] = useState<Record<string, string>>({});
  const [enabled, setEnabled] = useState(true);
  const [limits, setLimits] = useState<Record<string, { images: string; videos: string }>>({});
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [testing, setTesting] = useState<null | "image" | "video">(null);
  const [test, setTest] = useState<{ kind: string; ok: boolean; message: string; preview?: string } | null>(null);

  function apply(d: Data) {
    setData(d);
    setEnabled(d.config.enabled);
    setForm({
      imageModel: d.config.imageModel,
      videoModel: d.config.videoModel,
      videoBaseUrl: d.config.videoBaseUrl,
      videoResolution: d.config.videoResolution,
      imageCostUsd: String(d.config.imageCostUsd),
      videoCostPerSecUsd: String(d.config.videoCostPerSecUsd),
    });
    setLimits(Object.fromEntries(PLANS.map((p) => [p.id, { images: String(d.config.limits[p.id].images), videos: String(d.config.limits[p.id].videos) }])));
  }
  async function load() {
    apply((await (await fetch("/api/admin/studio")).json()) as Data);
  }
  useEffect(() => {
    let alive = true;
    fetch("/api/admin/studio")
      .then((r) => r.json())
      .then((d: Data) => alive && apply(d))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  async function save() {
    setSaving(true);
    setSaved(false);
    const post = (body: unknown, url = "/api/admin/settings") => fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    if (imageKey.trim()) await post({ id: "gemini_image", value: imageKey.trim() });
    if (videoKey.trim()) await post({ id: "seedance_video", value: videoKey.trim() });
    setImageKey("");
    setVideoKey("");
    await post(
      {
        action: "save",
        enabled,
        ...form,
        imageCostUsd: Number(form.imageCostUsd),
        videoCostPerSecUsd: Number(form.videoCostPerSecUsd),
        limits: Object.fromEntries(Object.entries(limits).map(([k, v]) => [k, { images: Number(v.images), videos: Number(v.videos) }])),
      },
      "/api/admin/studio",
    );
    setSaving(false);
    setSaved(true);
    await load();
  }

  async function runTest(kind: "image" | "video") {
    setTesting(kind);
    setTest(null);
    const r = await (await fetch("/api/admin/studio", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: `test_${kind}` }) })).json();
    setTest({ kind, ...r });
    setTesting(null);
  }

  const c = data?.config;
  const worst = (p: "growth" | "scale") => {
    const l = limits[p];
    if (!l || !c) return null;
    return Number(l.images) * Number(form.imageCostUsd || 0) + Number(l.videos) * (10 * Number(form.videoCostPerSecUsd || 0) + Number(form.imageCostUsd || 0));
  };

  return (
    <div>
      <Topbar title="Studio" subtitle="AI images & reels for sellers — Google Nano Banana 2 (images) + ByteDance Seedance 2.0 (video with sound), Growth & Scale plans only" />
      <div className="max-w-[1000px] space-y-5 p-5 sm:p-8 lg:p-10">
        <Card className="p-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="text-[15px] font-medium">
                {!c ? "Loading…" : !c.enabled ? "Studio is switched off" : c.imageKeySet && c.videoKeySet ? "Images and reels are on" : c.imageKeySet ? "Images on — reels need the video key" : "Not set up yet"}
              </div>
              <p className="mt-1 max-w-xl text-[13.5px] leading-relaxed text-text-dim">
                Sellers pick a format on the Content page (or ask the Orchestrator), the director plans it with Claude, and only then is the image / video made. Studio
                spend has its own monthly limits per plan and doesn&apos;t count against the seller&apos;s AI-chat budget.
              </p>
            </div>
            <div className="flex gap-2">
              <Pill tone={c?.imageKeySet ? "good" : "neutral"}>Images {c?.imageKeySet ? "✓" : "—"}</Pill>
              <Pill tone={c?.videoKeySet ? "good" : "neutral"}>Video {c?.videoKeySet ? "✓" : "—"}</Pill>
            </div>
          </div>
          {data && (
            <div className="mt-5 grid gap-3 sm:grid-cols-3">
              <Stat label="Spent this month" value={`$${data.usage.totalUsd.toFixed(2)}`} />
              <Stat label="Images made" value={String(data.usage.sellers.reduce((a, s) => a + s.images, 0))} />
              <Stat label="Reels made" value={String(data.usage.sellers.reduce((a, s) => a + s.videos, 0))} />
            </div>
          )}
        </Card>

        <Card className="p-6">
          <SectionLabel>Keys</SectionLabel>
          <div className="mt-4 grid gap-5">
            <KeyInput
              label="Google AI Studio key (images)"
              saved={!!c?.imageKeySet}
              value={imageKey}
              onChange={setImageKey}
              show={show}
              setShow={setShow}
              help="aistudio.google.com → Get API key → Create key. Turn on billing for the project (the free tier has no image model)."
              link="https://aistudio.google.com/apikey"
            />
            <KeyInput
              label="BytePlus ModelArk key (video)"
              saved={!!c?.videoKeySet}
              value={videoKey}
              onChange={setVideoKey}
              show={show}
              setShow={setShow}
              help="console.byteplus.com → ModelArk → API Keys → Create. Then in Model activation turn on Seedance 2.0 and copy its exact model id below."
              link="https://console.byteplus.com/ark"
            />
          </div>
        </Card>

        <Card className="p-6">
          <SectionLabel>Models & prices</SectionLabel>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <TextField label="Image model id" value={form.imageModel ?? ""} onChange={(v) => setForm({ ...form, imageModel: v })} />
            <TextField label="Video model id" value={form.videoModel ?? ""} onChange={(v) => setForm({ ...form, videoModel: v })} hint="Copy it exactly from ModelArk's model list." />
            <TextField label="Video API base URL" value={form.videoBaseUrl ?? ""} onChange={(v) => setForm({ ...form, videoBaseUrl: v })} />
            <div>
              <label className="text-[12.5px] font-medium text-text-dim">Video resolution</label>
              <select value={form.videoResolution ?? "720p"} onChange={(e) => setForm({ ...form, videoResolution: e.target.value })} className="input mt-1 block w-full">
                <option value="480p">480p (cheapest)</option>
                <option value="720p">720p (recommended)</option>
                <option value="1080p">1080p</option>
              </select>
            </div>
            <TextField label="Cost per image (USD)" value={form.imageCostUsd ?? ""} onChange={(v) => setForm({ ...form, imageCostUsd: v })} hint="Used for cost reports — match your real rate." />
            <TextField label="Video cost per second (USD)" value={form.videoCostPerSecUsd ?? ""} onChange={(v) => setForm({ ...form, videoCostPerSecUsd: v })} />
          </div>

          <div className="mt-5">
            <div className="text-[12.5px] font-medium text-text-dim">Monthly allowance per seller</div>
            <div className="mt-2 grid gap-3 sm:grid-cols-2">
              {PLANS.map((p) => (
                <div key={p.id} className="rounded-xl bg-panel-2 px-4 py-3">
                  <div className="text-[12px] text-text-faint">{p.label}</div>
                  <div className="mt-1 flex gap-4">
                    <label className="flex items-center gap-2 text-[13px]">
                      <input
                        type="number"
                        min={0}
                        value={limits[p.id]?.images ?? ""}
                        onChange={(e) => setLimits({ ...limits, [p.id]: { ...limits[p.id], images: e.target.value } })}
                        className="w-16 bg-transparent text-[16px] font-semibold tabular-nums outline-none"
                      />
                      images
                    </label>
                    <label className="flex items-center gap-2 text-[13px]">
                      <input
                        type="number"
                        min={0}
                        value={limits[p.id]?.videos ?? ""}
                        onChange={(e) => setLimits({ ...limits, [p.id]: { ...limits[p.id], videos: e.target.value } })}
                        className="w-12 bg-transparent text-[16px] font-semibold tabular-nums outline-none"
                      />
                      reels
                    </label>
                  </div>
                  {worst(p.id) != null && <div className="mt-1 text-[11px] text-text-faint">max ${worst(p.id)!.toFixed(2)} / seller / month (10s reels)</div>}
                </div>
              ))}
            </div>
            <p className="mt-2 text-[11.5px] text-text-faint">Starter has no Studio. Failed jobs don&apos;t count. Regenerating counts as a new one.</p>
          </div>

          <div className="mt-5 flex flex-wrap items-center gap-3">
            <label className="flex items-center gap-2.5 text-[13px]">
              <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} className="h-4 w-4 accent-[var(--accent)]" />
              Studio on for all sellers
            </label>
            <Button variant="primary" onClick={save} disabled={saving}>
              {saving ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />} Save
            </Button>
            {saved && <span className="text-[12.5px] text-good">Saved — active now.</span>}
          </div>
        </Card>

        <Card className="p-6">
          <SectionLabel>Test the keys (real calls — they cost a little)</SectionLabel>
          <div className="mt-3 flex flex-wrap gap-2.5">
            <Button variant="secondary" onClick={() => runTest("image")} disabled={!!testing || !c?.imageKeySet}>
              {testing === "image" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />} Test image (~$0.07)
            </Button>
            <Button variant="secondary" onClick={() => runTest("video")} disabled={!!testing || !c?.videoKeySet}>
              {testing === "video" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />} Test video (5s)
            </Button>
          </div>
          {test && (
            <div className={`mt-4 rounded-xl px-4 py-3 text-[13px] ${test.ok ? "bg-good-soft text-good" : "bg-bad-soft text-bad"}`}>
              {test.message}
              {test.preview && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={test.preview} alt="" className="mt-3 h-32 w-32 rounded-lg object-cover" />
              )}
            </div>
          )}
        </Card>

        <Card className="p-6">
          <SectionLabel>This month, by seller</SectionLabel>
          {data?.usage.sellers.length ? (
            <table className="mt-3 w-full text-[13px]">
              <thead>
                <tr className="text-left text-[11.5px] uppercase tracking-wide text-text-faint">
                  <th className="pb-2 font-medium">Seller</th>
                  <th className="pb-2 font-medium">Plan</th>
                  <th className="pb-2 text-right font-medium">Images</th>
                  <th className="pb-2 text-right font-medium">Reels</th>
                  <th className="pb-2 text-right font-medium">Failed</th>
                  <th className="pb-2 text-right font-medium">Cost</th>
                </tr>
              </thead>
              <tbody>
                {data.usage.sellers.map((s) => (
                  <tr key={s.id} className="border-t border-border">
                    <td className="py-2">{s.name}</td>
                    <td className="py-2 capitalize text-text-dim">{s.plan}</td>
                    <td className="py-2 text-right tabular-nums">{s.images}</td>
                    <td className="py-2 text-right tabular-nums">{s.videos}</td>
                    <td className="py-2 text-right tabular-nums text-text-dim">{s.failed}</td>
                    <td className="py-2 text-right tabular-nums text-text-dim">${s.costUsd.toFixed(3)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="mt-3 text-[13px] text-text-faint">Nothing made yet this month.</p>
          )}
        </Card>
      </div>
    </div>
  );
}

function KeyInput({
  label,
  saved,
  value,
  onChange,
  show,
  setShow,
  help,
  link,
}: {
  label: string;
  saved: boolean;
  value: string;
  onChange: (v: string) => void;
  show: boolean;
  setShow: (v: boolean) => void;
  help: string;
  link: string;
}) {
  return (
    <div>
      <div className="flex items-center justify-between">
        <label className="text-[12.5px] font-medium text-text-dim">{label}</label>
        <div className="flex items-center gap-3">
          {saved && <span className="text-[11px] text-good">✓ saved</span>}
          <a href={link} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-[12px] text-accent hover:underline">
            Open <ArrowUpRight className="h-3 w-3" />
          </a>
        </div>
      </div>
      <div className="mt-1 flex items-center gap-2 rounded-xl border border-border-strong bg-panel px-3 py-2">
        <input
          type={show ? "text" : "password"}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={saved ? "Saved — paste a new key to replace" : "Paste the key"}
          className="w-full bg-transparent text-[13.5px] outline-none placeholder:text-text-faint"
          autoComplete="new-password"
          data-1p-ignore
          data-lpignore="true"
        />
        <button onClick={() => setShow(!show)} className="text-text-faint hover:text-text-dim" type="button" aria-label={show ? "Hide keys" : "Show keys"}>
          {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
        </button>
      </div>
      <p className="mt-1 text-[11.5px] text-text-faint">{help}</p>
    </div>
  );
}

function TextField({ label, value, onChange, hint }: { label: string; value: string; onChange: (v: string) => void; hint?: string }) {
  return (
    <div>
      <label className="text-[12.5px] font-medium text-text-dim">{label}</label>
      <input value={value} onChange={(e) => onChange(e.target.value)} className="input mt-1 block w-full" />
      {hint && <p className="mt-1 text-[11.5px] text-text-faint">{hint}</p>}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-panel-2 px-4 py-3">
      <div className="text-[11.5px] uppercase tracking-wide text-text-faint">{label}</div>
      <div className="mt-1 text-[20px] font-semibold tabular-nums">{value}</div>
    </div>
  );
}
