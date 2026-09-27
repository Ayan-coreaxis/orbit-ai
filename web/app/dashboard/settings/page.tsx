import Link from "next/link";
import { redirect } from "next/navigation";
import { Card } from "@/components/ui";
import { SETTINGS_GROUPS } from "@/lib/settings-nav";
import { getSettingsBusiness, type SettingsBusiness } from "@/lib/settings-data";
import { getUsageStatus, PLAN_LABELS } from "@/lib/usage-limit";
import { LegacySettingsHash } from "@/components/settings/LegacySettingsHash";
import { ChevronRight } from "lucide-react";

type Status = { text: string; tone: "good" | "warn" | "neutral" };

const COURIER: Record<string, string> = { postex: "PostEx", leopards: "Leopards", tcs: "TCS" };
const PAYMENT: Record<string, string> = { cod: "Cash on delivery", stripe: "Card (Stripe)", both: "Cash on delivery + card" };

/** One line per section saying where it stands, so the seller sees what's set up without opening each page. */
async function statuses(b: SettingsBusiness): Promise<Record<string, Status>> {
  const usage = await getUsageStatus(b.businessId);
  const cur = (b.storeCurrency ?? "usd").toUpperCase();
  const tracking = [b.ga4MeasurementId && "Google Analytics", b.metaPixelId && "Meta Pixel"].filter(Boolean);
  const connections = b._count.mcpConnections + b._count.skills + b._count.pluginInstalls;
  return {
    "/dashboard/settings/plan": {
      text: `${PLAN_LABELS[b.plan] ?? b.plan} plan${usage.blockedWindow ? " · AI paused until it refills" : ""}`,
      tone: usage.blockedWindow || b.subscriptionStatus === "past_due" ? "warn" : "good",
    },
    "/dashboard/settings/team": { text: b._count.members ? `${b._count.members + 1} people` : "Just you", tone: "neutral" },
    "/dashboard/settings/payments": {
      text: `${PAYMENT[b.paymentProvider ?? "cod"] ?? b.paymentProvider} · ${cur}`,
      tone: b.paymentProvider !== "cod" && !(b.stripeSecretKey && b.stripePublishableKey) ? "warn" : "good",
    },
    "/dashboard/settings/delivery": {
      text: [
        b.shippingFee ? `${cur} ${b.shippingFee} delivery` : "Free delivery",
        b._count.shippingZones ? `${b._count.shippingZones} city zone${b._count.shippingZones === 1 ? "" : "s"}` : null,
        COURIER[b.courierProvider ?? ""] ?? "no courier connected",
      ]
        .filter(Boolean)
        .join(" · "),
      tone: COURIER[b.courierProvider ?? ""] ? "good" : "neutral",
    },
    "/dashboard/settings/checkout": {
      text: [b.codVerification ? "COD confirmation on" : "COD confirmation off", b.taxRatePercent ? `${b.taxLabel} ${b.taxRatePercent}%` : "no tax"].join(" · "),
      tone: "neutral",
    },
    "/dashboard/settings/storefront": { text: b.chatWidgetEnabled ? "Chat bubble on" : "Chat bubble off", tone: "neutral" },
    "/dashboard/settings/domain": {
      text: b.customDomain ? `${b.customDomain} · ${b.customDomainStatus === "verified" ? "live" : b.customDomainStatus ?? "pending"}` : "Using the Orbit address",
      tone: b.customDomainStatus === "verified" ? "good" : b.customDomain ? "warn" : "neutral",
    },
    "/dashboard/settings/channels": {
      text: [b.metaPageId ? `Facebook${b.metaInstagramUserId ? " + Instagram" : ""} connected` : "Facebook not connected", b.whatsappInboundNumber ? "WhatsApp on" : null].filter(Boolean).join(" · "),
      tone: b.metaPageId ? "good" : "neutral",
    },
    "/dashboard/settings/tracking": { text: tracking.length ? `${tracking.join(" + ")} on` : "Nothing tracking sales yet", tone: tracking.length ? "good" : "neutral" },
    "/dashboard/settings/connections": { text: connections ? `${connections} added` : "None yet", tone: "neutral" },
  };
}

const DOT = { good: "bg-good", warn: "bg-warn", neutral: "bg-text-faint/50" };

export default async function SettingsOverviewPage({ searchParams }: { searchParams: Promise<{ meta?: string; billing?: string }> }) {
  // Old return addresses (Meta login, Stripe) still point here — send them to the page they belong to.
  const { meta, billing } = await searchParams;
  if (meta) redirect(`/dashboard/settings/channels?meta=${encodeURIComponent(meta)}`);
  if (billing) redirect(`/dashboard/settings/plan?billing=${encodeURIComponent(billing)}`);

  const b = await getSettingsBusiness();
  const status = b ? await statuses(b) : {};

  return (
    <div className="space-y-7">
      <LegacySettingsHash />
      {SETTINGS_GROUPS.map((g) => {
        const items = g.items.filter((i) => i.href !== "/dashboard/settings");
        if (!items.length) return null;
        return (
          <section key={g.title}>
            <h2 className="mb-2.5 text-[12px] font-semibold uppercase tracking-[0.08em] text-text-faint">{g.title}</h2>
            <div className="grid gap-3 sm:grid-cols-2">
              {items.map((item) => {
                const Icon = item.icon;
                const s = status[item.href];
                return (
                  <Link key={item.href} href={item.href} className="group">
                    <Card className="flex h-full items-start gap-3.5 p-4 transition-colors group-hover:border-border-strong">
                      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-panel-2">
                        <Icon className="h-[18px] w-[18px] text-text-dim" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-[14px] font-medium">{item.label}</span>
                          <ChevronRight className="h-4 w-4 shrink-0 text-text-faint transition-transform group-hover:translate-x-0.5" />
                        </div>
                        <p className="mt-0.5 text-[12.5px] text-text-faint">{item.desc}</p>
                        {s && (
                          <p className="mt-2 flex items-center gap-1.5 text-[12.5px] text-text-dim">
                            <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${DOT[s.tone]}`} />
                            <span className="truncate">{s.text}</span>
                          </p>
                        )}
                      </div>
                    </Card>
                  </Link>
                );
              })}
            </div>
          </section>
        );
      })}
    </div>
  );
}
