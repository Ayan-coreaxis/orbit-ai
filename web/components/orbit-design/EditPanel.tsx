"use client";

import { useRef, useState } from "react";
import { ArrowDown, ArrowUp, ImagePlus, Loader2, Plus, Trash2, X } from "lucide-react";
import type { SiteState } from "@/lib/store-site-state";
import type { PickedEl } from "@/components/store/SiteFrame";
import type { MenuItem, SiteProduct, SitePage } from "@/lib/store-site";

const inp = "w-full rounded-lg border border-border bg-bg px-3 py-2 text-[14px] outline-none focus:border-accent";
const lab = "mb-1 block text-[13px] font-medium text-text-dim";
const small = "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-border text-text-dim hover:text-text disabled:opacity-30";

function Upload({ value, onChange }: { value: string; onChange: (u: string) => void }) {
  const ref = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  async function up(f: File) {
    setBusy(true);
    setErr("");
    const fd = new FormData();
    fd.append("file", f);
    const r = await fetch("/api/upload", { method: "POST", body: fd }).then((x) => x.json()).catch(() => ({ error: "Network error." }));
    setBusy(false);
    if (r.url) onChange(r.url);
    else setErr(r.error ?? "Upload failed.");
  }
  return (
    <div>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {value && <img src={value} alt="" className="mb-2 max-h-40 w-full rounded-lg border border-border object-cover" />}
      <input ref={ref} type="file" hidden accept="image/jpeg,image/png,image/webp,image/gif,image/avif" onChange={(e) => { const f = e.target.files?.[0]; if (f) void up(f); e.target.value = ""; }} />
      <button type="button" disabled={busy} onClick={() => ref.current?.click()} className="flex w-full items-center justify-center gap-2 rounded-lg border border-dashed border-border px-3 py-2.5 text-[14px] text-text-dim hover:border-accent hover:text-text">
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <ImagePlus className="h-4 w-4" />} {value ? "Upload another photo" : "Upload a photo"}
      </button>
      {err && <p className="mt-1 text-[13px] text-bad">{err}</p>}
    </div>
  );
}

function LinkPicker({ value, onChange, pages, products }: { value: string; onChange: (v: string) => void; pages: SitePage[]; products: SiteProduct[] }) {
  const known = ["#cart", "#account", ...pages.map((p) => `#page:${p.slug}`), ...products.map((p) => `#product:${p.id}`)];
  const web = !known.includes(value);
  return (
    <div className="space-y-2">
      <select aria-label="Link to" className={inp} value={web ? "web" : value} onChange={(e) => onChange(e.target.value === "web" ? "https://" : e.target.value)}>
        <optgroup label="Pages">
          {pages.filter((p) => p.slug !== "product").map((p) => (
            <option key={p.slug} value={`#page:${p.slug}`}>{p.title}</option>
          ))}
          <option value="#cart">Cart</option>
          <option value="#account">Login / account</option>
        </optgroup>
        <optgroup label="Products">
          {products.slice(0, 100).map((p) => (
            <option key={p.id} value={`#product:${p.id}`}>{p.name}</option>
          ))}
        </optgroup>
        <option value="web">Another website…</option>
      </select>
      {web && <input aria-label="Web address" className={inp} value={value} onChange={(e) => onChange(e.target.value)} placeholder="https://" />}
    </div>
  );
}

/** Opens when the seller clicks something in the preview: change its words, picture or link. No AI. */
export function ClickEditor({ picked, slug, st, busy, onSave, onAsk, onClose }: { picked: PickedEl; slug: string; st: SiteState; busy: boolean; onSave: (edits: object[]) => void; onAsk: (note: string) => void; onClose: () => void }) {
  const [texts, setTexts] = useState(picked.texts.map((t) => t.now));
  const [image, setImage] = useState(picked.image ?? "");
  const [link, setLink] = useState(picked.link?.href ?? "");
  const [everywhere, setEverywhere] = useState(/^(header|footer)/.test(picked.where));
  const [ask, setAsk] = useState("");
  const page = everywhere ? "*" : slug;
  const edits: object[] = [];
  picked.texts.forEach((t, i) => {
    if (!t.product && texts[i].trim() && texts[i].trim() !== t.now) edits.push({ kind: "text", page, from: t.from, to: texts[i] });
  });
  if (picked.image && image && image !== picked.image) edits.push({ kind: "image", from: picked.image, to: image });
  if (picked.link && link !== picked.link.href) edits.push({ kind: "link", page, from: picked.link.from, text: picked.link.text, to: link });
  const hideKey = picked.texts.length === 1 && !picked.texts[0].product ? picked.texts[0].from : !picked.texts.length && picked.tag === "img" ? picked.image : null;
  const nothing = !picked.texts.length && !picked.image && !picked.link;
  return (
    <div className="absolute inset-y-0 right-0 z-20 flex w-full max-w-[340px] flex-col border-l border-border bg-panel shadow-xl">
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <b className="text-[15px]">Edit</b>
        <button type="button" onClick={onClose} aria-label="Close" className={small}><X className="h-4 w-4" /></button>
      </div>
      <div className="flex-1 space-y-5 overflow-y-auto p-4">
        {picked.texts.map((t, i) =>
          t.product ? (
            <p key={t.from} className="rounded-lg bg-panel-2 p-3 text-[13.5px]">
              “{t.now}” comes from your product. <a className="font-medium text-accent-strong underline" href="/dashboard/store">Change it in Products</a>
            </p>
          ) : (
            <label key={`${i}-${t.from}`} className="block">
              <span className={lab}>Text</span>
              <textarea className={inp} rows={t.now.length > 50 ? 4 : 2} maxLength={600} value={texts[i]} onChange={(e) => setTexts((x) => x.map((v, k) => (k === i ? e.target.value : v)))} />
            </label>
          ),
        )}
        {picked.image && (
          <div>
            <span className={lab}>Photo</span>
            {picked.imageIsProduct ? (
              <p className="rounded-lg bg-panel-2 p-3 text-[13.5px]">
                This is a product photo. <a className="font-medium text-accent-strong underline" href="/dashboard/store">Change it in Products</a>
              </p>
            ) : (
              <Upload value={image} onChange={setImage} />
            )}
          </div>
        )}
        {picked.link && !/^#product:/.test(picked.link.from) && (
          <div>
            <span className={lab}>Link goes to</span>
            <LinkPicker value={link} onChange={setLink} pages={st.pages} products={st.products} />
          </div>
        )}
        {nothing && <p className="text-[14px] text-text-dim">Nothing to type here. Tell the designer what to change below.</p>}
        {!nothing && (
          <label className="flex items-center gap-2 text-[14px]">
            <input type="checkbox" checked={everywhere} onChange={(e) => setEverywhere(e.target.checked)} /> Change it on every page
          </label>
        )}
        {hideKey && (
          <button type="button" disabled={busy} onClick={() => onSave([{ kind: "hide", page, from: hideKey }])} className="flex items-center gap-2 text-[14px] text-text-dim hover:text-bad">
            <Trash2 className="h-4 w-4" /> Remove this
          </button>
        )}
        <div className="border-t border-border pt-4">
          <span className={lab}>Or ask the designer (uses AI)</span>
          <textarea className={inp} rows={3} value={ask} onChange={(e) => setAsk(e.target.value)} placeholder="Make this section darker, add a photo…" />
          <button type="button" disabled={busy || !ask.trim()} onClick={() => onAsk(ask)} className="mt-2 w-full rounded-lg border border-border px-3 py-2 text-[14px] font-medium hover:border-accent disabled:opacity-40">Ask</button>
        </div>
      </div>
      {!nothing && (
        <div className="border-t border-border p-4">
          <button type="button" disabled={busy || !edits.length} onClick={() => onSave(edits)} className="btn-primary w-full disabled:opacity-40">Save</button>
        </div>
      )}
    </div>
  );
}

/** The menu, plus whatever knobs and lists this store's own design declared. */
export function CustomisePanel({ st, busy, onSave, onClose }: { st: SiteState; busy: boolean; onSave: (b: object) => void; onClose: () => void }) {
  const [menu, setMenu] = useState<MenuItem[]>(st.menu);
  const [settings, setSettings] = useState<Record<string, string | number | boolean>>(Object.fromEntries(st.settings.map((s) => [s.key, s.value])));
  const [lists, setLists] = useState<Record<string, Record<string, string>[]>>(Object.fromEntries(st.lists.map((l) => [l.key, l.items])));
  const move = <T,>(a: T[], i: number, d: number) => {
    const n = [...a];
    const [x] = n.splice(i, 1);
    n.splice(i + d, 0, x);
    return n;
  };
  const setList = (k: string, v: Record<string, string>[]) => setLists((x) => ({ ...x, [k]: v }));
  return (
    <div className="absolute inset-y-0 right-0 z-20 flex w-full max-w-[380px] flex-col border-l border-border bg-panel shadow-xl">
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <b className="text-[15px]">Customise</b>
        <button type="button" onClick={onClose} aria-label="Close" className={small}><X className="h-4 w-4" /></button>
      </div>
      <div className="flex-1 space-y-7 overflow-y-auto p-4">
        <section>
          <h3 className="mb-2 text-[15px] font-semibold">Menu</h3>
          <div className="space-y-3">
            {menu.map((m, i) => (
              <div key={i} className="space-y-2 rounded-xl border border-border p-3">
                <div className="flex gap-1.5">
                  <input aria-label="Menu name" className={inp} value={m.label} maxLength={40} onChange={(e) => setMenu((x) => x.map((v, k) => (k === i ? { ...v, label: e.target.value } : v)))} />
                  <button type="button" aria-label="Move up" className={small} disabled={!i} onClick={() => setMenu((x) => move(x, i, -1))}><ArrowUp className="h-4 w-4" /></button>
                  <button type="button" aria-label="Move down" className={small} disabled={i === menu.length - 1} onClick={() => setMenu((x) => move(x, i, 1))}><ArrowDown className="h-4 w-4" /></button>
                  <button type="button" aria-label="Remove" className={small} disabled={menu.length < 2} onClick={() => setMenu((x) => x.filter((_, k) => k !== i))}><Trash2 className="h-4 w-4" /></button>
                </div>
                <LinkPicker value={m.href} onChange={(v) => setMenu((x) => x.map((y, k) => (k === i ? { ...y, href: v } : y)))} pages={st.pages} products={st.products} />
              </div>
            ))}
          </div>
          <button type="button" disabled={menu.length >= 14} onClick={() => setMenu((x) => [...x, { label: "New link", href: "#page:home" }])} className="mt-2 flex items-center gap-1.5 text-[14px] font-medium text-accent-strong disabled:opacity-40"><Plus className="h-4 w-4" /> Add to menu</button>
        </section>
        {st.settings.length > 0 && (
          <section>
            <h3 className="mb-2 text-[15px] font-semibold">Settings</h3>
            <div className="space-y-4">
              {st.settings.map((s) => {
                const v = settings[s.key];
                const set = (x: string | number | boolean) => setSettings((o) => ({ ...o, [s.key]: x }));
                return (
                  <div key={s.key}>
                    {s.type === "toggle" ? (
                      <label className="flex items-center gap-2 text-[14px]"><input type="checkbox" checked={v === true} onChange={(e) => set(e.target.checked)} /> {s.label}</label>
                    ) : (
                      <label className="block">
                        <span className={lab}>{s.label}</span>
                        {s.type === "select" ? (
                          <select className={inp} value={String(v)} onChange={(e) => set(e.target.value)}>{(s.options ?? []).map((o) => <option key={String(o)}>{String(o)}</option>)}</select>
                        ) : s.type === "number" ? (
                          <input type="number" className={inp} min={s.min} max={s.max} value={String(v)} onChange={(e) => set(e.target.value === "" ? "" : Number(e.target.value))} />
                        ) : s.type === "color" ? (
                          <input type="color" className="h-10 w-full rounded-lg border border-border" value={String(v)} onChange={(e) => set(e.target.value)} />
                        ) : s.type === "image" ? null : (
                          <input className={inp} value={String(v)} maxLength={600} onChange={(e) => set(e.target.value)} />
                        )}
                      </label>
                    )}
                    {s.type === "image" && <Upload value={String(v || "")} onChange={set} />}
                  </div>
                );
              })}
            </div>
          </section>
        )}
        {st.lists.map((l) => {
          const items = lists[l.key] ?? [];
          const max = l.max ?? 30;
          const min = l.min ?? 0;
          return (
            <section key={l.key}>
              <h3 className="mb-2 text-[15px] font-semibold">{l.label} <span className="font-normal text-text-faint">({items.length})</span></h3>
              <div className="space-y-3">
                {items.map((it, i) => (
                  <details key={i} className="rounded-xl border border-border p-3">
                    <summary className="cursor-pointer text-[14px] font-medium">{Object.values(it).find((x) => x && !/^(https?:|\/uploads|#)/.test(x))?.slice(0, 40) || `Item ${i + 1}`}</summary>
                    <div className="mt-3 space-y-3">
                      {l.fields.map((f) => {
                        const set = (v: string) => setList(l.key, items.map((x, k) => (k === i ? { ...x, [f.key]: v } : x)));
                        return (
                          <div key={f.key}>
                            <span className={lab}>{f.label}</span>
                            {f.type === "image" ? <Upload value={it[f.key] ?? ""} onChange={set} /> : f.type === "link" ? <LinkPicker value={it[f.key] ?? "#page:home"} onChange={set} pages={st.pages} products={st.products} /> : f.type === "textarea" ? <textarea aria-label={f.label} className={inp} rows={3} value={it[f.key] ?? ""} onChange={(e) => set(e.target.value)} /> : <input aria-label={f.label} className={inp} value={it[f.key] ?? ""} onChange={(e) => set(e.target.value)} />}
                          </div>
                        );
                      })}
                      <div className="flex gap-1.5">
                        <button type="button" aria-label="Move up" className={small} disabled={!i} onClick={() => setList(l.key, move(items, i, -1))}><ArrowUp className="h-4 w-4" /></button>
                        <button type="button" aria-label="Move down" className={small} disabled={i === items.length - 1} onClick={() => setList(l.key, move(items, i, 1))}><ArrowDown className="h-4 w-4" /></button>
                        <button type="button" aria-label="Remove" className={small} disabled={items.length <= min} onClick={() => setList(l.key, items.filter((_, k) => k !== i))}><Trash2 className="h-4 w-4" /></button>
                      </div>
                    </div>
                  </details>
                ))}
              </div>
              <button type="button" disabled={items.length >= max} onClick={() => setList(l.key, [...items, { ...(items.at(-1) ?? {}) }])} className="mt-2 flex items-center gap-1.5 text-[14px] font-medium text-accent-strong disabled:opacity-40"><Plus className="h-4 w-4" /> Add</button>
            </section>
          );
        })}
        {st.hidden.length > 0 && <p className="text-[13.5px] text-text-dim">{st.hidden.length} removed item{st.hidden.length === 1 ? "" : "s"}. Use Undo to bring the last one back.</p>}
      </div>
      <div className="border-t border-border p-4">
        <button type="button" disabled={busy} onClick={() => onSave({ menu, settings, lists })} className="btn-primary w-full disabled:opacity-40">Save</button>
      </div>
    </div>
  );
}
