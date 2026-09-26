"use client";

import { useEffect } from "react";
import { firePixel } from "@/lib/pixel-client";

/**
 * Fires the browser Purchase once per order (the server sends the same event through the
 * Conversions API with the same id, and Meta counts it once).
 */
export function PixelPurchase({
  orderId,
  placedAt,
  value,
  currency,
  contentIds,
  numItems,
}: {
  orderId: string;
  placedAt: number;
  value: number;
  currency: string;
  contentIds: string[];
  numItems: number;
}) {
  useEffect(() => {
    if (Date.now() - placedAt > 86400000) return; // an old order page being revisited isn't a new sale
    const key = `od_px_purchase_${orderId}`;
    // Mark it sent only when it actually fires, so an effect that's cleaned up early can't swallow it.
    const t = setTimeout(() => {
      try {
        if (localStorage.getItem(key)) return;
        localStorage.setItem(key, "1");
      } catch {
        /* private mode — still fire; Meta dedupes by event id */
      }
      firePixel("purchase", { value, currency, content_ids: contentIds, num_items: numItems, order_id: orderId }, `order_${orderId}`);
    }, 300);
    return () => clearTimeout(t);
  }, [orderId, placedAt, value, currency, contentIds, numItems]);
  return null;
}
