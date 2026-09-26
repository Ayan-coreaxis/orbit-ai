"use client";

import { useEffect, useState } from "react";
import { Topbar } from "@/components/Topbar";
import { Card, SectionLabel, Pill, Button } from "@/components/ui";
import { apiKeyConfigs } from "@/lib/admin-data";
import { KeyRound, Eye, EyeOff, Check, RefreshCw } from "lucide-react";

export default function ApiKeysPage() {
  const [values, setValues] = useState<Record<string, string>>({});
  const [visible, setVisible] = useState<Record<string, boolean>>({});
  const [status, setStatus] = useState<Record<string, boolean>>({});
  const [saving, setSaving] = useState<Record<string, boolean>>({});
  const [loaded, setLoaded] = useState(false);

  async function loadStatus() {
    const res = await fetch("/api/admin/settings");
    const data = await res.json();
    setStatus(data.status ?? {});
    setLoaded(true);
  }

  useEffect(() => {
    let alive = true;
    fetch("/api/admin/settings")
      .then((r) => r.json())
      .then((data) => {
        if (!alive) return;
        setStatus(data.status ?? {});
        setLoaded(true);
      })
      .catch(() => alive && setLoaded(true));
    return () => {
      alive = false;
    };
  }, []);

  async function save(id: string) {
    const value = values[id];
    if (!value) return;
    setSaving({ ...saving, [id]: true });
    const res = await fetch("/api/admin/settings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, value }),
    });
    setSaving({ ...saving, [id]: false });
    if (res.ok) {
      setValues({ ...values, [id]: "" });
      await loadStatus();
    }
  }

  return (
    <div>
      <Topbar
        title="API Keys & Integrations"
        subtitle="Saved directly to this server's .env.local — real, not a demo"
      />
      <div className="max-w-[900px] space-y-5 p-10">
        {!loaded && <p className="text-[13.5px] text-text-faint">Loading current status…</p>}

        {apiKeyConfigs.map((cfg) => (
          <Card key={cfg.id} className="p-6">
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-start gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-panel-2">
                  <KeyRound className="h-[18px] w-[18px] text-text-dim" />
                </div>
                <div>
                  <div className="text-[15px] font-medium">{cfg.name}</div>
                  <p className="mt-1 max-w-md text-[13.5px] leading-relaxed text-text-dim">
                    {cfg.description}
                  </p>
                </div>
              </div>
              <Pill tone={status[cfg.id] ? "good" : "neutral"}>
                {status[cfg.id] ? "Connected" : "Not connected"}
              </Pill>
            </div>

            <div className="mt-4 flex items-center gap-2.5">
              <div className="flex flex-1 items-center gap-2 rounded-xl border border-border-strong bg-panel px-3.5 py-2.5">
                <input
                  type={visible[cfg.id] ? "text" : "password"}
                  placeholder={status[cfg.id] ? "Already set — paste a new key to replace it" : `Paste your ${cfg.name} key…`}
                  value={values[cfg.id] ?? ""}
                  onChange={(e) => setValues({ ...values, [cfg.id]: e.target.value })}
                  className="w-full bg-transparent text-[14px] outline-none placeholder:text-text-faint"
                  name={`orbit-key-${cfg.id}`}
                  autoComplete="new-password"
                  data-1p-ignore
                  data-lpignore="true"
                />
                <button
                  onClick={() => setVisible({ ...visible, [cfg.id]: !visible[cfg.id] })}
                  className="text-text-faint hover:text-text-dim"
                >
                  {visible[cfg.id] ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              <Button variant="primary" onClick={() => save(cfg.id)} disabled={saving[cfg.id]}>
                {saving[cfg.id] ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                Save
              </Button>
            </div>
          </Card>
        ))}

        <Card className="p-6">
          <SectionLabel>Where these are used</SectionLabel>
          <p className="mt-2 text-[13.5px] leading-relaxed text-text-dim">
            Saving here writes straight to the server&apos;s <code>.env.local</code> file — the same
            place the Competitor Intelligence and Strategy Orchestrator agents already read from.
            Once Anthropic shows &quot;Connected&quot;, real onboarding reports start working
            immediately, no restart needed. Stripe, Meta, and Twilio are stored the same way, ready
            for when those integrations are built.
          </p>
          <p className="mt-3 text-[12px] text-text-faint">
            This whole panel is password-gated — see <code>ADMIN_PASSWORD</code> in <code>.env.local</code>.
          </p>
        </Card>
      </div>
    </div>
  );
}
