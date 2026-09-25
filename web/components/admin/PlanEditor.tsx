"use client";

import { useState } from "react";
import { PLAN_LABELS } from "@/lib/usage-limit";

export function PlanEditor({
  businessId,
  initialPlan,
  initialCap,
}: {
  businessId: string;
  initialPlan: string;
  initialCap: number | null;
}) {
  const [plan, setPlan] = useState(initialPlan);
  const [cap, setCap] = useState(initialCap === null ? "" : String(initialCap));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save(patch: { plan?: string; monthlyUsageCapUsd?: number | null }) {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/business/${businessId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Couldn't save.");
        return;
      }
      // Server may have auto-applied a plan-default cap — reflect that back in the field.
      setCap(data.monthlyUsageCapUsd === null ? "" : String(data.monthlyUsageCapUsd));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <div className="flex items-center gap-2">
        <select
          value={plan}
          onChange={(e) => {
            setPlan(e.target.value);
            save({ plan: e.target.value });
          }}
          className="rounded-md border border-border bg-panel-2 px-2 py-1 text-[12.5px]"
        >
          {Object.entries(PLAN_LABELS).map(([id, label]) => (
            <option key={id} value={id}>
              {label}
            </option>
          ))}
        </select>
        <div className="flex items-center gap-1">
          <span className="text-[12px] text-text-faint">$ cap</span>
          <input
            type="number"
            min={0}
            step={1}
            value={cap}
            onChange={(e) => setCap(e.target.value)}
            onBlur={() => save({ monthlyUsageCapUsd: cap === "" ? null : Number(cap) })}
            placeholder="none"
            className="w-16 rounded-md border border-border bg-panel-2 px-1.5 py-1 text-[12.5px]"
          />
        </div>
        {saving && <span className="text-[11px] text-text-faint">…</span>}
      </div>
      {error && <div className="mt-1 max-w-[220px] text-[11px] text-bad">{error}</div>}
    </div>
  );
}
