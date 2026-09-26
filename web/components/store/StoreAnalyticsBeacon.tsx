"use client";

import { useEffect } from "react";
import { firePixel } from "@/lib/pixel-client";

/**
 * Fires a single storefront analytics event on mount (a page view). `add_to_cart` and
 * `checkout_start` are fired elsewhere (the storefront runtime / the cart widget);
 * `order_complete` is recorded server-side so it can't be spoofed.
 */
export function StoreAnalyticsBeacon({
  businessId,
  type,
  productId,
}: {
  businessId: string;
  type: "view_store" | "view_product";
  productId?: string;
}) {
  useEffect(() => {
    try {
      const body = JSON.stringify({ type, productId, referrer: document.referrer || undefined });
      const url = `/api/store/${businessId}/event`;
      // keepalive so it still lands if the user navigates away immediately
      fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body, keepalive: true }).catch(() => {});
      if (type === "view_product" && productId) firePixel("view_product", { content_ids: [productId] });
    } catch {
      /* never break the page */
    }
  }, [businessId, type, productId]);

  return null;
}
