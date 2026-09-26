"use client";

import { useState } from "react";

export function UpgradeButton({ plan, currentPlan, billingConfigured }: { plan: string; currentPlan: string; billingConfigured: boolean }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isCurrent = plan === currentPlan;

  async function upgrade() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/billing/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan, returnUrl: window.location.origin + window.location.pathname }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Couldn't start checkout.");
      window.location.href = data.url;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
      setLoading(false);
    }
  }

  if (isCurrent) {
    return (
      <div className="mt-4 rounded-lg border border-border py-2 text-center text-[12.5px] font-medium text-text-faint">
        Current plan
      </div>
    );
  }

  return (
    <div className="mt-4">
      <button
        onClick={upgrade}
        disabled={loading || !billingConfigured}
        className="w-full rounded-lg bg-accent py-2 text-[12.5px] font-semibold text-white disabled:opacity-40"
        title={billingConfigured ? undefined : "Online billing isn't switched on yet."}
      >
        {loading ? "Redirecting…" : billingConfigured ? "Switch to this plan" : "Not available yet"}
      </button>
      {error && <p className="mt-2 text-[11.5px] text-bad">{error}</p>}
    </div>
  );
}
