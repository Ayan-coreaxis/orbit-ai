"use client";

import { useEffect, useState } from "react";
import { Check, ExternalLink, Loader2, Megaphone, Send } from "lucide-react";
import { Button } from "@/components/ui";
import { cn } from "@/lib/utils";

type Post = { id: string; platform: string; status: string; permalink: string | null; error: string | null; createdAt: string };
type Ready = { facebook: string | null; instagram: string | null; instagramNeedsPublicFiles: boolean; pageName: string | null };

/** Share a finished Studio piece: post to Facebook / Instagram, or turn it into a Meta ad. */
export function ShareBox({ mediaId, kind, caption: initialCaption, title }: { mediaId: string; kind: string; caption: string; title: string }) {
  const [ready, setReady] = useState<Ready | null>(null);
  const [posts, setPosts] = useState<Post[]>([]);
  const [caption, setCaption] = useState(initialCaption);
  const [pick, setPick] = useState<{ facebook: boolean; instagram: boolean }>({ facebook: true, instagram: true });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const posting = posts.some((p) => p.status === "posting");
  useEffect(() => {
    let alive = true;
    const load = () =>
      fetch(`/api/social?mediaId=${mediaId}`)
        .then((r) => r.json())
        .then((d) => {
          if (!alive) return;
          setReady(d.ready ?? null);
          setPosts(d.posts ?? []);
        })
        .catch(() => {});
    load();
    const t = posting ? setInterval(load, 5000) : null;
    return () => {
      alive = false;
      if (t) clearInterval(t);
    };
  }, [mediaId, posting]);

  const igBlocked = ready ? ready.instagram ?? (ready.instagramNeedsPublicFiles ? "Instagram needs your files on a public link — connect Cloudflare R2 (Super Admin > Storage) or put Orbit on its public domain." : null) : null;
  const fbBlocked = ready?.facebook ?? null;
  const chosen = (["facebook", "instagram"] as const).filter((p) => pick[p] && !(p === "facebook" ? fbBlocked : igBlocked));

  async function post() {
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch("/api/social", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ mediaId, caption, platforms: chosen }) });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error || "Couldn't post.");
      setPosts((p) => [...(d.posts as Post[]), ...p]);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Couldn't post.");
    } finally {
      setBusy(false);
    }
  }

  const adHref = `/dashboard/ads?media=${mediaId}&headline=${encodeURIComponent(title.slice(0, 40))}&text=${encodeURIComponent(caption.split("#")[0].trim().slice(0, 500))}`;

  return (
    <div className="grid gap-3 rounded-xl border border-border bg-panel-2/50 p-4">
      <div className="text-[11.5px] font-semibold uppercase tracking-[0.05em] text-text-faint">Share it</div>
      <textarea value={caption} onChange={(e) => setCaption(e.target.value)} rows={4} className="resize-none rounded-lg border border-border bg-panel px-3 py-2 text-[13px] outline-none focus:border-accent/60" />
      <div className="flex flex-wrap gap-2">
        {(["facebook", "instagram"] as const).map((p) => {
          const blocked = p === "facebook" ? fbBlocked : igBlocked;
          return (
            <button
              key={p}
              type="button"
              disabled={!!blocked}
              title={blocked ?? undefined}
              onClick={() => setPick((x) => ({ ...x, [p]: !x[p] }))}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[12.5px]",
                blocked ? "cursor-not-allowed border-border text-text-faint opacity-60" : pick[p] ? "border-accent bg-accent-soft font-medium text-accent-strong" : "border-border text-text-dim",
              )}
            >
              {pick[p] && !blocked && <Check className="h-3 w-3" />}
              {p === "facebook" ? `Facebook${ready?.pageName ? ` · ${ready.pageName}` : ""}` : kind === "video" ? "Instagram Reel" : "Instagram"}
            </button>
          );
        })}
      </div>
      {(fbBlocked || igBlocked) && (
        <ul className="grid gap-1 text-[12px] text-text-faint">
          {fbBlocked && <li>Facebook: {fbBlocked}</li>}
          {igBlocked && <li>Instagram: {igBlocked}</li>}
        </ul>
      )}
      <div className="flex flex-wrap gap-2">
        <Button className="px-3 py-2 text-[13px]" disabled={!chosen.length || busy || !caption.trim()} onClick={post}>
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />} Post now
        </Button>
        <a href={adHref} className="inline-flex items-center gap-1.5 rounded-lg border border-border-strong bg-panel px-3 py-2 text-[13px] hover:border-accent/50">
          <Megaphone className="h-4 w-4" /> Make it an ad
        </a>
      </div>
      {err && <p className="text-[12.5px] text-bad">{err}</p>}
      {posts.length > 0 && (
        <ul className="grid gap-1.5">
          {posts.map((p) => (
            <li key={p.id} className="flex items-center gap-2 text-[12.5px]">
              {p.status === "posting" ? <Loader2 className="h-3.5 w-3.5 animate-spin text-accent" /> : p.status === "posted" ? <Check className="h-3.5 w-3.5 text-good" /> : <span className="h-2 w-2 rounded-full bg-bad" />}
              <span className="capitalize">{p.platform}</span>
              <span className="text-text-faint">
                {p.status === "posting" ? (kind === "video" && p.platform === "instagram" ? "Instagram is processing the Reel…" : "Posting…") : p.status === "posted" ? "Posted" : p.error}
              </span>
              {p.permalink && (
                <a href={p.permalink} target="_blank" rel="noreferrer" className="ml-auto inline-flex items-center gap-1 text-accent hover:underline">
                  Open <ExternalLink className="h-3 w-3" />
                </a>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
