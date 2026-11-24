"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Sparkles } from "lucide-react";

/** "See it with sample conversations" — adds the demo threads so the Inbox can be tried right away. */
export function DemoStart({ subtle = false }: { subtle?: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  async function go() {
    setBusy(true);
    await fetch("/api/inbox/demo", { method: "POST" }).catch(() => null);
    router.refresh();
    setBusy(false);
  }
  return (
    <button
      onClick={go}
      disabled={busy}
      className={subtle ? "mx-auto flex items-center gap-2 rounded-full px-4 py-2 text-[14.5px] font-medium text-text-dim hover:bg-panel hover:text-text" : "btn-soft inline-flex items-center gap-2"}
    >
      {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
      See it with sample conversations
    </button>
  );
}
