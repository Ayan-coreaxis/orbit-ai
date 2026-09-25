"use client";

import { useEffect, useState, type ReactNode } from "react";
import { Package, Receipt, BarChart3, MessageSquare, Users, Ticket, LayoutTemplate } from "lucide-react";

const TABS = [
  { key: "products", label: "Products", icon: Package },
  { key: "storefront", label: "Storefront", icon: LayoutTemplate },
  { key: "orders", label: "Orders", icon: Receipt },
  { key: "customers", label: "Customers", icon: Users },
  { key: "discounts", label: "Discounts", icon: Ticket },
  { key: "analytics", label: "Analytics", icon: BarChart3 },
  { key: "messages", label: "Messages", icon: MessageSquare },
] as const;
type TabKey = (typeof TABS)[number]["key"];

function readHash(): TabKey {
  if (typeof window === "undefined") return "products";
  const h = window.location.hash.replace("#", "");
  return (TABS.find((t) => t.key === h)?.key ?? "products") as TabKey;
}

export function StoreTabs({
  products,
  storefront,
  orders,
  customers,
  discounts,
  analytics,
  messages,
  ordersBadge,
}: {
  products: ReactNode;
  storefront: ReactNode;
  orders: ReactNode;
  customers: ReactNode;
  discounts: ReactNode;
  analytics: ReactNode;
  messages: ReactNode;
  ordersBadge?: number;
}) {
  const [tab, setTab] = useState<TabKey>("products");

  // hydrate from + sync to the URL hash so a tab is shareable and survives reload / back
  useEffect(() => {
    setTab(readHash());
    const onHash = () => setTab(readHash());
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  function select(key: TabKey) {
    setTab(key);
    if (typeof window !== "undefined") {
      history.replaceState(null, "", key === "products" ? window.location.pathname : `#${key}`);
    }
  }

  // Only the active panel is rendered, so OrdersManager / StoreAnalyticsCard don't mount
  // (and don't fetch) until you open their tab.
  const panels: Record<TabKey, ReactNode> = { products, storefront, orders, customers, discounts, analytics, messages };

  return (
    <div>
      <div role="tablist" aria-label="Store sections" className="flex gap-0.5 border-b border-border">
        {TABS.map((t) => {
          const active = tab === t.key;
          const Icon = t.icon;
          return (
            <button
              key={t.key}
              role="tab"
              aria-selected={active}
              onClick={() => select(t.key)}
              className={`group -mb-px flex items-center gap-2 border-b-2 px-3.5 py-2.5 text-[13.5px] font-medium outline-none transition-colors focus-visible:bg-panel-2 ${
                active
                  ? "border-accent-strong text-text"
                  : "border-transparent text-text-faint hover:text-text-dim"
              }`}
            >
              <Icon className={`h-4 w-4 ${active ? "text-accent-strong" : "text-text-faint group-hover:text-text-dim"}`} strokeWidth={2} />
              {t.label}
              {t.key === "orders" && (
                <span
                  role="status"
                  aria-atomic="true"
                  className={`ml-0.5 inline-flex min-w-[1.25rem] items-center justify-center rounded-full px-1.5 text-[11px] font-semibold tabular-nums ${
                    ordersBadge ? "bg-warn-soft text-warn" : "text-transparent"
                  }`}
                >
                  {ordersBadge ? `${ordersBadge}` : "0"}
                  <span className="sr-only">{ordersBadge ? ` orders need attention` : ""}</span>
                </span>
              )}
            </button>
          );
        })}
      </div>
      <div className="mt-6">{panels[tab]}</div>
    </div>
  );
}
