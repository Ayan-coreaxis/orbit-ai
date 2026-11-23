"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Download, Mail, Trash2 } from "lucide-react";
import { Card } from "@/components/ui";

export function AccountControls({ email, verified, stores }: { email: string; verified: boolean; stores: string[] }) {
  const router = useRouter();
  const [sending, setSending] = useState(false);
  const [sentMsg, setSentMsg] = useState<string | null>(null);
  const [confirm, setConfirm] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function resend() {
    setSending(true);
    setSentMsg(null);
    const r = await fetch("/api/auth/verify", { method: "POST" }).catch(() => null);
    const d = (await r?.json().catch(() => ({}))) as { error?: string; devLink?: string; alreadyVerified?: boolean };
    setSending(false);
    setSentMsg(r?.ok ? (d.alreadyVerified ? "Already confirmed." : `Sent — check ${email}.${d.devLink ? " (Dev: email isn't set up, link printed in the console.)" : ""}`) : d.error ?? "Couldn't send it.");
    if (d.devLink) console.info("Verify link:", d.devLink);
  }

  async function del() {
    setDeleting(true);
    setErr(null);
    const r = await fetch("/api/account/delete", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ confirm }) }).catch(() => null);
    const d = (await r?.json().catch(() => ({}))) as { error?: string };
    if (r?.ok) {
      router.push("/");
      router.refresh();
      return;
    }
    setDeleting(false);
    setErr(d.error ?? "Couldn't delete the account.");
  }

  const canDelete = confirm.trim().toLowerCase() === email.toLowerCase();

  return (
    <div className="space-y-5">
      <Card className="p-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <span className="flex h-11 w-11 items-center justify-center rounded-full bg-panel-2 text-accent">
              <Mail className="h-5 w-5" />
            </span>
            <div>
              <div className="text-[16px] font-semibold">{email}</div>
              <div className={`mt-0.5 flex items-center gap-1.5 text-[14px] ${verified ? "text-good" : "text-warn"}`}>
                {verified ? <CheckCircle2 className="h-4 w-4" /> : null}
                {verified ? "Email confirmed" : "Not confirmed yet"}
              </div>
            </div>
          </div>
          {!verified && (
            <button onClick={resend} disabled={sending} className="btn-primary disabled:opacity-60">
              {sending ? "Sending…" : "Send confirmation email"}
            </button>
          )}
        </div>
        {sentMsg && <p className="mt-3 text-[14px] text-text-dim">{sentMsg}</p>}
      </Card>

      <Card className="p-6">
        <h2 className="text-[17px] font-semibold">Download your data</h2>
        <p className="mt-1 max-w-xl text-[14.5px] leading-relaxed text-text-dim">
          One file with your stores, products, orders, customers, offers, reviews and store design. Passwords and API keys are left out.
        </p>
        <a href="/api/account/export" className="btn-soft mt-4">
          <Download className="h-4 w-4" /> Download my data
        </a>
      </Card>

      <Card className="border-bad/30 p-6">
        <h2 className="text-[17px] font-semibold text-bad">Delete account</h2>
        <p className="mt-1 max-w-xl text-[14.5px] leading-relaxed text-text-dim">
          This permanently deletes your login{stores.length ? ` and ${stores.length === 1 ? `the store “${stores[0]}”` : `${stores.length} stores (${stores.join(", ")})`}` : ""} —
          products, orders, customers, messages and design. It can&apos;t be undone. Download your data first if you want a copy.
        </p>
        <label className="mt-4 block max-w-md">
          <span className="mb-1.5 block text-[14px] text-text-dim">
            Type <b className="text-text">{email}</b> to confirm
          </span>
          <input className="input" value={confirm} onChange={(e) => setConfirm(e.target.value)} placeholder={email} autoComplete="off" />
        </label>
        {err && <p role="alert" className="mt-3 text-[14px] text-bad">{err}</p>}
        <button
          onClick={del}
          disabled={!canDelete || deleting}
          className="press mt-4 inline-flex items-center gap-2 rounded-full bg-bad px-5 py-2.5 text-[14.5px] font-semibold text-white transition-opacity disabled:cursor-not-allowed disabled:opacity-40"
        >
          <Trash2 className="h-4 w-4" /> {deleting ? "Deleting…" : "Delete my account"}
        </button>
      </Card>
    </div>
  );
}
