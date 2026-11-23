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
import { getStoreKpis } from "@/lib/store-analytics";
import { ExternalLink, Sparkles } from "lucide-react";

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
      <Topbar
        title="Store"
        subtitle="Orders, products, customers and offers"
        actions={
          businessId ? (
            <>
              <span className={`inline-flex items-center gap-2 rounded-full px-3.5 py-2 text-[13.5px] font-semibold ${design?.published ? "bg-good-soft text-good" : "bg-panel-2 text-text-dim"}`}>
                <span className={`h-2 w-2 rounded-full ${design?.published ? "bg-good" : "bg-text-faint"}`} />
                {design?.published ? "Live" : "Not published"}
              </span>
              {design?.published ? (
                <Link href={`/store/${businessId}`} target="_blank" className="btn-primary">
                  View store <ExternalLink className="h-4 w-4" />
                </Link>
              ) : (
                <Link href="/dashboard/orbit-design" className="btn-primary">
                  <Sparkles className="h-4 w-4" /> Design & publish
                </Link>
              )}
            </>
          ) : undefined
        }
      />
      <div className="page-body space-y-5">
        {!businessId ? (
          <Card className="p-6">
            <p className="text-[14px] text-text-dim">No business yet — finish setup first.</p>
          </Card>
        ) : (
          <>
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
