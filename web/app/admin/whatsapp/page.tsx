"use client";

import { useEffect, useState } from "react";
import { Topbar } from "@/components/Topbar";
import { Button, Card, Pill, SectionLabel } from "@/components/ui";
import { AlertTriangle, Check, Copy, Loader2, Send } from "lucide-react";

type Data = {
  configured: boolean;
  sender: string | null;
  webhookUrl: string;
  publicApp: boolean;
  sellers: { id: string; name: string; whatsappInboundNumber: string | null }[];
  inboundLast7Days: number;
};

export default function WhatsAppAdminPage() {
  const [d, setD] = useState<Data | null>(null);
  const [to, setTo] = useState("");
  const [from, setFrom] = useState("");
  const [sending, setSending] = useState(false);
  const [res, setRes] = useState<{ ok: boolean; message: string } | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let alive = true;
    fetch("/api/admin/whatsapp")
      .then((r) => r.json())
      .then((x) => alive && setD(x))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  async function test() {
    setSending(true);
    setRes(null);
    setRes(await (await fetch("/api/admin/whatsapp", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ to, from }) })).json());
    setSending(false);
  }

  const steps = [
    { ok: !!d?.configured, text: "Twilio Account SID, Auth Token and WhatsApp sender are saved (Super Admin > API Keys)." },
    { ok: !!d?.publicApp, text: "Orbit runs on a public https address, so Twilio can deliver incoming messages." },
    { ok: (d?.sellers.length ?? 0) > 0, text: "At least one seller has their WhatsApp number assigned (Sellers page)." },
    { ok: (d?.inboundLast7Days ?? 0) > 0, text: "Incoming messages are arriving (last 7 days)." },
  ];

  return (
    <div>
      <Topbar title="WhatsApp" subtitle="Twilio WhatsApp — the seller's store chatbot, order confirmations, delivery & cart messages" />
      <div className="max-w-[1000px] space-y-5 p-10">
        <Card className="p-6">
          <div className="flex items-center justify-between">
            <SectionLabel>Setup</SectionLabel>
            <Pill tone={d?.configured ? "good" : "neutral"}>{d?.configured ? `Sender ${d.sender}` : "Not connected"}</Pill>
          </div>
          <ul className="mt-4 grid gap-2">
            {steps.map((s) => (
              <li key={s.text} className="flex items-start gap-2 text-[13px]">
                {s.ok ? <Check className="mt-0.5 h-4 w-4 text-good" /> : <AlertTriangle className="mt-0.5 h-4 w-4 text-warn" />}
                <span className={s.ok ? "text-text-dim" : ""}>{s.text}</span>
              </li>
            ))}
          </ul>
          <div className="mt-5">
            <div className="text-[12.5px] font-medium text-text-dim">Paste this into Twilio as the &quot;When a message comes in&quot; webhook (HTTP POST) for every sender number:</div>
            <div className="mt-1.5 flex items-center gap-2 rounded-xl border border-border-strong bg-panel px-3 py-2 font-mono text-[12.5px]">
              <span className="flex-1 truncate">{d?.webhookUrl ?? "…"}</span>
              <button
                onClick={() => d && navigator.clipboard?.writeText(d.webhookUrl).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500); })}
                className="text-text-faint hover:text-text"
                aria-label="Copy webhook URL"
              >
                {copied ? <Check className="h-4 w-4 text-good" /> : <Copy className="h-4 w-4" />}
              </button>
            </div>
            <p className="mt-2 text-[11.5px] leading-relaxed text-text-faint">
              Every incoming message is checked against Twilio&apos;s signature, so only Twilio can reach the chatbot. If Orbit sits behind a proxy that changes the address, set
              TWILIO_WEBHOOK_URL to exactly the URL above. Messages to a customer who hasn&apos;t written in the last 24 hours need a Meta-approved template in Twilio.
            </p>
          </div>
        </Card>

        <Card className="p-6">
          <SectionLabel>Send a test message</SectionLabel>
          <div className="mt-3 grid gap-3 sm:grid-cols-[1fr_1fr_auto]">
            <input className="input" placeholder="To, e.g. +923001234567" value={to} onChange={(e) => setTo(e.target.value)} />
            <input className="input" placeholder="From (optional — a seller's number)" value={from} onChange={(e) => setFrom(e.target.value)} />
            <Button onClick={test} disabled={sending || !d?.configured || !to.trim()}>
              {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />} Send
            </Button>
          </div>
          {res && <p className={`mt-3 rounded-lg px-3 py-2 text-[13px] ${res.ok ? "bg-good-soft text-good" : "bg-bad-soft text-bad"}`}>{res.message}</p>}
        </Card>

        <Card className="p-6">
          <SectionLabel>Sellers with a WhatsApp number</SectionLabel>
          {d?.sellers.length ? (
            <ul className="mt-3 divide-y divide-border text-[13px]">
              {d.sellers.map((s) => (
                <li key={s.id} className="flex justify-between py-2">
                  <span>{s.name}</span>
                  <span className="font-mono text-text-dim">{s.whatsappInboundNumber}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-3 text-[13px] text-text-faint">None yet — assign a number to a seller on the Sellers page.</p>
          )}
        </Card>
      </div>
    </div>
  );
}
