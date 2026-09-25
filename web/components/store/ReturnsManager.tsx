"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Card } from "@/components/ui";
import { useDashToast, DashToastHost } from "@/components/dash-toast";
import { money } from "@/lib/money";

interface ReturnRow {
  id: string;
  orderId: string;
  reason: string;
  status: string;
  sellerNote: string | null;
  createdAt: string;
  customerName: string;
  total: number;
  paymentProvider: string;
  refundAmount: number | null;
  refundMethod: string | null;
}

const STATUS_CLS: Record<string, string> = {
  requested: "bg-warn-soft text-warn",
  approved: "bg-accent-soft text-accent-strong",
  received: "bg-accent-soft text-accent-strong",
  rejected: "bg-bad-soft text-bad",
  refunded: "bg-good-soft text-good",
};

const NEXT: Record<string, { to: string; label: string }[]> = {
  requested: [
    { to: "approved", label: "Approve" },
    { to: "rejected", label: "Reject" },
  ],
  approved: [
    { to: "received", label: "Mark goods received (restock)" },
    { to: "rejected", label: "Reject" },
  ],
  received: [{ to: "refunded", label: "Issue refund" }],
};

export function ReturnsManager({ rows, currency }: { rows: ReturnRow[]; currency?: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [toasts, toast] = useDashToast();

  async function move(row: ReturnRow, to: string) {
    let refundAmount: number | undefined;
    if (to === "refunded") {
      const input = prompt(`Refund amount (${(currency ?? "usd").toUpperCase()})`, String(row.total));
      if (input == null) return;
      refundAmount = Math.max(0, Number(input) || 0);
      const method = row.paymentProvider === "stripe" ? "a Stripe refund" : "a manual refund you pay out yourself";
      if (!confirm(`Issue ${method} of ${money(refundAmount, currency)}?`)) return;
    }
    setBusy(row.id);
    try {
      const r = await fetch(`/api/returns/${row.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: to, refundAmount }),
      });
      const d = await r.json();
      if (!r.ok) toast(d.error || "Update failed.", "err");
      else router.refresh();
    } finally {
      setBusy(null);
    }
  }

  return (
    <Card className="overflow-hidden p-0">
      <DashToastHost items={toasts} />
      {rows.length === 0 ? (
        <p className="p-6 text-[13px] text-text-faint">No return requests yet.</p>
      ) : (
        <div className="divide-y divide-border">
          {rows.map((r) => (
            <div key={r.id} className="p-5">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <div className="text-[14px] font-medium">
                    {r.customerName} <span className="font-mono text-[12px] text-text-faint">#{r.orderId.slice(-6).toUpperCase()}</span>
                  </div>
                  <div className="text-[12.5px] tabular-nums text-text-faint">
                    Order {money(r.total, currency)} · {r.paymentProvider.toUpperCase()}
                    {r.refundAmount != null && ` · refunded ${money(r.refundAmount, currency)}${r.refundMethod === "stripe" ? " (Stripe)" : " (manual)"}`}
                  </div>
                  <p className="mt-1.5 text-[13px] text-text-dim">&ldquo;{r.reason}&rdquo;</p>
                </div>
                <span className={`flex-none rounded-md px-1.5 py-0.5 text-[11px] font-semibold capitalize ${STATUS_CLS[r.status] ?? "bg-panel-2 text-text-faint"}`}>
                  {r.status}
                </span>
              </div>
              {NEXT[r.status] && (
                <div className="mt-3 flex flex-wrap gap-3">
                  {NEXT[r.status].map((a) => (
                    <button
                      key={a.to}
                      onClick={() => move(r, a.to)}
                      disabled={busy === r.id}
                      className={`text-[12.5px] font-medium hover:underline disabled:opacity-50 ${
                        a.to === "rejected" ? "text-bad" : a.to === "refunded" ? "text-accent-strong" : "text-good"
                      }`}
                    >
                      {a.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}
