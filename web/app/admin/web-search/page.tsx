"use client";

import { useEffect, useState } from "react";
import { Topbar } from "@/components/Topbar";
import { Card, SectionLabel, Pill, Button } from "@/components/ui";
import { ArrowUpRight, Check, Eye, EyeOff, Loader2, RefreshCw, Search } from "lucide-react";

type Data = {
  config: { configured: boolean; enabled: boolean; country: string; perTurn: number; limits: Record<string, number> };
  defaults: Record<string, number>;
  pricing: { perSearchUsd: number; freeMonthlyUsd: number };
  usage: {
    total: number;
    grossUsd: number;
    billedUsd: number;
    freeLeft: number;
    sellers: { id: string; name: string; plan: string; used: number; limit: number; costUsd: number }[];
  };
};

const PLANS = [
  { id: "starter", label: "Starter" },
  { id: "growth", label: "Growth" },
  { id: "scale", label: "Scale" },
];

export default function WebSearchAdminPage() {
  const [data, setData] = useState<Data | null>(null);
  const [key, setKeyValue] = useState("");
  const [showKey, setShowKey] = useState(false);
  const [enabled, setEnabled] = useState(true);
  const [country, setCountry] = useState("pk");
  const [perTurn, setPerTurn] = useState("3");
  const [limits, setLimits] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [testQ, setTestQ] = useState("best selling snacks in Pakistan");
  const [testing, setTesting] = useState(false);
  const [test, setTest] = useState<{ ok: boolean; reason?: string; results?: { title: string; url: string; snippet: string }[] } | null>(null);

  async function load() {
    apply((await (await fetch("/api/admin/web-search")).json()) as Data);
  }
  function apply(d: Data) {
    setData(d);
    setEnabled(d.config.enabled || !d.config.configured);
    setCountry(d.config.country);
    setPerTurn(String(d.config.perTurn));
    setLimits(Object.fromEntries(PLANS.map((p) => [p.id, String(d.config.limits[p.id] ?? d.defaults[p.id])])));
  }
  useEffect(() => {
    let alive = true;
    fetch("/api/admin/web-search")
      .then((r) => r.json())
      .then((d: Data) => alive && apply(d))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  async function save() {
    setSaving(true);
    setSaved(false);
    if (key.trim()) {
      await fetch("/api/admin/settings", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: "brave_search", value: key.trim() }) });
      setKeyValue("");
    }
    await fetch("/api/admin/web-search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "save", enabled, country, perTurn: Number(perTurn), limits: Object.fromEntries(Object.entries(limits).map(([k, v]) => [k, Number(v)])) }),
    });
    setSaving(false);
    setSaved(true);
    await load();
  }

  async function runTest() {
    setTesting(true);
    setTest(await (await fetch("/api/admin/web-search", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "test", query: testQ }) })).json());
    setTesting(false);
  }

  const u = data?.usage;
  const p = data?.pricing;

  return (
    <div>
      <Topbar title="Web Search" subtitle="Lets the Orchestrator look up live prices, trends and rules on the web — Brave Search API, with per-plan monthly limits" />
      <div className="max-w-[1000px] space-y-5 p-5 sm:p-8 lg:p-10">
        {/* Status + this month */}
        <Card className="p-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="text-[15px] font-medium">
                {!data ? "Loading…" : !data.config.configured ? "Not set up yet" : data.config.enabled ? "Web search is on" : "Web search is switched off"}
              </div>
              <p className="mt-1 max-w-xl text-[13.5px] leading-relaxed text-text-dim">
                The Orchestrator decides when a question needs fresh web info, searches (max {data?.config.perTurn ?? 3} per reply), can open a result page, and shows its sources. Each search counts against the seller&apos;s monthly limit and their AI usage.
              </p>
            </div>
            <Pill tone={data?.config.configured && data.config.enabled ? "good" : data?.config.configured ? "warn" : "neutral"}>
              {data?.config.configured ? (data.config.enabled ? "On" : "Off") : "Not connected"}
            </Pill>
          </div>
          {u && p && (
            <div className="mt-5 grid gap-3 sm:grid-cols-4">
              <Stat label="Searches this month" value={u.total.toLocaleString()} />
              <Stat label="Free searches left" value={u.freeLeft.toLocaleString()} sub={`$${p.freeMonthlyUsd} free credit / month`} />
              <Stat label="Value used" value={`$${u.grossUsd.toFixed(2)}`} sub={`$${(p.perSearchUsd * 1000).toFixed(0)} per 1,000`} />
              <Stat label="Est. Brave bill" value={`$${u.billedUsd.toFixed(2)}`} sub="after the free credit" />
            </div>
          )}
        </Card>

        {/* Settings */}
        <Card className="p-6">
          <div className="flex items-center justify-between">
            <SectionLabel>Settings</SectionLabel>
            <a href="https://api-dashboard.search.brave.com/" target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-[12.5px] text-accent hover:underline">
              Open Brave API dashboard <ArrowUpRight className="h-3.5 w-3.5" />
            </a>
          </div>

          <div className="mt-4">
            <div className="flex items-center justify-between">
              <label className="text-[12.5px] font-medium text-text-dim">Brave Search API key</label>
              {data?.config.configured && <span className="text-[11px] text-good">✓ saved</span>}
            </div>
            <div className="mt-1 flex items-center gap-2 rounded-xl border border-border-strong bg-panel px-3 py-2">
              <input
                type={showKey ? "text" : "password"}
                value={key}
                onChange={(e) => setKeyValue(e.target.value)}
                placeholder={data?.config.configured ? "Saved — paste a new key to replace" : "Paste your Brave Search API key"}
                className="w-full bg-transparent text-[13.5px] outline-none placeholder:text-text-faint"
                name="orbit-brave-search-key"
                autoComplete="new-password"
                data-1p-ignore
                data-lpignore="true"
              />
              <button onClick={() => setShowKey(!showKey)} className="text-text-faint hover:text-text-dim" type="button">
                {showKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
            <p className="mt-1 text-[11.5px] text-text-faint">brave.com/search/api → Get started → pick the “Search” plan (comes with $5 free credit every month; a card is required) → API Keys → copy.</p>
          </div>

          <div className="mt-5 grid gap-4 sm:grid-cols-3">
            <label className="flex items-center gap-2.5 rounded-xl border border-border bg-panel-2 px-3 py-2.5 text-[13px]">
              <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} className="h-4 w-4 accent-[var(--accent)]" />
              Web search on for all sellers
            </label>
            <div>
              <label className="text-[12.5px] font-medium text-text-dim">Results country</label>
              <select value={country} onChange={(e) => setCountry(e.target.value)} className="input mt-1 block w-full">
                {[["pk", "Pakistan"], ["ae", "UAE"], ["sa", "Saudi Arabia"], ["in", "India"], ["gb", "United Kingdom"], ["us", "United States"], ["all", "Worldwide"]].map(([v, l]) => (
                  <option key={v} value={v}>
                    {l}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-[12.5px] font-medium text-text-dim">Max searches per reply</label>
              <input type="number" min={1} max={10} value={perTurn} onChange={(e) => setPerTurn(e.target.value)} className="input mt-1 block w-full" />
            </div>
          </div>

          <div className="mt-5">
            <div className="text-[12.5px] font-medium text-text-dim">Monthly search limit per seller, by plan</div>
            <div className="mt-2 grid gap-3 sm:grid-cols-3">
              {PLANS.map((pl) => (
                <div key={pl.id} className="rounded-xl bg-panel-2 px-3 py-2.5">
                  <div className="text-[12px] text-text-faint">{pl.label}</div>
                  <input
                    type="number"
                    min={0}
                    value={limits[pl.id] ?? ""}
                    onChange={(e) => setLimits({ ...limits, [pl.id]: e.target.value })}
                    className="mt-1 w-full bg-transparent text-[16px] font-semibold tabular-nums outline-none"
                  />
                  {p && limits[pl.id] && (
                    <div className="text-[11px] text-text-faint">max ${(Number(limits[pl.id]) * p.perSearchUsd).toFixed(2)} / seller / month</div>
                  )}
                </div>
              ))}
            </div>
            <p className="mt-2 text-[11.5px] text-text-faint">0 = no web search on that plan. Sellers near their limit are told; at the limit the Orchestrator keeps working without search and says so.</p>
          </div>

          <div className="mt-5 flex items-center gap-2.5">
            <Button variant="primary" onClick={save} disabled={saving}>
              {saving ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />} Save
            </Button>
            {saved && <span className="text-[12.5px] text-good">Saved — active now.</span>}
          </div>
        </Card>

        {/* Test */}
        <Card className="p-6">
          <SectionLabel>Test a search</SectionLabel>
          <div className="mt-3 flex items-center gap-2.5">
            <input value={testQ} onChange={(e) => setTestQ(e.target.value)} className="input flex-1" />
            <Button onClick={runTest} disabled={testing || !data?.config.configured}>
              {testing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />} Search
            </Button>
          </div>
          {!data?.config.configured && <p className="mt-2 text-[12px] text-text-faint">Save a Brave API key first.</p>}
          {test && (
            <div className="mt-4 space-y-3">
              {!test.ok && <p className="text-[13px] text-bad">{test.reason}</p>}
              {test.results?.map((r) => (
                <div key={r.url} className="rounded-xl bg-panel-2 px-4 py-3">
                  <a href={r.url} target="_blank" rel="noreferrer" className="text-[13.5px] font-medium text-accent hover:underline">
                    {r.title}
                  </a>
                  <div className="truncate text-[11.5px] text-text-faint">{r.url}</div>
                  <p className="mt-1 line-clamp-2 text-[12.5px] text-text-dim">{r.snippet}</p>
                </div>
              ))}
              {test.ok && <p className="text-[12px] text-text-faint">Test searches don&apos;t count against any seller, but Brave does count them.</p>}
            </div>
          )}
        </Card>

        {/* Per seller */}
        <Card className="p-6">
          <SectionLabel>This month, by seller</SectionLabel>
          {u?.sellers.length ? (
            <table className="mt-3 w-full text-[13px]">
              <thead>
                <tr className="text-left text-[11.5px] uppercase tracking-wide text-text-faint">
                  <th className="pb-2 font-medium">Seller</th>
                  <th className="pb-2 font-medium">Plan</th>
                  <th className="pb-2 text-right font-medium">Searches</th>
                  <th className="pb-2 text-right font-medium">Cost</th>
                </tr>
              </thead>
              <tbody>
                {u.sellers.map((s) => {
                  const pct = s.limit ? s.used / s.limit : 1;
                  return (
                    <tr key={s.id} className="border-t border-border">
                      <td className="py-2">{s.name}</td>
                      <td className="py-2 capitalize text-text-dim">{s.plan}</td>
                      <td className={`py-2 text-right tabular-nums ${pct >= 1 ? "text-bad" : pct >= 0.8 ? "text-warn" : ""}`}>
                        {s.used} / {s.limit}
                      </td>
                      <td className="py-2 text-right tabular-nums text-text-dim">${s.costUsd.toFixed(3)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          ) : (
            <p className="mt-3 text-[13px] text-text-faint">No sellers yet.</p>
          )}
        </Card>
      </div>
    </div>
  );
}

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-xl bg-panel-2 px-4 py-3">
      <div className="text-[11.5px] uppercase tracking-wide text-text-faint">{label}</div>
      <div className="mt-1 text-[18px] font-semibold tabular-nums">{value}</div>
      {sub && <div className="text-[11.5px] text-text-faint">{sub}</div>}
    </div>
  );
}
