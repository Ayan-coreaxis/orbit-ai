"use client";

import { useEffect, useMemo, useState } from "react";
import { Card, SectionLabel, Pill } from "@/components/ui";
import { Plug, Plus, X, Loader2, CheckCircle2, Trash2, Wrench, Search } from "lucide-react";
import {
  KNOWN_MCP_CONNECTORS,
  CONNECTOR_CATEGORY_LABELS,
  CONNECTOR_CATEGORY_ORDER,
  getConnector,
  type KnownConnector,
} from "@/lib/known-mcp-connectors";
import { ConnectorIcon } from "@/components/icons/ConnectorIcon";

interface Connection {
  id: string;
  name: string;
  connectorId: string | null;
  mcpServerUrl: string;
  authType: string;
  hasAuthToken: boolean;
  oauthConnected: boolean;
  oauthPending: boolean;
  skill: string | null;
  enabled: boolean;
  lastStatus: string | null;
  lastToolNames: string[];
}

const BLANK = { name: "", mcpServerUrl: "", authToken: "", skill: "" };

export function McpConnectionsManager() {
  const [connections, setConnections] = useState<Connection[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [query, setQuery] = useState("");
  const [cat, setCat] = useState<"all" | (typeof CONNECTOR_CATEGORY_ORDER)[number]>("all");
  const [form, setForm] = useState(BLANK);
  const [selected, setSelected] = useState<KnownConnector | null>(null);
  const [shopDomain, setShopDomain] = useState("");
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; text: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const [oauthBusy, setOauthBusy] = useState(false);
  const [useOAuth, setUseOAuth] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [banner, setBanner] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    const p = new URLSearchParams(window.location.search).get("mcp");
    if (p === "connected") setBanner({ ok: true, text: "Signed in — the tool is now in the pool." });
    else if (p === "error") setBanner({ ok: false, text: "Sign-in didn't complete. Delete the pending entry and try again." });
    if (p) window.history.replaceState({}, "", window.location.pathname);
  }, []);

  async function load() {
    setLoading(true);
    try {
      const res = await fetch("/api/mcp-connections");
      const data = await res.json();
      setConnections(data.connections ?? []);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    load();
  }, []);

  function pickConnector(c: KnownConnector) {
    setSelected(c);
    setShopDomain("");
    setTestResult(null);
    setError(null);
    setUseOAuth(c.authType === "oauth");
    setForm({ name: c.name, mcpServerUrl: c.needsShopDomain ? "" : c.urlTemplate, authToken: "", skill: "" });
  }
  function pickCustom() {
    setSelected(null);
    setShopDomain("");
    setTestResult(null);
    setError(null);
    setUseOAuth(false);
    setForm(BLANK);
  }

  async function startOAuth() {
    setOauthBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/mcp-connections/oauth/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, connectorId: selected?.id ?? null }),
      });
      const data = await res.json();
      if (!res.ok || !data.authUrl) throw new Error(data.error || "Couldn't start sign-in.");
      window.location.href = data.authUrl;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
      setOauthBusy(false);
    }
  }

  useEffect(() => {
    if (selected?.needsShopDomain) {
      setForm((f) => ({
        ...f,
        mcpServerUrl: shopDomain ? selected.urlTemplate.replace("{shop}", shopDomain.trim()) : "",
      }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shopDomain]);

  async function testConnection() {
    setTesting(true);
    setTestResult(null);
    try {
      const res = await fetch("/api/mcp-connections/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mcpServerUrl: form.mcpServerUrl, authToken: form.authToken || undefined }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        setTestResult({ ok: false, text: data.error || "Couldn't connect." });
      } else {
        setTestResult({
          ok: true,
          text: `Connected — found ${data.toolCount} real tool${data.toolCount === 1 ? "" : "s"}: ${data.toolNames.join(", ") || "(none named)"}`,
        });
      }
    } catch {
      setTestResult({ ok: false, text: "Couldn't reach the server." });
    } finally {
      setTesting(false);
    }
  }

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/mcp-connections", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, connectorId: selected?.id ?? null }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Couldn't save.");
      setForm(BLANK);
      setSelected(null);
      setTestResult(null);
      setShowForm(false);
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setSaving(false);
    }
  }

  async function patch(id: string, patch: Record<string, unknown>) {
    await fetch(`/api/mcp-connections/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
  }
  async function toggleEnabled(id: string, enabled: boolean) {
    setConnections((cs) => cs.map((c) => (c.id === id ? { ...c, enabled } : c)));
    await patch(id, { enabled });
  }
  async function saveSkill(id: string, skill: string) {
    setConnections((cs) => cs.map((c) => (c.id === id ? { ...c, skill } : c)));
    await patch(id, { skill });
  }
  async function remove(id: string) {
    await fetch(`/api/mcp-connections/${id}`, { method: "DELETE" });
    setConnections((cs) => cs.filter((c) => c.id !== id));
  }
  async function reauth(id: string) {
    const res = await fetch("/api/mcp-connections/oauth/start", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ connectionId: id }),
    });
    const data = await res.json();
    if (res.ok && data.authUrl) window.location.href = data.authUrl;
    else setBanner({ ok: false, text: data.error || "Couldn't start sign-in." });
  }

  const grouped = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = KNOWN_MCP_CONNECTORS.filter((c) => {
      if (cat !== "all" && c.category !== cat) return false;
      return !q || c.name.toLowerCase().includes(q) || c.description.toLowerCase().includes(q);
    });
    return CONNECTOR_CATEGORY_ORDER.map(
      (k) => [CONNECTOR_CATEGORY_LABELS[k], filtered.filter((c) => c.category === k)] as const,
    ).filter(([, list]) => list.length > 0);
  }, [query, cat]);
  const resultCount = grouped.reduce((n, [, list]) => n + list.length, 0);

  const wantsOAuth = selected ? selected.authType === "oauth" : useOAuth;

  return (
    <Card className="p-7">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Plug className="h-4 w-4 text-text-faint" />
          <SectionLabel>Connected tools (MCP)</SectionLabel>
        </div>
        <button
          onClick={() => {
            setShowForm((s) => !s);
            pickCustom();
          }}
          className="flex items-center gap-1.5 rounded-lg border border-border-strong px-3 py-1.5 text-[12.5px] font-medium text-text-dim hover:text-text"
        >
          {showForm ? <X className="h-3.5 w-3.5" /> : <Plus className="h-3.5 w-3.5" />}
          {showForm ? "Cancel" : "Connect a tool"}
        </button>
      </div>
      <p className="mt-2 max-w-2xl text-[12.5px] leading-relaxed text-text-faint">
        These live in one shared pool. When any agent runs, it looks at its task and pulls in only
        the tools that genuinely help — with the usage notes you write below — then drops them when
        the run ends. Nothing is pinned to one agent and nothing stays connected between runs.
      </p>

      {banner && (
        <p className={`mt-3 rounded-lg px-3 py-2 text-[12.5px] ${banner.ok ? "bg-good-soft text-good" : "bg-bad-soft text-bad"}`}>
          {banner.text}
        </p>
      )}

      {showForm && (
        <div className="mt-4 space-y-4 rounded-xl border border-border bg-panel-2/40 p-4">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-faint" />
            <input
              className="input w-full pl-9"
              placeholder={`Search ${KNOWN_MCP_CONNECTORS.length} connectors…`}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              autoFocus
            />
          </div>

          <div className="flex flex-wrap gap-1.5">
            {(["all", ...CONNECTOR_CATEGORY_ORDER] as const).map((k) => (
              <button
                key={k}
                onClick={() => setCat(k)}
                className={`rounded-full px-2.5 py-1 text-[11.5px] font-medium transition-colors ${
                  cat === k
                    ? "bg-accent text-white"
                    : "bg-panel-2 text-text-dim hover:text-text"
                }`}
              >
                {k === "all" ? "All" : CONNECTOR_CATEGORY_LABELS[k]}
              </button>
            ))}
          </div>

          <div className="max-h-[320px] space-y-4 overflow-y-auto pr-1">
            {grouped.map(([label, list]) => (
              <div key={label}>
                <div className="mb-2 text-[11px] font-semibold uppercase tracking-[0.06em] text-text-faint">{label}</div>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
                  {list.map((c) => (
                    <button
                      key={c.id}
                      onClick={() => pickConnector(c)}
                      className={`group flex items-center gap-2.5 rounded-xl border p-2.5 text-left transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-accent ${
                        selected?.id === c.id
                          ? "border-accent bg-accent-soft"
                          : "border-border hover:-translate-y-px hover:border-border-strong hover:bg-panel-2"
                      }`}
                    >
                      <ConnectorIcon si={c.si} mono={c.mono} color={c.color} size={18} />
                      <span className="min-w-0 flex-1 truncate text-[12.5px] font-medium">{c.name}</span>
                    </button>
                  ))}
                </div>
              </div>
            ))}
            {resultCount === 0 && (
              <p className="py-6 text-center text-[12.5px] text-text-faint">
                No connector matches “{query}”. Use <button onClick={pickCustom} className="text-accent-strong underline">Custom server</button>.
              </p>
            )}
            <div>
              <div className="mb-2 text-[11px] font-semibold uppercase tracking-[0.06em] text-text-faint">Anything else</div>
              <button
                onClick={pickCustom}
                className={`flex items-center gap-2.5 rounded-xl border p-2.5 text-left transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-accent ${
                  !selected ? "border-accent bg-accent-soft" : "border-border hover:border-border-strong hover:bg-panel-2"
                }`}
              >
                <span className="inline-flex h-[28px] w-[28px] shrink-0 items-center justify-center rounded-[22%] border border-border bg-panel-2">
                  <Wrench className="h-3.5 w-3.5 text-text-faint" />
                </span>
                <span className="text-[12.5px] font-medium">Custom MCP server</span>
              </button>
            </div>
          </div>

          {selected && (
            <p className="text-[12px] leading-relaxed text-text-faint">
              {selected.description} <span className="text-text-dim">{selected.authHint}</span>
            </p>
          )}

          {!selected && (
            <label className="flex items-center gap-2 text-[12px] text-text-dim">
              <input type="checkbox" checked={useOAuth} onChange={(e) => setUseOAuth(e.target.checked)} />
              This server uses OAuth sign-in (no API key)
            </label>
          )}

          {selected?.needsShopDomain && (
            <div>
              <label className="mb-1 block text-[11.5px] font-medium text-text-faint">
                Your {selected.placeholderSuffix} subdomain
              </label>
              <div className="flex items-center gap-1">
                <input
                  className="input flex-1"
                  placeholder={selected.placeholderLabel}
                  value={shopDomain}
                  onChange={(e) => setShopDomain(e.target.value)}
                />
                <span className="text-[12.5px] text-text-faint">{selected.placeholderSuffix}</span>
              </div>
            </div>
          )}

          <input
            className="input w-full"
            placeholder="Name, e.g. Higgsfield Video Gen"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
          />
          <input
            className="input w-full"
            placeholder="Real MCP server URL, e.g. https://mcp.higgsfield.ai/mcp"
            value={form.mcpServerUrl}
            disabled={!!selected && !selected.needsShopDomain}
            onChange={(e) => setForm({ ...form, mcpServerUrl: e.target.value })}
          />
          <input
            className="input w-full"
            type="password"
            placeholder={
              wantsOAuth
                ? "Auth token / API key (only if this server also accepts one)"
                : "Auth token / API key (optional, if the server needs one)"
            }
            value={form.authToken}
            onChange={(e) => setForm({ ...form, authToken: e.target.value })}
          />
          <textarea
            className="input w-full"
            style={{ minHeight: 72, resize: "none" }}
            placeholder="Usage notes — tell any agent how & when to use this, e.g. 'Generate a real 10-second product video whenever the plan calls for a video asset.'"
            value={form.skill}
            onChange={(e) => setForm({ ...form, skill: e.target.value })}
          />

          <div className="flex flex-wrap items-center gap-3">
            {wantsOAuth && !form.authToken.trim() ? (
              <button
                onClick={startOAuth}
                disabled={!form.name.trim() || !form.mcpServerUrl.trim() || oauthBusy}
                className="gradient-fill rounded-lg px-4 py-2 text-[12.5px] font-semibold text-white disabled:opacity-50"
              >
                {oauthBusy ? "Starting sign-in…" : `Continue to ${selected?.name ?? "the server"} sign-in`}
              </button>
            ) : (
              <>
                <button
                  onClick={testConnection}
                  disabled={!form.mcpServerUrl.trim() || testing}
                  className="flex items-center gap-1.5 rounded-lg border border-border-strong px-3.5 py-2 text-[12.5px] font-medium text-text-dim disabled:opacity-40"
                >
                  {testing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
                  Test connection
                </button>
                <button
                  onClick={save}
                  disabled={!form.name.trim() || !form.mcpServerUrl.trim() || saving}
                  className="gradient-fill rounded-lg px-4 py-2 text-[12.5px] font-semibold text-white disabled:opacity-50"
                >
                  {saving ? "Saving…" : "Save"}
                </button>
              </>
            )}
          </div>
          {testResult && <p className={`text-[12px] ${testResult.ok ? "text-good" : "text-bad"}`}>{testResult.text}</p>}
          {error && <p className="text-[12px] text-bad">{error}</p>}
        </div>
      )}

      <div className="mt-5 space-y-2.5">
        {loading ? (
          [0, 1].map((i) => <div key={i} className="h-[74px] animate-pulse rounded-xl border border-border bg-panel-2/50" />)
        ) : connections.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border px-4 py-8 text-center">
            <span className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-panel-2">
              <Plug className="h-4 w-4 text-text-faint" />
            </span>
            <p className="mt-2.5 text-[13px] font-medium text-text-dim">No tools connected yet</p>
            <p className="mt-1 text-[12px] text-text-faint">
              Install a plugin above, or use <span className="text-text-dim">Connect a tool</span> to add one.
            </p>
          </div>
        ) : (
          connections.map((c) => (
            <ConnectionRow
              key={c.id}
              c={c}
              onToggle={toggleEnabled}
              onSaveSkill={saveSkill}
              onRemove={remove}
              onReauth={reauth}
            />
          ))
        )}
      </div>
    </Card>
  );
}

function ConnectionRow({
  c,
  onToggle,
  onSaveSkill,
  onRemove,
  onReauth,
}: {
  c: Connection;
  onToggle: (id: string, enabled: boolean) => void;
  onSaveSkill: (id: string, skill: string) => void;
  onRemove: (id: string) => void;
  onReauth: (id: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(c.skill ?? "");
  const brand = getConnector(c.connectorId);

  return (
    <div className="rounded-xl border border-border p-3.5">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 gap-3">
          <div className="pt-0.5">
            <ConnectorIcon si={brand?.si} mono={brand?.mono ?? c.name.slice(0, 2)} color={brand?.color ?? "#5b5b6b"} size={17} />
          </div>
          <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[13.5px] font-medium">{c.name}</span>
            {c.oauthPending ? (
              <Pill tone="bad">Waiting for sign-in</Pill>
            ) : (
              <Pill tone={c.enabled ? "good" : "neutral"}>{c.enabled ? "In the pool" : "Off"}</Pill>
            )}
            {c.oauthConnected && <Pill tone="good">Signed in</Pill>}
            {c.authType === "api_key" && c.hasAuthToken && <Pill tone="neutral">Has API key</Pill>}
            {c.lastStatus === "ok" && <Pill tone="good">Reachable</Pill>}
            {c.lastStatus === "error" && <Pill tone="bad">Last check failed</Pill>}
          </div>
          <p className="mt-1 truncate text-[12px] text-text-faint">{c.mcpServerUrl}</p>
          {c.lastToolNames.length > 0 && (
            <p className="mt-1 text-[11.5px] text-text-faint">Tools: {c.lastToolNames.slice(0, 8).join(", ")}</p>
          )}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {c.oauthPending ? (
            <button
              onClick={() => onReauth(c.id)}
              className="rounded-lg border border-border-strong px-2.5 py-1 text-[12px] font-medium text-accent-strong hover:bg-accent-soft"
            >
              Sign in
            </button>
          ) : (
            <button onClick={() => onToggle(c.id, !c.enabled)} className="text-[12px] font-medium text-text-faint hover:text-text">
              {c.enabled ? "Turn off" : "Turn on"}
            </button>
          )}
          <button onClick={() => onRemove(c.id)} className="text-text-faint hover:text-bad">
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {editing ? (
        <div className="mt-2.5">
          <textarea
            className="input w-full"
            style={{ minHeight: 64, resize: "none" }}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="How & when should an agent use this tool?"
          />
          <div className="mt-1.5 flex gap-2">
            <button
              onClick={() => {
                onSaveSkill(c.id, draft.trim());
                setEditing(false);
              }}
              className="rounded-lg border border-border-strong px-2.5 py-1 text-[12px] font-medium text-text-dim hover:text-text"
            >
              Save notes
            </button>
            <button onClick={() => setEditing(false)} className="px-2 py-1 text-[12px] text-text-faint hover:text-text">
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <button onClick={() => setEditing(true)} className="mt-2 text-left text-[12px] text-text-dim hover:text-text">
          {c.skill ? c.skill : <span className="text-text-faint italic">No usage notes — add some so agents know when to use it</span>}
        </button>
      )}
    </div>
  );
}
