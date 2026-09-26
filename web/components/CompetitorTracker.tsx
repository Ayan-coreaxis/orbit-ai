"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Plus, X } from "lucide-react";
import { Button, Card, SectionLabel } from "@/components/ui";
import { RefreshAnalysisButton } from "@/components/RefreshAnalysisButton";

type Tracked = { id: string; url: string };

/** Add / remove competitor links, then refresh the notes. */
export function CompetitorTracker({ initial }: { initial: Tracked[] }) {
  const router = useRouter();
  const [list, setList] = useState(initial);
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function add() {
    setBusy(true);
    setError(null);
    const res = await fetch("/api/competitors", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ url }) });
    const d = (await res.json().catch(() => ({}))) as { competitor?: Tracked; error?: string };
    if (d.competitor) {
      setList((l) => [...l, d.competitor!]);
      setUrl("");
    } else setError(d.error ?? "Couldn't add it.");
    setBusy(false);
  }

  async function remove(id: string) {
    setList((l) => l.filter((c) => c.id !== id));
    await fetch(`/api/competitors?id=${encodeURIComponent(id)}`, { method: "DELETE" }).catch(() => {});
    router.refresh();
  }

  return (
    <Card className="p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <SectionLabel>Competitors you track</SectionLabel>
        {list.length > 0 && <RefreshAnalysisButton />}
      </div>
      <p className="mt-1.5 text-[12.5px] text-text-faint">
        Reference only — your growth plan is built from your own business. Refresh after adding or removing links.
      </p>
      {list.length > 0 && (
        <div className="mt-4 flex flex-wrap gap-2">
          {list.map((c) => (
            <span key={c.id} className="flex items-center gap-1.5 rounded-lg border border-border bg-panel-2 px-2.5 py-1 text-[13px]">
              {c.url}
              <button onClick={() => remove(c.id)} className="text-text-faint hover:text-bad" aria-label={`Stop tracking ${c.url}`}>
                <X className="h-3.5 w-3.5" />
              </button>
            </span>
          ))}
        </div>
      )}
      <div className="mt-4 flex gap-2">
        <input
          className="input flex-1"
          placeholder="theirshop.pk or @theirbrand"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && url.trim() && !busy && add()}
        />
        <Button variant="secondary" onClick={add} disabled={busy || !url.trim()}>
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} Track
        </Button>
      </div>
      {error && <p className="mt-2 text-[12.5px] text-bad">{error}</p>}
    </Card>
  );
}
