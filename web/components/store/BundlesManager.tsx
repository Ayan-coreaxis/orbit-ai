"use client";

import { useEffect, useState } from "react";
import { Card, Button } from "@/components/ui";
import { Package } from "lucide-react";
import { money } from "@/lib/money";

interface Variant {
  id: string;
  label: string;
  price: number | null;
  stock: number;
}
interface Product {
  id: string;
  name: string;
  price: number;
  stock: number;
  variants: Variant[];
}
interface BundleItem {
  productId: string;
  variantId: string | null;
  qty: number;
  name: string;
  variantLabel: string | null;
  price: number;
  stock: number;
}
interface Bundle {
  id: string;
  name: string;
  description: string | null;
  price: number;
  status: string;
  items: BundleItem[];
}

interface DraftItem {
  productId: string;
  variantId: string;
  qty: string;
}

export function BundlesManager({ businessId, currency }: { businessId: string; currency?: string }) {
  const [bundles, setBundles] = useState<Bundle[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [price, setPrice] = useState("");
  const [draftItems, setDraftItems] = useState<DraftItem[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = () =>
    fetch(`/api/store/${businessId}/admin/bundles`)
      .then((r) => r.json())
      .then((d) => {
        if (Array.isArray(d.bundles)) setBundles(d.bundles);
        if (Array.isArray(d.products)) setProducts(d.products);
      })
      .catch(() => {})
      .finally(() => setLoading(false));

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [businessId]);

  const catalogWorth = draftItems.reduce((sum, it) => {
    const p = products.find((x) => x.id === it.productId);
    if (!p) return sum;
    const v = p.variants.find((x) => x.id === it.variantId);
    const unitPrice = v?.price ?? p.price;
    return sum + unitPrice * (Number(it.qty) || 0);
  }, 0);

  function addDraftItem() {
    if (products.length === 0) return;
    setDraftItems((cur) => [...cur, { productId: products[0].id, variantId: "", qty: "1" }]);
  }

  function updateDraftItem(idx: number, patch: Partial<DraftItem>) {
    setDraftItems((cur) => cur.map((it, i) => (i === idx ? { ...it, ...patch } : it)));
  }

  function removeDraftItem(idx: number) {
    setDraftItems((cur) => cur.filter((_, i) => i !== idx));
  }

  function resetForm() {
    setName("");
    setDescription("");
    setPrice("");
    setDraftItems([]);
    setError(null);
  }

  async function submitCreate() {
    setError(null);
    const items = draftItems
      .filter((it) => it.productId && Number(it.qty) > 0)
      .map((it) => ({ productId: it.productId, variantId: it.variantId || null, qty: Math.floor(Number(it.qty)) }));
    if (!name.trim()) return setError("Give the bundle a name.");
    if (items.length === 0) return setError("Add at least one product.");
    if (!Number.isFinite(Number(price)) || Number(price) <= 0) return setError("Enter a bundle price greater than 0.");

    setBusy(true);
    const r = await fetch(`/api/store/${businessId}/admin/bundles`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, description, price: Number(price), items }),
    });
    const d = await r.json();
    setBusy(false);
    if (r.ok) {
      setCreateOpen(false);
      resetForm();
      load();
    } else {
      setError(d.error ?? "Couldn't create that bundle.");
    }
  }

  async function toggleStatus(b: Bundle) {
    const next = b.status === "active" ? "disabled" : "active";
    setBundles((cur) => cur.map((x) => (x.id === b.id ? { ...x, status: next } : x)));
    await fetch(`/api/store/${businessId}/admin/bundles`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ bundleId: b.id, status: next }),
    }).catch(() => {});
  }

  async function remove(b: Bundle) {
    setBundles((cur) => cur.filter((x) => x.id !== b.id));
    await fetch(`/api/store/${businessId}/admin/bundles?bundleId=${b.id}`, { method: "DELETE" }).catch(() => {});
  }

  const input = "w-full rounded-lg border border-border bg-panel px-3 py-2 text-[13px] outline-none focus:border-accent-strong/40";

  if (loading) {
    return (
      <Card className="p-6">
        <p className="text-[13px] text-text-faint">Loading…</p>
      </Card>
    );
  }

  return (
    <Card className="p-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-[14px] font-semibold">
          <Package className="h-4 w-4 text-text-dim" /> Bundles
        </div>
        <Button onClick={() => setCreateOpen(true)} className="!py-2 !text-[13px]" disabled={products.length === 0}>
          New bundle
        </Button>
      </div>
      <p className="mt-1 text-[12.5px] text-text-dim">
        Sell a fixed set of real products together at one flat price. Each product&apos;s own stock is still tracked individually.
      </p>
      {products.length === 0 && <p className="mt-2 text-[12px] text-text-faint">Add some products first, then come back to bundle them.</p>}

      <div className="mt-6">
        <div className="text-[13px] font-semibold">Bundles ({bundles.length})</div>
        {bundles.length === 0 ? (
          <p className="mt-3 rounded-lg border border-dashed border-border py-6 text-center text-[13px] text-text-faint">
            No bundles yet.
          </p>
        ) : (
          <div className="mt-3 grid gap-3">
            {bundles.map((b) => {
              const worth = b.items.reduce((s, it) => s + it.price * it.qty, 0);
              return (
                <div key={b.id} className="rounded-lg border border-border p-3">
                  <div className="flex flex-wrap items-center gap-3">
                    <span className="text-[13.5px] font-medium">{b.name}</span>
                    <span
                      className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${
                        b.status === "active" ? "bg-good/15 text-good" : "bg-panel-2 text-text-faint"
                      }`}
                    >
                      {b.status === "active" ? "Active" : "Disabled"}
                    </span>
                    <span className="ml-auto font-mono text-[13px] font-semibold">
                      {money(b.price, currency)}
                      {worth > b.price && <span className="ml-1.5 text-[11.5px] font-normal text-text-faint line-through">{money(worth, currency)}</span>}
                    </span>
                  </div>
                  <div className="mt-1.5 text-[12px] text-text-dim">
                    {b.items.map((it) => `${it.qty}× ${it.name}${it.variantLabel ? ` (${it.variantLabel})` : ""}`).join(" + ")}
                  </div>
                  <div className="mt-2 flex gap-2">
                    <button onClick={() => toggleStatus(b)} className="rounded-lg border border-border px-2 py-1 text-[11.5px] font-medium text-text-dim hover:border-accent-strong/40 hover:text-text">
                      {b.status === "active" ? "Disable" : "Activate"}
                    </button>
                    <button onClick={() => remove(b)} className="rounded-lg border border-bad/30 px-2 py-1 text-[11.5px] font-medium text-bad">
                      Delete
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {createOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={() => {
            setCreateOpen(false);
            resetForm();
          }}
        >
          <div className="max-h-[85vh] w-full max-w-md overflow-y-auto rounded-xl border border-border bg-panel p-5" onClick={(e) => e.stopPropagation()}>
            <div className="text-[13.5px] font-semibold">New bundle</div>
            <div className="mt-3 grid gap-3">
              <label className="grid gap-1.5">
                <span className="text-[12px] font-medium text-text-dim">Name</span>
                <input className={input} value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Starter Kit" />
              </label>
              <label className="grid gap-1.5">
                <span className="text-[12px] font-medium text-text-dim">Description (optional)</span>
                <input className={input} value={description} onChange={(e) => setDescription(e.target.value)} />
              </label>

              <div className="grid gap-2">
                <span className="text-[12px] font-medium text-text-dim">Items</span>
                {draftItems.map((it, idx) => {
                  const p = products.find((x) => x.id === it.productId);
                  return (
                    <div key={idx} className="flex items-center gap-2">
                      <select
                        className={input}
                        value={it.productId}
                        onChange={(e) => updateDraftItem(idx, { productId: e.target.value, variantId: "" })}
                      >
                        {products.map((pr) => (
                          <option key={pr.id} value={pr.id}>
                            {pr.name}
                          </option>
                        ))}
                      </select>
                      {p && p.variants.length > 0 && (
                        <select className={input} value={it.variantId} onChange={(e) => updateDraftItem(idx, { variantId: e.target.value })}>
                          <option value="">Any variant</option>
                          {p.variants.map((v) => (
                            <option key={v.id} value={v.id}>
                              {v.label}
                            </option>
                          ))}
                        </select>
                      )}
                      <input
                        className={input}
                        style={{ maxWidth: 64 }}
                        type="number"
                        min={1}
                        value={it.qty}
                        onChange={(e) => updateDraftItem(idx, { qty: e.target.value })}
                      />
                      <button type="button" onClick={() => removeDraftItem(idx)} className="text-[12px] text-bad">
                        Remove
                      </button>
                    </div>
                  );
                })}
                <Button variant="secondary" onClick={addDraftItem} className="!py-1.5 !text-[12.5px]" disabled={products.length === 0}>
                  + Add product
                </Button>
                {catalogWorth > 0 && (
                  <p className="text-[11.5px] text-text-faint">Worth {money(catalogWorth, currency)} bought separately.</p>
                )}
              </div>

              <label className="grid gap-1.5">
                <span className="text-[12px] font-medium text-text-dim">Bundle price ({currency ?? "unit"})</span>
                <input className={input} type="number" min={0} step={1} value={price} onChange={(e) => setPrice(e.target.value)} placeholder="e.g. 2500" />
              </label>
            </div>
            {error && <p className="mt-2 text-[12px] text-bad">{error}</p>}
            <div className="mt-4 flex justify-end gap-2">
              <Button
                variant="secondary"
                onClick={() => {
                  setCreateOpen(false);
                  resetForm();
                }}
                className="!py-2 !text-[13px]"
              >
                Cancel
              </Button>
              <Button onClick={submitCreate} disabled={busy} className="!py-2 !text-[13px]">
                {busy ? "Creating…" : "Create bundle"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </Card>
  );
}
