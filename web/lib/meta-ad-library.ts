import { GRAPH_BASE } from "@/lib/meta-oauth";
import { safeSlice } from "@/lib/utils";

interface AdArchiveEntry {
  page_name?: string;
  ad_delivery_start_time?: string;
  ad_creative_bodies?: string[];
}

export function isAdLibraryConfigured(): boolean {
  return !!process.env.META_APP_ID && !!process.env.META_APP_SECRET;
}

/** Real Meta Ad Library API search — no App Review needed for non-political/commercial ads, unlike the Marketing API. */
export async function searchAdLibrary(query: string): Promise<{ text: string; method: "api" | "failed" }> {
  const appId = process.env.META_APP_ID;
  const appSecret = process.env.META_APP_SECRET;
  if (!appId || !appSecret) return { text: "", method: "failed" };

  const params = new URLSearchParams({
    search_terms: query,
    ad_reached_countries: JSON.stringify(["US", "GB", "CA", "AU"]),
    ad_active_status: "ACTIVE",
    ad_type: "ALL",
    fields: "page_name,ad_delivery_start_time,ad_creative_bodies",
    limit: "10",
    access_token: `${appId}|${appSecret}`,
  });

  try {
    const res = await fetch(`${GRAPH_BASE}/ads_archive?${params.toString()}`, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) return { text: "", method: "failed" };
    const data = (await res.json()) as { data?: AdArchiveEntry[] };
    const ads = data.data ?? [];
    if (ads.length === 0) {
      return { text: "No active ads found for this business in the real Meta Ad Library right now.", method: "api" };
    }
    const summary = ads
      .slice(0, 5)
      .map((a) => {
        const copy = safeSlice(a.ad_creative_bodies?.[0] ?? "", 200);
        return `Page "${a.page_name ?? "unknown"}" — running since ${a.ad_delivery_start_time ?? "unknown date"}${copy ? `: "${copy}"` : ""}`;
      })
      .join(" | ");
    return { text: safeSlice(summary, 1500), method: "api" };
  } catch {
    return { text: "", method: "failed" };
  }
}
