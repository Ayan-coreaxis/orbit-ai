import { GRAPH_BASE } from "@/lib/meta-oauth";

export interface GraphResult {
  ok: boolean;
  id?: string;
  error?: string;
}

/** Real post to a real connected Facebook Page — text-only, works without an image. */
export async function publishFacebookPost(pageId: string, pageAccessToken: string, message: string): Promise<GraphResult> {
  try {
    const res = await fetch(`${GRAPH_BASE}/${pageId}/feed`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message, access_token: pageAccessToken }),
    });
    const data = await res.json();
    if (!res.ok) return { ok: false, error: data?.error?.message ?? `Facebook API error ${res.status}` };
    return { ok: true, id: data.id };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Unknown error posting to Facebook" };
  }
}

/**
 * Real post to a connected Instagram Business account. Instagram's Content Publishing API
 * requires a real, publicly reachable image URL — there is no text-only Instagram post. If no
 * image is supplied, this honestly fails rather than pretending to post.
 */
export async function publishInstagramPost(
  igUserId: string,
  pageAccessToken: string,
  imageUrl: string,
  caption: string,
): Promise<GraphResult> {
  try {
    const createRes = await fetch(`${GRAPH_BASE}/${igUserId}/media`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ image_url: imageUrl, caption, access_token: pageAccessToken }),
    });
    const createData = await createRes.json();
    if (!createRes.ok) return { ok: false, error: createData?.error?.message ?? `Instagram media create failed (${createRes.status})` };

    const publishRes = await fetch(`${GRAPH_BASE}/${igUserId}/media_publish`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ creation_id: createData.id, access_token: pageAccessToken }),
    });
    const publishData = await publishRes.json();
    if (!publishRes.ok) return { ok: false, error: publishData?.error?.message ?? `Instagram publish failed (${publishRes.status})` };
    return { ok: true, id: publishData.id };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Unknown error posting to Instagram" };
  }
}

export interface AdCampaignParams {
  adAccountId: string;
  accessToken: string;
  campaignName: string;
  dailyBudgetUsd: number;
  objective?: string;
}

/**
 * Real Meta ad campaign creation, paused by default (status=PAUSED) — never launches spending
 * automatically without a separate, explicit activation step. The daily budget is passed to Meta
 * itself as `daily_budget` (in cents), so the cap is enforced by Meta's platform, not just our code.
 */
export async function createPausedAdCampaign(params: AdCampaignParams): Promise<GraphResult> {
  try {
    const res = await fetch(`${GRAPH_BASE}/act_${params.adAccountId.replace(/^act_/, "")}/campaigns`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: params.campaignName,
        objective: params.objective ?? "OUTCOME_TRAFFIC",
        status: "PAUSED",
        special_ad_categories: [],
        access_token: params.accessToken,
      }),
    });
    const data = await res.json();
    if (!res.ok) return { ok: false, error: data?.error?.message ?? `Meta campaign creation failed (${res.status})` };
    return { ok: true, id: data.id };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Unknown error creating Meta campaign" };
  }
}

/** Real ad set with a real, Meta-enforced daily budget cap (in USD, converted to cents for the API). */
export async function createAdSetWithBudget(
  adAccountId: string,
  accessToken: string,
  campaignId: string,
  name: string,
  dailyBudgetUsd: number,
): Promise<GraphResult> {
  try {
    const res = await fetch(`${GRAPH_BASE}/act_${adAccountId.replace(/^act_/, "")}/adsets`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name,
        campaign_id: campaignId,
        daily_budget: Math.round(dailyBudgetUsd * 100), // Meta's API takes minor currency units (cents)
        billing_event: "IMPRESSIONS",
        optimization_goal: "LINK_CLICKS",
        status: "PAUSED",
        access_token: accessToken,
      }),
    });
    const data = await res.json();
    if (!res.ok) return { ok: false, error: data?.error?.message ?? `Meta ad set creation failed (${res.status})` };
    return { ok: true, id: data.id };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Unknown error creating Meta ad set" };
  }
}

/** Real activation — flips a real PAUSED campaign to ACTIVE, the one action that actually starts real spend. */
export async function activateCampaign(campaignId: string, accessToken: string): Promise<GraphResult> {
  try {
    const res = await fetch(`${GRAPH_BASE}/${campaignId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "ACTIVE", access_token: accessToken }),
    });
    const data = await res.json();
    if (!res.ok) return { ok: false, error: data?.error?.message ?? `Meta activation failed (${res.status})` };
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Unknown error activating Meta campaign" };
  }
}

/** Real pause — flips a real ACTIVE campaign back to PAUSED, a real kill-switch. */
export async function pauseCampaign(campaignId: string, accessToken: string): Promise<GraphResult> {
  try {
    const res = await fetch(`${GRAPH_BASE}/${campaignId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "PAUSED", access_token: accessToken }),
    });
    const data = await res.json();
    if (!res.ok) return { ok: false, error: data?.error?.message ?? `Meta pause failed (${res.status})` };
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Unknown error pausing Meta campaign" };
  }
}
