"use client";

import { useLayoutEffect, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { Package, Receipt, BarChart3, MessageSquare, Users, Ticket, LayoutTemplate } from "lucide-react";

// Orders first — it's what a seller opens most. "#products" etc. deep-link to a tab.
const TABS = [
  { key: "orders", label: "Orders", icon: Receipt },
  { key: "products", label: "Products", icon: Package },
  { key: "customers", label: "Customers", icon: Users },
  { key: "discounts", label: "Offers", icon: Ticket },
  { key: "storefront", label: "Storefront", icon: LayoutTemplate },
  { key: "analytics", label: "Analytics", icon: BarChart3 },
  { key: "messages", label: "Messages", icon: MessageSquare },
] as const;
type TabKey = (typeof TABS)[number]["key"];
const DEFAULT: TabKey = "orders";

const TAB_EVENT = "orbit-store-tab";

function subscribeHash(onChange: () => void) {
  window.addEventListener("hashchange", onChange);
  window.addEventListener(TAB_EVENT, onChange);
  return () => {
    window.removeEventListener("hashchange", onChange);
    window.removeEventListener(TAB_EVENT, onChange);
  };
}

function readHash(): TabKey {
  if (typeof window === "undefined") return DEFAULT;
  const h = window.location.hash.replace("#", "");
  return (TABS.find((t) => t.key === h)?.key ?? DEFAULT) as TabKey;
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
  // The URL hash is the source of truth, so a tab is shareable and survives reload / back.
  const tab = useSyncExternalStore(subscribeHash, readHash, () => DEFAULT);

  function select(key: TabKey) {
    history.replaceState(null, "", key === DEFAULT ? window.location.pathname : `#${key}`);
    window.dispatchEvent(new Event(TAB_EVENT)); // replaceState doesn't fire hashchange
  }

  // The dark pill slides to the selected tab.
  const wrap = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState<{ x: number; w: number } | null>(null);
  useLayoutEffect(() => {
    const measure = () => {
      const el = wrap.current?.querySelector<HTMLElement>(`[data-tab="${tab}"]`);
      setBox(el ? { x: el.offsetLeft, w: el.offsetWidth } : null);
    };
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [tab]);

  // Only the active panel is rendered, so OrdersManager / StoreAnalyticsCard don't mount
  // (and don't fetch) until you open their tab.
  const panels: Record<TabKey, ReactNode> = { products, storefront, orders, customers, discounts, analytics, messages };

  return (
    <div>
      <div className="glass scrollbar-thin inline-flex max-w-full overflow-x-auto rounded-full">
        <div ref={wrap} role="tablist" aria-label="Store sections" className="relative flex items-center gap-0.5 p-1.5">
          {box && (
            <span
              aria-hidden
              className="absolute top-1.5 bottom-1.5 left-0 rounded-full bg-accent transition-[transform,width] duration-500 ease-[cubic-bezier(0.22,1,0.36,1)]"
              style={{ width: box.w, transform: `translateX(${box.x}px)` }}
            />
          )}
          {TABS.map((t) => {
            const active = tab === t.key;
            const Icon = t.icon;
            return (
              <button
                key={t.key}
                data-tab={t.key}
                role="tab"
                aria-selected={active}
                onClick={() => select(t.key)}
                className={`relative z-10 flex shrink-0 items-center gap-2 whitespace-nowrap rounded-full px-4 py-2 text-[14px] font-medium outline-none transition-colors duration-300 focus-visible:ring-2 focus-visible:ring-accent ${
                  active ? "text-panel" : "text-text-dim hover:text-text"
                }`}
              >
                <Icon className="h-4 w-4" strokeWidth={2} />
                {t.label}
                {t.key === "orders" && !!ordersBadge && (
                  <span role="status" className={`inline-flex min-w-[1.3rem] items-center justify-center rounded-full px-1.5 text-[12px] font-semibold ${active ? "bg-tomato text-white" : "bg-tomato-soft text-tomato-strong"}`}>
                    {ordersBadge}
                    <span className="sr-only"> orders need attention</span>
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>
      <div key={tab} className="page-enter mt-6">
        {panels[tab]}
      </div>
    </div>
  );
}
