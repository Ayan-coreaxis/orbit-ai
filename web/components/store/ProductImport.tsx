"use client";

import { useRef, useState } from "react";
import { Button } from "@/components/ui";
import { money } from "@/lib/money";
import type { ImportedProduct } from "@/lib/product-import";
import { Upload, X } from "lucide-react";

type PreviewProduct = ImportedProduct & { exists: boolean };
type Preview = { source: string; truncated: boolean; notes: string[]; products: PreviewProduct[] };

/**
 * Bulk import on the Products screen: paste the old shop's link or upload a CSV / Excel file →
 * preview what was found → untick anything unwanted → "Import N products". Nothing is saved until
 * that last button. `onDone` receives the store's full product list after the import.
 */
export function ProductImport<P>({ currency, onDone, onClose }: { currency?: string; onDone: (products: P[], message: string) => void; onClose: () => void }) {
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState<"reading" | "saving" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [picked, setPicked] = useState<Set<number>>(new Set());
  const [defaultStock, setDefaultStock] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  async function read(init: RequestInit) {
    setBusy("reading");
    setError(null);
    setPreview(null);
    try {
      const res = await fetch("/api/store/products/import/preview", { method: "POST", ...init });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Couldn't read that.");
        return;
      }
      const p = data as Preview;
      setPreview(p);
      setPicked(new Set(p.products.flatMap((x, i) => (x.exists ? [] : [i]))));
    } catch {
      setError("Couldn't read that — check your connection and try again.");
    } finally {
      setBusy(null);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  function readFile(file: File | undefined) {
    if (!file) return;
    const form = new FormData();
    form.append("file", file);
    void read({ body: form });
  }

  async function save() {
    if (!preview) return;
    setBusy("saving");
    setError(null);
    try {
      const res = await fetch("/api/store/products/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ products: preview.products.filter((_, i) => picked.has(i)), defaultStock: defaultStock === "" ? null : Number(defaultStock) }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Couldn't import.");
        return;
      }
      const skipped: string[] = data.skipped ?? [];
      onDone(
        data.products as P[],
        `${data.created} product${data.created === 1 ? "" : "s"} imported${skipped.length ? ` — ${skipped.length} skipped (already in your store)` : ""}.`,
      );
    } catch {
      setError("Couldn't import — check your connection and try again.");
    } finally {
      setBusy(null);
    }
  }

  const toggle = (i: number) =>
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i);
      else next.add(i);
      return next;
    });
  const selectable = preview ? preview.products.flatMap((p, i) => (p.exists ? [] : [i])) : [];
  const allPicked = selectable.length > 0 && selectable.every((i) => picked.has(i));
  const needsStock = !!preview?.products.some((p, i) => picked.has(i) && (p.optionTypes.length ? p.variants.some((v) => v.stock == null) : p.stock == null));

  return (
    <div className="mt-5 rounded-xl border border-border-strong bg-panel-2 p-4">
      <div className="flex items-center justify-between">
        <div className="text-[13.5px] font-semibold">Import products</div>
        <button onClick={onClose} className="text-text-faint hover:text-text" aria-label="Close">
          <X className="h-4 w-4" />
        </button>
      </div>
      <p className="mt-1 text-[12.5px] text-text-dim">
        Bring your whole catalogue in one go — paste the link of your old shop (Shopify, WooCommerce or any shop page), or upload a CSV / Excel file in any
        layout. You&apos;ll see a preview before anything is added.
      </p>

      <form
        className="mt-3 flex flex-wrap gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (url.trim()) void read({ headers: { "Content-Type": "application/json" }, body: JSON.stringify({ url: url.trim() }) });
        }}
      >
        <input
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://yourshop.com"
          inputMode="url"
          aria-label="Shop link"
          className="min-w-0 flex-1 basis-56 rounded-lg border border-border bg-panel px-3 py-2 text-[13px] outline-none transition-colors focus:border-accent-strong/40"
        />
        <Button type="submit" disabled={busy !== null || !url.trim()} className="!py-2 !text-[13px]">
          {busy === "reading" ? "Reading…" : "Read products"}
        </Button>
        <Button type="button" variant="secondary" disabled={busy !== null} onClick={() => fileRef.current?.click()} className="!py-2 !text-[13px]">
          <Upload className="h-4 w-4" /> Upload CSV / Excel
        </Button>
        <input ref={fileRef} type="file" accept=".csv,.tsv,.txt,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" className="hidden" onChange={(e) => readFile(e.target.files?.[0])} />
      </form>
      {busy === "reading" && <p className="mt-2 text-[12.5px] text-text-faint">Reading the catalogue — a big shop can take up to a minute.</p>}
      {error && <p className="mt-2 text-[13px] text-bad">{error}</p>}

      {preview && (
        <div className="mt-4">
          {preview.notes.map((n) => (
            <p key={n} className="text-[12.5px] text-text-dim">
              {n}
            </p>
          ))}
          {preview.truncated && <p className="text-[12.5px] text-warn">Only the first {preview.products.length} products are shown — import these, then import again for the rest.</p>}

          <label className="mt-3 flex cursor-pointer items-center gap-2 border-b border-border pb-2 text-[12.5px] font-medium">
            <input type="checkbox" checked={allPicked} onChange={() => setPicked(allPicked ? new Set() : new Set(selectable))} />
            {preview.products.length} found — {picked.size} selected
          </label>
          <div className="max-h-[420px] divide-y divide-border overflow-y-auto">
            {preview.products.map((p, i) => {
              const prices = p.variants.map((v) => v.price ?? p.price);
              const max = prices.length ? Math.max(...prices) : p.price;
              return (
                <label key={`${p.name}-${i}`} className={`flex cursor-pointer items-center gap-3 py-2 ${p.exists ? "cursor-default opacity-60" : ""}`}>
                  <input type="checkbox" checked={picked.has(i)} disabled={p.exists} onChange={() => toggle(i)} />
                  {p.imageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={p.imageUrl} alt="" loading="lazy" referrerPolicy="no-referrer" className="h-10 w-10 shrink-0 rounded-lg object-cover" />
                  ) : (
                    <div className="h-10 w-10 shrink-0 rounded-lg bg-panel" />
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[13px] font-medium">{p.name}</div>
                    <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[12px]">
                      <span className="tabular-nums text-text-dim">{max > p.price ? `${money(p.price, currency)} – ${money(max, currency)}` : money(p.price, currency)}</span>
                      {p.variants.length > 0 && (
                        <span className="rounded bg-panel px-1.5 py-0.5 text-[11px] text-text-faint">
                          {p.variants.length} variant{p.variants.length === 1 ? "" : "s"} ({p.optionTypes.map((t) => t.name).join(", ")})
                        </span>
                      )}
                      {p.galleryUrls.length > 0 && <span className="text-[11px] text-text-faint">+{p.galleryUrls.length} photos</span>}
                      {p.exists ? <span className="text-[11px] font-medium text-warn">Already in your store — skipped</span> : p.warnings.map((w) => (
                        <span key={w} className="text-[11px] text-warn">
                          {w}
                        </span>
                      ))}
                    </div>
                  </div>
                </label>
              );
            })}
          </div>

          {needsStock && (
            <label className="mt-3 flex flex-wrap items-center gap-2 text-[12.5px] text-text-dim">
              Some products have no stock number in the source. Stock to give them:
              <input
                type="number"
                inputMode="numeric"
                min={0}
                value={defaultStock}
                onChange={(e) => setDefaultStock(e.target.value)}
                placeholder="0"
                className="w-20 rounded-lg border border-border bg-panel px-2 py-1 text-[13px] outline-none focus:border-accent-strong/40"
              />
              <span className="text-text-faint">(left empty, they start at 0 = out of stock until you set it)</span>
            </label>
          )}
          <p className="mt-2 text-[12px] text-text-faint">Prices are imported exactly as the source lists them, in your store currency ({(currency ?? "usd").toUpperCase()}) — nothing is converted.</p>

          <div className="mt-3 flex gap-2">
            <Button onClick={save} disabled={busy !== null || picked.size === 0} className="!py-2 !text-[13px]">
              {busy === "saving" ? "Importing…" : `Import ${picked.size} product${picked.size === 1 ? "" : "s"}`}
            </Button>
            <Button variant="ghost" onClick={onClose} className="!py-2 !text-[13px]">
              Cancel
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
