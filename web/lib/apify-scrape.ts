/**
 * Real Instagram/TikTok profile reads via Apify's hosted scraper actors — residential-proxy
 * backed, so they succeed where a plain headless browser gets an anti-bot login wall. This is
 * a paid, per-run service (Apify usage-based pricing); requires APIFY_API_TOKEN. Falls back to
 * "not configured" honestly when the token isn't set, rather than pretending to have real data.
 */

import { safeSlice } from "@/lib/utils";

const APIFY_BASE = "https://api.apify.com/v2";

export function isApifyConfigured(): boolean {
  return !!process.env.APIFY_API_TOKEN;
}

async function runApifyActor<T>(actorId: string, input: Record<string, unknown>, timeoutMs = 25000): Promise<T[] | null> {
  const token = process.env.APIFY_API_TOKEN;
  if (!token) return null;
  try {
    const res = await fetch(`${APIFY_BASE}/acts/${actorId}/run-sync-get-dataset-items?token=${token}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!res.ok) return null;
    return (await res.json()) as T[];
  } catch {
    return null;
  }
}

interface InstagramProfileItem {
  biography?: string;
  followersCount?: number;
  latestPosts?: { caption?: string }[];
}

export async function scrapeInstagramProfileReal(handle: string): Promise<{ text: string; method: "api" | "failed" }> {
  const items = await runApifyActor<InstagramProfileItem>("apify~instagram-profile-scraper", { usernames: [handle] });
  const profile = items?.[0];
  if (!profile) return { text: "", method: "failed" };
  const captions = (profile.latestPosts ?? [])
    .map((p) => p.caption)
    .filter((c): c is string => !!c)
    .slice(0, 5)
    .join(" | ");
  const text = `Bio: ${profile.biography ?? "none"}. Followers: ${profile.followersCount ?? "unknown"}. Recent post captions: ${captions || "none available"}`;
  return { text: safeSlice(text, 1500), method: "api" };
}

interface TikTokVideoItem {
  text?: string;
}

export async function scrapeTiktokProfileReal(handle: string): Promise<{ text: string; method: "api" | "failed" }> {
  const items = await runApifyActor<TikTokVideoItem>("clockworks~tiktok-scraper", { profiles: [handle], resultsPerPage: 5 });
  if (!items || items.length === 0) return { text: "", method: "failed" };
  const captions = items
    .map((v) => v.text)
    .filter((c): c is string => !!c)
    .slice(0, 5)
    .join(" | ");
  if (!captions) return { text: "", method: "failed" };
  return { text: safeSlice(`Recent video captions: ${captions}`, 1500), method: "api" };
}
