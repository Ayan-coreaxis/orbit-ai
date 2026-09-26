"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Card, SectionLabel, Pill } from "@/components/ui";
import { Megaphone, AlertTriangle } from "lucide-react";
import { FacebookIcon, InstagramIcon } from "@/components/icons/BrandIcons";
import { MetaHealth } from "@/components/settings/MetaHealth";

const META_BLUE = "#1877F2";

const STATUS_MESSAGE: Record<string, { tone: "good" | "bad" | "warn"; text: string }> = {
  connected: { tone: "good", text: "Connected — real Page linked just now." },
  denied: { tone: "warn", text: "Connection cancelled — you didn't approve the real Facebook login." },
  no_pages: { tone: "warn", text: "That Facebook account doesn't manage any real Pages — connect an account that has one." },
  no_business: { tone: "bad", text: "No active business to connect this to." },
  not_configured: { tone: "bad", text: "The platform owner hasn't added a real Meta App ID/Secret yet — see Admin > API Keys." },
  error: { tone: "bad", text: "Something went wrong connecting to Meta — try again." },
};

export function MetaConnectCard({
  appConfigured,
  connected,
  pageName,
  hasInstagram,
  hasAdAccount,
  connectedAt,
  metaStatus,
}: {
  appConfigured: boolean;
  connected: boolean;
  pageName: string | null;
  hasInstagram: boolean;
  hasAdAccount: boolean;
  connectedAt: string | null;
  metaStatus?: string;
}) {
  const router = useRouter();
  const [disconnecting, setDisconnecting] = useState(false);
  const statusMsg = metaStatus ? STATUS_MESSAGE[metaStatus] : null;

  async function disconnect() {
    setDisconnecting(true);
    try {
      await fetch("/api/oauth/meta/disconnect", { method: "POST" });
      router.refresh();
    } finally {
      setDisconnecting(false);
    }
  }

  return (
    <Card
      className="p-7 transition-colors"
      style={
        connected
          ? { background: "rgba(24, 119, 242, 0.08)", border: `1px solid rgba(24, 119, 242, 0.35)` }
          : undefined
      }
    >
      <div className="flex items-center gap-2">
        <div className="flex items-center -space-x-1.5">
          <FacebookIcon size={18} />
          <InstagramIcon size={18} />
        </div>
        <SectionLabel>Instagram & Facebook</SectionLabel>
      </div>

      {statusMsg && (
        <div className={`mt-3 flex items-start gap-2 rounded-lg px-3.5 py-2.5 ${statusMsg.tone === "good" ? "bg-good-soft" : statusMsg.tone === "warn" ? "bg-warn-soft" : "bg-bad-soft"}`}>
          <AlertTriangle className={`mt-0.5 h-3.5 w-3.5 shrink-0 ${statusMsg.tone === "good" ? "text-good" : statusMsg.tone === "warn" ? "text-warn" : "text-bad"}`} />
          <p className={`text-[12.5px] ${statusMsg.tone === "good" ? "text-good" : statusMsg.tone === "warn" ? "text-warn" : "text-bad"}`}>
            {statusMsg.text}
          </p>
        </div>
      )}

      {connected ? (
        <div className="mt-4">
          <div className="flex flex-wrap items-center gap-2">
            <Pill tone="good">Connected: {pageName ?? "your Page"}</Pill>
            {hasInstagram && <Pill tone="good">Instagram linked</Pill>}
            {hasAdAccount && (
              <Pill tone="accent">
                <Megaphone className="mr-1 inline h-3 w-3" /> Ads access granted
              </Pill>
            )}
          </div>
          {connectedAt && (
            <p className="mt-2 text-[12px] text-text-faint">Connected {new Date(connectedAt).toLocaleDateString()}</p>
          )}
          <p className="mt-3 text-[13px] leading-relaxed text-text-dim">
            Orbit can post your Studio images and reels to this Page{hasInstagram ? " and Instagram" : ""}, and run Meta ads (built paused — you
            activate them in Ads). {!hasAdAccount && "No ad account access was granted yet — reconnect and approve ads access to run ads."}
          </p>
          <MetaHealth />
          <div className="mt-3 flex items-center gap-4">
            {appConfigured && (
              <a href="/api/oauth/meta/start" className="text-[12.5px] font-medium hover:underline" style={{ color: META_BLUE }}>
                Reconnect
              </a>
            )}
            <button onClick={disconnect} disabled={disconnecting} className="text-[12.5px] font-medium text-bad hover:underline">
              {disconnecting ? "Disconnecting…" : "Disconnect"}
            </button>
          </div>
        </div>
      ) : (
        <div className="mt-4">
          <p className="text-[13px] leading-relaxed text-text-dim">
            Connect your real Facebook Page (and its linked Instagram, if any) so Content and Ads
            agents can actually post and run real campaigns — not just recommend them.
          </p>
          {appConfigured ? (
            <a
              href="/api/oauth/meta/start"
              className="mt-3 inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-[13.5px] font-semibold text-white hover:opacity-90"
              style={{ background: META_BLUE }}
            >
              <FacebookIcon size={16} /> Connect Instagram & Facebook
            </a>
          ) : (
            <p className="mt-3 text-[12.5px] text-text-faint">
              Not available yet — the platform owner needs to add a real Meta App ID and Secret in
              Admin &gt; API Keys first (requires a real Meta Developer App).
            </p>
          )}
        </div>
      )}
    </Card>
  );
}
