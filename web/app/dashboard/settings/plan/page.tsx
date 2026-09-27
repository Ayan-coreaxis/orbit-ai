import { Card, SectionLabel, Pill, ProgressBar } from "@/components/ui";
import { pricingTiers } from "@/lib/mock-data";
import { getUsageStatus, PLAN_LABELS, PLAN_PRICE_USD } from "@/lib/usage-limit";
import { isPlatformStripeConfigured, planPriceId, subscriptionIsLive } from "@/lib/platform-stripe";
import { ManageBillingButton } from "@/components/dashboard/ManageBillingButton";
import { UpgradeButton } from "@/components/dashboard/UpgradeButton";
import { SettingsHeader } from "@/components/settings/SettingsHeader";
import { getSettingsBusiness } from "@/lib/settings-data";
import { cn } from "@/lib/utils";
import { Check, AlertTriangle } from "lucide-react";

const TIER_PLAN_ID: Record<string, string> = { Starter: "starter", Growth: "growth", Scale: "scale" };

const BILLING_NOTICE: Record<string, { tone: "good" | "warn" | "neutral"; text: string }> = {
  success: { tone: "good", text: "Payment received — your plan updates within a few seconds of Stripe confirming it." },
  changed: { tone: "good", text: "Plan changed. Stripe charged or credited the difference for the rest of this month." },
  pending: { tone: "warn", text: "Your plan change is waiting for payment — it switches as soon as Stripe confirms it. Check your card in Manage billing if it doesn't." },
  cancelled: { tone: "neutral", text: "Checkout was cancelled — your plan hasn't changed." },
};

const NOTICE_CLASS = {
  good: "border-good/30 bg-good-soft text-good",
  warn: "border-warn/30 bg-warn-soft text-warn",
  bad: "border-bad/30 bg-bad-soft text-bad",
  neutral: "border-border bg-panel-2 text-text-dim",
};

export default async function PlanSettingsPage({ searchParams }: { searchParams: Promise<{ billing?: string }> }) {
  const { billing } = await searchParams;
  const b = await getSettingsBusiness();
  const usage = b ? await getUsageStatus(b.businessId) : null;
  const stripeOn = isPlatformStripeConfigured();
  // A subscription that ended leaves the plan at Starter with AI paused — every plan can be picked again.
  const subEnded = !!b?.subscriptionStatus && !subscriptionIsLive(b.subscriptionStatus);
  const notices: { tone: keyof typeof NOTICE_CLASS; text: string }[] = [];
  if (billing && BILLING_NOTICE[billing]) notices.push(BILLING_NOTICE[billing]);
  if (subEnded) notices.push({ tone: "bad", text: `Your subscription has ended (${b?.subscriptionStatus}). Your store stays online, but the AI is paused — pick a plan below to turn it back on.` });
  if (b?.subscriptionStatus === "past_due") notices.push({ tone: "warn", text: "Your last payment didn't go through. Stripe will retry — update your card with Manage billing so nothing pauses." });

  return (
    <div className="space-y-6">
      <SettingsHeader
        title="Plan & billing"
        description={
          stripeOn ? "Billed monthly through Stripe. Changing plan charges or credits the difference right away." : "Online billing isn't switched on yet — your plan is set by the Orbit team."
        }
      >
        {stripeOn && b?.stripeCustomerId && <ManageBillingButton />}
      </SettingsHeader>

      {notices.map((n) => (
        <div key={n.text} className={cn("rounded-xl border px-4 py-3 text-[13px]", NOTICE_CLASS[n.tone])}>
          {n.text}
        </div>
      ))}

      <Card className="p-6 sm:p-7">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <SectionLabel>AI allowance</SectionLabel>
          {usage && (
            <div className="flex flex-wrap items-center gap-2">
              <Pill tone="accent">
                {PLAN_LABELS[usage.plan] ?? usage.plan} — ${PLAN_PRICE_USD[usage.plan] ?? "?"}/mo
              </Pill>
              {usage.blockedWindow && (
                <Pill tone="bad">{usage.blockedWindow === "session" ? "5-hour" : usage.blockedWindow === "weekly" ? "Weekly" : "Monthly"} limit reached</Pill>
              )}
            </div>
          )}
        </div>
        <p className="mt-2 max-w-2xl text-[13px] leading-relaxed text-text-dim">
          It refills on its own: a short window every few hours, a weekly window, and a monthly total. If you reach it, the AI pauses until it refills — your store keeps
          selling.
        </p>
        {usage ? (
          <>
            <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-3">
              {usage.session && <UsageWindowCard label="Next few hours" status={usage.session} resetLabel="Refills every few hours" />}
              {usage.weekly && <UsageWindowCard label="This week" status={usage.weekly} resetLabel="Refills day by day" />}
              {usage.capUsd !== null ? (
                <UsageWindowCard label="This month" status={{ usedUsd: usage.usedUsd, capUsd: usage.capUsd, atCap: usage.blockedWindow === "monthly" }} resetLabel="Refills on the 1st" />
              ) : (
                <div className="rounded-xl border border-border p-4">
                  <div className="text-[12.5px] font-medium text-text-dim">This month</div>
                  <div className="mt-1.5 text-lg font-semibold">No limit</div>
                </div>
              )}
            </div>
            {usage.blockedWindow && (
              <div className="mt-4 flex items-start gap-2 rounded-lg bg-bad-soft px-3.5 py-2.5">
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-bad" />
                <p className="text-[12.5px] text-bad">
                  {usage.blockedWindow === "session" && "Your AI is taking a short break — it refills within a few hours, no action needed."}
                  {usage.blockedWindow === "weekly" && "Your AI has used this week's allowance — it refills day by day. A bigger plan gives it more room."}
                  {usage.blockedWindow === "monthly" && "Your AI has used this month's allowance and is paused until the 1st. Move to a bigger plan below to keep going now."}
                </p>
              </div>
            )}
          </>
        ) : (
          <p className="mt-4 text-[13px] text-text-faint">No AI usage yet — this fills in once you chat with the Orchestrator.</p>
        )}
      </Card>

      <div>
        <SectionLabel>Plans</SectionLabel>
        <div className="mt-3 grid grid-cols-1 gap-4 md:grid-cols-3">
          {pricingTiers.map((tier) => {
            const current = !subEnded && usage?.plan === TIER_PLAN_ID[tier.name];
            return (
              <Card key={tier.name} className={cn("flex flex-col p-6", current ? "border-2 border-accent" : tier.featured && "border-accent/40")}>
                <div className="flex items-center justify-between">
                  <div className="text-[13px] font-medium text-text-dim">{tier.name}</div>
                  {current && <Pill tone="accent">Your plan</Pill>}
                </div>
                <div className="mt-1 text-2xl font-semibold">
                  ${tier.price}
                  <span className="text-[14px] font-normal text-text-dim">/mo</span>
                </div>
                <p className="mt-2 text-[12.5px] text-text-faint">{tier.desc}</p>
                <ul className="mt-4 flex-1 space-y-2">
                  {tier.features.map((f) => (
                    <li key={f} className="flex items-start gap-2 text-[13px] text-text-dim">
                      <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-accent" /> {f}
                    </li>
                  ))}
                </ul>
                {b && usage && (
                  <UpgradeButton plan={TIER_PLAN_ID[tier.name]} currentPlan={subEnded ? "" : usage.plan} billingConfigured={stripeOn && !!planPriceId(TIER_PLAN_ID[tier.name])} />
                )}
              </Card>
            );
          })}
        </div>
        {!stripeOn && <p className="mt-3 text-[12.5px] text-text-faint">To change your plan, contact the Orbit team.</p>}
      </div>
    </div>
  );
}

function UsageWindowCard({ label, status, resetLabel }: { label: string; status: { usedUsd: number; capUsd: number; atCap: boolean }; resetLabel: string }) {
  const pct = status.capUsd > 0 ? Math.min(100, Math.round((status.usedUsd / status.capUsd) * 100)) : 0;
  return (
    <div className={cn("rounded-xl border p-4", status.atCap ? "border-bad/40 bg-bad-soft" : "border-border")}>
      <div className="text-[12.5px] font-medium text-text-dim">{label}</div>
      <div className="mt-1.5 text-lg font-semibold">
        {pct}%<span className="text-[13px] font-normal text-text-faint"> used</span>
      </div>
      <div className="mt-2.5">
        <ProgressBar value={pct} />
      </div>
      <div className="mt-1.5 text-[11px] text-text-faint">{status.atCap ? "Paused until it refills" : resetLabel}</div>
    </div>
  );
}
