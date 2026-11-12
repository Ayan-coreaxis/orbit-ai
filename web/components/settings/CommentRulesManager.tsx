"use client";

import { useState } from "react";
import { Pencil, Plus, Trash2, X } from "lucide-react";
import { Button, Card, Pill, SectionLabel } from "@/components/ui";
import { InstagramIcon } from "@/components/icons/BrandIcons";
import { MAX_DM_CHARS, MAX_PUBLIC_REPLY_CHARS, fillTemplate, normalizeKeywords, templatePlaceholders } from "@/lib/comment-dm-rules";
import type { CommentRuleView } from "@/lib/comment-rules-data";

interface ProductOption {
  id: string;
  name: string;
  price: string;
  link: string | null;
}
interface PostOption {
  id: string;
  label: string;
}

const blank = {
  id: null as string | null,
  keywords: "price, link, info, kitna, order",
  productId: "",
  postId: "",
  dmText: "Thanks for your comment!\n{{product}} - {{price}}\nOrder here: {{link}}",
  publicReplyOn: true,
  publicReply: "DM bhej diya!",
};
type Form = typeof blank;

/** Instagram comment-to-DM: keyword rules the seller adds, edits and switches on or off. */
export function CommentRulesManager({
  initial,
  products,
  posts,
  storeLink,
  instagramConnected,
}: {
  initial: CommentRuleView[];
  products: ProductOption[];
  posts: PostOption[];
  storeLink: string | null;
  instagramConnected: boolean;
}) {
  const [rules, setRules] = useState(initial);
  const [form, setForm] = useState<Form | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const input = "w-full rounded-lg border border-border bg-panel px-3 py-2 text-[13px] outline-none focus:border-accent-strong/40";
  const labelCls = "text-[12px] font-medium text-text-dim";

  function edit(r: CommentRuleView) {
    setError(null);
    setForm({
      id: r.id,
      keywords: r.keywords.join(", "),
      productId: r.productId ?? "",
      postId: r.postId ?? "",
      dmText: r.dmText,
      publicReplyOn: !!r.publicReply,
      publicReply: r.publicReply ?? blank.publicReply,
    });
  }

  async function save() {
    if (!form) return;
    setBusy(true);
    setError(null);
    const body = {
      keywords: normalizeKeywords(form.keywords),
      productId: form.productId || null,
      postId: form.postId || null,
      dmText: form.dmText,
      publicReply: form.publicReplyOn ? form.publicReply : null,
    };
    try {
      const r = await fetch(form.id ? `/api/comment-rules/${form.id}` : "/api/comment-rules", {
        method: form.id ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const d = (await r.json()) as { rule?: CommentRuleView; error?: string };
      if (!r.ok || !d.rule) return setError(d.error ?? "Couldn't save.");
      const saved = d.rule;
      setRules((cur) => (form.id ? cur.map((x) => (x.id === saved.id ? saved : x)) : [saved, ...cur]));
      setForm(null);
    } catch {
      setError("Couldn't save — check your connection.");
    } finally {
      setBusy(false);
    }
  }

  async function toggle(r: CommentRuleView) {
    setRules((cur) => cur.map((x) => (x.id === r.id ? { ...x, active: !x.active } : x)));
    const res = await fetch(`/api/comment-rules/${r.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ active: !r.active }) }).catch(() => null);
    if (!res?.ok) setRules((cur) => cur.map((x) => (x.id === r.id ? { ...x, active: r.active } : x)));
  }

  async function remove(r: CommentRuleView) {
    if (!confirm("Delete this rule?")) return;
    const res = await fetch(`/api/comment-rules/${r.id}`, { method: "DELETE" }).catch(() => null);
    if (res?.ok) setRules((cur) => cur.filter((x) => x.id !== r.id));
  }

  const product = form ? products.find((p) => p.id === form.productId) ?? null : null;
  const values = { product: product?.name ?? null, price: product?.price ?? null, link: product ? product.link : storeLink };
  const preview = form ? fillTemplate(form.dmText, values) : "";
  const unfilled = form ? templatePlaceholders(form.dmText).filter((k) => !values[k]) : [];

  return (
    <Card className="p-6 sm:p-7">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <InstagramIcon size={18} />
          <SectionLabel>Comment to DM</SectionLabel>
        </div>
        {!form && (
          <Button variant="secondary" onClick={() => (setError(null), setForm(blank))} className="!py-2 !text-[13px]">
            <Plus className="h-4 w-4" /> New rule
          </Button>
        )}
      </div>
      <p className="mt-3 text-[13px] leading-relaxed text-text-dim">
        When someone comments a keyword on your Instagram post (like &quot;price&quot; or &quot;kitna&quot;), Orbit sends them a DM with the product, price and link. The DM also shows in your Inbox.
      </p>
      {!instagramConnected && <p className="mt-2 text-[12.5px] text-text-faint">Connect an Instagram professional account above first — rules start working once it&apos;s connected.</p>}
      <p className="mt-2 text-[12.5px] text-text-faint">
        One DM per comment, and at most 3 a day to the same person. If you connected before this feature, reconnect once to allow comments. Until Meta approves Orbit&apos;s app, it works for app testers only.
      </p>

      {form && (
        <div className="mt-4 rounded-xl border border-border-strong bg-panel-2 p-4">
          <div className="flex items-center justify-between">
            <div className="text-[13.5px] font-semibold">{form.id ? "Edit rule" : "New rule"}</div>
            <button onClick={() => setForm(null)} className="text-text-faint hover:text-text" aria-label="Close">
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <label className="grid gap-1.5 sm:col-span-2">
              <span className={labelCls}>Keywords (comma separated)</span>
              <input className={input} value={form.keywords} onChange={(e) => setForm({ ...form, keywords: e.target.value })} placeholder="price, link, kitna, order" />
              <span className="text-[11.5px] text-text-faint">Whole words, any capitals: &quot;Price?&quot; matches price, &quot;priceless&quot; doesn&apos;t.</span>
            </label>
            <label className="grid gap-1.5">
              <span className={labelCls}>Product</span>
              <select className={input} value={form.productId} onChange={(e) => setForm({ ...form, productId: e.target.value })}>
                <option value="">No product — send the store link</option>
                {products.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} ({p.price})
                  </option>
                ))}
              </select>
            </label>
            <label className="grid gap-1.5">
              <span className={labelCls}>Which posts</span>
              <select className={input} value={form.postId} onChange={(e) => setForm({ ...form, postId: e.target.value })}>
                <option value="">All my posts</option>
                {form.postId && !posts.some((p) => p.id === form.postId) && <option value={form.postId}>Post {form.postId}</option>}
                {posts.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="grid gap-1.5 sm:col-span-2">
              <span className={labelCls}>
                Message — use {"{{product}}"} {"{{price}}"} {"{{link}}"}
              </span>
              <textarea className={`${input} min-h-[96px]`} maxLength={MAX_DM_CHARS} value={form.dmText} onChange={(e) => setForm({ ...form, dmText: e.target.value })} />
            </label>
            <div className="sm:col-span-2">
              <div className={labelCls}>What they receive</div>
              <div className="mt-1.5 whitespace-pre-wrap break-words rounded-lg border border-border bg-panel px-3 py-2 text-[13px] text-text">{preview || <span className="text-text-faint">Nothing to send yet.</span>}</div>
              {unfilled.length > 0 && (
                <p className="mt-1.5 text-[11.5px] text-text-faint">
                  {unfilled.map((k) => `{{${k}}}`).join(", ")} {unfilled.length > 1 ? "have" : "has"} nothing to show{unfilled.includes("link") ? " (your store has no public address yet)" : " — pick a product"}, so {unfilled.length > 1 ? "they are" : "it is"} left out.
                </p>
              )}
            </div>
            <label className="flex items-center gap-2 text-[13px] sm:col-span-2">
              <input type="checkbox" checked={form.publicReplyOn} onChange={(e) => setForm({ ...form, publicReplyOn: e.target.checked })} />
              Also reply under the comment
            </label>
            {form.publicReplyOn && (
              <label className="grid gap-1.5 sm:col-span-2">
                <span className={labelCls}>Public reply</span>
                <input className={input} maxLength={MAX_PUBLIC_REPLY_CHARS} value={form.publicReply} onChange={(e) => setForm({ ...form, publicReply: e.target.value })} placeholder="DM bhej diya!" />
              </label>
            )}
          </div>
          {error && <p className="mt-3 text-[12.5px] text-bad">{error}</p>}
          <div className="mt-4 flex gap-2">
            <Button onClick={save} disabled={busy} className="!py-2 !text-[13px]">
              {busy ? "Saving…" : form.id ? "Save changes" : "Add rule"}
            </Button>
            <Button variant="ghost" onClick={() => setForm(null)} className="!py-2 !text-[13px]">
              Cancel
            </Button>
          </div>
        </div>
      )}

      <div className="mt-4 space-y-2">
        {rules.length === 0 && !form && <p className="text-[13px] text-text-faint">No rules yet.</p>}
        {rules.map((r) => (
          <div key={r.id} className="flex flex-wrap items-start justify-between gap-3 rounded-xl border border-border p-4">
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-1.5">
                {r.keywords.map((k) => (
                  <span key={k} className="rounded-full bg-panel-2 px-2 py-0.5 text-[12px] font-medium">
                    {k}
                  </span>
                ))}
                <Pill tone={r.active ? "good" : "neutral"}>{r.active ? "On" : "Off"}</Pill>
              </div>
              <p className="mt-2 line-clamp-2 whitespace-pre-wrap text-[12.5px] text-text-dim">{r.dmText}</p>
              <p className="mt-1.5 text-[11.5px] text-text-faint">
                {r.productName ?? "Store link"} · {r.postId ? "one post" : "all posts"} · {r.publicReply ? `replies "${r.publicReply}"` : "no public reply"} · {r.sent} sent
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-1">
              <button onClick={() => toggle(r)} className="rounded-lg border border-border-strong px-2.5 py-1.5 text-[12px] font-medium hover:border-accent/50">
                {r.active ? "Turn off" : "Turn on"}
              </button>
              <button onClick={() => edit(r)} className="rounded-lg p-2 text-text-faint hover:bg-panel-2 hover:text-text" aria-label="Edit rule">
                <Pencil className="h-4 w-4" />
              </button>
              <button onClick={() => remove(r)} className="rounded-lg p-2 text-text-faint hover:bg-panel-2 hover:text-text" aria-label="Delete rule">
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}
