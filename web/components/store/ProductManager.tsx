"use client";

import { useMemo, useState } from "react";
import { Card, Button } from "@/components/ui";
import { money } from "@/lib/money";
import { cartesian, comboKey, comboLabel, parseOptionTypes, type OptionType } from "@/lib/variants";
import { Plus, Trash2, Pencil, X } from "lucide-react";
import { ImageUpload } from "@/components/ImageUpload";

interface RawVariant {
  id?: string;
  label: string;
  options: string; // JSON string
  sku?: string | null;
  price: number | null;
  stock: number;
}
interface P {
  id: string;
  name: string;
  price: number;
  stock: number;
  imageUrl: string | null;
  description: string | null;
  optionTypes: string | null;
  variants: RawVariant[];
}

const blank = { name: "", price: "", stock: "", imageUrl: "", description: "" };

interface VRow {
  id?: string;
  options: Record<string, string>;
  price: string;
  stock: string;
}

export function ProductManager({ initialProducts, currency }: { initialProducts: P[]; currency?: string }) {
  const [products, setProducts] = useState<P[]>(initialProducts);
  const [editing, setEditing] = useState<string | "new" | null>(null);
  const [form, setForm] = useState<typeof blank>(blank);
  const [optTypes, setOptTypes] = useState<OptionType[]>([]);
  const [vrows, setVrows] = useState<VRow[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const hasOpts = optTypes.length > 0 && optTypes.every((t) => t.name && t.values.length);

  // regenerate the combination table whenever option types change, keeping entered price/stock
  const combos = useMemo(() => (hasOpts ? cartesian(optTypes) : []), [hasOpts, optTypes]);
  const syncedRows = useMemo(() => {
    const byKey = new Map(vrows.map((r) => [comboKey(r.options), r]));
    return combos.map((options) => {
      const prev = byKey.get(comboKey(options));
      return { id: prev?.id, options, price: prev?.price ?? "", stock: prev?.stock ?? "0" };
    });
  }, [combos, vrows]);

  function openNew() {
    setForm(blank);
    setOptTypes([]);
    setVrows([]);
    setEditing("new");
    setError(null);
  }
  function openEdit(p: P) {
    setForm({
      name: p.name,
      price: String(p.price),
      stock: String(p.stock),
      imageUrl: p.imageUrl ?? "",
      description: p.description ?? "",
    });
    const types = parseOptionTypes(p.optionTypes);
    setOptTypes(types);
    setVrows(
      p.variants.map((v) => {
        let options: Record<string, string> = {};
        try {
          options = JSON.parse(v.options);
        } catch {
          /* ignore */
        }
        return { id: v.id, options, price: v.price != null ? String(v.price) : "", stock: String(v.stock) };
      }),
    );
    setEditing(p.id);
    setError(null);
  }

  function setOptName(i: number, name: string) {
    setOptTypes((t) => t.map((o, idx) => (idx === i ? { ...o, name } : o)));
  }
  function setOptValues(i: number, raw: string) {
    const values = [...new Set(raw.split(",").map((s) => s.trim()).filter(Boolean))].slice(0, 24);
    setOptTypes((t) => t.map((o, idx) => (idx === i ? { ...o, values } : o)));
  }

  async function save() {
    setBusy(true);
    setError(null);
    const payload: Record<string, unknown> = {
      name: form.name.trim(),
      price: Number(form.price),
      stock: Number(form.stock || 0),
      imageUrl: form.imageUrl.trim(),
      description: form.description.trim(),
    };
    if (hasOpts) {
      payload.optionTypes = optTypes;
      payload.variants = syncedRows.map((r) => ({
        id: r.id,
        options: r.options,
        price: r.price === "" ? null : Number(r.price),
        stock: Number(r.stock || 0),
      }));
    } else {
      payload.optionTypes = [];
      payload.variants = [];
    }

    const isNew = editing === "new";
    const res = await fetch(isNew ? "/api/store/products" : `/api/store/products/${editing}`, {
      method: isNew ? "POST" : "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    setBusy(false);
    if (!res.ok) {
      setError(data.error ?? "Couldn't save.");
      return;
    }
    const p: P = data.product;
    setProducts((prev) => (isNew ? [p, ...prev] : prev.map((x) => (x.id === p.id ? p : x))));
    setEditing(null);
  }

  async function remove(id: string) {
    if (!confirm("Delete this product? This can't be undone.")) return;
    const res = await fetch(`/api/store/products/${id}`, { method: "DELETE" });
    if (res.ok) setProducts((prev) => prev.filter((p) => p.id !== id));
  }

  return (
    <Card className="p-6">
      <div className="flex items-center justify-between">
        <div className="text-[14px] font-semibold">
          Products <span className="text-text-faint">({products.length})</span>
        </div>
        {editing === null && (
          <Button variant="secondary" onClick={openNew} className="!py-2 !text-[13px]">
            <Plus className="h-4 w-4" /> Add product
          </Button>
        )}
      </div>

      {editing !== null && (
        <div className="mt-5 rounded-xl border border-border-strong bg-panel-2 p-4">
          <div className="flex items-center justify-between">
            <div className="text-[13.5px] font-semibold">{editing === "new" ? "New product" : "Edit product"}</div>
            <button onClick={() => setEditing(null)} className="text-text-faint hover:text-text" aria-label="Close">
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <Field label="Name">
              <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className={input} />
            </Field>
            <Field label="Product photo">
              <ImageUpload library value={form.imageUrl} onChange={(url) => setForm({ ...form, imageUrl: url })} />
            </Field>
            <Field label={`${hasOpts ? "Base price" : "Price"} (${(currency ?? "usd").toUpperCase()})`}>
              <input type="number" inputMode="decimal" value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} className={input} />
            </Field>
            {!hasOpts && (
              <Field label="Stock">
                <input type="number" inputMode="numeric" value={form.stock} onChange={(e) => setForm({ ...form, stock: e.target.value })} className={input} />
              </Field>
            )}
            <div className="sm:col-span-2">
              <Field label="Description">
                <textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} className={`${input} min-h-[72px]`} />
              </Field>
            </div>
          </div>

          {/* ---- variants ---- */}
          <div className="mt-4 rounded-lg border border-border bg-panel p-3">
            <label className="flex cursor-pointer items-center gap-2 text-[13px] font-medium">
              <input
                type="checkbox"
                checked={optTypes.length > 0}
                onChange={(e) => setOptTypes(e.target.checked ? [{ name: "Size", values: [] }] : [])}
              />
              This product has options (size, colour…)
            </label>

            {optTypes.length > 0 && (
              <div className="mt-3 space-y-2.5">
                {optTypes.map((t, i) => (
                  <div key={i} className="grid gap-2 sm:grid-cols-[140px_1fr_auto]">
                    <input
                      value={t.name}
                      onChange={(e) => setOptName(i, e.target.value)}
                      placeholder="Option name"
                      className={input}
                    />
                    <input
                      defaultValue={t.values.join(", ")}
                      onBlur={(e) => setOptValues(i, e.target.value)}
                      placeholder="Values, comma separated — e.g. S, M, L"
                      className={input}
                    />
                    <button
                      onClick={() => setOptTypes((ts) => ts.filter((_, idx) => idx !== i))}
                      className="rounded-lg p-2 text-text-faint hover:text-bad"
                      aria-label="Remove option"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                ))}
                {optTypes.length < 2 && (
                  <button
                    onClick={() => setOptTypes((ts) => [...ts, { name: ts.length === 0 ? "Size" : "Colour", values: [] }])}
                    className="text-[12.5px] font-medium text-accent-strong hover:underline"
                  >
                    + Add another option
                  </button>
                )}

                {hasOpts && (
                  <div className="mt-2 overflow-x-auto">
                    <table className="w-full text-[12.5px]">
                      <thead>
                        <tr className="text-left text-text-faint">
                          <th className="pb-1 font-medium">Variant</th>
                          <th className="pb-1 font-medium">Price</th>
                          <th className="pb-1 font-medium">Stock</th>
                        </tr>
                      </thead>
                      <tbody>
                        {syncedRows.map((r) => {
                          const k = comboKey(r.options);
                          return (
                            <tr key={k}>
                              <td className="py-1 pr-3 text-text-dim">{comboLabel(r.options, optTypes)}</td>
                              <td className="py-1 pr-3">
                                <input
                                  type="number"
                                  inputMode="decimal"
                                  value={r.price}
                                  placeholder={form.price || "base"}
                                  onChange={(e) =>
                                    setVrows((rows) => upsertRow(rows, r.options, { price: e.target.value }))
                                  }
                                  className={`${input} !w-24 !py-1`}
                                />
                              </td>
                              <td className="py-1">
                                <input
                                  type="number"
                                  inputMode="numeric"
                                  value={r.stock}
                                  onChange={(e) =>
                                    setVrows((rows) => upsertRow(rows, r.options, { stock: e.target.value }))
                                  }
                                  className={`${input} !w-20 !py-1`}
                                />
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}
          </div>

          {error && <p className="mt-2 text-[13px] text-bad">{error}</p>}
          <div className="mt-3 flex gap-2">
            <Button onClick={save} disabled={busy} className="!py-2 !text-[13px]">
              {busy ? "Saving…" : "Save product"}
            </Button>
            <Button variant="ghost" onClick={() => setEditing(null)} className="!py-2 !text-[13px]">
              Cancel
            </Button>
          </div>
        </div>
      )}

      <div className="mt-5 divide-y divide-border">
        {products.length === 0 && editing === null && (
          <p className="rounded-lg border border-dashed border-border py-8 text-center text-[13px] text-text-faint">
            No products yet. Add your first one, then design the storefront in Orbit Design.
          </p>
        )}
        {products.map((p) => {
          const withOpts = parseOptionTypes(p.optionTypes).length > 0 && p.variants.length > 0;
          const stock = withOpts ? p.variants.reduce((s, v) => s + Math.max(0, v.stock), 0) : p.stock;
          const fromPrice = withOpts ? Math.min(...p.variants.map((v) => v.price ?? p.price)) : p.price;
          return (
            <div key={p.id} className="flex items-center gap-4 py-3">
              {p.imageUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={p.imageUrl} alt={p.name} className="h-12 w-12 rounded-lg object-cover" />
              ) : (
                <div className="h-12 w-12 rounded-lg bg-panel-2" />
              )}
              <div className="min-w-0 flex-1">
                <div className="truncate text-[14px] font-medium">{p.name}</div>
                <div className="mt-0.5 flex flex-wrap items-center gap-2 text-[12.5px]">
                  <span className="tabular-nums text-text-dim">
                    {withOpts && fromPrice !== p.price ? `from ${money(fromPrice, currency)}` : money(p.price, currency)}
                  </span>
                  {withOpts && (
                    <span className="rounded bg-panel-2 px-1.5 py-0.5 text-[11px] text-text-faint">
                      {p.variants.length} variant{p.variants.length === 1 ? "" : "s"}
                    </span>
                  )}
                  <span
                    className={`rounded px-1.5 py-0.5 text-[11px] font-medium tabular-nums ${
                      stock <= 0 ? "bg-bad-soft text-bad" : stock <= 5 ? "bg-warn-soft text-warn" : "bg-panel-2 text-text-faint"
                    }`}
                  >
                    {stock <= 0 ? "Out of stock" : `${stock} in stock`}
                  </span>
                </div>
              </div>
              <button onClick={() => openEdit(p)} className="rounded-lg p-2 text-text-faint hover:bg-panel-2 hover:text-text" aria-label="Edit">
                <Pencil className="h-4 w-4" />
              </button>
              <button onClick={() => remove(p.id)} className="rounded-lg p-2 text-text-faint hover:bg-bad-soft hover:text-bad" aria-label="Delete">
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          );
        })}
      </div>
    </Card>
  );
}

function upsertRow(rows: VRow[], options: Record<string, string>, patch: Partial<VRow>): VRow[] {
  const k = comboKey(options);
  const found = rows.some((r) => comboKey(r.options) === k);
  if (found) return rows.map((r) => (comboKey(r.options) === k ? { ...r, ...patch } : r));
  return [...rows, { options, price: "", stock: "0", ...patch }];
}

const input = "w-full rounded-lg border border-border bg-panel px-3 py-2 text-[13px] outline-none transition-colors focus:border-accent-strong/40";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="grid gap-1.5">
      <span className="text-[12px] font-medium text-text-dim">{label}</span>
      {children}
    </label>
  );
}
