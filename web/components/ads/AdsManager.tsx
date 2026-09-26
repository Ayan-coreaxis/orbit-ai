"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, Check, Clapperboard, ExternalLink, Loader2, Megaphone, Pause, Play, Plus, Trash2, X } from "lucide-react";
import { Button, Card, Pill } from "@/components/ui";
import { cn } from "@/lib/utils";

type Campaign = {
  id: string;
  name: string;
  status: string;
  metaStatus: string | null;
  reviewNote: string | null;
  dailyBudget: number | null;
  currency: string | null;
  hasAd: boolean;
  headline: string | null;
  primaryText: string | null;
  reasoning: string;
  link: string | null;
  thumbUrl: string | null;
  isVideo: boolean;
  spend: number | null;
  impressions: number | null;
  clicks: number | null;
  objective: string | null;
  purchases: number | null;
  purchaseValue: number | null;
  endsAt: string | null;
  source: string;
  createdAt: string;
};
type Media = { id: string; kind: string; name: string; url: string; poster: string | null; source: string };
type Data = {
  ready: { page: string | null; adAccount: boolean; userToken: boolean; store: string | null; storeReason: string | null };
  account: { currency: string; minDailyBudget: number | null; status: string; ok: boolean; name: string } | null;
  accountError: string | null;
  campaigns: Campaign[];
  media: Media[];
  products: { id: string; name: string }[];
};

const CTA_LABEL: Record<string, string> = { SHOP_NOW: "Shop now", ORDER_NOW: "Order now", BUY_NOW: "Buy now", LEARN_MORE: "Learn more", GET_OFFER: "Get offer", SIGN_UP: "Sign up" };

const META_STATUS: Record<string, { label: string; tone: "neutral" | "good" | "warn" | "bad" | "accent" }> = {
  ACTIVE: { label: "Running", tone: "good" },
  PAUSED: { label: "Paused", tone: "warn" },
  CAMPAIGN_PAUSED: { label: "Paused", tone: "warn" },
  ADSET_PAUSED: { label: "Paused", tone: "warn" },
  PENDING_REVIEW: { label: "In Meta review", tone: "accent" },
  IN_PROCESS: { label: "Processing", tone: "accent" },
  DISAPPROVED: { label: "Rejected by Meta", tone: "bad" },
  WITH_ISSUES: { label: "Has issues", tone: "bad" },
  PENDING_BILLING_INFO: { label: "Needs payment method", tone: "bad" },
};

const money = (n: number | null | undefined, c: string | null) => (n == null ? "—" : `${c ?? ""} ${n.toLocaleString(undefined, { maximumFractionDigits: 2 })}`.trim());

/** The Ads page: is Meta ready, create a complete ad (paused), and run / pause / delete it with live results. */
export function AdsManager() {
  const [data, setData] = useState<Data | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<Campaign | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/ads");
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || "Couldn't load ads.");
      setData(d);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Couldn't load ads.");
    }
  }, []);
  useEffect(() => {
    let alive = true;
    fetch("/api/ads")
      .then(async (r) => ({ ok: r.ok, d: await r.json() }))
      .then(({ ok, d }) => {
        if (!alive) return;
        if (ok) {
          setData(d);
          // Opened from Studio's "Make it an ad" → go straight to the form.
          if (new URLSearchParams(window.location.search).get("media")) setCreating(true);
        } else setErr(d.error || "Couldn't load ads.");
      })
      .catch(() => alive && setErr("Couldn't load ads."));
    return () => {
      alive = false;
    };
  }, []);

  async function act(c: Campaign, action: "activate" | "pause" | "delete") {
    setBusy(c.id);
    setErr(null);
    try {
      const res = await fetch(`/api/ads/${c.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action }) });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error || "Couldn't update the ad.");
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Couldn't update the ad.");
    } finally {
      setBusy(null);
      setConfirm(null);
    }
  }

  if (!data) {
    return err ? (
      <Card className="p-6 text-[13px] text-bad">{err}</Card>
    ) : (
      <Card className="flex justify-center p-10 text-text-faint">
        <Loader2 className="h-5 w-5 animate-spin" />
      </Card>
    );
  }

  const r = data.ready;
  const canCreate = !!r.page && r.adAccount && r.userToken && !!r.store && !!data.account?.ok;

  return (
    <div className="grid gap-5">
      <Card className="p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="max-w-xl">
            <div className="flex items-center gap-2">
              <Megaphone className="h-4 w-4 text-accent" />
              <h2 className="text-[16px] font-semibold">Meta ads (Facebook + Instagram)</h2>
            </div>
            <p className="mt-1.5 text-[13px] leading-relaxed text-text-dim">
              Every ad is built complete in your own Meta ad account and saved <b>paused</b>. Nothing spends until you press Activate — and Pause stops it instantly.
            </p>
          </div>
          <Button onClick={() => setCreating(true)} disabled={!canCreate}>
            <Plus className="h-4 w-4" /> Create an ad
          </Button>
        </div>
        <ul className="mt-5 grid gap-2 sm:grid-cols-2">
          <Check1 ok={!!r.page} label={r.page ? `Facebook Page: ${r.page}` : "Facebook Page not connected"} fix="/dashboard/settings" />
          <Check1
            ok={r.adAccount && r.userToken && !!data.account?.ok}
            label={
              !r.adAccount
                ? "No ad account connected"
                : !r.userToken
                  ? "Reconnect Meta once to allow ads"
                  : data.accountError
                    ? data.accountError
                    : data.account
                      ? `Ad account: ${data.account.name} · ${data.account.currency} · ${data.account.status}`
                      : "Ad account"
            }
            fix="/dashboard/settings"
          />
          <Check1 ok={!!r.store} label={r.store ? `Ads send people to ${r.store.replace(/^https:\/\//, "")}` : (r.storeReason ?? "Store isn't public yet")} fix="/dashboard/settings#domain" />
          <Check1 ok={data.media.length > 0} label={data.media.length ? `${data.media.length} photos & videos ready to use` : "No photos or videos yet — make some in Content > Orbit Studio"} fix="/dashboard/content" />
        </ul>
      </Card>

      {err && <Card className="p-4 text-[13px] text-bad">{err}</Card>}

      {data.campaigns.length === 0 ? (
        <Card className="p-8 text-center text-[13.5px] text-text-faint">No ads yet. Create one above, or ask your Orchestrator to plan one.</Card>
      ) : (
        <div className="grid gap-3">
          {data.campaigns.map((c) => {
            const ms = c.metaStatus ? META_STATUS[c.metaStatus] : null;
            const ctr = c.impressions && c.clicks != null ? ((c.clicks / c.impressions) * 100).toFixed(2) : null;
            return (
              <Card key={c.id} className="flex flex-col gap-4 p-5 sm:flex-row">
                <div className="relative h-28 w-28 shrink-0 overflow-hidden rounded-lg bg-panel-2">
                  {c.isVideo && <Clapperboard className="absolute bottom-1.5 right-1.5 h-4 w-4 text-white drop-shadow" />}
                  {c.thumbUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={c.thumbUrl} alt="" className="h-full w-full object-cover" />
                  ) : (
                    <div className="flex h-full items-center justify-center text-text-faint">
                      <Megaphone className="h-5 w-5" />
                    </div>
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-[14px] font-semibold">{c.name}</span>
                    <Pill tone={c.status === "active" ? "good" : c.status === "error" ? "bad" : "warn"}>{c.status === "active" ? "Active" : c.status === "error" ? "Error" : "Paused"}</Pill>
                    {ms && ms.label !== "Paused" && ms.label !== "Running" && <Pill tone={ms.tone}>{ms.label}</Pill>}
                    {c.objective && <span className="text-[11.5px] text-text-faint">{c.objective === "sales" ? "Optimised for sales" : "Optimised for clicks"}</span>}
                    {c.source !== "owner" && <span className="text-[11.5px] text-text-faint">by {c.source === "ads-agent" ? "Ads Agent" : "Orchestrator"}</span>}
                  </div>
                  {c.headline && <div className="mt-1 text-[13px] font-medium">{c.headline}</div>}
                  {c.primaryText && <p className="mt-0.5 line-clamp-2 text-[12.5px] text-text-dim">{c.primaryText}</p>}
                  {!c.hasAd && (
                    <p className="mt-2 flex items-center gap-1.5 text-[12.5px] text-warn">
                      <AlertTriangle className="h-3.5 w-3.5" /> Old empty campaign (no ad inside) — it can&apos;t deliver. Delete it and create a new ad.
                    </p>
                  )}
                  {c.reviewNote && <p className="mt-2 text-[12.5px] text-bad">Meta: {c.reviewNote}</p>}
                  <div className="mt-3 grid grid-cols-2 gap-x-6 gap-y-1 text-[12.5px] sm:grid-cols-5">
                    <Stat label="Budget / day" value={money(c.dailyBudget, c.currency)} />
                    <Stat label="Spent" value={money(c.spend, c.currency)} />
                    <Stat label="Seen" value={c.impressions != null ? c.impressions.toLocaleString() : "—"} />
                    <Stat label="Clicks" value={c.clicks != null ? c.clicks.toLocaleString() : "—"} />
                    <Stat label="Click rate" value={ctr ? `${ctr}%` : "—"} />
                    {c.objective === "sales" && (
                      <>
                        <Stat label="Sales" value={c.purchases != null ? c.purchases.toLocaleString() : "—"} />
                        <Stat label="Sales value" value={money(c.purchaseValue, c.currency)} />
                        <Stat label="Return" value={c.purchaseValue != null && c.spend ? `${(c.purchaseValue / c.spend).toFixed(1)}×` : "—"} />
                      </>
                    )}
                  </div>
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    {c.status !== "active" && c.hasAd && (
                      <Button className="px-3 py-1.5 text-[12.5px]" disabled={busy === c.id} onClick={() => setConfirm(c)}>
                        <Play className="h-3.5 w-3.5" /> Activate
                      </Button>
                    )}
                    {c.status === "active" && (
                      <Button variant="secondary" className="px-3 py-1.5 text-[12.5px]" disabled={busy === c.id} onClick={() => act(c, "pause")}>
                        {busy === c.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Pause className="h-3.5 w-3.5" />} Pause now
                      </Button>
                    )}
                    {c.status !== "active" && (
                      <Button variant="ghost" className="px-3 py-1.5 text-[12.5px] text-bad" disabled={busy === c.id} onClick={() => confirmDelete(c) && act(c, "delete")}>
                        <Trash2 className="h-3.5 w-3.5" /> Delete
                      </Button>
                    )}
                    {c.link && (
                      <a href={c.link} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-[12px] text-text-faint hover:text-text">
                        Where it sends people <ExternalLink className="h-3 w-3" />
                      </a>
                    )}
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {confirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={() => setConfirm(null)}>
          <div className="w-full max-w-md rounded-2xl border border-border bg-panel p-6 shadow-2xl" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Activate ad">
            <h3 className="text-[16px] font-semibold">Start spending on this ad?</h3>
            <p className="mt-2 text-[13.5px] leading-relaxed text-text-dim">
              &quot;{confirm.name}&quot; will run at up to <b>{money(confirm.dailyBudget, confirm.currency)} a day</b>
              {confirm.endsAt ? ` until ${new Date(confirm.endsAt).toLocaleDateString()}` : " until you pause it"}. Meta charges your ad account&apos;s payment method. Meta first reviews the ad (usually under a day).
            </p>
            <div className="mt-5 flex gap-2">
              <Button variant="secondary" className="flex-1" onClick={() => setConfirm(null)}>
                Cancel
              </Button>
              <Button className="flex-1" disabled={busy === confirm.id} onClick={() => act(confirm, "activate")}>
                {busy === confirm.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />} Activate
              </Button>
            </div>
          </div>
        </div>
      )}

      {creating && <CreateAd data={data} onClose={() => setCreating(false)} onCreated={() => { setCreating(false); load(); }} />}
    </div>
  );
}

function confirmDelete(c: Campaign) {
  return window.confirm(`Delete "${c.name}" from your Meta ad account? This can't be undone.`);
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[11px] text-text-faint">{label}</div>
      <div className="font-medium tabular-nums">{value}</div>
    </div>
  );
}

function Check1({ ok, label, fix }: { ok: boolean; label: string; fix: string }) {
  return (
    <li className={cn("flex items-start gap-2 rounded-lg px-3 py-2 text-[12.5px]", ok ? "bg-good-soft text-good" : "bg-warn-soft text-warn")}>
      {ok ? <Check className="mt-0.5 h-3.5 w-3.5 shrink-0" /> : <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />}
      <span className="flex-1">{label}</span>
      {!ok && (
        <a href={fix} className="shrink-0 font-medium underline">
          Fix
        </a>
      )}
    </li>
  );
}

function CreateAd({ data, onClose, onCreated }: { data: Data; onClose: () => void; onCreated: () => void }) {
  const params = useMemo(() => (typeof window !== "undefined" ? new URLSearchParams(window.location.search) : new URLSearchParams()), []);
  const currency = data.account?.currency ?? "";
  const min = data.account?.minDailyBudget ?? null;
  const [mediaId, setMediaId] = useState(params.get("media") ?? data.media[0]?.id ?? "");
  const [headline, setHeadline] = useState(params.get("headline") ?? "");
  const [text, setText] = useState(params.get("text") ?? "");
  const [cta, setCta] = useState("SHOP_NOW");
  const [budget, setBudget] = useState(min ? String(Math.ceil(min * 2)) : "");
  const [countries, setCountries] = useState("PK");
  const [ageMin, setAgeMin] = useState("18");
  const [ageMax, setAgeMax] = useState("65");
  const [days, setDays] = useState("7");
  const [productId, setProductId] = useState("");
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const picked = data.media.find((m) => m.id === mediaId);
  const b = Number(budget);
  const problems = [
    !mediaId && "pick a photo or video",
    !headline.trim() && "write a headline",
    !text.trim() && "write the ad text",
    !(b > 0) && "set a daily budget",
    min != null && b > 0 && b < min && `budget must be at least ${min} ${currency}`,
  ].filter(Boolean) as string[];

  async function submit() {
    setSaving(true);
    setErr(null);
    try {
      const res = await fetch("/api/ads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          mediaId,
          headline,
          primaryText: text,
          callToAction: cta,
          dailyBudget: b,
          countries: countries.split(/[\s,]+/).filter(Boolean),
          ageMin: Number(ageMin),
          ageMax: Number(ageMax),
          days: Number(days) || null,
          productId: productId || null,
        }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error || "Couldn't create the ad.");
      onCreated();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Couldn't create the ad.");
    } finally {
      setSaving(false);
    }
  }

  const input = "rounded-lg border border-border bg-panel-2 px-3 py-2 text-[13.5px] outline-none focus:border-accent/60";
  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/50" onClick={onClose}>
      <div className="flex h-full w-full max-w-[620px] flex-col border-l border-border bg-panel shadow-2xl" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Create an ad">
        <div className="flex items-center justify-between border-b border-border px-6 py-4">
          <div>
            <h2 className="text-[16px] font-semibold">Create an ad</h2>
            <p className="text-[12.5px] text-text-faint">Built in Meta and saved paused — you activate it after checking.</p>
          </div>
          <button onClick={onClose} className="rounded-md p-1 text-text-faint hover:text-text" aria-label="Close">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="scrollbar-thin grid flex-1 content-start gap-5 overflow-y-auto px-6 py-5">
          <div className="grid gap-1.5">
            <span className="text-[13px] font-medium">Photo or video</span>
            {data.media.length === 0 ? (
              <p className="text-[12.5px] text-text-faint">
                No media yet — make one in <a className="text-accent underline" href="/dashboard/content">Content &gt; Orbit Studio</a>.
              </p>
            ) : (
              <div className="grid max-h-[230px] grid-cols-4 gap-2 overflow-y-auto sm:grid-cols-5">
                {data.media.map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => setMediaId(m.id)}
                    className={cn("relative aspect-square overflow-hidden rounded-lg border", mediaId === m.id ? "border-accent ring-2 ring-accent/40" : "border-border hover:border-accent/50")}
                    title={m.name}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={m.kind === "video" ? (m.poster ?? "") : m.url} alt="" className="h-full w-full bg-panel-2 object-cover" />
                    {m.kind === "video" && <Clapperboard className="absolute bottom-1 right-1 h-3.5 w-3.5 text-white drop-shadow" />}
                  </button>
                ))}
              </div>
            )}
            {picked?.kind === "video" && !picked.poster && <p className="text-[12px] text-warn">This video has no cover image — pick a video made in Orbit Studio, or a photo.</p>}
          </div>
          <label className="grid gap-1.5">
            <span className="text-[13px] font-medium">Headline</span>
            <input className={input} maxLength={40} value={headline} onChange={(e) => setHeadline(e.target.value)} placeholder="e.g. Homemade mango jam, delivered" />
            <span className="text-[11.5px] text-text-faint">{headline.length}/40</span>
          </label>
          <label className="grid gap-1.5">
            <span className="text-[13px] font-medium">Ad text</span>
            <textarea className={cn(input, "resize-none")} rows={4} value={text} onChange={(e) => setText(e.target.value)} placeholder="A hook and a reason to buy. No prices or discounts you don't really offer." />
          </label>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="grid gap-1.5">
              <span className="text-[13px] font-medium">Button</span>
              <select className={input} value={cta} onChange={(e) => setCta(e.target.value)}>
                {Object.entries(CTA_LABEL).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </select>
            </label>
            <label className="grid gap-1.5">
              <span className="text-[13px] font-medium">Send people to</span>
              <select className={input} value={productId} onChange={(e) => setProductId(e.target.value)}>
                <option value="">Store home page</option>
                {data.products.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="grid gap-1.5">
              <span className="text-[13px] font-medium">Daily budget ({currency})</span>
              <input className={input} type="number" min={min ?? 1} value={budget} onChange={(e) => setBudget(e.target.value)} />
              {min != null && <span className="text-[11.5px] text-text-faint">Meta&apos;s minimum: {min} {currency}</span>}
            </label>
            <label className="grid gap-1.5">
              <span className="text-[13px] font-medium">Run for (days)</span>
              <input className={input} type="number" min={0} value={days} onChange={(e) => setDays(e.target.value)} />
              <span className="text-[11.5px] text-text-faint">0 = until you pause it</span>
            </label>
            <label className="grid gap-1.5">
              <span className="text-[13px] font-medium">Countries</span>
              <input className={input} value={countries} onChange={(e) => setCountries(e.target.value.toUpperCase())} placeholder="PK" />
              <span className="text-[11.5px] text-text-faint">2-letter codes, e.g. PK, AE</span>
            </label>
            <div className="grid gap-1.5">
              <span className="text-[13px] font-medium">Age</span>
              <div className="flex items-center gap-2">
                <input className={cn(input, "w-20")} type="number" min={18} max={65} value={ageMin} onChange={(e) => setAgeMin(e.target.value)} />
                <span className="text-text-faint">to</span>
                <input className={cn(input, "w-20")} type="number" min={18} max={65} value={ageMax} onChange={(e) => setAgeMax(e.target.value)} />
              </div>
              <span className="text-[11.5px] text-text-faint">Meta may widen this if it finds buyers outside it.</span>
            </div>
          </div>
          <label className="grid gap-1.5">
            <span className="text-[13px] font-medium">
              Name <span className="text-[11.5px] font-normal text-text-faint">optional — only you see it</span>
            </span>
            <input className={input} value={name} onChange={(e) => setName(e.target.value)} />
          </label>
          {b > 0 && (
            <p className="rounded-lg bg-panel-2 px-3 py-2.5 text-[12.5px] text-text-dim">
              Once you activate it: up to <b>{currency} {b.toLocaleString()}</b> a day
              {Number(days) > 0 ? <>, about <b>{currency} {(b * Number(days)).toLocaleString()}</b> in total over {days} days</> : ", until you pause it"}.
            </p>
          )}
          {err && <p className="rounded-lg bg-bad-soft px-3 py-2.5 text-[12.5px] text-bad">{err}</p>}
        </div>
        <div className="border-t border-border px-6 py-4">
          {problems.length > 0 && <p className="mb-2 text-[12.5px] text-text-faint">Still needed: {problems.join(" · ")}</p>}
          <Button className="w-full" disabled={problems.length > 0 || saving} onClick={submit}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
            {saving ? (picked?.kind === "video" ? "Uploading the video to Meta… (up to 2 minutes)" : "Building the ad in Meta…") : "Create the ad (paused)"}
          </Button>
        </div>
      </div>
    </div>
  );
}
