"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Card, Pill } from "@/components/ui";
import { Play, Pause } from "lucide-react";

interface CampaignRow {
  id: string;
  name: string;
  dailyBudgetUsd: number;
  reasoning: string;
  status: string;
  createdAt: string;
  activatedAt: string | null;
}

const STATUS_TONE: Record<string, "warn" | "good" | "bad" | "neutral"> = {
  paused: "warn",
  active: "good",
  error: "bad",
};

export function AdCampaignsManager({ campaigns }: { campaigns: CampaignRow[] }) {
  const router = useRouter();
  const [updating, setUpdating] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function toggle(id: string, action: "activate" | "pause") {
    setUpdating(id);
    setError(null);
    try {
      const res = await fetch(`/api/ads/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Couldn't update campaign.");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setUpdating(null);
    }
  }

  return (
    <Card className="overflow-hidden">
      {campaigns.length === 0 ? (
        <p className="p-6 text-[13.5px] text-text-faint">
          No real campaigns yet — the Ads Agent creates one when auto-apply is on and a real cycle runs.
        </p>
      ) : (
        <div className="divide-y divide-border">
          {error && <p className="p-4 text-[13px] text-bad">{error}</p>}
          {campaigns.map((c) => (
            <div key={c.id} className="p-5">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="text-[14px] font-medium">{c.name}</div>
                  <div className="text-[12.5px] text-text-faint">Real budget: ${c.dailyBudgetUsd}/day</div>
                  <p className="mt-1.5 text-[13px] text-text-dim">{c.reasoning}</p>
                </div>
                <Pill tone={STATUS_TONE[c.status] ?? "neutral"}>{c.status}</Pill>
              </div>
              <div className="mt-3 flex gap-2">
                {c.status === "paused" && (
                  <button
                    onClick={() => toggle(c.id, "activate")}
                    disabled={updating === c.id}
                    className="flex items-center gap-1.5 text-[12.5px] font-medium text-good hover:underline"
                  >
                    <Play className="h-3.5 w-3.5" /> Activate real spend
                  </button>
                )}
                {c.status === "active" && (
                  <button
                    onClick={() => toggle(c.id, "pause")}
                    disabled={updating === c.id}
                    className="flex items-center gap-1.5 text-[12.5px] font-medium text-bad hover:underline"
                  >
                    <Pause className="h-3.5 w-3.5" /> Pause (kill switch)
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}
