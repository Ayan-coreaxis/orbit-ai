import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Store",
  robots: { index: true, follow: true },
};

/**
 * Storefront shell — deliberately bare. No dashboard sidebar, no app theme tokens; the seller's
 * generated design owns the entire visual surface. Each page sets the real page background from
 * its own design tokens so the dashboard's dark body colour never peeks through.
 */
export default function StoreLayout({ children }: { children: React.ReactNode }) {
  return <div className="min-h-dvh">{children}</div>;
}
