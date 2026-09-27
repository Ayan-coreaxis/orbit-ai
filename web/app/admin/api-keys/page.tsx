"use client";

import { useEffect, useState } from "react";
import { Topbar } from "@/components/Topbar";
import { Card, Pill, Button } from "@/components/ui";
import { apiKeyConfigs, apiKeyGroups } from "@/lib/admin-data";
import { Eye, EyeOff, Check, RefreshCw } from "lucide-react";

const byId = new Map(apiKeyConfigs.map((c) => [c.id, c]));

export default function ApiKeysPage() {
  const [values, setValues] = useState<Record<string, string>>({});
  const [visible, setVisible] = useState<Record<string, boolean>>({});
  const [status, setStatus] = useState<Record<string, boolean>>({});
  const [saving, setSaving] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ id: string; ok: boolean; text: string } | null>(null);
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
    const value = values[id]?.trim();
    if (!value) return;
    setSaving(id);
    setNotice(null);
    try {
      const res = await fetch("/api/admin/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, value }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Couldn't save.");
      setValues((v) => ({ ...v, [id]: "" }));
      setNotice({ id, ok: true, text: "Saved — in use now." });
      await loadStatus();
    } catch (e) {
      setNotice({ id, ok: false, text: e instanceof Error ? e.message : "Couldn't save." });
    } finally {
      setSaving(null);
    }
  }

  return (
    <div>
      <Topbar title="API keys" subtitle="Keys for the services Orbit uses — stored encrypted, used straight away" />
      <div className="max-w-[1000px] space-y-6 p-5 sm:p-8 lg:p-10">
        {/* jump links */}
        <div className="flex flex-wrap gap-1.5">
          {apiKeyGroups.map((g) => {
            const set = g.keys.filter((k) => status[k]).length;
            return (
              <a key={g.id} href={`#${g.id}`} className="rounded-full bg-panel-2 px-3 py-1.5 text-[12.5px] font-medium text-text-dim hover:text-text">
                {g.title.split(" — ")[0]} <span className={set === g.keys.length ? "text-good" : "opacity-60"}>{loaded ? `${set}/${g.keys.length}` : ""}</span>
              </a>
            );
          })}
        </div>

        {apiKeyGroups.map((g) => (
          <section key={g.id} id={g.id} className="scroll-mt-6">
            <div className="mb-2.5">
              <h2 className="text-[15.5px] font-semibold">{g.title}</h2>
              <p className="text-[13px] text-text-dim">{g.note}</p>
            </div>
            <Card className="divide-y divide-border">
              {g.keys.map((id) => {
                const cfg = byId.get(id);
                if (!cfg) return null;
                return (
                  <div key={id} className="p-5">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <div className="text-[14px] font-medium">{cfg.name}</div>
                        <p className="mt-0.5 max-w-2xl text-[12.5px] leading-relaxed text-text-faint">{cfg.description}</p>
                      </div>
                      <Pill tone={status[id] ? "good" : "neutral"}>{!loaded ? "…" : status[id] ? "Set" : "Not set"}</Pill>
                    </div>
                    <div className="mt-3 flex items-center gap-2.5">
                      <div className="flex flex-1 items-center gap-2 rounded-xl border border-border-strong bg-panel px-3.5 py-2">
                        <input
                          type={visible[id] ? "text" : "password"}
                          placeholder={status[id] ? "Saved — paste a new value to replace it" : `Paste ${cfg.name}…`}
                          value={values[id] ?? ""}
                          onChange={(e) => setValues({ ...values, [id]: e.target.value })}
                          onKeyDown={(e) => e.key === "Enter" && save(id)}
                          className="w-full bg-transparent text-[13.5px] outline-none placeholder:text-text-faint"
                          name={`orbit-key-${id}`}
                          autoComplete="new-password"
                          data-1p-ignore
                          data-lpignore="true"
                        />
                        <button
                          type="button"
                          onClick={() => setVisible({ ...visible, [id]: !visible[id] })}
                          className="text-text-faint hover:text-text-dim"
                          aria-label={visible[id] ? "Hide" : "Show"}
                        >
                          {visible[id] ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                        </button>
                      </div>
                      <Button variant="primary" onClick={() => save(id)} disabled={saving === id || !values[id]?.trim()}>
                        {saving === id ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                        Save
                      </Button>
                    </div>
                    {notice?.id === id && <p className={`mt-2 text-[12.5px] ${notice.ok ? "text-good" : "text-bad"}`}>{notice.text}</p>}
                  </div>
                );
              })}
            </Card>
          </section>
        ))}

        <p className="text-[12px] text-text-faint">
          Storage (Cloudflare R2, Whisper), web search (Brave) and Studio (Gemini, BytePlus) keys are on their own pages, next to their settings.
        </p>
      </div>
    </div>
  );
}
