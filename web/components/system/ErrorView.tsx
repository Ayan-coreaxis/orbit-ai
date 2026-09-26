"use client";

import Link from "next/link";
import { useEffect } from "react";
import { RotateCcw, Home } from "lucide-react";

/** Shared "something broke" screen for error boundaries — calm, one clear action, a reference code. */
export function ErrorView({ error, retry, homeHref = "/" }: { error: Error & { digest?: string }; retry: () => void; homeHref?: string }) {
  useEffect(() => {
    console.error(error);
  }, [error]);
  return (
    <div className="flex min-h-[70dvh] items-center justify-center px-6">
      <div className="orbit-fade-up w-full max-w-md text-center">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-bad-soft text-2xl">⚠︎</div>
        <h1 className="mt-5 text-xl font-semibold">Something went wrong on our side</h1>
        <p className="mt-2 text-[14px] leading-relaxed text-text-dim">Nothing you did — try again. If it keeps happening, send us the code below.</p>
        {error.digest && <p className="mt-3 font-mono text-[12px] text-text-faint">Ref: {error.digest}</p>}
        <div className="mt-6 flex justify-center gap-3">
          <button onClick={() => retry()} className="inline-flex items-center gap-2 rounded-lg bg-accent px-4 py-2 text-[13.5px] font-semibold text-white transition-transform hover:scale-[1.02]">
            <RotateCcw className="h-4 w-4" /> Try again
          </button>
          <Link href={homeHref} className="inline-flex items-center gap-2 rounded-lg border border-border px-4 py-2 text-[13.5px] font-medium hover:bg-panel-2">
            <Home className="h-4 w-4" /> Go back
          </Link>
        </div>
      </div>
    </div>
  );
}
