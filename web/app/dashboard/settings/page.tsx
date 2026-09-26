import { Topbar } from "@/components/Topbar";
import { Card, SectionLabel, Pill, ProgressBar } from "@/components/ui";
import { pricingTiers } from "@/lib/mock-data";
import { getRealPlan } from "@/lib/get-business";
import { getUsageStatus, PLAN_LABELS, PLAN_PRICE_USD } from "@/lib/usage-limit";
import { getActiveBusinessId } from "@/lib/get-active-business-id";
import { prisma } from "@/lib/prisma";
import { isMetaAppConfigured } from "@/lib/meta-oauth";
import { isPlatformStripeConfigured, PLAN_PRICE_IDS } from "@/lib/platform-stripe";
import { MetaConnectCard } from "@/components/store/MetaConnectCard";
import { DomainCard } from "@/components/settings/DomainCard";
import { PaymentSettingsCard } from "@/components/store/PaymentSettingsCard";
import { StoreOpsSettingsCard } from "@/components/store/StoreOpsSettingsCard";
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
  const real = await getRealPlan();
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
          relatedProductsEnabled: true,
          recentlyViewedEnabled: true,
          widgetMotion: true,
          widgetCopy: true,
          accountTabs: true,
          checkoutCustomFields: true,
          subscriptionStatus: true,
        },
      })
    : null;

  return (
    <div>
      <Topbar title="Settings & Billing" subtitle={real?.businessName ?? "No real business yet"} />
      <div className="max-w-[1200px] space-y-8 p-10">
        {billingStatus === "success" && (
          <div className="rounded-xl border border-good/30 bg-good-soft px-4 py-3 text-[13px] text-good">
            Payment received — your plan updates automatically within a few seconds of Stripe confirming it.
          </div>
        )}
        {billingStatus === "cancelled" && (
          <div className="rounded-xl border border-border bg-panel-2 px-4 py-3 text-[13px] text-text-dim">
            Checkout was cancelled — your plan hasn&apos;t changed.
          </div>
        )}
        <Card className="p-7">
          <SectionLabel>Your plan & real usage</SectionLabel>
          <p className="mt-2 max-w-2xl text-[13.5px] leading-relaxed text-text-dim">
            {isPlatformStripeConfigured() ? (
              <>
                Billed via real Stripe — plan changes below charge or credit your card immediately.
                {business?.subscriptionStatus && business.subscriptionStatus !== "active" && (
                  <> Current subscription status: <b>{business.subscriptionStatus}</b>.</>
                )}
              </>
            ) : (
              "Stripe billing isn't connected yet, so there's no real charge or renewal date — your plan is set manually by the platform owner today."
            )}{" "}
            Usage is rate-limited the same way
            Claude.ai itself works: a fast-resetting short window plus a weekly window, so you&apos;re
            never blocked for weeks — worst case is a few hours. The monthly total is the outer bound,
            and it&apos;s structurally kept below your plan&apos;s price — this business can never cost
            more in real AI usage than it pays.
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
                  <UsageWindowCard label="Last 5 hours" status={usage.session} resetLabel="resets in a few hours" />
                )}
                {usage.weekly && (
                  <UsageWindowCard label="Last 7 days" status={usage.weekly} resetLabel="rolling weekly reset" />
                )}
                <div className="rounded-xl border border-border p-4">
                  <div className="text-[12.5px] font-medium text-text-dim">This calendar month</div>
                  <div className="mt-1.5 text-lg font-semibold">
                    ${usage.usedUsd.toFixed(4)}
                    <span className="text-[13px] font-normal text-text-faint">
                      {" "}/ {usage.capUsd === null ? "no cap" : `$${usage.capUsd.toFixed(0)}`}
                    </span>
                  </div>
                  {usage.capUsd !== null && (
                    <div className="mt-2.5">
                      <ProgressBar value={(usage.usedUsd / usage.capUsd) * 100} />
                    </div>
                  )}
                  <div className="mt-1.5 text-[11px] text-text-faint">outer bound — resets next calendar month</div>
                </div>
              </div>

              {usage.blockedWindow && (
                <div className="mt-4 flex items-start gap-2 rounded-lg bg-bad-soft px-3.5 py-2.5">
                  <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-bad" />
                  <p className="text-[12.5px] text-bad">
                    {usage.blockedWindow === "session" &&
                      "New AI cycles are paused for a few hours — your 5-hour window will reset on its own."}
                    {usage.blockedWindow === "weekly" &&
                      "New AI cycles are paused for now — your weekly window resets on a rolling basis, so you'll have room again within the week."}
                    {usage.blockedWindow === "monthly" &&
                      "New AI cycles are paused for the rest of this month. This is already visible to the platform owner — they can raise your cap without you waiting."}
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
                    currentPlan={usage.plan}
                    billingConfigured={isPlatformStripeConfigured() && !!PLAN_PRICE_IDS[TIER_PLAN_ID[tier.name]]}
                  />
                )}
              </Card>
            ))}
          </div>
          <p className="mt-4 text-[12.5px] text-text-faint">
            {isPlatformStripeConfigured()
              ? "Switching plans above charges or credits your card immediately via Stripe. You can also contact the platform owner for a manual change."
              : "Plan switching isn't self-serve yet — the platform owner hasn't connected real Stripe billing. Contact them to change your plan or usage cap."}
          </p>
        </div>

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

        {businessId && <DomainCard />}

        {businessId && (
          <PaymentSettingsCard
            initialProvider={business?.paymentProvider ?? "cod"}
            initialStripeConfigured={!!business?.stripeSecretKey && !!business?.stripePublishableKey}
            initialCurrency={business?.storeCurrency ?? "usd"}
          />
        )}

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
              courierProvider: business?.courierProvider ?? "manual",
              courierApiKeySet: !!business?.courierApiKey,
              ga4MeasurementId: business?.ga4MeasurementId ?? null,
              metaPixelId: business?.metaPixelId ?? null,
              relatedProductsEnabled: business?.relatedProductsEnabled ?? true,
              recentlyViewedEnabled: business?.recentlyViewedEnabled ?? true,
              currency: business?.storeCurrency ?? "usd",
            }}
          />
        )}

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

        {businessId && <ShippingZonesManager businessId={businessId} currency={business?.storeCurrency ?? "usd"} />}

        {businessId && <TeamManager />}

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
  return (
    <div className={cn("rounded-xl border p-4", status.atCap ? "border-bad/40 bg-bad-soft" : "border-border")}>
      <div className="text-[12.5px] font-medium text-text-dim">{label}</div>
      <div className="mt-1.5 text-lg font-semibold">
        ${status.usedUsd.toFixed(4)}
        <span className="text-[13px] font-normal text-text-faint"> / ${status.capUsd.toFixed(2)}</span>
      </div>
      <div className="mt-2.5">
        <ProgressBar value={(status.usedUsd / status.capUsd) * 100} />
      </div>
      <div className="mt-1.5 text-[11px] text-text-faint">{resetLabel}</div>
    </div>
  );
}
