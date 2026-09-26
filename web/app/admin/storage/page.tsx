"use client";

import { useEffect, useState } from "react";
import { Topbar } from "@/components/Topbar";
import { Card, SectionLabel, Pill, Button } from "@/components/ui";
import { Check, Cloud, HardDrive, Loader2, RefreshCw, Eye, EyeOff, X, ArrowUpRight } from "lucide-react";

type Field = { set: boolean; value: string };
type Usage = {
  mode: "r2" | "local";
  publicUrl: string | null;
  bucket: string | null;
  local: { bytes: number; files: number };
  onR2: { bytes: number; files: number } | null;
  totalBytes: number;
  uploadsThisMonth: number;
  estMonthlyUsd: number;
  byKind: { kind: string; bytes: number; files: number }[];
  byBusiness: { businessId: string; name: string; bytes: number; files: number }[];
};
type Pricing = { freeGb: number; perGbMonth: number; classAPerMillion: number; classBPerMillion: number; freeClassA: number; freeClassB: number };

const FIELDS: { id: string; label: string; hint: string; secret: boolean; placeholder: string }[] = [
  { id: "r2_account_id", label: "Account ID", hint: "Cloudflare dashboard → R2 → right side, “Account ID”.", secret: false, placeholder: "e.g. 4f1c…9a2b" },
  { id: "r2_bucket", label: "Bucket name", hint: "R2 → Create bucket (e.g. orbit-media). Location: Automatic.", secret: false, placeholder: "orbit-media" },
  { id: "r2_access_key_id", label: "Access Key ID", hint: "R2 → Manage R2 API Tokens → Create token → Object Read & Write, this bucket only.", secret: true, placeholder: "Access Key ID" },
  { id: "r2_secret_access_key", label: "Secret Access Key", hint: "Shown once when you create the token — copy it straight here.", secret: true, placeholder: "Secret Access Key" },
  { id: "r2_public_url", label: "Public URL", hint: "Bucket → Settings → Public access: enable the r2.dev URL or connect a custom domain (recommended for production), then paste it.", secret: false, placeholder: "https://pub-xxxx.r2.dev or https://media.yourdomain.com" },
];

const fmt = (b: number) => (b < 1024 * 1024 ? `${(b / 1024).toFixed(0)} KB` : b < 1024 ** 3 ? `${(b / 1024 / 1024).toFixed(1)} MB` : `${(b / 1024 ** 3).toFixed(2)} GB`);

export default function StoragePage() {
  const [usage, setUsage] = useState<Usage | null>(null);
  const [pricing, setPricing] = useState<Pricing | null>(null);
  const [fields, setFields] = useState<Record<string, Field>>({});
  const [values, setValues] = useState<Record<string, string>>({});
  const [show, setShow] = useState<Record<string, boolean>>({});
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [test, setTest] = useState<{ ok: boolean; steps: { step: string; ok: boolean; detail?: string }[] } | null>(null);
  const [testing, setTesting] = useState(false);
  const [migrating, setMigrating] = useState(false);
  const [migration, setMigration] = useState<string | null>(null);

  async function load() {
    apply(await (await fetch("/api/admin/storage")).json());
  }
  function apply(d: { usage: Usage; pricing: Pricing; fields?: Record<string, Field> }) {
    setUsage(d.usage);
    setPricing(d.pricing);
    setFields(d.fields ?? {});
    setValues((v) => ({ ...v, r2_account_id: d.fields?.r2_account_id?.value ?? "", r2_bucket: d.fields?.r2_bucket?.value ?? "", r2_public_url: d.fields?.r2_public_url?.value ?? "" }));
  }
  useEffect(() => {
    let alive = true;
    fetch("/api/admin/storage")
      .then((r) => r.json())
      .then((d) => alive && apply(d))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  async function saveAll() {
    setSaving(true);
    setSaved(false);
    for (const f of FIELDS) {
      const v = values[f.id]?.trim();
      if (!v || (!f.secret && v === fields[f.id]?.value)) continue;
      await fetch("/api/admin/settings", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: f.id, value: v.replace(/\/+$/, "") }) });
    }
    setValues((v) => ({ ...v, r2_access_key_id: "", r2_secret_access_key: "" }));
    setSaving(false);
    setSaved(true);
    setTest(null);
    await load();
  }

  async function runTest() {
    setTesting(true);
    setTest(await (await fetch("/api/admin/storage", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "test" }) })).json());
    setTesting(false);
  }

  async function migrate() {
    if (!confirm("Copy every file on this server to R2 and point stores at the R2 copies? Local files are kept as a backup.")) return;
    setMigrating(true);
    setMigration(null);
    const d = await (await fetch("/api/admin/storage", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "migrate" }) })).json();
    setMigration(d.error ? `Failed: ${d.error}` : d.failed?.length ? `Copied ${d.copied}, but ${d.failed.length} failed — nothing was switched over. First: ${d.failed[0]}` : `Done — copied ${d.copied} files, updated ${d.rowsUpdated} records to R2 links.`);
    setMigrating(false);
    await load();
  }

  const allSet = FIELDS.every((f) => fields[f.id]?.set);
  const localLeft = usage && usage.mode === "r2" ? usage.local.files - (usage.onR2?.files ?? 0) : 0;

  return (
    <div>
      <Topbar title="Storage" subtitle="Where sellers' photos, videos, voice notes and PDFs are kept — Cloudflare R2 or this server" />
      <div className="max-w-[1000px] space-y-5 p-10">
        {/* Status */}
        <Card className="p-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-panel-2">
                {usage?.mode === "r2" ? <Cloud className="h-5 w-5 text-good" /> : <HardDrive className="h-5 w-5 text-warn" />}
              </div>
              <div>
                <div className="text-[15px] font-medium">{usage?.mode === "r2" ? "Cloudflare R2 is active" : "Files are on this server"}</div>
                <p className="mt-1 max-w-xl text-[13.5px] leading-relaxed text-text-dim">
                  {usage?.mode === "r2"
                    ? `New uploads go to bucket “${usage.bucket}” and are served from ${usage.publicUrl}.`
                    : "Fine for local testing. Before moving to a VPS, connect R2 below — a VPS disk is small, and files on it are lost if the server is rebuilt."}
                </p>
              </div>
            </div>
            <Pill tone={usage?.mode === "r2" ? "good" : "warn"}>{usage?.mode === "r2" ? "R2" : "Local disk"}</Pill>
          </div>
          {usage && (
            <div className="mt-5 grid gap-3 sm:grid-cols-4">
              <Stat label="Total stored" value={fmt(usage.totalBytes)} />
              <Stat label="Files on this server" value={`${usage.local.files}`} sub={fmt(usage.local.bytes)} />
              <Stat label="Uploads this month" value={`${usage.uploadsThisMonth}`} />
              <Stat label="Est. R2 cost / month" value={`$${usage.estMonthlyUsd.toFixed(2)}`} sub={pricing ? `first ${pricing.freeGb} GB free` : undefined} />
            </div>
          )}
        </Card>

        {/* Config */}
        <Card className="p-6">
          <div className="flex items-center justify-between">
            <SectionLabel>Cloudflare R2 settings</SectionLabel>
            <a href="https://dash.cloudflare.com/?to=/:account/r2/overview" target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-[12.5px] text-accent hover:underline">
              Open Cloudflare R2 <ArrowUpRight className="h-3.5 w-3.5" />
            </a>
          </div>
          <p className="mt-2 text-[13px] leading-relaxed text-text-dim">
            Saved to this server&apos;s <code>.env.local</code> and used immediately. Secrets are never shown again after saving.
          </p>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            {FIELDS.map((f) => (
              <div key={f.id} className={f.id === "r2_public_url" ? "sm:col-span-2" : ""}>
                <div className="flex items-center justify-between">
                  <label className="text-[12.5px] font-medium text-text-dim">{f.label}</label>
                  {fields[f.id]?.set && <span className="text-[11px] text-good">✓ saved</span>}
                </div>
                <div className="mt-1 flex items-center gap-2 rounded-xl border border-border-strong bg-panel px-3 py-2">
                  <input
                    type={f.secret && !show[f.id] ? "password" : "text"}
                    value={values[f.id] ?? ""}
                    onChange={(e) => setValues({ ...values, [f.id]: e.target.value })}
                    placeholder={f.secret && fields[f.id]?.set ? "Saved — paste a new one to replace" : f.placeholder}
                    className="w-full bg-transparent text-[13.5px] outline-none placeholder:text-text-faint"
                    // Never let the browser autofill the admin's own login email/password into these.
                    name={`orbit-${f.id}`}
                    autoComplete={f.secret ? "new-password" : "off"}
                    data-1p-ignore
                    data-lpignore="true"
                  />
                  {f.secret && (
                    <button onClick={() => setShow({ ...show, [f.id]: !show[f.id] })} className="text-text-faint hover:text-text-dim" type="button">
                      {show[f.id] ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  )}
                </div>
                <p className="mt-1 text-[11.5px] text-text-faint">{f.hint}</p>
              </div>
            ))}
          </div>
          <div className="mt-5 flex flex-wrap items-center gap-2.5">
            <Button variant="primary" onClick={saveAll} disabled={saving}>
              {saving ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />} Save
            </Button>
            <Button onClick={runTest} disabled={testing || !allSet}>
              {testing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Cloud className="h-4 w-4" />} Test connection
            </Button>
            {saved && <span className="text-[12.5px] text-good">Saved.</span>}
            {!allSet && <span className="text-[12px] text-text-faint">Fill all five fields to turn R2 on.</span>}
          </div>
          {test && (
            <ul className="mt-4 space-y-1.5 rounded-xl bg-panel-2 p-4 text-[13px]">
              {test.steps.map((s) => (
                <li key={s.step} className="flex gap-2">
                  {s.ok ? <Check className="mt-0.5 h-4 w-4 shrink-0 text-good" /> : <X className="mt-0.5 h-4 w-4 shrink-0 text-bad" />}
                  <span>
                    {s.step}
                    {s.detail && <span className="block text-[12px] text-text-faint">{s.detail}</span>}
                  </span>
                </li>
              ))}
              <li className={`pt-1 font-medium ${test.ok ? "text-good" : "text-bad"}`}>{test.ok ? "R2 works — new uploads now go to your bucket." : "Not working yet — fix the red step above."}</li>
            </ul>
          )}
        </Card>

        {/* Migration */}
        {usage?.mode === "r2" && (
          <Card className="p-6">
            <SectionLabel>Move existing files to R2</SectionLabel>
            <p className="mt-2 text-[13px] leading-relaxed text-text-dim">
              Copies everything already uploaded on this server into the bucket and switches product photos, store designs and media links to the R2 copies. Local files are kept as a backup. Run it once before moving to the VPS.
            </p>
            <div className="mt-4 flex items-center gap-3">
              <Button onClick={migrate} disabled={migrating}>
                {migrating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Cloud className="h-4 w-4" />} {migrating ? "Moving files…" : `Move ${usage.local.files} files to R2`}
              </Button>
              {localLeft > 0 && !migration && <span className="text-[12px] text-warn">{localLeft} files still only on this server</span>}
            </div>
            {migration && <p className="mt-3 text-[13px] text-text-dim">{migration}</p>}
          </Card>
        )}

        {/* Usage breakdown */}
        {usage && (
          <div className="grid gap-5 lg:grid-cols-2">
            <Card className="p-6">
              <SectionLabel>By seller</SectionLabel>
              {usage.byBusiness.length ? (
                <table className="mt-3 w-full text-[13px]">
                  <tbody>
                    {usage.byBusiness.slice(0, 15).map((b) => (
                      <tr key={b.businessId} className="border-b border-border last:border-0">
                        <td className="py-2">{b.name}</td>
                        <td className="py-2 text-right text-text-faint">{b.files} files</td>
                        <td className="py-2 text-right tabular-nums">{fmt(b.bytes)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <p className="mt-3 text-[13px] text-text-faint">No uploads yet.</p>
              )}
            </Card>
            <Card className="p-6">
              <SectionLabel>By type</SectionLabel>
              <table className="mt-3 w-full text-[13px]">
                <tbody>
                  {usage.byKind.map((k) => (
                    <tr key={k.kind} className="border-b border-border last:border-0">
                      <td className="py-2 capitalize">{k.kind === "pdf" ? "PDFs" : `${k.kind}s`}</td>
                      <td className="py-2 text-right text-text-faint">{k.files} files</td>
                      <td className="py-2 text-right tabular-nums">{fmt(k.bytes)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {pricing && (
                <p className="mt-4 text-[12px] leading-relaxed text-text-faint">
                  R2 pricing: first {pricing.freeGb} GB free every month, then ${pricing.perGbMonth}/GB-month. Uploads ${pricing.classAPerMillion}/million and reads ${pricing.classBPerMillion}/million after {pricing.freeClassA / 1e6}M / {pricing.freeClassB / 1e6}M free. Downloads (egress) are free. The estimate above covers storage only.
                </p>
              )}
            </Card>
          </div>
        )}

        {/* Whisper */}
        <Card className="p-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <SectionLabel>Speech-to-text for uploaded audio (optional)</SectionLabel>
              <p className="mt-2 max-w-xl text-[13px] leading-relaxed text-text-dim">
                Voice notes recorded in the chat are transcribed free by the browser. Audio <em>files</em> sellers upload need OpenAI Whisper (~$0.006 per minute). Without it they&apos;re stored with a note that there&apos;s no transcript.
              </p>
            </div>
            <Pill tone={fields.openai_whisper?.set ? "good" : "neutral"}>{fields.openai_whisper?.set ? "Connected" : "Not connected"}</Pill>
          </div>
          <div className="mt-3 flex items-center gap-2.5">
            <input
              type="password"
              value={values.openai_whisper ?? ""}
              onChange={(e) => setValues({ ...values, openai_whisper: e.target.value })}
              placeholder={fields.openai_whisper?.set ? "Saved — paste a new key to replace" : "OpenAI API key (sk-…)"}
              className="flex-1 rounded-xl border border-border-strong bg-panel px-3 py-2 text-[13.5px] outline-none placeholder:text-text-faint"
              name="orbit-openai-whisper"
              autoComplete="new-password"
              data-1p-ignore
              data-lpignore="true"
            />
            <Button
              variant="primary"
              onClick={async () => {
                if (!values.openai_whisper?.trim()) return;
                await fetch("/api/admin/settings", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: "openai_whisper", value: values.openai_whisper.trim() }) });
                setValues({ ...values, openai_whisper: "" });
                load();
              }}
            >
              <Check className="h-4 w-4" /> Save
            </Button>
          </div>
        </Card>
      </div>
    </div>
  );
}

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-xl bg-panel-2 px-4 py-3">
      <div className="text-[11.5px] uppercase tracking-wide text-text-faint">{label}</div>
      <div className="mt-1 text-[18px] font-semibold tabular-nums">{value}</div>
      {sub && <div className="text-[11.5px] text-text-faint">{sub}</div>}
    </div>
  );
}
