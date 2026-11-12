import { FEED_CACHE, loadStoreFeed } from "@/lib/product-feed-data";
import { buildGoogleFeedXml } from "@/lib/product-feed";

/** Google Merchant Center product feed for one published store. */
export async function GET(_req: Request, { params }: { params: Promise<{ businessId: string }> }) {
  const { businessId } = await params;
  const feed = await loadStoreFeed(businessId);
  if (!feed) return new Response("Not found", { status: 404 });
  return new Response(buildGoogleFeedXml(feed.store, feed.items), {
    headers: { "Content-Type": "application/xml; charset=utf-8", "Cache-Control": FEED_CACHE },
  });
}
