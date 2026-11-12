import { FEED_CACHE, loadStoreFeed } from "@/lib/product-feed-data";
import { buildMetaFeedCsv } from "@/lib/product-feed";

/** Meta Commerce Manager (Facebook / Instagram Shops) catalog feed for one published store. */
export async function GET(_req: Request, { params }: { params: Promise<{ businessId: string }> }) {
  const { businessId } = await params;
  const feed = await loadStoreFeed(businessId);
  if (!feed) return new Response("Not found", { status: 404 });
  return new Response(buildMetaFeedCsv(feed.items), {
    headers: { "Content-Type": "text/csv; charset=utf-8", "Cache-Control": FEED_CACHE },
  });
}
