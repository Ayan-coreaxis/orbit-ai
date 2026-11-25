import { redirect } from "next/navigation";
import { SiteShell } from "@/components/store/SiteShell";

export const dynamic = "force-dynamic";
export const metadata = { title: "Checkout" };

/** Agent-built stores have their own checkout page; older stores check out inside the cart. */
export default async function CheckoutPage({ params }: { params: Promise<{ businessId: string }> }) {
  const { businessId } = await params;
  const site = await SiteShell({ businessId, slug: "checkout" });
  if (!site) redirect(`/store/${businessId}/cart`);
  return site;
}
