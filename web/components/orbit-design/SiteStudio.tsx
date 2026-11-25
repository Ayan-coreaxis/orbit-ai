"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowUp, ExternalLink, Loader2, Menu, MousePointerClick, Monitor, Plus, Rocket, SlidersHorizontal, Smartphone, Square, Trash2, Undo2 } from "lucide-react";
import type { SiteState } from "@/lib/store-site-state";
import { SiteFrame, type PickedEl } from "@/components/store/SiteFrame";
import { BuildingCanvas } from "./BuildingCanvas";
import { ClickEditor, CustomisePanel } from "./EditPanel";
import { useImageAttachments } from "./useImageAttachments";
import { AttachButton, AttachmentTray } from "./Attachments";

const mins = (iso: string, now: number) => Math.max(0, Math.floor((now - new Date(iso).getTime()) / 60000));
const btn = "flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-2 text-[13px] font-medium text-text-dim transition-colors hover:text-text disabled:opacity-50";

/** Orbit Design for an agent-built store: chat on the left, the real store on the right. */
export function SiteStudio({ businessId, storeName, initial }: { businessId: string; storeName: string; initial: SiteState }) {
  const [st, setSt] = useState(initial);
  const [at, setAt] = useState<{ slug: string; productId: string | null; next?: string }>({ slug: "home", productId: null });
  const [view, setView] = useState<"desktop" | "mobile">("desktop");
  const [tab, setTab] = useState<"chat" | "preview">("chat");
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [pick, setPick] = useState(false);
  const [picked, setPicked] = useState<PickedEl | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [custom, setCustom] = useState(false);
  const [adding, setAdding] = useState(false);
  const [newPage, setNewPage] = useState({ title: "", about: "" });
  const [now, setNow] = useState(0);
  const attach = useImageAttachments();
  const scroll = useRef<HTMLDivElement>(null);

  const flash = useCallback((m: string) => {
    setNotice(m);
    setTimeout(() => setNotice((n) => (n === m ? null : n)), 4000);
  }, []);

  useEffect(() => {
    if (!st.running) return;
    const t = setInterval(async () => {
      setNow(Date.now());
      const r = await fetch("/api/orbit-design/site").then((x) => x.json()).catch(() => null);
      if (r && !r.error) setSt(r);
    }, 3000);
    return () => clearInterval(t);
  }, [st.running]);

  const logLen = st.build?.log.length ?? 0;
  useEffect(() => {
    scroll.current?.scrollTo({ top: scroll.current.scrollHeight, behavior: "smooth" });
  }, [st.turns.length, logLen]);

  async function call(method: string, body: object, url = "/api/orbit-design/site"): Promise<boolean> {
    setBusy(true);
    try {
      const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const r = await res.json().catch(() => ({}));
      if (!res.ok || r.error) {
        flash(r.error ?? "That didn't go through. Try again.");
        return false;
      }
      if (Array.isArray(r.pages)) setSt(r);
      return true;
    } catch {
      flash("Network error. Try again.");
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function send(text: string, images: string[] = []) {
    if ((!text.trim() && !images.length) || st.running || busy) return;
    if (await call("POST", { message: text.trim(), images })) {
      setInput("");
      attach.clear();
      setNow(Date.now());
    }
  }

  async function publish(next: boolean) {
    if (!next && !confirm("Take your store offline? Customers won't be able to open it.")) return;
    setBusy(true);
    try {
      const res = await fetch("/api/orbit-design/publish", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ published: next }) });
      const r = await res.json().catch(() => ({}));
      if (!res.ok || (next && !r.published)) return flash(r.note || r.error || "Couldn't publish. Try again.");
      setSt((s) => ({ ...s, published: !!r.published, dirty: r.published ? false : s.dirty }));
      flash(r.published ? "Your store is live." : "Your store is offline.");
    } catch {
      flash("Network error. Try again.");
    } finally {
      setBusy(false);
    }
  }

  async function startOver() {
    if (!confirm("Delete this design and the whole chat, and start again? This also removes shopper accounts and form entries, and takes the store offline. It can't be undone.")) return;
    setBusy(true);
    const ok = await fetch("/api/orbit-design", { method: "DELETE" }).then((r) => r.ok).catch(() => false);
    if (ok) location.reload();
    else {
      setBusy(false);
      flash("Couldn't reset. Try again.");
    }
  }

  const go = useCallback(
    (to: string, id: string | null) => {
      if (to === "account-more") return flash("Addresses, returns and rewards open on your live store.");
      if (to === "order") flash("This is a demo order. Nothing was saved.");
      setAt({ slug: to === "order" ? "thanks" : to, productId: to === "product" ? id : null, next: to === "login" && id === "checkout" ? "checkout" : undefined });
    },
    [flash],
  );

  const slug = [...st.pages, ...st.shopPages].some((p) => p.slug === at.slug) ? at.slug : "home";
  const q = new URLSearchParams({ page: slug, rev: st.rev });
  if (at.productId && slug === "product") q.set("product", at.productId);
  if (at.next && slug === "login") q.set("next", at.next);
  const b = st.build;
  const live = `/store/${businessId}${slug === "home" || slug === "product" || slug === "thanks" ? "" : slug === "login" ? "/account/login" : st.shopPages.some((p) => p.slug === slug) ? `/${slug}` : `/p/${slug}`}`;

  return (
    <div className="fixed inset-0 z-50 flex h-dvh flex-col bg-bg">
      <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3 sm:px-6">
        <div className="flex min-w-0 items-center gap-2.5">
          <button type="button" onClick={() => window.dispatchEvent(new Event("orbit:open-nav"))} className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-text-dim hover:bg-panel-2 hover:text-text" aria-label="Open menu">
            <Menu className="h-[18px] w-[18px]" />
          </button>
          <span className="truncate text-[15px] font-semibold">{storeName}</span>
          <span className={`shrink-0 rounded-full px-2 py-0.5 text-[12px] font-medium ${st.published ? "bg-good-soft text-good" : "bg-panel-2 text-text-dim"}`}>{st.published ? "Live" : "Draft"}</span>
        </div>
        <div className="flex items-center gap-2">
          <button className={btn} onClick={() => call("PATCH", { action: "undo" })} disabled={busy || st.running || !st.undo} aria-label="Undo">
            <Undo2 className="h-3.5 w-3.5" /> <span className="hidden sm:inline">Undo</span>
          </button>
          <button className={`${btn} hover:text-bad`} onClick={startOver} disabled={busy || st.running} aria-label="Start over">
            <Trash2 className="h-3.5 w-3.5" /> <span className="hidden md:inline">Start over</span>
          </button>
          {st.legacy && (
            <button className={btn} onClick={async () => { if (confirm("Go back to your previous design? The new one is deleted. Your live store hasn't changed.") && (await call("PATCH", { action: "discard" }))) location.reload(); }} disabled={busy || st.running}>
              Keep old design
            </button>
          )}
          {st.published && (
            <button className={btn} onClick={() => publish(false)} disabled={busy}>
              Take offline
            </button>
          )}
          {(!st.published || st.dirty) && (
            <button className="btn-primary inline-flex items-center gap-1.5 !px-4 !py-2 text-[13.5px] disabled:opacity-50" onClick={() => publish(true)} disabled={busy || st.running || !st.has}>
              <Rocket className="h-3.5 w-3.5" /> {st.published ? "Publish changes" : "Publish"}
            </button>
          )}
        </div>
      </div>

      <div className="flex border-b border-border lg:hidden">
        {(["chat", "preview"] as const).map((t) => (
          <button key={t} onClick={() => setTab(t)} className={`flex-1 py-2.5 text-[13.5px] font-medium capitalize ${tab === t ? "border-b-2 border-accent text-text" : "text-text-faint"}`}>
            {t}
          </button>
        ))}
      </div>
      {notice && (
        <div className="border-b border-accent/20 bg-accent-soft px-6 py-2 text-[13px] text-accent-strong" role="status">
          {notice}
        </div>
      )}

      <div className="flex min-h-0 flex-1">
        <div className={`${tab === "chat" ? "flex" : "hidden"} w-full flex-col border-r border-border lg:flex lg:w-[350px] lg:shrink-0`}>
          <div ref={scroll} className="flex-1 space-y-4 overflow-y-auto p-4">
            {st.turns.map((m, i) => (
              <div key={i} className={m.role === "user" ? "flex justify-end" : "flex"}>
                <div className={`max-w-[88%] whitespace-pre-wrap break-words rounded-2xl px-3.5 py-2.5 text-[14px] leading-relaxed ${m.role === "user" ? "gradient-fill text-white" : "border border-border bg-panel"}`}>
                  {m.content.length > 420 ? `${m.content.slice(0, 420)}…` : m.content}
                </div>
              </div>
            ))}
            {st.running && b && (
              <div className="rounded-2xl border border-border bg-panel p-4">
                <div className="flex items-center gap-2 text-[14px] font-semibold">
                  <Loader2 className="h-4 w-4 animate-spin text-accent" /> {b.kind === "build" ? "Building your store" : "Making the change"}
                  <button type="button" onClick={() => call("PATCH", { action: "stop" })} disabled={busy || b.stop} className="ml-auto flex items-center gap-1 text-[13px] font-medium text-text-dim hover:text-bad disabled:opacity-50">
                    <Square className="h-3 w-3" /> {b.stop ? "Stopping" : "Stop"}
                  </button>
                </div>
                <p className="mt-1 text-[13px] text-text-dim">
                  {b.kind === "build" ? "Usually 15 to 25 minutes. You can leave this page." : "Usually 1 to 4 minutes."}
                  {now > 0 && ` ${mins(b.startedAt, now)} min so far.`}
                </p>
                <ul className="mt-3 space-y-1.5 text-[13.5px]">
                  {b.log.slice(-6).map((l, i, a) => (
                    <li key={`${i}-${l}`} className={i === a.length - 1 ? "font-medium text-text" : "text-text-faint"}>
                      {l}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {st.canContinue && (
              <div className="rounded-2xl border border-border bg-panel p-4 text-[14px]">
                <p>{b?.status === "running" ? "The work was interrupted." : "The store isn't finished yet."} It can carry on from where it stopped.</p>
                <button type="button" onClick={() => call("PATCH", { action: "continue" })} disabled={busy} className="btn-primary mt-3 !px-4 !py-2 text-[13.5px] disabled:opacity-50">Continue</button>
              </div>
            )}
          </div>
          <form
            className="border-t border-border p-3"
            onSubmit={(e) => {
              e.preventDefault();
              void send(input, attach.items.map((a) => a.dataUrl));
            }}
            {...attach.dropHandlers}
          >
            <div className={`flex flex-col gap-2 rounded-2xl border bg-panel px-3 pb-2 pt-2.5 focus-within:border-accent/50 ${attach.dragging ? "border-dashed border-accent" : "border-border"}`}>
              <AttachmentTray items={attach.items} onRemove={attach.remove} />
              <textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onPaste={attach.onPaste}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    void send(input, attach.items.map((a) => a.dataUrl));
                  }
                }}
                rows={2}
                placeholder="Change anything: a section, a page, an animation, a 3D scene…"
                className="max-h-40 w-full resize-none bg-transparent text-[14px] outline-none placeholder:text-text-faint"
              />
              <div className="flex items-center justify-between">
                <AttachButton onFiles={attach.add} disabled={busy || attach.atMax} />
                <button type="submit" aria-label="Send" disabled={busy || st.running || (!input.trim() && !attach.items.length)} className="flex h-9 w-9 items-center justify-center rounded-full gradient-fill text-white disabled:opacity-30">
                  <ArrowUp className="h-4 w-4" />
                </button>
              </div>
            </div>
          </form>
        </div>

        <div className={`relative ${tab === "preview" ? "flex" : "hidden"} min-w-0 flex-1 flex-col bg-panel-2 lg:flex`}>
          <div className="flex flex-wrap items-center gap-2 border-b border-border px-4 py-2.5">
            <select value={slug} onChange={(e) => setAt({ slug: e.target.value, productId: null })} aria-label="Page" className="max-w-[180px] rounded-lg border border-border bg-panel px-2.5 py-2 text-[13px] font-medium">
              <optgroup label="Your pages">
                {st.pages.map((p) => (
                  <option key={p.slug} value={p.slug}>
                    {p.title}
                  </option>
                ))}
              </optgroup>
              <optgroup label="Shop pages">
                {st.shopPages.map((p) => (
                  <option key={p.slug} value={p.slug}>
                    {p.title}
                  </option>
                ))}
              </optgroup>
            </select>
            <button className={btn} onClick={() => setAdding((a) => !a)} disabled={st.running || !st.has}>
              <Plus className="h-3.5 w-3.5" /> Page
            </button>
            <div className="flex gap-1 rounded-lg border border-border bg-panel p-0.5">
              {(["desktop", "mobile"] as const).map((v) => {
                const Icon = v === "desktop" ? Monitor : Smartphone;
                return (
                  <button key={v} onClick={() => setView(v)} aria-pressed={view === v} aria-label={v} className={`rounded-md px-2.5 py-1.5 ${view === v ? "bg-accent-soft text-accent-strong" : "text-text-dim"}`}>
                    <Icon className="h-4 w-4" />
                  </button>
                );
              })}
            </div>
            <button className={`${btn} ${pick ? "!border-accent/40 bg-accent-soft !text-accent-strong" : ""}`} aria-pressed={pick} onClick={() => { setPick((p) => !p); setCustom(false); setPicked(null); }} disabled={st.running || !st.has}>
              <MousePointerClick className="h-3.5 w-3.5" /> {pick ? "Click anything" : "Edit"}
            </button>
            <button className={`${btn} ${custom ? "!border-accent/40 bg-accent-soft !text-accent-strong" : ""}`} aria-pressed={custom} onClick={() => { setCustom((c) => !c); setPick(false); setPicked(null); }} disabled={st.running || !st.has}>
              <SlidersHorizontal className="h-3.5 w-3.5" /> Customise
            </button>
            {st.published && (
              <a href={live} target="_blank" rel="noreferrer" className="ml-auto flex items-center gap-1.5 text-[13px] font-medium text-text-dim hover:text-text">
                Open live <ExternalLink className="h-3.5 w-3.5" />
              </a>
            )}
          </div>
          {adding && (
            <form
              className="flex flex-wrap gap-2 border-b border-border bg-panel px-4 py-3"
              onSubmit={(e) => {
                e.preventDefault();
                if (!newPage.title.trim()) return;
                setAdding(false);
                void send(`Add a new page called "${newPage.title.trim()}". ${newPage.about.trim()} Link to it from the menu.`);
                setNewPage({ title: "", about: "" });
              }}
            >
              <input value={newPage.title} onChange={(e) => setNewPage((n) => ({ ...n, title: e.target.value }))} placeholder="Page name" aria-label="Page name" className="w-44 rounded-lg border border-border bg-bg px-3 py-2 text-[14px] outline-none focus:border-accent" />
              <input value={newPage.about} onChange={(e) => setNewPage((n) => ({ ...n, about: e.target.value }))} placeholder="What should be on it?" aria-label="What should be on it" className="min-w-[200px] flex-1 rounded-lg border border-border bg-bg px-3 py-2 text-[14px] outline-none focus:border-accent" />
              <button className="btn-primary !px-4 !py-2 text-[13.5px]">Build page</button>
            </form>
          )}
          <div className="flex min-h-0 flex-1 items-start justify-center p-3 sm:p-5">
            {st.has ? (
              <div className="relative h-full overflow-hidden rounded-xl border border-border bg-white shadow-lg" style={{ width: view === "mobile" ? 390 : "100%" }}>
                <SiteFrame src={`/api/orbit-design/site/view?${q}`} businessId={businessId} products={st.products} live={false} onGo={go} pick={pick} onPicked={(p) => { setPicked(p); setPick(false); }} onNotice={flash} title="Store preview" className="block h-full w-full border-0" />
              </div>
            ) : st.running ? (
              <BuildingCanvas label={b?.log.at(-1) ?? "Designing your store"} />
            ) : (
              <p className="pt-24 text-[14.5px] text-text-dim">Describe your store in the chat and it will appear here.</p>
            )}
            {picked && (
              <ClickEditor
                key={`${picked.where}-${picked.tag}-${picked.texts[0]?.from ?? picked.image ?? ""}`}
                picked={picked}
                slug={slug}
                st={st}
                busy={busy || st.running}
                onClose={() => setPicked(null)}
                onSave={async (edits) => {
                  if (await call("PATCH", { action: "edit", edits })) {
                    setPicked(null);
                    flash("Saved in your draft.");
                  }
                }}
                onAsk={(note) => {
                  const p = picked;
                  setPicked(null);
                  void send(`On the ${slug} page, in ${p.where || "the page"}, the <${p.tag}${p.cls ? ` class="${p.cls}"` : ""}>${p.text ? ` that reads "${p.text}"` : ""}: ${note}`);
                }}
              />
            )}
            {custom && (
              <CustomisePanel
                key={st.rev}
                st={st}
                busy={busy || st.running}
                onClose={() => setCustom(false)}
                onSave={async (b) => {
                  if (await call("PATCH", { action: "customise", ...b })) flash("Saved in your draft.");
                }}
              />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
