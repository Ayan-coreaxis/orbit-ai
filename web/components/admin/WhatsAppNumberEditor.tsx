"use client";

import { useState } from "react";

export function WhatsAppNumberEditor({ businessId, initialNumber }: { businessId: string; initialNumber: string | null }) {
  const [value, setValue] = useState(initialNumber ?? "");
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    try {
      await fetch(`/api/admin/business/${businessId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ whatsappInboundNumber: value || null }),
      });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex items-center gap-1">
      <input
        type="text"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onBlur={save}
        placeholder="+14155238886"
        className="w-32 rounded-md border border-border bg-panel-2 px-1.5 py-1 text-[12.5px]"
      />
      {saving && <span className="text-[10px] text-text-faint">…</span>}
    </div>
  );
}
