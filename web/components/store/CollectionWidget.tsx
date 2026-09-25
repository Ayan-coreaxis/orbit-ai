"use client";

import { useEffect, useState } from "react";
import type { SpecField } from "@/lib/orbit-backend-spec";
import { wLabel, wInput, wBtn, wErr, wCard, wHeading } from "./widget-ui";

interface Item {
  id: string;
  data: Record<string, unknown>;
  status: string;
  createdAt: string;
}

/**
 * Generic collection widget — lists published rows of a spec collection and offers a submit form.
 * Used for product reviews (pass `productId`) and any other collection the seller designed a form
 * for. Fields + labels come from the StoreBackendSpec.
 */
export function CollectionWidget({
  businessId,
  collection,
  fields,
  productId,
  moderated,
  title,
}: {
  businessId: string;
  collection: string;
  fields: SpecField[];
  productId?: string;
  moderated?: boolean;
  title?: string;
}) {
  const [items, setItems] = useState<Item[]>([]);
  const [values, setValues] = useState<Record<string, string>>({});
  const [name, setName] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);
  const [loggedIn, setLoggedIn] = useState<boolean | null>(null);

  const base = `/api/store/${businessId}`;

  useEffect(() => {
    const q = productId ? `?productId=${encodeURIComponent(productId)}` : "";
    fetch(`${base}/records/${collection}${q}`)
      .then((r) => r.json())
      .then((d) => setItems(Array.isArray(d.items) ? d.items : []))
      .catch(() => {});
    fetch(`${base}/auth/me`)
      .then((r) => r.json())
      .then((d) => setLoggedIn(!!d.customer))
      .catch(() => setLoggedIn(false));
  }, [base, collection, productId]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    setBusy(true);
    try {
      const res = await fetch(`${base}/records/${collection}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ data: values, productId, name }),
      });
      const d = await res.json();
      setBusy(false);
      if (!res.ok) return setErr(d.error ?? "Couldn't submit.");
      setDone(true);
      if (d.status === "published") {
        setItems((cur) => [{ id: d.id, data: { ...values, _name: name || "You" }, status: "published", createdAt: new Date().toISOString() }, ...cur]);
      }
    } catch {
      setBusy(false);
      setErr("Network error.");
    }
  }

  const displayName = (it: Item) => String(it.data._name ?? "Anonymous");

  return (
    <div style={{ display: "grid", gap: 24 }}>
      {title && <h3 style={wHeading}>{title}</h3>}

      {items.length > 0 && (
        <div style={{ display: "grid", gap: 14 }}>
          {items.map((it) => (
            <div key={it.id} style={wCard}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
                <strong style={{ fontSize: 13.5 }}>{displayName(it)}</strong>
                {typeof it.data.rating === "number" && <span style={{ color: "var(--od-accent)", fontSize: 13 }}>{"★".repeat(Number(it.data.rating))}{"☆".repeat(5 - Number(it.data.rating))}</span>}
              </div>
              {fields.map((f) =>
                f.k !== "rating" && it.data[f.k] ? (
                  <p key={f.k} style={{ margin: "6px 0 0", fontSize: 13.5, color: "var(--od-muted)", lineHeight: 1.6 }}>
                    {String(it.data[f.k])}
                  </p>
                ) : null,
              )}
            </div>
          ))}
        </div>
      )}

      {done ? (
        <p style={{ color: "var(--od-muted)", fontSize: 14 }}>
          Thanks! {moderated ? "It'll show once the store approves it." : "It's live now."}
        </p>
      ) : (
        <form onSubmit={submit} style={{ display: "grid", gap: 12, maxWidth: 460, ...wCard }}>
          <strong style={{ fontSize: 14 }}>Add yours</strong>
          {loggedIn === false && (
            <label style={wLabel}>
              Your name
              <input required value={name} onChange={(e) => setName(e.target.value)} style={wInput} />
            </label>
          )}
          {fields.map((f) => (
            <label key={f.k} style={wLabel}>
              {f.label}
              {f.t === "textarea" ? (
                <textarea
                  required={f.required}
                  value={values[f.k] ?? ""}
                  onChange={(e) => setValues({ ...values, [f.k]: e.target.value })}
                  style={{ ...wInput, minHeight: 84, resize: "vertical" }}
                />
              ) : f.t === "stars" ? (
                <select required={f.required} value={values[f.k] ?? ""} onChange={(e) => setValues({ ...values, [f.k]: e.target.value })} style={wInput}>
                  <option value="">Rate…</option>
                  {[5, 4, 3, 2, 1].map((n) => (
                    <option key={n} value={n}>{"★".repeat(n)}</option>
                  ))}
                </select>
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
          <button type="submit" disabled={busy} style={{ ...wBtn, opacity: busy ? 0.7 : 1 }}>
            {busy ? "…" : "Submit"}
          </button>
        </form>
      )}
    </div>
  );
}
