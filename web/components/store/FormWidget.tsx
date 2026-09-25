"use client";

import { useState } from "react";
import type { SpecField } from "@/lib/orbit-backend-spec";
import { wLabel, wInput, wBtn, wErr, wCard } from "./widget-ui";

/**
 * A generic form → one of the fixed targets (contact / support / newsletter). Fields + labels
 * come from the StoreBackendSpec (inferred by Orbit Code from the form the seller designed).
 */
export function FormWidget({
  businessId,
  target,
  fields,
  submitLabel,
  successText,
}: {
  businessId: string;
  target: string;
  fields: SpecField[];
  submitLabel?: string;
  successText?: string;
}) {
  const [values, setValues] = useState<Record<string, string>>({});
  const [err, setErr] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);

  const list = fields.length
    ? fields
    : target === "newsletter"
      ? [{ k: "email", t: "email" as const, label: "Email", required: true }]
      : [
          { k: "name", t: "text" as const, label: "Your name", required: true },
          { k: "email", t: "email" as const, label: "Email" },
          { k: "message", t: "textarea" as const, label: "How can we help?", required: true },
        ];

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    setBusy(true);
    try {
      const res = await fetch(`/api/store/${businessId}/submit/${target}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ data: values }),
      });
      const d = await res.json();
      setBusy(false);
      if (!res.ok) return setErr(d.error ?? "Couldn't send that.");
      setDone(true);
    } catch {
      setBusy(false);
      setErr("Network error.");
    }
  }

  if (done)
    return (
      <p style={{ color: "var(--od-muted)", fontSize: 14, ...wCard }}>
        {successText || "Thanks — we've got it and will be in touch."}
      </p>
    );

  return (
    <form onSubmit={submit} style={{ display: "grid", gap: 12, maxWidth: 480, ...wCard }}>
      {list.map((f) => (
        <label key={f.k} style={wLabel}>
          {f.label}
          {f.t === "textarea" ? (
            <textarea
              required={f.required}
              value={values[f.k] ?? ""}
              onChange={(e) => setValues({ ...values, [f.k]: e.target.value })}
              style={{ ...wInput, minHeight: 96, resize: "vertical" }}
            />
          ) : f.t === "select" ? (
            <select required={f.required} value={values[f.k] ?? ""} onChange={(e) => setValues({ ...values, [f.k]: e.target.value })} style={wInput}>
              <option value="">Choose…</option>
              {(f.options ?? []).map((o) => (
                <option key={o} value={o}>{o}</option>
              ))}
            </select>
          ) : (
            <input
              required={f.required}
              type={f.t === "email" ? "email" : f.t === "tel" ? "tel" : "text"}
              value={values[f.k] ?? ""}
              onChange={(e) => setValues({ ...values, [f.k]: e.target.value })}
              style={wInput}
            />
          )}
        </label>
      ))}
      {err && <p role="alert" style={wErr}>{err}</p>}
      <button type="submit" disabled={busy} style={{ ...wBtn, opacity: busy ? 0.7 : 1, justifySelf: "start" }}>
        {busy ? "Sending…" : submitLabel || "Submit"}
      </button>
    </form>
  );
}
