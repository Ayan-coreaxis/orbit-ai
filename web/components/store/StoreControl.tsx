"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ChevronRight, Loader2, Eye, EyeOff, Trash2, ExternalLink } from "lucide-react";
import type { DesignContent, OrbitDesignDoc } from "@/lib/orbit-design";
import { scanImages, setImageSrc, splitTextRuns, replaceRun } from "@/lib/orbit-html-edit";
import { ImageUpload } from "@/components/ImageUpload";

/**
 * The Store Control page — one place to change every piece of the storefront's data: brand, colours,
 * type, contact, and the text + images of every section the AI built. It is fully doc-driven: two
 * stores never have the same sections, so this walks whatever `doc.pages[].sections[]` exist and
 * surfaces editable controls for the text runs and image slots found in each one.
 */
export function StoreControl({ businessId: _businessId }: { businessId: string }) {
  const [doc, setDoc] = useState<OrbitDesignDoc | null>(null);
  const [published, setPublished] = useState(false);
  const [loading, setLoading] = useState(true);
  const [savingKey, setSavingKey] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/orbit-design")
      .then((r) => r.json())
      .then((d) => {
        if (d.doc) setDoc(d.doc);
        setPublished(!!d.published);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const save = useCallback(async (key: string, body: Record<string, unknown>) => {
    setSavingKey(key);
    try {
      const res = await fetch("/api/orbit-design", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (data.doc) setDoc(data.doc);
    } finally {
      setSavingKey(null);
    }
  }, []);

  if (loading) {
    return (
      <div className="flex items-center gap-2 p-8 text-[13px] text-text-faint">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading your storefront…
      </div>
    );
  }
  if (!doc || !doc.pages?.length) {
    return (
      <div className="rounded-xl border border-border bg-panel p-6 text-center">
        <p className="text-[14px] font-medium text-text">No storefront yet</p>
        <p className="mt-1.5 text-[13px] text-text-dim">Design one first, then come back here to fine-tune every detail.</p>
        <Link
          href="/dashboard/orbit-design"
          className="mt-4 inline-flex rounded-lg gradient-fill px-4 py-2 text-[13px] font-semibold text-white"
        >
          Open Orbit Design
        </Link>
      </div>
    );
  }

  const busy = (k: string) => savingKey === k;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between px-1">
        <p className="text-[12.5px] text-text-dim">
          Every change here is live-safe and takes effect immediately{published ? " on your published store" : " (publish to go live)"}.
        </p>
        <Link href="/dashboard/orbit-design" className="flex items-center gap-1 text-[12.5px] font-medium text-accent-strong hover:underline">
          Redesign in Orbit <ExternalLink className="h-3.5 w-3.5" />
        </Link>
      </div>

      <Group title="Brand" defaultOpen>
        <Row label="Store name">
          <Text value={doc.storeName} onSave={(v) => save("name", { storeName: v })} busy={busy("name")} />
        </Row>
        <Row label="Tagline">
          <Text value={doc.tagline} onSave={(v) => save("tagline", { tagline: v })} busy={busy("tagline")} />
        </Row>
        <ImageUpload
          label="Logo"
          value={doc.content.logoUrl}
          onChange={(url) => save("logo", { content: { logoUrl: url } })}
          hint="Replaces the text wordmark in your header."
        />
      </Group>

      <Group title="Announcement bar">
        <label className="flex items-center gap-2 text-[13px] text-text-dim">
          <input
            type="checkbox"
            checked={doc.content.announcement.enabled}
            onChange={(e) => save("ann", { content: { announcement: { ...doc.content.announcement, enabled: e.target.checked } } })}
          />
          Show the bar at the top of every page
        </label>
        <Row label="Text">
          <Text
            value={doc.content.announcement.text}
            onSave={(v) => save("ann", { content: { announcement: { ...doc.content.announcement, text: v } } })}
            busy={busy("ann")}
          />
        </Row>
      </Group>

      <Group title="Contact (shown in your footer)">
        {(
          [
            ["contactEmail", "Email", "hello@yourstore.com"],
            ["contactPhone", "Phone", "+92 3XX XXXXXXX"],
            ["contactAddress", "Address", "Shop 4, Main Blvd, Lahore"],
          ] as const
        ).map(([k, label, ph]) => (
          <Row key={k} label={label}>
            <Text
              value={(doc.content as DesignContent)[k]}
              placeholder={ph}
              onSave={(v) => save(k, { content: { [k]: v } })}
              busy={busy(k)}
            />
          </Row>
        ))}
      </Group>

      <Group title="Social links">
        {(["instagram", "tiktok", "facebook", "x", "youtube"] as const).map((k) => (
          <Row key={k} label={k[0].toUpperCase() + k.slice(1)}>
            <Text
              value={doc.content.socials[k]}
              placeholder="https://…"
              onSave={(v) => save(`s-${k}`, { content: { socials: { ...doc.content.socials, [k]: v } } })}
              busy={busy(`s-${k}`)}
            />
          </Row>
        ))}
      </Group>

      <Group title="Colours & type">
        {(
          [
            ["bg", "Background"],
            ["surface", "Surface"],
            ["text", "Text"],
            ["muted", "Muted text"],
            ["border", "Borders"],
            ["accent", "Accent"],
            ["accentText", "On accent"],
          ] as const
        ).map(([k, label]) => (
          <Row key={k} label={label}>
            <Colour value={doc.tokens[k]} onSave={(v) => save(`t-${k}`, { tokens: { [k]: v } })} />
          </Row>
        ))}
        {!!doc.tokens.palette?.length && (
          <>
            <p className="text-[11px] font-semibold uppercase tracking-wide text-text-faint">Brand palette</p>
            {doc.tokens.palette.map((p, i) => (
              <Row key={p.name} label={p.name}>
                <Colour
                  value={p.value}
                  onSave={(v) =>
                    save(`t-pal-${p.name}`, {
                      tokens: { palette: (doc.tokens.palette ?? []).map((x, j) => (j === i ? { ...x, value: v } : x)) },
                    })
                  }
                />
              </Row>
            ))}
          </>
        )}
        <Row label="Heading font">
          <Text value={doc.tokens.fontHeading} onSave={(v) => save("t-fh", { tokens: { fontHeading: v } })} busy={busy("t-fh")} />
        </Row>
        <Row label="Body font">
          <Text value={doc.tokens.fontBody} onSave={(v) => save("t-fb", { tokens: { fontBody: v } })} busy={busy("t-fb")} />
        </Row>
        <Slider label="Corner radius" value={doc.tokens.radius} min={0} max={32} step={1} suffix="px" onSave={(v) => save("t-r", { tokens: { radius: v } })} />
        <Slider label="Spacing density" value={doc.tokens.density} min={0.7} max={1.6} step={0.05} onSave={(v) => save("t-d", { tokens: { density: v } })} />
        <Slider label="Heading weight" value={doc.tokens.headingWeight} min={400} max={900} step={50} onSave={(v) => save("t-w", { tokens: { headingWeight: v } })} />
      </Group>

      <Group title={`Pages & sections (${doc.pages.length})`}>
        {doc.pages.map((p) => (
          <PageBlock key={p.slug} doc={doc} slug={p.slug} save={save} savingKey={savingKey} />
        ))}
      </Group>

      {!!doc.tweaks?.length && (
        <Group title="Custom controls">
          {doc.tweaks.map((tw) => (
            <Row key={tw.key} label={tw.label}>
              {tw.type === "color" ? (
                <Colour value={tw.value} onSave={(v) => save(`tw-${tw.key}`, { tweak: { key: tw.key, value: v } })} />
              ) : tw.type === "select" ? (
                <select
                  value={tw.value}
                  onChange={(e) => save(`tw-${tw.key}`, { tweak: { key: tw.key, value: e.target.value } })}
                  className={inputCls}
                >
                  {(tw.options ?? []).map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  type="range"
                  min={tw.min ?? 0}
                  max={tw.max ?? 100}
                  step={tw.step ?? 1}
                  defaultValue={parseFloat(tw.value) || 0}
                  onMouseUp={(e) => save(`tw-${tw.key}`, { tweak: { key: tw.key, value: `${(e.target as HTMLInputElement).value}${tw.unit ?? ""}` } })}
                  className="w-full accent-accent"
                />
              )}
            </Row>
          ))}
        </Group>
      )}

      <Group title="Header & footer HTML (advanced)">
        <p className="text-[12px] text-text-faint">Hand-edit the raw markup. The nav, cart and account icons are injected automatically — leave the &lt;!--OD_NAV--&gt; markers in place.</p>
        <RawHtml label="Header" value={doc.components.header} onSave={(v) => save("hdr", { blockHtml: { block: "header", html: v } })} busy={busy("hdr")} />
        <RawHtml label="Footer" value={doc.components.footer} onSave={(v) => save("ftr", { blockHtml: { block: "footer", html: v } })} busy={busy("ftr")} />
      </Group>
    </div>
  );
}

// ── pages / sections ───────────────────────────────────────────────────────────

const NAV_OPTS = [
  { v: "always", l: "In nav" },
  { v: "afterLogin", l: "After login" },
  { v: "never", l: "Hidden" },
] as const;

function PageBlock({
  doc,
  slug,
  save,
  savingKey,
}: {
  doc: OrbitDesignDoc;
  slug: string;
  save: (k: string, b: Record<string, unknown>) => void;
  savingKey: string | null;
}) {
  const page = doc.pages.find((p) => p.slug === slug)!;
  const [open, setOpen] = useState(false);
  const navShow = page.navShow ?? (page.nav ? "always" : "never");
  const visibleCount = page.sections.filter((s) => s.visible !== false).length;

  return (
    <div className="rounded-lg border border-border bg-panel-2">
      <button onClick={() => setOpen((o) => !o)} className="flex w-full items-center gap-2 px-3 py-2.5 text-left">
        <ChevronRight className={`h-3.5 w-3.5 shrink-0 text-text-faint transition-transform ${open ? "rotate-90" : ""}`} />
        <span className="text-[13px] font-medium">{page.title}</span>
        <span className="text-[11px] text-text-faint">/{slug === "home" ? "" : slug} · {visibleCount} section{visibleCount === 1 ? "" : "s"}</span>
      </button>
      {open && (
        <div className="space-y-3 border-t border-border p-3">
          <div className="flex flex-wrap items-center gap-3">
            <input
              defaultValue={page.title}
              onBlur={(e) => {
                const t = e.target.value.trim();
                if (t && t !== page.title) save(`pt-${slug}`, { pageNav: { slug, navShow, title: t } });
              }}
              className="min-w-0 flex-1 rounded-md border border-border bg-panel px-2 py-1.5 text-[12.5px] outline-none focus:border-accent/50"
            />
            <div className="flex gap-1">
              {NAV_OPTS.map((o) => (
                <button
                  key={o.v}
                  onClick={() => save(`pn-${slug}`, { pageNav: { slug, navShow: o.v } })}
                  className={`rounded-md border px-2 py-1 text-[11.5px] font-medium ${
                    navShow === o.v ? "border-accent/40 bg-accent-soft text-accent-strong" : "border-border text-text-dim"
                  }`}
                >
                  {o.l}
                </button>
              ))}
            </div>
          </div>

          {page.sections.map((s) => (
            <SectionBlock key={s.id} doc={doc} pageSlug={slug} sectionId={s.id} save={save} savingKey={savingKey} />
          ))}
        </div>
      )}
    </div>
  );
}

function SectionBlock({
  doc,
  pageSlug,
  sectionId,
  save,
  savingKey,
}: {
  doc: OrbitDesignDoc;
  pageSlug: string;
  sectionId: string;
  save: (k: string, b: Record<string, unknown>) => void;
  savingKey: string | null;
}) {
  const s = doc.pages.find((p) => p.slug === pageSlug)!.sections.find((x) => x.id === sectionId)!;
  const key = `sec-${sectionId}`;
  // hide functional markers ({{auth}}, {{cart}}, …) — they're not seller-editable copy
  const runs = useMemo(() => splitTextRuns(s.html || "").filter((r) => !/^\{\{.*\}\}$/.test(r.text.trim())), [s.html]);
  const imgs = useMemo(() => scanImages(s.html || ""), [s.html]);
  const [raw, setRaw] = useState(false);
  const editable = !s.block; // curated-component sections are managed in Orbit Design
  const hidden = s.visible === false;

  return (
    <div className={`rounded-md border border-border bg-panel p-2.5 ${hidden ? "opacity-55" : ""}`}>
      <div className="flex items-center gap-2">
        <span className="min-w-0 flex-1 truncate text-[12px] font-medium text-text-dim">{s.label || s.type}</span>
        {savingKey === key && <Loader2 className="h-3 w-3 animate-spin text-text-faint" />}
        <button
          onClick={() => save(key, { sectionVisibility: [{ page: pageSlug, id: sectionId, visible: hidden }] })}
          title={hidden ? "Show" : "Hide"}
          className="text-text-faint hover:text-text"
        >
          {hidden ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
        </button>
        <button
          onClick={() => confirm(`Delete the "${s.label || s.type}" section?`) && save(key, { blockDelete: `s:${sectionId}` })}
          title="Delete"
          className="text-text-faint hover:text-bad"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>

      {!editable ? (
        <p className="mt-1.5 text-[11.5px] text-text-faint">Managed in Orbit Design — ask there to change it.</p>
      ) : raw ? (
        <RawHtml
          label=""
          value={s.html}
          onSave={(v) => save(key, { blockHtml: { block: `s:${sectionId}`, html: v } })}
          busy={savingKey === key}
        />
      ) : (
        <div className="mt-2 space-y-2">
          {runs.map((r) => (
            <textarea
              key={r.index}
              defaultValue={r.text}
              rows={r.text.length > 70 ? 3 : 1}
              onBlur={(e) => {
                if (e.target.value !== r.text) {
                  save(key, { blockHtml: { block: `s:${sectionId}`, html: replaceRun(s.html, r.index, e.target.value) } });
                }
              }}
              className="w-full resize-none rounded-md border border-border bg-panel-2 px-2 py-1.5 text-[12.5px] outline-none focus:border-accent/50"
            />
          ))}
          {imgs.map((im) => (
            <ImageUpload
              key={im.index}
              compact
              label={im.brief ? `Image · ${im.brief}` : "Image"}
              value={im.src}
              onChange={(url) => save(key, { blockHtml: { block: `s:${sectionId}`, html: setImageSrc(s.html, im.index, url) } })}
            />
          ))}
          {!runs.length && !imgs.length && <p className="text-[11.5px] text-text-faint">No editable text or images here.</p>}
        </div>
      )}

      {editable && (
        <button onClick={() => setRaw((v) => !v)} className="mt-1.5 text-[11px] text-text-faint underline hover:text-text">
          {raw ? "Simple editor" : "Edit HTML"}
        </button>
      )}
    </div>
  );
}

// ── small controls ─────────────────────────────────────────────────────────────

const inputCls = "w-full rounded-md border border-border bg-panel-2 px-2.5 py-1.5 text-[12.5px] outline-none focus:border-accent/50";

function Group({ title, defaultOpen = false, children }: { title: string; defaultOpen?: boolean; children: React.ReactNode }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="rounded-xl border border-border bg-panel">
      <button onClick={() => setOpen((o) => !o)} className="flex w-full items-center gap-2 px-4 py-3 text-left">
        <ChevronRight className={`h-4 w-4 text-text-faint transition-transform ${open ? "rotate-90" : ""}`} />
        <span className="text-[13.5px] font-semibold">{title}</span>
      </button>
      {open && <div className="space-y-3 border-t border-border p-4">{children}</div>}
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="grid gap-1 text-[12px] text-text-dim sm:grid-cols-[120px_1fr] sm:items-center sm:gap-3">
      <span>{label}</span>
      <div className="min-w-0">{children}</div>
    </label>
  );
}

function Text({
  value,
  placeholder,
  onSave,
  busy,
}: {
  value: string;
  placeholder?: string;
  onSave: (v: string) => void;
  busy?: boolean;
}) {
  const [v, setV] = useState(value);
  const [seen, setSeen] = useState(value);
  if (seen !== value) {
    setSeen(value); // a new saved value came in — show it
    setV(value);
  }
  return (
    <div className="flex items-center gap-1.5">
      <input
        value={v}
        placeholder={placeholder}
        onChange={(e) => setV(e.target.value)}
        onBlur={() => v !== value && onSave(v)}
        onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
        className={inputCls}
      />
      {busy && <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-text-faint" />}
    </div>
  );
}

function Colour({ value, onSave }: { value: string; onSave: (v: string) => void }) {
  const [v, setV] = useState(value);
  const [seen, setSeen] = useState(value);
  if (seen !== value) {
    setSeen(value); // a new saved value came in — show it
    setV(value);
  }
  const hex = /^#[0-9a-f]{3,8}$/i.test(v.trim()) ? v.trim() : "#000000";
  return (
    <div className="flex items-center gap-2">
      <input
        type="color"
        value={hex}
        onChange={(e) => {
          setV(e.target.value);
          onSave(e.target.value);
        }}
        className="h-7 w-9 shrink-0 rounded border border-border bg-transparent"
      />
      <input
        value={v}
        onChange={(e) => setV(e.target.value)}
        onBlur={() => v !== value && onSave(v)}
        className={inputCls}
      />
    </div>
  );
}

function Slider({
  label,
  value,
  min,
  max,
  step,
  suffix,
  onSave,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  suffix?: string;
  onSave: (v: number) => void;
}) {
  const [v, setV] = useState(value);
  const [seen, setSeen] = useState(value);
  if (seen !== value) {
    setSeen(value); // a new saved value came in — show it
    setV(value);
  }
  return (
    <Row label={label}>
      <div className="flex items-center gap-3">
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={v}
          onChange={(e) => setV(parseFloat(e.target.value))}
          onMouseUp={() => v !== value && onSave(v)}
          onTouchEnd={() => v !== value && onSave(v)}
          className="w-full accent-accent"
        />
        <span className="w-14 shrink-0 text-right text-[12px] tabular-nums text-text-dim">
          {step < 1 ? v.toFixed(2) : v}
          {suffix}
        </span>
      </div>
    </Row>
  );
}

function RawHtml({ label, value, onSave, busy }: { label: string; value: string; onSave: (v: string) => void; busy?: boolean }) {
  const [v, setV] = useState(value);
  const [seen, setSeen] = useState(value);
  if (seen !== value) {
    setSeen(value); // a new saved value came in — show it
    setV(value);
  }
  return (
    <div>
      {label && <div className="mb-1 text-[11px] font-medium uppercase tracking-wide text-text-faint">{label}</div>}
      <textarea
        value={v}
        onChange={(e) => setV(e.target.value)}
        spellCheck={false}
        rows={8}
        className="w-full resize-y rounded-md border border-border bg-panel-2 p-2.5 font-mono text-[11.5px] leading-relaxed outline-none focus:border-accent/50"
      />
      <button
        onClick={() => v !== value && onSave(v)}
        disabled={busy || v === value}
        className="mt-1.5 rounded-md gradient-fill px-3 py-1 text-[11.5px] font-semibold text-white disabled:opacity-40"
      >
        {busy ? "Saving…" : "Save HTML"}
      </button>
    </div>
  );
}
