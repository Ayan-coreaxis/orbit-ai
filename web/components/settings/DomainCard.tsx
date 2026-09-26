"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, Check, Copy, ExternalLink, Globe, Loader2, RefreshCw, Trash2 } from "lucide-react";
import { Button, Card, Pill, SectionLabel } from "@/components/ui";
import { cn } from "@/lib/utils";

type Rec = { type: string; host: string; name: string; value: string; ok?: boolean; found?: string[] };
type View = { domain: string | null; status: string | null; note: string | null; checkedAt: string | null; records: Rec[]; storeUrl: string; hostingReady: boolean };

/** Settings > Domain: put the store on the seller's own domain, with exact DNS records and a live check. */
export function DomainCard() {
  const [v, setV] = useState<View | null>(null);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState<null | "save" | "check" | "remove">(null);
  const [err, setErr] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    fetch("/api/domains")
      .then((r) => r.json())
      .then((d) => alive && !d.error && setV(d))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  async function call(kind: "save" | "check" | "remove") {
    setBusy(kind);
    setErr(null);
    try {
      const res =
        kind === "save"
          ? await fetch("/api/domains", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ domain: input }) })
          : kind === "check"
            ? await fetch("/api/domains/check", { method: "POST" })
            : await fetch("/api/domains", { method: "DELETE" });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || "Something went wrong.");
      if (kind === "check") setV((x) => (x ? { ...x, status: d.status, note: d.note, records: d.records, checkedAt: new Date().toISOString() } : x));
      else setV(d);
      if (kind === "check" && d.status === "verified") {
        const fresh = await (await fetch("/api/domains")).json();
        setV(fresh);
      }
      if (kind === "save") setInput("");
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setBusy(null);
    }
  }

  function copy(text: string) {
    navigator.clipboard?.writeText(text).then(() => {
      setCopied(text);
      setTimeout(() => setCopied(null), 1500);
    });
  }

  const verified = v?.status === "verified";
  return (
    <Card className="p-7" >
      <div id="domain" className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Globe className="h-4 w-4 text-accent" />
          <SectionLabel>Your own domain</SectionLabel>
        </div>
        {v?.domain && <Pill tone={verified ? "good" : "warn"}>{verified ? "Live" : "Waiting for DNS"}</Pill>}
      </div>

      {!v ? (
        <div className="mt-4 flex items-center gap-2 text-[12.5px] text-text-faint">
          <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading…
        </div>
      ) : !v.domain ? (
        <div className="mt-3">
          <p className="text-[13px] leading-relaxed text-text-dim">
            Put your store on your own address, like <b>shop.mybrand.pk</b> or <b>mybrand.com</b>. Right now it&apos;s at{" "}
            <a href={v.storeUrl} target="_blank" rel="noreferrer" className="text-accent hover:underline">
              {v.storeUrl.replace(/^https?:\/\//, "")}
            </a>
            . You need a domain you&apos;ve bought (e.g. from PKNIC, GoDaddy, Namecheap or Cloudflare).
          </p>
          <div className="mt-3 flex gap-2">
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && input.trim() && call("save")}
              placeholder="shop.mybrand.pk"
              className="flex-1 rounded-lg border border-border bg-panel-2 px-3 py-2 text-[13.5px] outline-none focus:border-accent/60"
            />
            <Button onClick={() => call("save")} disabled={!input.trim() || busy === "save"}>
              {busy === "save" ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Connect
            </Button>
          </div>
          <p className="mt-2 text-[12px] text-text-faint">Tip: a sub-domain like shop.mybrand.pk is the easiest to set up.</p>
          {!v.hostingReady && <p className="mt-2 text-[12px] text-warn">Orbit&apos;s hosting isn&apos;t configured for custom domains yet — the platform admin needs to set it up.</p>}
        </div>
      ) : (
        <div className="mt-3 grid gap-4">
          <div className="flex flex-wrap items-center gap-2 text-[14px]">
            <span className="font-semibold">{v.domain}</span>
            {verified && (
              <a href={`https://${v.domain}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-[12.5px] text-accent hover:underline">
                Open <ExternalLink className="h-3 w-3" />
              </a>
            )}
          </div>
          {!verified && (
            <>
              <p className="text-[13px] leading-relaxed text-text-dim">
                Log in where you bought the domain, open its <b>DNS settings</b>, and add these records exactly. Then press <b>Check</b>.
              </p>
              <div className="overflow-x-auto rounded-xl border border-border">
                <table className="w-full min-w-[520px] text-[12.5px]">
                  <thead className="bg-panel-2 text-left text-[11px] uppercase tracking-wide text-text-faint">
                    <tr>
                      <th className="px-3 py-2 font-medium">Type</th>
                      <th className="px-3 py-2 font-medium">Host / Name</th>
                      <th className="px-3 py-2 font-medium">Value / Points to</th>
                      <th className="px-3 py-2" />
                    </tr>
                  </thead>
                  <tbody>
                    {v.records.map((r) => (
                      <tr key={r.type + r.host} className="border-t border-border align-top">
                        <td className="px-3 py-2 font-mono font-semibold">{r.type}</td>
                        <td className="px-3 py-2 font-mono">
                          <CopyText text={r.host} copied={copied} onCopy={copy} />
                        </td>
                        <td className="px-3 py-2 font-mono">
                          <CopyText text={r.value} copied={copied} onCopy={copy} />
                        </td>
                        <td className="px-3 py-2 text-right">
                          {r.ok === true ? <Check className="inline h-4 w-4 text-good" /> : r.ok === false ? <AlertTriangle className="inline h-4 w-4 text-warn" /> : null}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
          {v.note && <p className={cn("rounded-lg px-3 py-2.5 text-[12.5px] leading-relaxed", verified ? "bg-good-soft text-good" : "bg-warn-soft text-warn")}>{v.note}</p>}
          <div className="flex flex-wrap items-center gap-2">
            {!verified && (
              <Button onClick={() => call("check")} disabled={busy === "check"}>
                {busy === "check" ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />} Check
              </Button>
            )}
            <Button variant="ghost" className="text-bad" onClick={() => window.confirm(`Disconnect ${v.domain}? Your store stays live at its Orbit address.`) && call("remove")} disabled={busy === "remove"}>
              <Trash2 className="h-4 w-4" /> Disconnect
            </Button>
            {v.checkedAt && <span className="text-[11.5px] text-text-faint">Last checked {new Date(v.checkedAt).toLocaleTimeString()}</span>}
          </div>
        </div>
      )}
      {err && <p className="mt-3 text-[12.5px] text-bad">{err}</p>}
    </Card>
  );
}

function CopyText({ text, copied, onCopy }: { text: string; copied: string | null; onCopy: (t: string) => void }) {
  return (
    <button type="button" onClick={() => onCopy(text)} className="group inline-flex max-w-full items-center gap-1.5 text-left hover:text-accent" title="Copy">
      <span className="break-all">{text}</span>
      {copied === text ? <Check className="h-3 w-3 shrink-0 text-good" /> : <Copy className="h-3 w-3 shrink-0 opacity-40 group-hover:opacity-100" />}
    </button>
  );
}
