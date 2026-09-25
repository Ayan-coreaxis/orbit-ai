"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Card, SectionLabel, Pill, Button } from "@/components/ui";
import { Plus, TrendingUp } from "lucide-react";

interface ExperimentResult {
  variant: "A" | "B";
  text: string;
  views: number;
  conversions: number;
  conversionRate: number;
}

interface ExperimentRow {
  id: string;
  name: string;
  active: boolean;
  variantAText: string;
  variantBText: string;
  createdAt: string;
  results: ExperimentResult[];
}

export function ExperimentsManager({ experiments }: { experiments: ExperimentRow[] }) {
  const router = useRouter();
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState("");
  const [variantAText, setVariantAText] = useState("");
  const [variantBText, setVariantBText] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function create() {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/experiments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, variantAText, variantBText }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Couldn't create experiment.");
      setName("");
      setVariantAText("");
      setVariantBText("");
      setShowForm(false);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setSaving(false);
    }
  }

  async function toggleActive(id: string, active: boolean) {
    await fetch(`/api/experiments/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ active }),
    });
    router.refresh();
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <SectionLabel>Experiments</SectionLabel>
        <Button variant="secondary" onClick={() => setShowForm((s) => !s)}>
          <Plus className="h-4 w-4" /> {showForm ? "Cancel" : "New experiment"}
        </Button>
      </div>

      {showForm && (
        <Card className="p-5">
          <div className="space-y-3">
            <input className="input" placeholder="Experiment name" value={name} onChange={(e) => setName(e.target.value)} />
            <input
              className="input"
              placeholder="Variant A — hero text"
              value={variantAText}
              onChange={(e) => setVariantAText(e.target.value)}
            />
            <input
              className="input"
              placeholder="Variant B — hero text"
              value={variantBText}
              onChange={(e) => setVariantBText(e.target.value)}
            />
          </div>
          {error && <p className="mt-2 text-[13px] text-bad">{error}</p>}
          <Button
            variant="primary"
            className="mt-3.5"
            onClick={create}
            disabled={saving || !name || !variantAText || !variantBText}
          >
            {saving ? "Creating…" : "Start experiment"}
          </Button>
        </Card>
      )}

      {experiments.length === 0 ? (
        <Card className="p-6">
          <p className="text-[13.5px] text-text-faint">No experiments yet — start one above.</p>
        </Card>
      ) : (
        <div className="space-y-4">
          {experiments.map((exp) => {
            const totalViews = exp.results.reduce((s, r) => s + r.views, 0);
            const winner =
              totalViews >= 10
                ? exp.results.reduce((a, b) => (b.conversionRate > a.conversionRate ? b : a))
                : null;
            return (
              <Card key={exp.id} className="p-5">
                <div className="flex items-center justify-between">
                  <div className="text-[14.5px] font-medium">{exp.name}</div>
                  <div className="flex items-center gap-2">
                    <Pill tone={exp.active ? "good" : "neutral"}>{exp.active ? "Active" : "Stopped"}</Pill>
                    <button
                      onClick={() => toggleActive(exp.id, !exp.active)}
                      className="text-[12.5px] font-medium text-accent-strong hover:underline"
                    >
                      {exp.active ? "Stop" : "Reactivate"}
                    </button>
                  </div>
                </div>
                <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
                  {exp.results.map((r) => (
                    <div
                      key={r.variant}
                      className={
                        "rounded-lg border p-3.5 " +
                        (winner?.variant === r.variant ? "border-good/40 bg-good-soft" : "border-border")
                      }
                    >
                      <div className="flex items-center gap-1.5 text-[12.5px] font-medium text-text-dim">
                        Variant {r.variant}
                        {winner?.variant === r.variant && <TrendingUp className="h-3 w-3 text-good" />}
                      </div>
                      <p className="mt-1 text-[13px] text-text-dim">&quot;{r.text}&quot;</p>
                      <div className="mt-2 text-[12.5px] text-text-faint">
                        {r.views} real views · {r.conversions} real conversions
                      </div>
                      <div className="mt-0.5 text-[14px] font-semibold">
                        {(r.conversionRate * 100).toFixed(1)}%
                      </div>
                    </div>
                  ))}
                </div>
                {totalViews < 10 && (
                  <p className="mt-3 text-[11.5px] text-text-faint">
                    Not enough real traffic yet ({totalViews} view{totalViews === 1 ? "" : "s"}) to call a
                    winner — no fake statistical significance shown.
                  </p>
                )}
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
