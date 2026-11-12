"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { Card, Pill, SectionLabel } from "@/components/ui";

function FeedRow({ label, url, steps }: { label: string; url: string; steps: string[] }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      /* clipboard blocked — the address is selectable */
    }
  }
  return (
    <div className="rounded-xl border border-border bg-panel-2 p-4">
      <div className="text-[13.5px] font-semibold">{label}</div>
      <div className="mt-2 flex items-center gap-2">
        <input readOnly value={url} onFocus={(e) => e.currentTarget.select()} aria-label={`${label} feed address`} className="min-w-0 flex-1 rounded-lg border border-border bg-panel px-3 py-2 font-mono text-[12px] text-text-dim outline-none" />
        <button onClick={copy} className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-border-strong bg-panel px-3 py-2 text-[12.5px] font-medium hover:border-accent/50">
          {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
      <ol className="mt-3 list-decimal space-y-1 pl-5 text-[12.5px] leading-relaxed text-text-dim">
        {steps.map((s) => (
          <li key={s}>{s}</li>
        ))}
      </ol>
    </div>
  );
}

/** The store's product feeds for Google Shopping and Facebook / Instagram Shops. */
export function ProductFeedsCard({ googleUrl, metaUrl, published, reachable }: { googleUrl: string; metaUrl: string; published: boolean; reachable: boolean }) {
  return (
    <Card className="p-6 sm:p-7">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <SectionLabel>Product feeds</SectionLabel>
        <Pill tone={published && reachable ? "good" : "neutral"}>{published && reachable ? "Live" : "Not live yet"}</Pill>
      </div>
      <p className="mt-3 text-[13px] leading-relaxed text-text-dim">
        List your products on Google Shopping and in Facebook / Instagram Shops. Each feed is your real catalog — names, prices, photos and stock — and updates itself about every hour.
        Products without a photo are left out.
      </p>
      {!published && <p className="mt-2 text-[12.5px] text-text-faint">Your store isn&apos;t published yet, so these addresses don&apos;t open. Publish the store first.</p>}
      {published && !reachable && <p className="mt-2 text-[12.5px] text-text-faint">Your store doesn&apos;t have a public web address yet, so Google and Meta can&apos;t read these. Connect a domain in Settings &gt; Domain.</p>}
      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <FeedRow
          label="Google Merchant Center"
          url={googleUrl}
          steps={["Open Merchant Center > Products > Feeds (Data sources) and add a product source.", "Choose \"Add products from a file\" and paste this address as the file link.", "Set it to fetch daily and save. Google reviews products in a few days."]}
        />
        <FeedRow
          label="Meta Commerce Manager"
          url={metaUrl}
          steps={["Open Commerce Manager > your catalog > Data sources > Add items > Data feed.", "Choose \"Scheduled feed\" and paste this address as the feed URL.", "Set it to update hourly or daily and save. Your Shop and ads use this catalog."]}
        />
      </div>
    </Card>
  );
}
