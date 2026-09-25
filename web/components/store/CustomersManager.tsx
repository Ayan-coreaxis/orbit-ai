"use client";

import { useEffect, useMemo, useState } from "react";
import { Card } from "@/components/ui";
import { money } from "@/lib/money";
import type { CustomerSummary, Segment } from "@/lib/store-customers";

const SEGMENTS: { key: Segment | "all"; label: string }[] = [
  { key: "all", label: "All" },
  { key: "vip", label: "VIP" },
  { key: "repeat", label: "Repeat" },
  { key: "new", label: "New" },
  { key: "at_risk", label: "At risk" },
];
const SEG_CLS: Record<Segment, string> = {
  vip: "bg-good-soft text-good",
  repeat: "bg-accent-soft text-accent-strong",
  new: "bg-panel-2 text-text-faint",
  at_risk: "bg-warn-soft text-warn",
};
const SEG_LABEL: Record<Segment, string> = { vip: "VIP", repeat: "Repeat", new: "New", at_risk: "At risk" };

const EMPTY: Record<Segment, number> = { new: 0, repeat: 0, vip: 0, at_risk: 0 };

export function CustomersManager({ businessId, currency }: { businessId: string; currency?: string }) {
  const [customers, setCustomers] = useState<CustomerSummary[]>([]);
  const [counts, setCounts] = useState<Record<Segment, number>>(EMPTY);
  const [loading, setLoading] = useState(true);
  const [seg, setSeg] = useState<Segment | "all">("all");
  const [q, setQ] = useState("");

  useEffect(() => {
    fetch(`/api/store/${businessId}/admin/customers`)
      .then((r) => r.json())
      .then((d) => {
        if (Array.isArray(d.customers)) {
          setCustomers(d.customers);
          setCounts(d.counts ?? EMPTY);
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [businessId]);

  const rows = useMemo(() => {
    const query = q.trim().toLowerCase();
    return customers.filter(
      (c) =>
        (seg === "all" || c.segment === seg) &&
        (!query || c.name.toLowerCase().includes(query) || c.phone.includes(query) || (c.email ?? "").toLowerCase().includes(query)),
    );
  }, [customers, seg, q]);

  if (loading) {
    return (
      <Card className="p-6">
        <div className="animate-pulse space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-8 rounded bg-panel-2" />
          ))}
        </div>
      </Card>
    );
  }
  if (customers.length === 0) {
    return (
      <Card className="p-6">
        <p className="text-[13px] text-text-faint">No customers yet — they show up here after their first confirmed order.</p>
      </Card>
    );
  }

  return (
    <Card className="overflow-hidden p-0">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-3">
        <div className="flex flex-wrap gap-1">
          {SEGMENTS.map((s) => (
            <button
              key={s.key}
              onClick={() => setSeg(s.key)}
              className={`rounded-md px-2.5 py-1 text-[12.5px] font-medium transition-colors ${
                seg === s.key ? "bg-accent-soft text-accent-strong" : "text-text-faint hover:bg-panel-2 hover:text-text-dim"
              }`}
            >
              {s.label}
              {s.key !== "all" && <span className="ml-1 tabular-nums opacity-70">{counts[s.key as Segment]}</span>}
            </button>
          ))}
        </div>
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Name, phone, email"
          className="w-48 rounded-md border border-border bg-panel-2 px-2.5 py-1.5 text-[12.5px] outline-none focus:border-accent-strong/40"
        />
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-[12.5px]">
          <thead className="text-left text-text-faint">
            <tr className="border-b border-border">
              <th className="px-4 py-2 font-medium">Customer</th>
              <th className="px-3 py-2 font-medium">Orders</th>
              <th className="px-3 py-2 font-medium">Spent</th>
              <th className="px-3 py-2 font-medium">Avg</th>
              <th className="px-3 py-2 font-medium">Last order</th>
              <th className="px-4 py-2" />
            </tr>
          </thead>
          <tbody>
            {rows.map((c) => (
              <tr key={c.phone} className="border-b border-border last:border-0 hover:bg-panel-2">
                <td className="px-4 py-2.5">
                  <div className="font-medium text-text">{c.name}</div>
                  <div className="text-text-faint">
                    {c.phone}
                    {c.email ? ` · ${c.email}` : ""}
                    {c.hasAccount ? " · account" : ""}
                  </div>
                </td>
                <td className="px-3 py-2.5 tabular-nums">{c.orders}</td>
                <td className="px-3 py-2.5 tabular-nums font-medium">{money(c.spent, currency)}</td>
                <td className="px-3 py-2.5 tabular-nums text-text-dim">{money(c.aov, currency)}</td>
                <td className="px-3 py-2.5 text-text-dim">
                  {new Date(c.lastOrderAt).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
                </td>
                <td className="px-4 py-2.5 text-right">
                  <span className={`rounded px-1.5 py-0.5 text-[11px] font-semibold ${SEG_CLS[c.segment]}`}>{SEG_LABEL[c.segment]}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
