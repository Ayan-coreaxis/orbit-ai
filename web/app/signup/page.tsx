"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Compass, ArrowRight, Mail, Lock, Loader2 } from "lucide-react";

export default function SignupPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Something went wrong.");
        return;
      }
      router.push("/onboarding");
      router.refresh();
    } catch {
      setError("Couldn't reach the server — try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#0a0a0c] px-6 py-12 text-zinc-100">
      <div className="w-full max-w-sm">
        <Link href="/" className="mb-8 flex items-center justify-center gap-2.5">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-violet-500 via-fuchsia-500 to-orange-400">
            <Compass className="h-5 w-5 text-white" strokeWidth={2.5} />
          </div>
          <span className="text-[17px] font-semibold tracking-tight">
            orbit<span className="bg-gradient-to-r from-violet-400 via-fuchsia-400 to-orange-400 bg-clip-text text-transparent">.ai</span>
          </span>
        </Link>

        <form onSubmit={submit} className="rounded-2xl border border-zinc-800 bg-zinc-900/50 p-8">
          <h1 className="text-xl font-semibold text-white">Create your account</h1>
          <p className="mt-1.5 text-[14px] text-zinc-400">Real account, real growth plan for your real business.</p>

          <div className="mt-6 space-y-3.5">
            <label className="block">
              <span className="mb-1.5 block text-[13px] font-medium text-zinc-400">Email</span>
              <div className="flex items-center gap-2.5 rounded-xl border border-zinc-700 bg-zinc-950 px-3.5 py-2.5 focus-within:border-fuchsia-500/60">
                <Mail className="h-4 w-4 text-zinc-500" />
                <input
                  type="email"
                  required
                  placeholder="you@business.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full bg-transparent text-[14.5px] text-zinc-100 outline-none placeholder:text-zinc-600"
                />
              </div>
            </label>
            <label className="block">
              <span className="mb-1.5 block text-[13px] font-medium text-zinc-400">Password</span>
              <div className="flex items-center gap-2.5 rounded-xl border border-zinc-700 bg-zinc-950 px-3.5 py-2.5 focus-within:border-fuchsia-500/60">
                <Lock className="h-4 w-4 text-zinc-500" />
                <input
                  type="password"
                  required
                  minLength={8}
                  placeholder="At least 8 characters"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full bg-transparent text-[14.5px] text-zinc-100 outline-none placeholder:text-zinc-600"
                />
              </div>
            </label>
          </div>

          {error && (
            <p className="mt-4 rounded-xl border border-red-500/20 bg-red-500/10 p-3 text-[13px] text-red-400">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="mt-6 flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-violet-500 via-fuchsia-500 to-orange-500 px-4 py-3 text-[14.5px] font-semibold text-white shadow-[0_0_20px_rgba(217,70,239,0.2)] transition-transform hover:scale-[1.01] disabled:opacity-50"
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <>Create account <ArrowRight className="h-4 w-4" /></>}
          </button>

          <p className="mt-4 text-center text-[12px] leading-relaxed text-zinc-500">
            By creating an account you agree to the{" "}
            <Link href="/terms" className="text-zinc-300 underline underline-offset-2 hover:text-white">
              Terms
            </Link>{" "}
            and{" "}
            <Link href="/privacy" className="text-zinc-300 underline underline-offset-2 hover:text-white">
              Privacy Policy
            </Link>
            .
          </p>

          <p className="mt-6 text-center text-[13.5px] text-zinc-500">
            Already have an account?{" "}
            <Link href="/login" className="font-medium text-zinc-200 hover:text-white">
              Log in
            </Link>
          </p>
        </form>
      </div>
    </div>
  );
}
