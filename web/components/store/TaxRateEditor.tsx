"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function TaxRateEditor({ initialRate }: { initialRate: number | null }) {
  const router = useRouter();
  const [value, setValue] = useState(initialRate === null ? "" : String(initialRate));
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    try {
      await fetch("/api/business/tax-rate", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ taxRatePercent: value === "" ? null : Number(value) }),
      });
      router.refresh();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mt-3 flex items-center gap-2">
      <input
        type="number"
        min={0}
        max={100}
        step={0.1}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onBlur={save}
        placeholder="e.g. 17"
        className="w-24 rounded-lg border border-border bg-panel-2 px-3 py-2 text-[14px]"
      />
      <span className="text-[13px] text-text-dim">%</span>
      {saving && <span className="text-[11px] text-text-faint">saving…</span>}
    </div>
  );
}
