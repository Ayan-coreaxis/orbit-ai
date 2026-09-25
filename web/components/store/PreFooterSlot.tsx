"use client";

import { useEffect, useRef, type ReactNode } from "react";

/**
 * The storefront renders the whole designed page (header → sections → footer) as one HTML blob,
 * then React appends the dynamic blocks (reviews, related, recently-viewed) after it — which
 * would land *below* the footer. This moves its children up to just before the footer on mount.
 */
export function PreFooterSlot({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const footer = document.querySelector("footer");
    if (footer && footer.parentElement && !footer.parentElement.contains(el)) {
      footer.parentElement.insertBefore(el, footer);
    } else if (footer) {
      footer.parentElement?.insertBefore(el, footer);
    }
  }, []);

  return <div ref={ref}>{children}</div>;
}
