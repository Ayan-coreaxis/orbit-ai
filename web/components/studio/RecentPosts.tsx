"use client";

import { useEffect, useState } from "react";
import { Check, ExternalLink, Loader2 } from "lucide-react";
import { Card } from "@/components/ui";

type Post = { id: string; platform: string; kind: string; caption: string; status: string; permalink: string | null; error: string | null; createdAt: string };

/** What Orbit has actually posted to Facebook / Instagram (and what failed, with the reason). */
export function RecentPosts() {
  const [posts, setPosts] = useState<Post[] | null>(null);
  useEffect(() => {
    let alive = true;
    fetch("/api/social")
      .then((r) => r.json())
      .then((d) => alive && setPosts(d.posts ?? []))
      .catch(() => alive && setPosts([]));
    return () => {
      alive = false;
    };
  }, []);
  if (!posts?.length) return null;
  return (
    <Card className="p-6">
      <div className="text-[12px] font-semibold uppercase tracking-[0.05em] text-text-faint">Posted to your social accounts</div>
      <ul className="mt-3 divide-y divide-border">
        {posts.map((p) => (
          <li key={p.id} className="flex items-start gap-3 py-2.5 text-[13px]">
            <span className="mt-0.5">{p.status === "posted" ? <Check className="h-4 w-4 text-good" /> : p.status === "posting" ? <Loader2 className="h-4 w-4 animate-spin text-accent" /> : <span className="mt-1 block h-2 w-2 rounded-full bg-bad" />}</span>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="font-medium capitalize">{p.platform}</span>
                <span className="text-[11.5px] text-text-faint">
                  {p.kind} · {new Date(p.createdAt).toLocaleString(undefined, { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })}
                </span>
              </div>
              <p className="truncate text-text-dim">{p.caption}</p>
              {p.status === "failed" && p.error && <p className="text-[12px] text-bad">{p.error}</p>}
            </div>
            {p.permalink && (
              <a href={p.permalink} target="_blank" rel="noreferrer" className="inline-flex shrink-0 items-center gap-1 text-[12px] text-accent hover:underline">
                Open <ExternalLink className="h-3 w-3" />
              </a>
            )}
          </li>
        ))}
      </ul>
    </Card>
  );
}
