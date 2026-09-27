"use client";

import { useState } from "react";
import { Card, SectionLabel } from "@/components/ui";
import { DEFAULT_WIDGET_COPY, WIDGET_COPY_GROUPS, type WidgetCopyKey } from "@/lib/widget-copy";
import type { CheckoutCustomField } from "@/lib/checkout-fields";

const MOTIONS: { v: string; label: string; hint: string }[] = [
  { v: "none", label: "None", hint: "Instant — no transitions, no success animation." },
  { v: "standard", label: "Standard", hint: "Subtle hover/focus transitions, a checkmark on order placed." },
  { v: "playful", label: "Playful", hint: "Livelier motion, a paper plane flies off when an order is placed." },
  { v: "premium", label: "Premium", hint: "Slower, more dramatic motion for the same paper-plane moment." },
];

const ALL_ACCOUNT_TABS: { v: string; label: string }[] = [
  { v: "orders", label: "Orders" },
  { v: "track", label: "Track order" },
  { v: "rewards", label: "Rewards" },
  { v: "addresses", label: "Addresses" },
  { v: "profile", label: "Profile" },
];

export type WidgetPart = "motion" | "tabs" | "fields" | "copy";

/** Checkout / cart / account screens. Each settings page shows only its `parts`; Save sends only those. */
export function WidgetCustomizationCard({
  initial,
  parts,
  title,
  description,
}: {
  parts: WidgetPart[];
  title: string;
  description?: string;
  initial: {
    widgetMotion: string;
    widgetCopy: Partial<Record<WidgetCopyKey, string>>;
    accountTabs?: string[];
    checkoutCustomFields?: CheckoutCustomField[];
  };
}) {
  const [motion, setMotion] = useState(initial.widgetMotion || "standard");
  const [copy, setCopy] = useState<Partial<Record<WidgetCopyKey, string>>>(initial.widgetCopy || {});
  const [tabs, setTabs] = useState<string[]>(initial.accountTabs?.length ? initial.accountTabs : ALL_ACCOUNT_TABS.map((t) => t.v));
  const [fields, setFields] = useState<CheckoutCustomField[]>(initial.checkoutCustomFields || []);
  const [openGroup, setOpenGroup] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const has = (p: WidgetPart) => parts.includes(p);

  function addField() {
    setFields((cur) => [...cur, { key: `field_${cur.length + 1}_${Date.now().toString(36)}`, label: "", type: "text", required: false }]);
  }
  function updateField(i: number, patch: Partial<CheckoutCustomField>) {
    setFields((cur) => cur.map((f, idx) => (idx === i ? { ...f, ...patch } : f)));
  }
  function removeField(i: number) {
    setFields((cur) => cur.filter((_, idx) => idx !== i));
  }

  function toggleTab(v: string) {
    setTabs((cur) => (cur.includes(v) ? cur.filter((t) => t !== v) : [...cur, v]));
  }
  function moveTab(v: string, dir: -1 | 1) {
    setTabs((cur) => {
      const i = cur.indexOf(v);
      const j = i + dir;
      if (i < 0 || j < 0 || j >= cur.length) return cur;
      const next = [...cur];
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });
  }

  async function save() {
    setBusy(true);
    setSaved(false);
    const r = await fetch("/api/business/store-ops-settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...(has("motion") ? { widgetMotion: motion } : {}),
        ...(has("copy") ? { widgetCopy: copy } : {}),
        ...(has("tabs") ? { accountTabs: tabs } : {}),
        ...(has("fields") ? { checkoutCustomFields: fields.filter((f) => f.label.trim()) } : {}),
      }),
    });
    setBusy(false);
    if (r.ok) setSaved(true);
  }

  const input = "w-full rounded-lg border border-border bg-panel px-3 py-2 text-[13px] outline-none focus:border-accent-strong/40";

  return (
    <Card className="p-6 sm:p-7">
      <SectionLabel>{title}</SectionLabel>
      {description && <p className="mt-1.5 text-[13px] text-text-dim">{description}</p>}

      {has("motion") && (
      <div className="mt-5">
        <span className="text-[12px] font-medium text-text-dim">Motion</span>
        <div className="mt-2 grid gap-2 sm:grid-cols-2">
          {MOTIONS.map((m) => (
            <label
              key={m.v}
              className={`cursor-pointer rounded-lg border px-3 py-2.5 text-[12.5px] ${motion === m.v ? "border-accent-strong/50 bg-accent-soft" : "border-border bg-panel"}`}
            >
              <div className="flex items-center gap-2">
                <input type="radio" name="widgetMotion" checked={motion === m.v} onChange={() => setMotion(m.v)} />
                <span className="font-semibold">{m.label}</span>
              </div>
              <p className="mt-1 text-text-dim">{m.hint}</p>
            </label>
          ))}
        </div>
      </div>

      )}

      {has("tabs") && (
      <div className="mt-5">
        <span className="text-[12px] font-medium text-text-dim">Account page tabs — show/hide and order</span>
        <div className="mt-2 grid gap-1.5">
          {tabs
            .filter((v) => ALL_ACCOUNT_TABS.some((t) => t.v === v))
            .map((v, i) => (
              <div key={v} className="flex items-center gap-2 rounded-lg border border-border bg-panel px-3 py-2">
                <span className="flex-1 text-[13px]">{ALL_ACCOUNT_TABS.find((t) => t.v === v)?.label}</span>
                <button type="button" onClick={() => moveTab(v, -1)} disabled={i === 0} className="text-text-dim disabled:opacity-30">
                  ↑
                </button>
                <button type="button" onClick={() => moveTab(v, 1)} disabled={i === tabs.length - 1} className="text-text-dim disabled:opacity-30">
                  ↓
                </button>
                <button type="button" onClick={() => toggleTab(v)} className="text-[12px] text-bad">
                  Hide
                </button>
              </div>
            ))}
          {ALL_ACCOUNT_TABS.filter((t) => !tabs.includes(t.v)).map((t) => (
            <div key={t.v} className="flex items-center gap-2 rounded-lg border border-dashed border-border px-3 py-2 opacity-60">
              <span className="flex-1 text-[13px]">{t.label} — hidden</span>
              <button type="button" onClick={() => toggleTab(t.v)} className="text-[12px] text-accent-strong">
                Show
              </button>
            </div>
          ))}
        </div>
      </div>

      )}

      {has("fields") && (
      <div className="mt-5">
        <span className="text-[12px] font-medium text-text-dim">
          Extra checkout fields — on top of name/phone/email/address, which always stay (real delivery needs them)
        </span>
        <div className="mt-2 grid gap-2">
          {fields.map((f, i) => (
            <div key={i} className="grid grid-cols-[1fr_auto_auto_auto] items-center gap-2 rounded-lg border border-border bg-panel p-2.5 max-sm:grid-cols-1">
              <input
                className={input}
                value={f.label}
                placeholder="e.g. Gift message"
                onChange={(e) => updateField(i, { label: e.target.value })}
              />
              <select className={input} value={f.type} onChange={(e) => updateField(i, { type: e.target.value as CheckoutCustomField["type"] })}>
                <option value="text">Short text</option>
                <option value="textarea">Long text</option>
                <option value="checkbox">Checkbox</option>
              </select>
              <label className="flex items-center gap-1.5 text-[12px] text-text-dim">
                <input type="checkbox" checked={f.required} onChange={(e) => updateField(i, { required: e.target.checked })} />
                Required
              </label>
              <button type="button" onClick={() => removeField(i)} className="text-[12px] text-bad">
                Remove
              </button>
            </div>
          ))}
          <button
            type="button"
            onClick={addField}
            className="w-fit rounded-lg border border-dashed border-border px-3 py-1.5 text-[12.5px] text-text-dim hover:text-text"
          >
            + Add a field
          </button>
        </div>
      </div>

      )}

      {has("copy") && (
      <div className="mt-5 space-y-2">
        <span className="text-[12px] font-medium text-text-dim">Wording — leave a line blank to keep the default</span>
        {WIDGET_COPY_GROUPS.map((g) => (
          <div key={g.label} className="rounded-lg border border-border">
            <button
              type="button"
              onClick={() => setOpenGroup(openGroup === g.label ? null : g.label)}
              className="flex w-full items-center justify-between px-3.5 py-2.5 text-left text-[13px] font-medium"
            >
              {g.label}
              <span className="text-text-dim">{openGroup === g.label ? "–" : "+"}</span>
            </button>
            {openGroup === g.label && (
              <div className="grid gap-3 border-t border-border p-3.5 sm:grid-cols-2">
                {g.keys.map((k) => (
                  <label key={k} className="grid gap-1">
                    <span className="text-[11.5px] text-text-dim">{DEFAULT_WIDGET_COPY[k]}</span>
                    <input
                      className={input}
                      value={copy[k] ?? ""}
                      placeholder={DEFAULT_WIDGET_COPY[k]}
                      onChange={(e) => setCopy((c) => ({ ...c, [k]: e.target.value }))}
                    />
                  </label>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>

      )}

      <div className="mt-6 flex items-center gap-3 border-t border-border pt-4">
        <button onClick={save} disabled={busy} className="rounded-lg bg-accent px-4 py-2 text-[13px] font-semibold text-white hover:opacity-90 disabled:opacity-50">
          {busy ? "Saving…" : "Save"}
        </button>
        {saved && <span className="text-[12.5px] text-good">Saved</span>}
      </div>
    </Card>
  );
}
