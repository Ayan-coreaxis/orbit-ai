"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowRight, Eye, EyeOff, Loader2, Lock, Mail } from "lucide-react";
import { AuthField } from "@/components/marketing/AuthShell";

/** Only same-site paths are allowed as a post-login destination. */
function safeNext(v: string | null): string | null {
  return v && v.startsWith("/") && !v.startsWith("//") ? v : null;
}

export function AuthForm({ mode }: { mode: "login" | "signup" }) {
  const router = useRouter();
  const params = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const strength = password.length === 0 ? 0 : password.length < 8 ? 1 : /[A-Z]/.test(password) && /\d/.test(password) && password.length >= 10 ? 3 : 2;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(mode === "login" ? "/api/auth/login" : "/api/auth/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string; hasBusiness?: boolean };
      if (!res.ok) {
        setError(data.error || "Something went wrong.");
        setLoading(false);
        return;
      }
      const next = safeNext(params.get("next"));
      router.push(mode === "signup" ? "/onboarding" : next ?? (data.hasBusiness === false ? "/onboarding" : "/dashboard"));
      router.refresh();
    } catch {
      setError("Couldn't reach the server — check your connection and try again.");
      setLoading(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4" noValidate>
      <AuthField label="Email" icon={<Mail className="h-4 w-4" />} type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@yourstore.com" />
      <AuthField
        label="Password"
        icon={<Lock className="h-4 w-4" />}
        type={show ? "text" : "password"}
        autoComplete={mode === "login" ? "current-password" : "new-password"}
        required
        minLength={8}
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        placeholder={mode === "signup" ? "At least 8 characters" : "Your password"}
        trailing={
          <button type="button" onClick={() => setShow(!show)} className="text-zinc-500 hover:text-zinc-300" aria-label={show ? "Hide password" : "Show password"}>
            {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
        }
      />
      {mode === "signup" && password.length > 0 && (
        <div className="orbit-fade flex items-center gap-2">
          <div className="flex flex-1 gap-1">
            {[1, 2, 3].map((i) => (
              <span key={i} className={`h-1 flex-1 rounded-full transition-colors duration-300 ${strength >= i ? (strength === 1 ? "bg-red-400" : strength === 2 ? "bg-amber-400" : "bg-emerald-400") : "bg-white/10"}`} />
            ))}
          </div>
          <span className="text-[11.5px] text-zinc-500">{strength === 1 ? "Too short" : strength === 2 ? "Okay" : "Strong"}</span>
        </div>
      )}
      {mode === "login" && (
        <div className="text-right">
          <Link href="/forgot-password" className="text-[13px] text-zinc-400 hover:text-white">
            Forgot password?
          </Link>
        </div>
      )}
      {error && (
        <p role="alert" className="orbit-fade rounded-xl border border-red-500/20 bg-red-500/10 p-3 text-[13px] text-red-300">
          {error}
        </p>
      )}
      <button
        type="submit"
        disabled={loading}
        className="press group flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-violet-500 via-fuchsia-500 to-orange-500 px-4 py-3.5 text-[15px] font-semibold text-white shadow-[0_10px_30px_-10px_rgba(217,70,239,0.6)] transition-opacity disabled:opacity-60"
      >
        {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <>{mode === "login" ? "Log in" : "Create account"} <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" /></>}
      </button>
      {mode === "signup" && (
        <p className="text-center text-[12px] leading-relaxed text-zinc-500">
          By creating an account you agree to the{" "}
          <Link href="/terms" className="text-zinc-300 underline underline-offset-2 hover:text-white">Terms</Link> and{" "}
          <Link href="/privacy" className="text-zinc-300 underline underline-offset-2 hover:text-white">Privacy Policy</Link>.
        </p>
      )}
    </form>
  );
}
