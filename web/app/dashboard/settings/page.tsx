import { Topbar } from "@/components/Topbar";
import { Card, SectionLabel, Pill, ProgressBar } from "@/components/ui";
import { pricingTiers } from "@/lib/mock-data";
import { getBusinessSummary } from "@/lib/get-business";
import { getUsageStatus, PLAN_LABELS, PLAN_PRICE_USD } from "@/lib/usage-limit";
import { getActiveBusinessId } from "@/lib/get-active-business-id";
import { prisma } from "@/lib/prisma";
import { isMetaAppConfigured } from "@/lib/meta-oauth";
import { isPlatformStripeConfigured, planPriceId, subscriptionIsLive } from "@/lib/platform-stripe";
import { ManageBillingButton } from "@/components/dashboard/ManageBillingButton";
import { MetaConnectCard } from "@/components/store/MetaConnectCard";
import { DomainCard } from "@/components/settings/DomainCard";
import { PaymentSettingsCard } from "@/components/store/PaymentSettingsCard";
import { StoreOpsSettingsCard } from "@/components/store/StoreOpsSettingsCard";
import { CourierCard } from "@/components/store/CourierCard";
import { SettingsNav } from "@/components/dashboard/SettingsNav";
import { WidgetCustomizationCard } from "@/components/store/WidgetCustomizationCard";
import { parseWidgetCopy } from "@/lib/widget-copy";
import { parseCheckoutCustomFields } from "@/lib/checkout-fields";
import { ShippingZonesManager } from "@/components/store/ShippingZonesManager";
import { TeamManager } from "@/components/store/TeamManager";
import { WhatsAppIcon } from "@/components/icons/BrandIcons";
import { UpgradeButton } from "@/components/dashboard/UpgradeButton";
import { cn } from "@/lib/utils";
import { Check, AlertTriangle } from "lucide-react";

const TIER_PLAN_ID: Record<string, string> = { Starter: "starter", Growth: "growth", Scale: "scale" };

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ meta?: string; billing?: string }>;
}) {
  const { meta: metaStatus, billing: billingStatus } = await searchParams;
  const real = await getBusinessSummary();
  const usage = real ? await getUsageStatus(real.businessId) : null;
  const businessId = await getActiveBusinessId();
  const business = businessId
    ? await prisma.business.findUnique({
        where: { id: businessId },
        select: {
          whatsapp: true,
          whatsappInboundNumber: true,
          metaPageId: true,
          metaPageName: true,
          metaInstagramUserId: true,
          metaAdAccountId: true,
          metaConnectedAt: true,
          paymentProvider: true,
          stripeSecretKey: true,
          stripePublishableKey: true,
          storeCurrency: true,
          shippingFee: true,
          freeShippingOver: true,
          taxRatePercent: true,
          taxLabel: true,
          taxInclusive: true,
          codVerification: true,
          notifyNewOrders: true,
          courierProvider: true,
          courierApiKey: true,
          ga4MeasurementId: true,
          metaPixelId: true,
          metaCapiToken: true,
          metaCapiNote: true,
          relatedProductsEnabled: true,
          recentlyViewedEnabled: true,
          widgetMotion: true,
          widgetCopy: true,
          accountTabs: true,
          checkoutCustomFields: true,
          subscriptionStatus: true,
          stripeCustomerId: true,
        },
      })
    : null;

  // A subscription that ended leaves the plan at Starter with AI paused — every plan can be picked again.
  const subEnded = !!business?.subscriptionStatus && !subscriptionIsLive(business.subscriptionStatus);

  return (
    <div>
      <Topbar title="Settings & Billing" subtitle={real?.businessName ?? "No business yet"} />
      <div className="max-w-[1200px] space-y-8 p-5 sm:p-8 lg:p-10">
        <SettingsNav />
        {billingStatus === "success" && (
          <div className="rounded-xl border border-good/30 bg-good-soft px-4 py-3 text-[13px] text-good">
            Payment received — your plan updates automatically within a few seconds of Stripe confirming it.
          </div>
        )}
        {billingStatus === "changed" && (
          <div className="rounded-xl border border-good/30 bg-good-soft px-4 py-3 text-[13px] text-good">
            Plan changed. Stripe charged or credited the difference for the rest of this month.
          </div>
        )}
        {billingStatus === "pending" && (
          <div className="rounded-xl border border-warn/30 bg-warn-soft px-4 py-3 text-[13px] text-warn">
            Your plan change is waiting for payment — it switches as soon as Stripe confirms it. Check your card in Manage billing if it doesn&apos;t.
          </div>
        )}
        {subEnded && (
          <div className="rounded-xl border border-bad/30 bg-bad-soft px-4 py-3 text-[13px] text-bad">
            Your subscription has ended ({business?.subscriptionStatus}). Your store stays online, but the AI agents are paused — pick a plan below to turn them back on.
          </div>
        )}
        {business?.subscriptionStatus === "past_due" && (
          <div className="rounded-xl border border-warn/30 bg-warn-soft px-4 py-3 text-[13px] text-warn">
            Your last payment didn&apos;t go through. Stripe will retry — update your card with Manage billing below so nothing pauses.
          </div>
        )}
        {billingStatus === "cancelled" && (
          <div className="rounded-xl border border-border bg-panel-2 px-4 py-3 text-[13px] text-text-dim">
            Checkout was cancelled — your plan hasn&apos;t changed.
          </div>
        )}
        <section id="plan" className="scroll-mt-24 space-y-8">
        <Card className="p-7">
          <SectionLabel>Your plan</SectionLabel>
          <p className="mt-2 max-w-2xl text-[13.5px] leading-relaxed text-text-dim">
            {isPlatformStripeConfigured()
              ? "Billed monthly through Stripe. Changing plan below charges or credits the difference right away."
              : "Online billing isn't switched on yet — your plan is set by the Orbit team."}{" "}
            Your AI allowance refills on its own: a short window every few hours, a weekly window, and a monthly total. If you reach it, the AI pauses
            until it refills — your store keeps selling.
          </p>
          {usage ? (
            <div className="mt-5">
              <div className="flex flex-wrap items-center gap-3">
                <Pill tone="accent">{PLAN_LABELS[usage.plan] ?? usage.plan} — ${PLAN_PRICE_USD[usage.plan] ?? "?"}/mo</Pill>
                {usage.blockedWindow && (
                  <Pill tone="bad">
                    {usage.blockedWindow === "session" ? "5-hour" : usage.blockedWindow === "weekly" ? "Weekly" : "Monthly"} limit reached
                  </Pill>
                )}
              </div>

              <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-3">
                {usage.session && (
                  <UsageWindowCard label="Next few hours" status={usage.session} resetLabel="Refills every few hours" />
                )}
                {usage.weekly && (
                  <UsageWindowCard label="This week" status={usage.weekly} resetLabel="Refills day by day" />
                )}
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
                    {usage.blockedWindow === "session" &&
                      "Your AI is taking a short break — it refills within a few hours, no action needed."}
                    {usage.blockedWindow === "weekly" &&
                      "Your AI has used this week's allowance — it refills day by day. A bigger plan gives it more room."}
                    {usage.blockedWindow === "monthly" &&
                      "Your AI has used this month's allowance and is paused until the 1st. Move to a bigger plan below to keep going now."}
                  </p>
                </div>
              )}
            </div>
          ) : (
            <p className="mt-4 text-[13px] text-text-faint">
              No AI usage yet — this fills in once you chat with the Orchestrator or run a cycle.
            </p>
          )}
        </Card>

        <div>
          <SectionLabel>Available plans</SectionLabel>
          <div className="mt-4 grid grid-cols-1 gap-5 md:grid-cols-3">
            {pricingTiers.map((tier) => (
              <Card
                key={tier.name}
                className={cn("p-6", tier.featured && "border-2 border-accent")}
              >
                <div className="text-[13px] font-medium text-text-dim">{tier.name}</div>
                <div className="mt-1 text-2xl font-semibold">
                  ${tier.price}
                  <span className="text-[14px] font-normal text-text-dim">/mo</span>
                </div>
                <p className="mt-2 text-[12.5px] text-text-faint">{tier.desc}</p>
                <ul className="mt-4 space-y-2">
                  {tier.features.map((f) => (
                    <li key={f} className="flex items-start gap-2 text-[13.5px] text-text-dim">
                      <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-accent" /> {f}
                    </li>
                  ))}
                </ul>
                {businessId && usage && (
                  <UpgradeButton
                    plan={TIER_PLAN_ID[tier.name]}
                    currentPlan={subEnded ? "" : usage.plan}
                    billingConfigured={isPlatformStripeConfigured() && !!planPriceId(TIER_PLAN_ID[tier.name])}
                  />
                )}
              </Card>
            ))}
          </div>
          <p className="mt-4 text-[12.5px] text-text-faint">
            {isPlatformStripeConfigured()
              ? "Switching plans charges or credits your card right away."
              : "Online plan changes aren't switched on yet — contact the Orbit team to change your plan."}
          </p>
          {isPlatformStripeConfigured() && business?.stripeCustomerId && <ManageBillingButton />}
        </div>
        </section>

        <section id="social" className="scroll-mt-24">
        {businessId && (
          <MetaConnectCard
            appConfigured={isMetaAppConfigured()}
            connected={!!business?.metaPageId}
            pageName={business?.metaPageName ?? null}
            hasInstagram={!!business?.metaInstagramUserId}
            hasAdAccount={!!business?.metaAdAccountId}
            connectedAt={business?.metaConnectedAt ? business.metaConnectedAt.toISOString() : null}
            metaStatus={metaStatus}
          />
        )}
        </section>

        <section id="domain" className="scroll-mt-24">{businessId && <DomainCard />}</section>

        <section id="payments" className="scroll-mt-24">
        {businessId && (
          <PaymentSettingsCard
            initialProvider={business?.paymentProvider ?? "cod"}
            initialStripeConfigured={!!business?.stripeSecretKey && !!business?.stripePublishableKey}
            initialCurrency={business?.storeCurrency ?? "usd"}
          />
        )}
        </section>

        <section id="store" className="scroll-mt-24">
        {businessId && (
          <StoreOpsSettingsCard
            initial={{
              shippingFee: business?.shippingFee ?? 0,
              freeShippingOver: business?.freeShippingOver ?? null,
              taxRatePercent: business?.taxRatePercent ?? null,
              taxLabel: business?.taxLabel ?? "Tax",
              taxInclusive: business?.taxInclusive ?? false,
              codVerification: business?.codVerification ?? false,
              notifyNewOrders: business?.notifyNewOrders ?? true,
              ga4MeasurementId: business?.ga4MeasurementId ?? null,
              metaPixelId: business?.metaPixelId ?? null,
              metaCapiTokenSet: !!business?.metaCapiToken,
              metaCapiNote: business?.metaCapiNote ?? null,
              relatedProductsEnabled: business?.relatedProductsEnabled ?? true,
              recentlyViewedEnabled: business?.recentlyViewedEnabled ?? true,
              currency: business?.storeCurrency ?? "usd",
            }}
          />
        )}
        </section>

        <section id="look" className="scroll-mt-24">
        {businessId && (
          <WidgetCustomizationCard
            initial={{
              widgetMotion: business?.widgetMotion ?? "standard",
              widgetCopy: parseWidgetCopy(business?.widgetCopy),
              accountTabs: (() => {
                try {
                  return business?.accountTabs ? (JSON.parse(business.accountTabs) as string[]) : undefined;
                } catch {
                  return undefined;
                }
              })(),
              checkoutCustomFields: parseCheckoutCustomFields(business?.checkoutCustomFields),
            }}
          />
        )}
        </section>

        <section id="courier" className="scroll-mt-24">{businessId && <CourierCard />}</section>
        <section id="delivery" className="scroll-mt-24">{businessId && <ShippingZonesManager businessId={businessId} currency={business?.storeCurrency ?? "usd"} />}</section>

        <section id="team" className="scroll-mt-24">{businessId && <TeamManager />}</section>

        <section id="whatsapp" className="scroll-mt-24">
        <Card
          className="p-7 transition-colors"
          style={
            business?.whatsappInboundNumber
              ? { background: "rgba(37, 211, 102, 0.08)", border: "1px solid rgba(37, 211, 102, 0.35)" }
              : undefined
          }
        >
          <div className="flex items-center gap-2">
            <WhatsAppIcon size={18} />
            <SectionLabel>WhatsApp</SectionLabel>
          </div>
          <p className="mt-2 text-[13px] leading-relaxed text-text-dim">
            {business?.whatsappInboundNumber ? (
              <>
                Real two-way number: <b>{business.whatsappInboundNumber}</b> — real customer messages
                to this number reach your real Chatbot automatically.
              </>
            ) : (
              <>
                No real two-way WhatsApp number assigned yet. Unlike Instagram/Facebook, WhatsApp
                Business numbers aren&apos;t self-serve via login — the platform owner assigns your
                business a real number from the Super Admin panel.
              </>
            )}
            {business?.whatsapp && (
              <span className="mt-1.5 block text-text-faint">
                Your contact number on file (for real weekly-plan notifications): {business.whatsapp}
              </span>
            )}
          </p>
        </Card>
        </section>
      </div>
    </div>
  );
}

function UsageWindowCard({
  label,
  status,
  resetLabel,
}: {
  label: string;
  status: { usedUsd: number; capUsd: number; atCap: boolean };
  resetLabel: string;
}) {
  const pct = status.capUsd > 0 ? Math.min(100, Math.round((status.usedUsd / status.capUsd) * 100)) : 0;
  return (
    <div className={cn("rounded-xl border p-4", status.atCap ? "border-bad/40 bg-bad-soft" : "border-border")}>
      <div className="text-[12.5px] font-medium text-text-dim">{label}</div>
      <div className="mt-1.5 text-lg font-semibold">
        {pct}%<span className="text-[13px] font-normal text-text-faint"> of your AI allowance used</span>
      </div>
      <div className="mt-2.5">
        <ProgressBar value={pct} />
      </div>
      <div className="mt-1.5 text-[11px] text-text-faint">{status.atCap ? "Paused until it refills" : resetLabel}</div>
    </div>
  );
}
