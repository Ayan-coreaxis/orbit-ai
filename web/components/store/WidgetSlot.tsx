"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

/**
 * Renders a functional widget (product details, cart, checkout) into the
 * `<div data-od-widget="...">` slot the seller's designed page HTML left for it.
 *
 * It creates its own host <div>, appends it to the slot, and portals into that host — so React
 * fully owns the widget's mount/unmount (portal child of this component) while the host is just
 * detached in the effect cleanup. This survives client navigation cleanly; moving a
 * React-managed node into the slot instead throws "removeChild: not a child of this node".
 */
export function WidgetSlot({
  kind,
  selector,
  index = 0,
  children,
}: {
  kind: "product" | "cart" | "checkout" | "auth" | "account" | "track" | "bundles" | "rewards" | "collection" | "form";
  /** override the default `[data-od-widget="<kind>"]` slot query (e.g. target one of several) */
  selector?: string;
  /** when multiple slots match, which one (0-based) */
  index?: number;
  children: React.ReactNode;
}) {
  const [host] = useState<HTMLDivElement | null>(() => (typeof document === "undefined" ? null : document.createElement("div")));
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const all = document.querySelectorAll(selector ?? `[data-od-widget="${kind}"]`);
    const slot = all[index] ?? all[0];
    if (!slot || !host) return;
    slot.replaceChildren(host);
    // eslint-disable-next-line react-hooks/set-state-in-effect -- signal that the host is in the DOM
    setMounted(true);
    return () => {
      try {
        host.remove();
      } catch {
        /* container already gone */
      }
    };
  }, [kind, host, selector, index]);

  return mounted && host ? createPortal(children, host) : null;
}
