"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Lock, ArrowRight, Loader2, ShieldCheck } from "lucide-react";

export default function AdminLoginPage() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Something went wrong.");
        return;
      }
      router.push("/admin");
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
        <div className="mb-8 flex items-center justify-center gap-2.5">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-zinc-800">
            <ShieldCheck className="h-5 w-5 text-zinc-300" strokeWidth={2.5} />
          </div>
          <span className="text-[17px] font-semibold tracking-tight">Super Admin</span>
        </div>

        <form onSubmit={submit} className="rounded-2xl border border-zinc-800 bg-zinc-900/50 p-8">
          <h1 className="text-xl font-semibold text-white">Owner access</h1>
          <p className="mt-1.5 text-[14px] text-zinc-400">Platform-owner password, from your .env.local.</p>

          <label className="mt-6 block">
            <span className="mb-1.5 block text-[13px] font-medium text-zinc-400">Password</span>
            <div className="flex items-center gap-2.5 rounded-xl border border-zinc-700 bg-zinc-950 px-3.5 py-2.5 focus-within:border-fuchsia-500/60">
              <Lock className="h-4 w-4 text-zinc-500" />
              <input
                type="password"
                required
                autoFocus
                placeholder="••••••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full bg-transparent text-[14.5px] text-zinc-100 outline-none placeholder:text-zinc-600"
              />
            </div>
          </label>

          {error && (
            <p className="mt-4 rounded-xl border border-red-500/20 bg-red-500/10 p-3 text-[13px] text-red-400">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="mt-6 flex w-full items-center justify-center gap-2 rounded-xl bg-zinc-100 px-4 py-3 text-[14.5px] font-semibold text-zinc-900 transition-transform hover:scale-[1.01] disabled:opacity-50"
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <>Enter <ArrowRight className="h-4 w-4" /></>}
          </button>
        </form>
      </div>
    </div>
  );
}
