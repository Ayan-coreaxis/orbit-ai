"use client";

import { useEffect, useState } from "react";
import { Topbar } from "@/components/Topbar";
import { Card, SectionLabel, Button } from "@/components/ui";
import { Cpu, Zap, RefreshCw, Check } from "lucide-react";

interface ModelOption {
  id: string;
  label: string;
  tier: "Latest" | "Previous generation";
  note?: string;
}

function ModelPicker({
  title,
  description,
  icon: Icon,
  models,
  value,
  onSave,
  saving,
  justSaved,
}: {
  title: string;
  description: string;
  icon: typeof Cpu;
  models: ModelOption[];
  value: string;
  onSave: (modelId: string) => void;
  saving: boolean;
  justSaved: boolean;
}) {
  const [selected, setSelected] = useState(value);
  // Follow a new saved value from the server (adjusting state during render, not in an effect).
  const [seen, setSeen] = useState(value);
  if (seen !== value) {
    setSeen(value);
    setSelected(value);
  }

  const grouped = ["Latest", "Previous generation"] as const;

  return (
    <Card className="p-6">
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-panel-2">
          <Icon className="h-[18px] w-[18px] text-text-dim" />
        </div>
        <div>
          <div className="text-[15px] font-medium">{title}</div>
          <p className="mt-1 max-w-lg text-[13.5px] leading-relaxed text-text-dim">{description}</p>
        </div>
      </div>

      <div className="mt-4 space-y-4">
        {grouped.map((tier) => {
          const inTier = models.filter((m) => m.tier === tier);
          if (inTier.length === 0) return null;
          return (
            <div key={tier}>
              <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-text-faint">{tier}</div>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {inTier.map((m) => (
                  <button
                    key={m.id}
                    onClick={() => setSelected(m.id)}
                    className={`rounded-xl border px-3.5 py-3 text-left transition-colors ${
                      selected === m.id
                        ? "border-accent bg-accent-soft"
                        : "border-border-strong hover:bg-panel-2"
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-[13.5px] font-medium">{m.label}</span>
                      {selected === m.id && <Check className="h-3.5 w-3.5 text-accent-strong" />}
                    </div>
                    {m.note && <p className="mt-0.5 text-[11.5px] text-text-faint">{m.note}</p>}
                    <p className="mt-1 truncate text-[10.5px] text-text-faint">{m.id}</p>
                  </button>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      <div className="mt-4">
        <Button variant="primary" onClick={() => onSave(selected)} disabled={saving || selected === value}>
          {saving ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
          {justSaved ? "Saved" : "Save"}
        </Button>
      </div>
    </Card>
  );
}

export default function AiModelPage() {
  const [models, setModels] = useState<ModelOption[]>([]);
  const [primary, setPrimary] = useState("");
  const [fast, setFast] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [savingRole, setSavingRole] = useState<"primary" | "fast" | null>(null);
  const [justSavedRole, setJustSavedRole] = useState<"primary" | "fast" | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    fetch("/api/admin/ai-model")
      .then(async (res) => ({ ok: res.ok, data: await res.json() }))
      .then(({ ok, data }) => {
        if (!alive) return;
        if (ok) {
          setModels(data.models);
          setPrimary(data.primary);
          setFast(data.fast);
        }
        setLoaded(true);
      })
      .catch(() => alive && setLoaded(true));
    return () => {
      alive = false;
    };
  }, []);

  async function save(role: "primary" | "fast", modelId: string) {
    setSavingRole(role);
    setJustSavedRole(null);
    setError(null);
    try {
      const res = await fetch("/api/admin/ai-model", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role, modelId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Couldn't save.");
      setPrimary(data.primary);
      setFast(data.fast);
      setJustSavedRole(role);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setSavingRole(null);
    }
  }

  return (
    <div>
      <Topbar title="AI Model" subtitle="Which real Claude model every agent calls, platform-wide" />
      <div className="max-w-[900px] space-y-5 p-5 sm:p-8 lg:p-10">
        {!loaded && <p className="text-[13.5px] text-text-faint">Loading current selection…</p>}
        {error && <p className="text-[13.5px] text-bad">{error}</p>}

        {loaded && (
          <>
            <ModelPicker
              title="Primary model"
              description="Used for the real reasoning-heavy calls — Orchestrator, Competitor Intelligence, Content, Orbit Design, and every other main agent."
              icon={Cpu}
              models={models}
              value={primary}
              onSave={(id) => save("primary", id)}
              saving={savingRole === "primary"}
              justSaved={justSavedRole === "primary"}
            />
            <ModelPicker
              title="Fast model"
              description="Used for cheaper, high-volume, lower-stakes calls — quick classifications and self-checks where the primary model would be overkill."
              icon={Zap}
              models={models}
              value={fast}
              onSave={(id) => save("fast", id)}
              saving={savingRole === "fast"}
              justSaved={justSavedRole === "fast"}
            />
          </>
        )}

        <Card className="p-6">
          <SectionLabel>How this takes effect</SectionLabel>
          <p className="mt-2 text-[13.5px] leading-relaxed text-text-dim">
            Saving here writes to the database and applies immediately — every route across the
            app reads the same live selection on its next real AI call. No restart, no deploy.
          </p>
        </Card>
      </div>
    </div>
  );
}
