"use client";

import { useState } from "react";

/** Opens Stripe's billing portal — change card, download invoices, cancel. */
export function ManageBillingButton() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function open() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/billing/portal", { method: "POST" });
      const data = (await res.json()) as { url?: string; error?: string };
      if (!res.ok || !data.url) throw new Error(data.error || "Couldn't open billing.");
      window.location.href = data.url;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
      setLoading(false);
    }
  }

  return (
    <div className="mt-4">
      <button onClick={open} disabled={loading} className="rounded-lg border border-border px-4 py-2 text-[12.5px] font-semibold hover:bg-panel-2 disabled:opacity-50">
        {loading ? "Opening…" : "Manage billing · invoices · cancel"}
      </button>
      {error && <p className="mt-2 text-[12px] text-bad">{error}</p>}
    </div>
  );
}
