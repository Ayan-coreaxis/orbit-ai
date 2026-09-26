"use client";

import { useEffect, useState } from "react";
import { Card, SectionLabel, Pill } from "@/components/ui";
import { Package, Check, Loader2 } from "lucide-react";
import { ConnectorIcon } from "@/components/icons/ConnectorIcon";

interface Plugin {
  id: string;
  name: string;
  description: string;
  mono: string;
  color: string;
  toolCount: number;
  skillCount: number;
  connectors: { name: string; authType: string; si?: string; mono: string; color: string }[];
  installed: boolean;
}

export function PluginsManager() {
  const [plugins, setPlugins] = useState<Plugin[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    fetch("/api/plugins")
      .then((r) => r.json())
      .then((data) => alive && setPlugins(data.plugins ?? []))
      .catch(() => {})
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, []);

  async function toggle(p: Plugin) {
    setBusy(p.id);
    setNote(null);
    try {
      const res = await fetch(`/api/plugins/${p.id}${p.installed ? "?action=uninstall" : ""}`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed.");
      if (!p.installed && Array.isArray(data.needsAuth) && data.needsAuth.length > 0) {
        setNote(`Installed. ${data.needsAuth.join(" and ")} still need${data.needsAuth.length === 1 ? "s" : ""} sign-in or an API key below.`);
      } else if (!p.installed) {
        setNote(`Installed "${p.name}".`);
      }
      // The MCP + Skills lists load on mount — reload so they show the new rows.
      setTimeout(() => window.location.reload(), p.installed ? 200 : 1200);
    } catch (e) {
      setNote(e instanceof Error ? e.message : "Something went wrong.");
      setBusy(null);
    }
  }

  return (
    <Card className="p-7">
      <div className="flex items-center gap-2">
        <Package className="h-4 w-4 text-text-faint" />
        <SectionLabel>Plugins</SectionLabel>
      </div>
      <p className="mt-2 max-w-2xl text-[12.5px] leading-relaxed text-text-faint">
        One-click bundles. Installing a plugin drops its tools into the pool and adds its skills —
        your agents then use them automatically when a task fits. Tools that need a sign-in or an
        API key will say so afterwards.
      </p>

      {note && (
        <p className="mt-3 rounded-lg border border-border bg-panel-2 px-3 py-2 text-[12.5px] text-text-dim" role="status">
          {note}
        </p>
      )}

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        {loading
          ? [0, 1, 2, 3].map((i) => (
              <div key={i} className="h-[168px] animate-pulse rounded-xl border border-border bg-panel-2/50" />
            ))
          : plugins.map((p) => (
              <div
                key={p.id}
                className={`flex flex-col rounded-xl border p-4 transition-colors ${
                  p.installed ? "border-accent/40 bg-accent-soft/30" : "border-border"
                }`}
              >
                <div className="flex items-start gap-3">
                  <span
                    aria-hidden
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[22%] text-[15px] font-semibold text-white"
                    style={{ background: p.color }}
                  >
                    {p.mono}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-[13.5px] font-medium">{p.name}</span>
                      {p.installed && <Pill tone="good">Installed</Pill>}
                    </div>
                    <p className="mt-0.5 text-[12px] leading-relaxed text-text-faint">{p.description}</p>
                  </div>
                </div>

                <div className="mt-3 flex flex-1 flex-wrap content-start items-center gap-1.5">
                  {p.connectors.map((c) => (
                    <span
                      key={c.name}
                      className="inline-flex items-center gap-1.5 rounded-md bg-panel-2 py-1 pl-1 pr-2 text-[11px] text-text-dim"
                    >
                      <ConnectorIcon si={c.si} mono={c.mono} color={c.color} size={12} />
                      {c.name}
                      <span className="text-text-faint">
                        {c.authType === "oauth" ? "· sign-in" : c.authType === "api_key" ? "· API key" : ""}
                      </span>
                    </span>
                  ))}
                  {p.skillCount > 0 && (
                    <span className="rounded-md bg-panel-2 px-2 py-1 text-[11px] text-text-dim">
                      {p.skillCount} skill{p.skillCount === 1 ? "" : "s"}
                    </span>
                  )}
                </div>

                <button
                  onClick={() => toggle(p)}
                  disabled={busy === p.id}
                  className={`mt-3 flex items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-[12.5px] font-semibold transition-opacity focus:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:opacity-50 ${
                    p.installed
                      ? "border border-border-strong text-text-dim hover:text-text"
                      : "gradient-fill text-white"
                  }`}
                >
                  {busy === p.id ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : p.installed ? null : (
                    <Check className="h-3.5 w-3.5" />
                  )}
                  {busy === p.id ? "Working…" : p.installed ? "Uninstall" : "Install"}
                </button>
              </div>
            ))}
      </div>
    </Card>
  );
}
