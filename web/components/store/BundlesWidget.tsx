"use client";

import { useEffect, useState } from "react";
import { addToCart } from "../../app/store/cart-store";
import { wCard, wBtn, wHeading, money } from "./widget-ui";
import { copyText, type WidgetCopyKey } from "@/lib/widget-copy";

interface BundleItem {
  productId: string;
  variantId: string | null;
  qty: number;
  name: string;
  variantLabel: string | null;
  price: number;
  stock: number;
}
interface Bundle {
  id: string;
  name: string;
  description: string | null;
  imageUrl: string | null;
  price: number;
  items: BundleItem[];
}

/** Storefront — every real, active combo deal, addable to the cart as one line at its flat price. */
export function BundlesWidget({
  businessId,
  currency,
  widgetCopy = {},
  widgetMotion: _widgetMotion = "standard",
}: {
  businessId: string;
  currency?: string;
  widgetCopy?: Partial<Record<WidgetCopyKey, string>>;
  widgetMotion?: string;
}) {
  const [bundles, setBundles] = useState<Bundle[]>([]);
  const [loading, setLoading] = useState(true);
  const [added, setAdded] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/store/${businessId}/bundles`)
      .then((r) => r.json())
      .then((d) => setBundles(Array.isArray(d.bundles) ? d.bundles : []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [businessId]);

  function add(b: Bundle) {
    addToCart(businessId, { bundleId: b.id, name: b.name, price: b.price, imageUrl: b.imageUrl });
    setAdded(b.id);
    setTimeout(() => setAdded((cur) => (cur === b.id ? null : cur)), 1800);
  }

  if (loading) return <p style={{ color: "var(--od-muted)" }}>Loading…</p>;
  if (bundles.length === 0) return <p style={{ color: "var(--od-muted)" }}>{copyText("bundles.none", widgetCopy)}</p>;

  return (
    <div style={{ display: "grid", gap: 20 }}>
      <h2 style={wHeading}>{copyText("bundles.heading", widgetCopy)}</h2>
      <div style={{ display: "grid", gap: 16, gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))" }}>
        {bundles.map((b) => {
          const worth = b.items.reduce((s, it) => s + it.price * it.qty, 0);
          return (
            <div key={b.id} style={wCard}>
              {b.imageUrl && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={b.imageUrl} alt={b.name} style={{ width: "100%", aspectRatio: "4/3", objectFit: "cover", borderRadius: "calc(var(--od-radius)*.6)" }} />
              )}
              <div style={{ marginTop: b.imageUrl ? 12 : 0, fontSize: 15, fontWeight: 600 }}>{b.name}</div>
              {b.description && <p style={{ margin: "4px 0 0", fontSize: 13, color: "var(--od-muted)", lineHeight: 1.5 }}>{b.description}</p>}
              <p style={{ margin: "8px 0 0", fontSize: 12.5, color: "var(--od-muted)" }}>
                {b.items.map((it) => `${it.qty}× ${it.name}`).join(" + ")}
              </p>
              <div style={{ marginTop: 10, display: "flex", alignItems: "baseline", gap: 8 }}>
                <span style={{ fontSize: 18, fontWeight: 700 }}>{money(b.price, currency)}</span>
                {worth > b.price && (
                  <span style={{ fontSize: 13, color: "var(--od-muted)", textDecoration: "line-through" }}>{money(worth, currency)}</span>
                )}
              </div>
              <button type="button" data-od-ripple onClick={() => add(b)} style={{ ...wBtn, marginTop: 12 }}>
                {added === b.id ? copyText("product.added", widgetCopy) : copyText("bundles.addBundle", widgetCopy)}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
