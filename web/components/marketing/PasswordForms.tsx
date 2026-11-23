"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowRight, CheckCircle2, Loader2, Lock, Mail } from "lucide-react";
import { AuthField } from "@/components/marketing/AuthShell";

const btn =
  "press group flex w-full items-center justify-center gap-2 rounded-full bg-accent px-4 py-3.5 text-[15.5px] font-semibold text-panel disabled:opacity-60";

export function ForgotForm() {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [devLink, setDevLink] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const res = await fetch("/api/auth/forgot", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email }) }).catch(() => null);
    const d = (await res?.json().catch(() => ({}))) as { error?: string; devLink?: string } | undefined;
    if (!res?.ok) setError(d?.error ?? "Couldn't send the email — try again.");
    else {
      setDone(true);
      setDevLink(d?.devLink ?? null);
    }
    setBusy(false);
  }

  if (done)
    return (
      <div className="orbit-scale-in rounded-2xl border border-good/25 bg-good-soft p-5 text-[14px] text-text">
        <CheckCircle2 className="h-6 w-6 text-good" />
        <p className="mt-3">If an account exists for <b className="text-text">{email}</b>, a reset link is on its way. It works for 30 minutes.</p>
        {devLink && (
          <p className="mt-3 break-all text-[12px] text-text-faint">
            Dev only (email not connected): <Link href={devLink.replace(/^https?:\/\/[^/]+/, "")} className="text-tomato underline">open reset link</Link>
          </p>
        )}
      </div>
    );

  return (
    <form onSubmit={submit} className="space-y-4">
      <AuthField label="Email" icon={<Mail className="h-4 w-4" />} type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@yourstore.com" />
      {error && <p role="alert" className="rounded-xl border border-bad/25 bg-bad-soft p-3 text-[13px] text-bad">{error}</p>}
      <button type="submit" disabled={busy || !email} className={btn}>
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <>Send reset link <ArrowRight className="h-4 w-4" /></>}
      </button>
    </form>
  );
}

export function ResetForm() {
  const router = useRouter();
  const token = useSearchParams().get("token") ?? "";
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const res = await fetch("/api/auth/reset", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token, password }) }).catch(() => null);
    const d = (await res?.json().catch(() => ({}))) as { error?: string } | undefined;
    if (!res?.ok) {
      setError(d?.error ?? "Couldn't reset the password.");
      setBusy(false);
      return;
    }
    router.push("/dashboard");
    router.refresh();
  }

  if (!token)
    return (
      <p className="text-[14px] text-text-dim">
        This page needs the link from your email. <Link href="/forgot-password" className="text-tomato underline">Ask for a new one</Link>.
      </p>
    );
  return (
    <form onSubmit={submit} className="space-y-4">
      <AuthField label="New password" icon={<Lock className="h-4 w-4" />} type="password" autoComplete="new-password" minLength={8} required value={password} onChange={(e) => setPassword(e.target.value)} placeholder="At least 8 characters" />
      {error && <p role="alert" className="rounded-xl border border-bad/25 bg-bad-soft p-3 text-[13px] text-bad">{error}</p>}
      <button type="submit" disabled={busy || password.length < 8} className={btn}>
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <>Save and log in <ArrowRight className="h-4 w-4" /></>}
      </button>
    </form>
  );
}
