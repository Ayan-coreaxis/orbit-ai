"use client";

import { useEffect, useRef } from "react";
import { CART_EVENT, readCart, type CartLine } from "../../app/store/cart-store";

/**
 * Keeps the browser cart mirrored to the server (`/api/store/:id/cart`). On mount: if the local
 * cart is empty but the server has one (another device, or cleared storage), it pulls it in;
 * otherwise it pushes the local cart up. After that it debounce-pushes on every change.
 * Mounted once per storefront page.
 */
export function CartSync({ businessId }: { businessId: string }) {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    // capture a `?ref=CODE` referral link the shopper landed on, so signup can credit it later
    try {
      const ref = new URLSearchParams(window.location.search).get("ref");
      if (ref && /^[A-Za-z0-9]{4,16}$/.test(ref)) {
        const days = 30;
        document.cookie = `ref_${businessId}=${encodeURIComponent(ref.toUpperCase())}; max-age=${days * 86400}; path=/; samesite=lax`;
      }
    } catch {
      /* ignore */
    }

    const K = `od_cart_${businessId}`;
    const push = () => {
      const items = readCart(businessId);
      fetch(`/api/store/${businessId}/cart`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items }),
        keepalive: true,
      }).catch(() => {});
    };

    // initial reconcile
    (async () => {
      const local = readCart(businessId);
      if (local.length > 0) {
        push();
        return;
      }
      try {
        const r = await fetch(`/api/store/${businessId}/cart`);
        const d = (await r.json()) as { items?: CartLine[] };
        if (Array.isArray(d.items) && d.items.length) {
          localStorage.setItem(K, JSON.stringify(d.items));
          window.dispatchEvent(new CustomEvent(CART_EVENT, { detail: { businessId } }));
        }
      } catch {
        /* ignore */
      }
    })();

    const onChange = () => {
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(push, 800);
    };
    window.addEventListener(CART_EVENT, onChange);
    window.addEventListener("beforeunload", push);
    return () => {
      window.removeEventListener(CART_EVENT, onChange);
      window.removeEventListener("beforeunload", push);
      if (timer.current) clearTimeout(timer.current);
    };
  }, [businessId]);

  return null;
}
