"use client";

import { X } from "lucide-react";
import type { DesignContent } from "@/lib/orbit-design";
import { ImageUpload } from "@/components/ImageUpload";

/**
 * The "Content" panel — the handful of things a seller updates often, edited directly with no AI.
 * Changes apply to `doc.content`; the design references them via {{content.*}} / {{store.*}} tokens.
 */
export function ContentPanel({
  content,
  storeName,
  tagline,
  onChange,
  onMeta,
  onClose,
}: {
  content: DesignContent;
  storeName: string;
  tagline: string;
  onChange: (patch: Partial<DesignContent>) => void;
  onMeta: (patch: { storeName?: string; tagline?: string }) => void;
  onClose: () => void;
}) {
  return (
    <div className="flex h-full w-[320px] shrink-0 flex-col border-l border-border bg-panel">
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <div className="text-[13px] font-semibold uppercase tracking-[0.04em] text-text-dim">Content</div>
        <button onClick={onClose} className="text-text-faint hover:text-text" aria-label="Close content panel">
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="flex-1 space-y-5 overflow-y-auto p-4">
        <Group title="Store">
          <Field label="Store name">
            <input value={storeName} onChange={(e) => onMeta({ storeName: e.target.value })} className={input} />
          </Field>
          <Field label="Tagline">
            <input value={tagline} onChange={(e) => onMeta({ tagline: e.target.value })} className={input} />
          </Field>
          <ImageUpload
            label="Logo"
            value={content.logoUrl}
            onChange={(url) => onChange({ logoUrl: url })}
            hint="Replaces the text wordmark in your header."
          />
        </Group>

        <Group title="Announcement bar">
          <label className="flex items-center gap-2 text-[12.5px] text-text-dim">
            <input
              type="checkbox"
              checked={content.announcement.enabled}
              onChange={(e) => onChange({ announcement: { ...content.announcement, enabled: e.target.checked } })}
            />
            Show the bar
          </label>
          <input
            value={content.announcement.text}
            onChange={(e) => onChange({ announcement: { ...content.announcement, text: e.target.value } })}
            className={input}
            placeholder="Free delivery on orders over…"
          />
        </Group>

        <Group title="Contact (used in your footer)">
          <Field label="Email">
            <input value={content.contactEmail} onChange={(e) => onChange({ contactEmail: e.target.value })} className={input} placeholder="hello@yourstore.com" />
          </Field>
          <Field label="Phone">
            <input value={content.contactPhone} onChange={(e) => onChange({ contactPhone: e.target.value })} className={input} placeholder="+92 3XX XXXXXXX" />
          </Field>
          <Field label="Address">
            <textarea value={content.contactAddress} onChange={(e) => onChange({ contactAddress: e.target.value })} className={`${input} min-h-[52px]`} />
          </Field>
        </Group>

        <Group title="Social links">
          {(["instagram", "tiktok", "facebook", "x", "youtube"] as const).map((k) => (
            <Field key={k} label={k[0].toUpperCase() + k.slice(1)}>
              <input
                value={content.socials[k]}
                onChange={(e) => onChange({ socials: { ...content.socials, [k]: e.target.value } })}
                className={input}
                placeholder="https://…"
              />
            </Field>
          ))}
        </Group>

        <p className="text-[11.5px] leading-relaxed text-text-faint">
          Ask Orbit Design to place these anywhere with tokens like <code>{"{{contact.email}}"}</code> or{" "}
          <code>{"{{social.instagram}}"}</code> — they stay in sync everywhere.
        </p>
      </div>
    </div>
  );
}

const input = "w-full rounded-lg border border-border bg-panel-2 px-2.5 py-2 text-[13px] outline-none focus:border-accent/50";

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-2 text-[12px] font-semibold text-text-faint">{title}</div>
      <div className="space-y-2">{children}</div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="grid gap-1 text-[12px] text-text-dim">
      {label}
      {children}
    </label>
  );
}
