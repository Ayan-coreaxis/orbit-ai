import Link from "next/link";
import { Topbar } from "@/components/Topbar";
import { Card } from "@/components/ui";
import { getActiveBusinessId } from "@/lib/get-active-business-id";
import { prisma } from "@/lib/prisma";
import { parseCheckoutCustomFields } from "@/lib/checkout-fields";
import { ProductManager } from "@/components/store/ProductManager";
import { StoreControl } from "@/components/store/StoreControl";
import { CustomerContentCard } from "@/components/store/CustomerContentCard";
import { StoreAnalyticsCard } from "@/components/store/StoreAnalyticsCard";
import { StoreTabs } from "@/components/store/StoreTabs";
import { OrdersManager } from "@/components/store/OrdersManager";
import { CustomersManager } from "@/components/store/CustomersManager";
import { CouponsManager } from "@/components/store/CouponsManager";
import { LoyaltyManager } from "@/components/store/LoyaltyManager";
import { ReferralManager } from "@/components/store/ReferralManager";
import { GiftCardsManager } from "@/components/store/GiftCardsManager";
import { BundlesManager } from "@/components/store/BundlesManager";
import { getStoreKpis, type StoreKpis } from "@/lib/store-analytics";
import { money } from "@/lib/money";
import { Sparkline } from "@/components/store/mini-chart";
import { TrendingUp, TrendingDown, ExternalLink, Sparkles } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function StoreAdminPage() {
  const businessId = await getActiveBusinessId();
  const [products, design, messages, subscriberCount, records, business, kpis] = businessId
    ? await Promise.all([
        prisma.product.findMany({
          where: { businessId },
          orderBy: { createdAt: "desc" },
          include: { variants: { orderBy: { createdAt: "asc" } } },
        }),
        prisma.storeDesign.findUnique({ where: { businessId }, select: { published: true, wiredAt: true, backend: true } }),
        prisma.contactMessage.findMany({ where: { businessId }, orderBy: { createdAt: "desc" }, take: 5 }),
        prisma.newsletterSubscriber.count({ where: { businessId } }),
        prisma.storeRecord.findMany({ where: { businessId }, orderBy: { createdAt: "desc" }, take: 100 }),
        prisma.business.findUnique({ where: { id: businessId }, select: { storeCurrency: true, courierProvider: true, checkoutCustomFields: true } }),
        getStoreKpis(businessId),
      ])
    : [[], null, [], 0, [], null, null];

  const currency = business?.storeCurrency ?? "usd";
  const pendingOrders = kpis?.pendingOrders ?? 0;

  return (
    <div>
      <Topbar title="Store" subtitle="Catalog, orders, and storefront performance — all in one place" />
      <div className="mx-auto max-w-[1120px] space-y-5 p-6 lg:p-10">
        {!businessId ? (
          <Card className="p-6">
            <p className="text-[13.5px] text-text-faint">No business yet — complete onboarding first.</p>
          </Card>
        ) : (
          <>
            {/* storefront status */}
            <Card className="flex flex-wrap items-center gap-x-4 gap-y-3 px-5 py-4">
              <span className="relative flex h-2.5 w-2.5" aria-hidden>
                <span
                  className={`absolute inline-flex h-full w-full rounded-full opacity-75 ${
                    design?.published ? "animate-ping bg-good" : ""
                  }`}
                />
                <span className={`relative inline-flex h-2.5 w-2.5 rounded-full ${design?.published ? "bg-good" : "bg-text-faint"}`} />
              </span>
              <div className="min-w-0">
                <div className="text-[14px] font-semibold leading-tight">Storefront</div>
                <div className="mt-0.5 text-[12.5px] text-text-dim">
                  {design?.published ? "Live and accepting orders" : "Draft — not published yet"}
                </div>
              </div>
              <div className="ml-auto flex flex-wrap items-center gap-2">
                <Link
                  href="/dashboard/orbit-design"
                  className="inline-flex items-center gap-1.5 rounded-lg border border-border-strong px-3 py-1.5 text-[13px] font-medium text-text-dim transition-colors hover:border-accent-strong/40 hover:text-text"
                >
                  <Sparkles className="h-3.5 w-3.5" strokeWidth={2} />
                  Orbit Design
                </Link>
                {design?.published && (
                  <Link
                    href={`/store/${businessId}`}
                    target="_blank"
                    className="inline-flex items-center gap-1.5 rounded-lg bg-accent-soft px-3 py-1.5 text-[13px] font-semibold text-accent-strong transition-opacity hover:opacity-90"
                  >
                    View live store
                    <ExternalLink className="h-3.5 w-3.5" strokeWidth={2.2} />
                  </Link>
                )}
              </div>
            </Card>

            {/* KPI strip */}
            {kpis && <KpiStrip k={kpis} currency={currency} />}

            <StoreTabs
              ordersBadge={pendingOrders || undefined}
              products={
                <ProductManager
                  currency={currency}
                  initialProducts={products.map((p) => ({
                    id: p.id,
                    name: p.name,
                    price: p.price,
                    stock: p.stock,
                    imageUrl: p.imageUrl,
                    description: p.description,
                    optionTypes: p.optionTypes,
                    variants: p.variants.map((v) => ({
                      id: v.id,
                      label: v.label,
                      options: v.options,
                      sku: v.sku,
                      price: v.price,
                      stock: v.stock,
                    })),
                  }))}
                />
              }
              storefront={<StoreControl businessId={businessId} />}
              orders={
                <OrdersManager
                  businessId={businessId}
                  currency={currency}
                  courierProvider={business?.courierProvider ?? null}
                  checkoutCustomFields={parseCheckoutCustomFields(business?.checkoutCustomFields)}
                />
              }
              customers={<CustomersManager businessId={businessId} currency={currency} />}
              discounts={
                <div className="space-y-5">
                  <CouponsManager businessId={businessId} currency={currency} />
                  <LoyaltyManager businessId={businessId} currency={currency} />
                  <ReferralManager businessId={businessId} />
                  <GiftCardsManager businessId={businessId} currency={currency} />
                  <BundlesManager businessId={businessId} currency={currency} />
                </div>
              }
              analytics={<StoreAnalyticsCard businessId={businessId} currency={currency} />}
              messages={
                <div className="space-y-5">
                  <Card className="p-6">
                    <div className="flex items-center justify-between">
                      <div className="text-[14px] font-semibold">Contact messages</div>
                      <div className="rounded-md bg-panel-2 px-2 py-0.5 text-[12px] tabular-nums text-text-dim">
                        {subscriberCount} newsletter subscriber{subscriberCount === 1 ? "" : "s"}
                      </div>
                    </div>
                    {messages.length === 0 ? (
                      <EmptyRow>No contact-form messages yet. They&apos;ll appear here when a shopper reaches out.</EmptyRow>
                    ) : (
                      <div className="mt-3 divide-y divide-border">
                        {messages.map((m) => (
                          <div key={m.id} className="py-3">
                            <div className="flex items-center justify-between text-[13px]">
                              <span className="font-medium">
                                {m.name}
                                {m.email ? <span className="text-text-faint"> · {m.email}</span> : ""}
                              </span>
                              <span className="text-[12px] tabular-nums text-text-faint">{m.createdAt.toLocaleDateString()}</span>
                            </div>
                            <p className="mt-1 text-[13px] leading-relaxed text-text-dim">{m.message}</p>
                          </div>
                        ))}
                      </div>
                    )}
                  </Card>

                  {records.length > 0 && (
                    <CustomerContentCard
                      businessId={businessId}
                      backend={design?.backend ?? null}
                      records={records.map((r) => ({
                        id: r.id,
                        collection: r.collection,
                        data: r.data,
                        status: r.status,
                        createdAt: r.createdAt.toISOString(),
                      }))}
                    />
                  )}
                </div>
              }
            />
          </>
        )}
      </div>
    </div>
  );
}

function EmptyRow({ children }: { children: React.ReactNode }) {
  return <p className="mt-4 rounded-lg border border-dashed border-border py-6 text-center text-[13px] text-text-faint">{children}</p>;
}

/** Headline numbers — from the cheap getStoreKpis() aggregate, not the full analytics query. */
function KpiStrip({ k, currency }: { k: StoreKpis; currency: string }) {
  const last7 = k.spark.slice(-7);
  const prev7 = k.spark.slice(0, 7);
  const rev7 = last7.reduce((s, d) => s + d.revenue, 0);
  const revPrev = prev7.reduce((s, d) => s + d.revenue, 0);
  const ord7 = last7.reduce((s, d) => s + d.orders, 0);
  const ordPrev = prev7.reduce((s, d) => s + d.orders, 0);

  const tiles = [
    {
      label: "Revenue · 7d",
      value: money(Math.round(rev7), currency),
      delta: pctDelta(rev7, revPrev),
      spark: k.spark.map((d) => d.revenue),
    },
    { label: "Orders · 7d", value: ord7.toLocaleString(), delta: pctDelta(ord7, ordPrev), spark: k.spark.map((d) => d.orders) },
    { label: "Visitors · 30d", value: k.visitors30.toLocaleString(), delta: null, spark: null },
    {
      label: "Conversion · 30d",
      value: `${k.conversion30.toFixed(k.conversion30 < 10 ? 1 : 0)}%`,
      delta: null,
      spark: null,
    },
  ];

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {tiles.map((t) => (
        <Card key={t.label} className="flex flex-col justify-between px-4 py-3.5">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <div className="text-[11px] font-medium uppercase tracking-[0.05em] text-text-faint">{t.label}</div>
              <div className="mt-1.5 text-[20px] font-semibold tabular-nums leading-none">{t.value}</div>
            </div>
            {t.delta != null ? (
              <span
                className={`inline-flex flex-none items-center gap-0.5 rounded-md px-1.5 py-0.5 text-[11px] font-semibold tabular-nums ${
                  t.delta >= 0 ? "bg-good-soft text-good" : "bg-bad-soft text-bad"
                }`}
              >
                {t.delta >= 0 ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                {Math.abs(t.delta).toFixed(0)}%
              </span>
            ) : null}
          </div>
          {t.spark && t.spark.some((v) => v > 0) ? (
            <Sparkline values={t.spark} className="mt-2.5 w-full" />
          ) : (
            <div className="mt-2.5 h-[28px]" />
          )}
        </Card>
      ))}
    </div>
  );
}

function pctDelta(now: number, prev: number): number | null {
  if (prev <= 0) return null; // no prior-week baseline — don't fabricate a "+100%"
  return ((now - prev) / prev) * 100;
}
