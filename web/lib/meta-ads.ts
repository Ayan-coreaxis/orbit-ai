import sharp from "sharp";
import { prisma } from "@/lib/prisma";
import { GRAPH_BASE, GRAPH_VIDEO_BASE } from "@/lib/meta-oauth";
import { readStoredFile } from "@/lib/storage";
import { parseList } from "@/lib/media";
import { STORE_NOT_PUBLIC_REASON, publicStoreUrl, withUtm } from "@/lib/public-url";

/**
 * Real Meta ads, end to end: campaign → ad set (budget in the ad account's own currency,
 * targeting) → creative (the seller's image or video) → ad. Everything is created PAUSED —
 * only the owner's Activate starts spend. If any step fails, what was already created is deleted,
 * so the seller's ad account never fills up with half-built campaigns.
 * Ad-account calls use the long-lived USER token (a Page token can't manage ads).
 */

export class MetaAdError extends Error {}

type Fetch = typeof fetch;

type GraphError = { error?: { message?: string; error_user_msg?: string; error_user_title?: string; code?: number } };

async function graph<T>(path: string, token: string, init: { method?: string; body?: Record<string, unknown> | FormData; base?: string } = {}, f: Fetch = fetch): Promise<T> {
  const base = init.base ?? GRAPH_BASE;
  const method = init.method ?? (init.body ? "POST" : "GET");
  let url = `${base}/${path.replace(/^\//, "")}`;
  let body: BodyInit | undefined;
  const headers: Record<string, string> = {};
  if (init.body instanceof FormData) {
    init.body.set("access_token", token);
    body = init.body;
  } else if (init.body) {
    headers["Content-Type"] = "application/json";
    body = JSON.stringify({ ...init.body, access_token: token });
  } else {
    url += `${url.includes("?") ? "&" : "?"}access_token=${encodeURIComponent(token)}`;
  }
  let res: Response;
  try {
    res = await f(url, { method, headers, body, signal: AbortSignal.timeout(120000) });
  } catch {
    throw new MetaAdError("Couldn't reach Meta — try again.");
  }
  const data = (await res.json().catch(() => ({}))) as T & GraphError;
  if (!res.ok || data.error) throw new MetaAdError(friendly(data.error));
  return data;
}

function friendly(e: GraphError["error"]): string {
  const msg = e?.error_user_msg || e?.message || "Meta rejected the request.";
  if (e?.code === 190) return "Your Meta connection expired — reconnect Facebook/Instagram in Settings.";
  if (e?.code === 10 || e?.code === 200 || /permission/i.test(msg)) return `Meta says Orbit doesn't have permission for this (${msg}). Reconnect Meta in Settings and allow ads access; until Meta approves the app, only its test users can run ads.`;
  if (/payment|funding|billing/i.test(msg)) return `Your ad account has no working payment method — add one in Meta Ads Manager. (${msg})`;
  return (e?.error_user_title ? `${e.error_user_title}: ` : "") + msg;
}

// Meta takes budgets in the currency's smallest unit; for these currencies that unit is 1.
const OFFSET_1 = new Set(["CLP", "COP", "CRC", "HUF", "ISK", "IDR", "JPY", "KRW", "PYG", "TWD", "VND"]);
export const minorUnits = (amount: number, currency: string) => Math.round(amount * (OFFSET_1.has(currency.toUpperCase()) ? 1 : 100));
export const fromMinor = (units: number, currency: string) => units / (OFFSET_1.has(currency.toUpperCase()) ? 1 : 100);

export type AdAccount = { id: string; name: string; currency: string; status: number; minDailyBudget: number | null; disableReason: number | null };

export async function adAccountInfo(adAccountId: string, token: string, f: Fetch = fetch): Promise<AdAccount> {
  const id = `act_${adAccountId.replace(/^act_/, "")}`;
  const d = await graph<{ id: string; name?: string; currency?: string; account_status?: number; min_daily_budget?: number; disable_reason?: number }>(
    `${id}?fields=name,currency,account_status,min_daily_budget,disable_reason`,
    token,
    {},
    f,
  );
  const currency = (d.currency || "USD").toUpperCase();
  return {
    id,
    name: d.name ?? id,
    currency,
    status: d.account_status ?? 0,
    minDailyBudget: d.min_daily_budget != null ? fromMinor(Number(d.min_daily_budget), currency) : null,
    disableReason: d.disable_reason ?? null,
  };
}

const ACCOUNT_STATUS: Record<number, string> = { 1: "active", 2: "disabled", 3: "unsettled (unpaid balance)", 7: "pending risk review", 8: "pending settlement", 9: "in grace period", 100: "pending closure", 101: "closed" };
export const accountStatusLabel = (s: number) => ACCOUNT_STATUS[s] ?? `status ${s}`;

export const CTAS = ["SHOP_NOW", "ORDER_NOW", "BUY_NOW", "LEARN_MORE", "GET_OFFER", "SIGN_UP"] as const;
export type Cta = (typeof CTAS)[number];

export type AdDraft = {
  businessId: string;
  name: string;
  mediaId?: string | null; // image or video from the media library; without one, the product's own photo is used
  headline: string;
  primaryText: string;
  callToAction?: Cta;
  dailyBudget: number; // in the ad account's currency
  countries?: string[]; // ISO codes, default PK
  ageMin?: number;
  ageMax?: number;
  days?: number | null; // run length; null/0 = until paused
  productId?: string | null; // link to this product's page instead of the store home
  reasoning?: string;
  source?: "owner" | "orchestrator" | "ads-agent";
};

async function uploadImage(accountId: string, token: string, data: Buffer, f: Fetch): Promise<string> {
  const jpeg = await sharp(data).rotate().resize({ width: 1440, height: 1440, fit: "inside", withoutEnlargement: true }).flatten({ background: "#ffffff" }).jpeg({ quality: 90 }).toBuffer();
  const d = await graph<{ images?: Record<string, { hash: string }> }>(`${accountId}/adimages`, token, { body: { bytes: jpeg.toString("base64") } }, f);
  const hash = Object.values(d.images ?? {})[0]?.hash;
  if (!hash) throw new MetaAdError("Meta didn't accept the ad image.");
  return hash;
}

async function uploadVideo(accountId: string, token: string, data: Buffer, name: string, f: Fetch): Promise<string> {
  const fd = new FormData();
  fd.set("source", new Blob([new Uint8Array(data)], { type: "video/mp4" }), "ad.mp4");
  fd.set("name", name.slice(0, 100));
  const d = await graph<{ id?: string }>(`${accountId}/advideos`, token, { body: fd, base: GRAPH_VIDEO_BASE }, f);
  if (!d.id) throw new MetaAdError("Meta didn't accept the ad video.");
  // Meta has to process the video before a creative can use it.
  for (let i = 0; i < 40; i++) {
    const s = await graph<{ status?: { video_status?: string } }>(`${d.id}?fields=status`, token, {}, f);
    const st = s.status?.video_status;
    if (st === "ready") return d.id;
    if (st === "error") throw new MetaAdError("Meta couldn't process the video — try another one.");
    await new Promise((r) => setTimeout(r, Number(process.env.META_POLL_MS ?? 4000)));
  }
  throw new MetaAdError("Meta is still processing the video — try again in a few minutes.");
}

/** Build and save a complete, PAUSED ad. Returns the AdCampaign row. */
export async function createPausedAd(d: AdDraft, f: Fetch = fetch) {
  const b = await prisma.business.findUnique({
    where: { id: d.businessId },
    select: { name: true, metaAdAccountId: true, metaUserToken: true, metaAccessToken: true, metaPageId: true, metaInstagramUserId: true },
  });
  if (!b?.metaPageId || !b.metaAccessToken) throw new MetaAdError("Connect your Facebook Page first (Settings > Instagram & Facebook).");
  if (!b.metaAdAccountId) throw new MetaAdError("No Meta ad account is connected — reconnect Meta in Settings and allow ads access.");
  const token = b.metaUserToken;
  if (!token) throw new MetaAdError("Reconnect Meta in Settings once — ads need a fresh permission Orbit didn't have before.");

  const product = d.productId ? await prisma.product.findFirst({ where: { id: d.productId, businessId: d.businessId }, select: { id: true, imageUrl: true } }) : null;
  const row = d.mediaId ? await prisma.mediaAsset.findFirst({ where: { id: d.mediaId, businessId: d.businessId } }) : null;
  const media: { id: string | null; kind: string; url: string; frames: string | null } | null = row
    ? { id: row.id, kind: row.kind, url: row.url, frames: row.frames }
    : product?.imageUrl
      ? { id: null, kind: "image", url: product.imageUrl, frames: null }
      : null;
  if (!media || (media.kind !== "image" && media.kind !== "video")) throw new MetaAdError("Pick a photo or video for the ad.");
  const landing = await publicStoreUrl(d.businessId, product ? `/product/${product.id}` : "");
  if (!landing) throw new MetaAdError(STORE_NOT_PUBLIC_REASON);

  const account = await adAccountInfo(b.metaAdAccountId, token, f);
  if (account.status !== 1) throw new MetaAdError(`Your ad account is ${accountStatusLabel(account.status)} — fix it in Meta Ads Manager first.`);
  if (!(d.dailyBudget > 0)) throw new MetaAdError("Set a daily budget.");
  if (account.minDailyBudget != null && d.dailyBudget < account.minDailyBudget) {
    throw new MetaAdError(`Meta's minimum daily budget for this account is ${account.minDailyBudget} ${account.currency}.`);
  }
  const headline = d.headline.trim().slice(0, 40);
  const primaryText = d.primaryText.trim().slice(0, 1000);
  if (!headline || !primaryText) throw new MetaAdError("Write a headline and the ad text.");
  const countries = (d.countries?.length ? d.countries : ["PK"]).map((c) => c.toUpperCase()).filter((c) => /^[A-Z]{2}$/.test(c)).slice(0, 25);
  const cta: Cta = d.callToAction && CTAS.includes(d.callToAction) ? d.callToAction : "SHOP_NOW";
  const name = d.name.trim().slice(0, 80) || `${b.name} — ${new Date().toISOString().slice(0, 10)}`;
  const endsAt = d.days && d.days > 0 ? new Date(Date.now() + d.days * 86400000) : null;

  const created: string[] = []; // for clean-up, newest last
  try {
    const campaign = await graph<{ id: string }>(
      `${account.id}/campaigns`,
      token,
      { body: { name, objective: "OUTCOME_TRAFFIC", status: "PAUSED", special_ad_categories: [], is_adset_budget_sharing_enabled: false } },
      f,
    );
    created.push(campaign.id);

    const adset = await graph<{ id: string }>(
      `${account.id}/adsets`,
      token,
      {
        body: {
          name: `${name} — ad set`,
          campaign_id: campaign.id,
          daily_budget: minorUnits(d.dailyBudget, account.currency),
          billing_event: "IMPRESSIONS",
          optimization_goal: "LINK_CLICKS",
          bid_strategy: "LOWEST_COST_WITHOUT_CAP",
          destination_type: "WEBSITE",
          targeting: {
            geo_locations: { countries },
            age_min: Math.max(18, Math.min(65, d.ageMin ?? 18)),
            age_max: Math.max(18, Math.min(65, d.ageMax ?? 65)),
            targeting_automation: { advantage_audience: 1 },
          },
          ...(endsAt ? { end_time: endsAt.toISOString() } : {}),
          status: "PAUSED",
        },
      },
      f,
    );
    created.push(adset.id);

    const link = withUtm(landing, `orbit-${campaign.id}`);
    const file = await readStoredFile(media.url);
    let spec: Record<string, unknown>;
    if (media.kind === "image") {
      const hash = await uploadImage(account.id, token, file, f);
      spec = { link_data: { image_hash: hash, link, message: primaryText, name: headline, call_to_action: { type: cta, value: { link } } } };
    } else {
      const videoId = await uploadVideo(account.id, token, file, name, f);
      const poster = parseList(media.frames)[0];
      const thumbHash = poster ? await uploadImage(account.id, token, await readStoredFile(poster), f) : null;
      if (!thumbHash) throw new MetaAdError("The video needs a cover image — make it in Orbit Studio or pick a video with a still frame.");
      spec = { video_data: { video_id: videoId, image_hash: thumbHash, message: primaryText, title: headline, call_to_action: { type: cta, value: { link } } } };
    }
    const creative = await graph<{ id: string }>(
      `${account.id}/adcreatives`,
      token,
      { body: { name: `${name} — creative`, object_story_spec: { page_id: b.metaPageId, ...(b.metaInstagramUserId ? { instagram_user_id: b.metaInstagramUserId } : {}), ...spec } } },
      f,
    );

    const ad = await graph<{ id: string }>(`${account.id}/ads`, token, { body: { name, adset_id: adset.id, creative: { creative_id: creative.id }, status: "PAUSED" } }, f);
    created.push(ad.id);

    return prisma.adCampaign.create({
      data: {
        businessId: d.businessId,
        metaCampaignId: campaign.id,
        metaAdSetId: adset.id,
        metaCreativeId: creative.id,
        metaAdId: ad.id,
        name,
        dailyBudget: d.dailyBudget,
        currency: account.currency,
        reasoning: (d.reasoning ?? "Created by you in Orbit.").slice(0, 1000),
        status: "paused",
        mediaId: media.id,
        thumbUrl: media.kind === "video" ? (parseList(media.frames)[0] ?? null) : media.url,
        link,
        headline,
        primaryText,
        callToAction: cta,
        countries: JSON.stringify(countries),
        endsAt,
        source: d.source ?? "owner",
      },
    });
  } catch (e) {
    // Remove whatever got built (campaign deletion removes its ad sets and ads too).
    if (created[0]) await graph(created[0], token, { method: "DELETE" }, f).catch(() => {});
    throw e instanceof MetaAdError ? e : new MetaAdError(e instanceof Error ? e.message : "Couldn't create the ad.");
  }
}

type Row = NonNullable<Awaited<ReturnType<typeof prisma.adCampaign.findFirst>>>;

async function tokenFor(businessId: string) {
  const b = await prisma.business.findUnique({ where: { id: businessId }, select: { metaUserToken: true, metaAccessToken: true } });
  // Old rows were made with the Page token; the user token is the right one for ad objects.
  const token = b?.metaUserToken || b?.metaAccessToken;
  if (!token) throw new MetaAdError("Meta isn't connected for this business any more.");
  return token;
}

/** Start spend: the ad, its ad set and the campaign all have to be ACTIVE. */
export async function activateAd(row: Row, f: Fetch = fetch) {
  const token = await tokenFor(row.businessId);
  if (!row.metaAdId) throw new MetaAdError("This is an old campaign with no ad inside it, so it can't deliver. Delete it and create a new ad.");
  await graph(row.metaAdId, token, { body: { status: "ACTIVE" } }, f);
  if (row.metaAdSetId) await graph(row.metaAdSetId, token, { body: { status: "ACTIVE" } }, f);
  await graph(row.metaCampaignId, token, { body: { status: "ACTIVE" } }, f);
  return prisma.adCampaign.update({ where: { id: row.id }, data: { status: "active", activatedAt: new Date() } });
}

/** The kill switch: pausing the campaign stops all its spend. */
export async function pauseAd(row: Row, f: Fetch = fetch) {
  const token = await tokenFor(row.businessId);
  await graph(row.metaCampaignId, token, { body: { status: "PAUSED" } }, f);
  return prisma.adCampaign.update({ where: { id: row.id }, data: { status: "paused" } });
}

export async function deleteAd(row: Row, f: Fetch = fetch) {
  const token = await tokenFor(row.businessId);
  await graph(row.metaCampaignId, token, { method: "DELETE" }, f).catch((e) => {
    if (!(e instanceof MetaAdError) || !/does not exist|cannot be loaded|Unsupported/i.test(e.message)) throw e;
  });
  return prisma.adCampaign.update({ where: { id: row.id }, data: { status: "deleted" } });
}

/** Pull Meta's review status and lifetime results. Cheap enough to run when the Ads page opens. */
export async function syncAd(row: Row, f: Fetch = fetch) {
  const token = await tokenFor(row.businessId);
  const id = row.metaAdId ?? row.metaCampaignId;
  const status = await graph<{ effective_status?: string; ad_review_feedback?: { global?: Record<string, string> }; issues_info?: { error_message?: string }[] }>(
    `${id}?fields=effective_status${row.metaAdId ? ",ad_review_feedback,issues_info" : ""}`,
    token,
    {},
    f,
  );
  const ins = await graph<{ data?: { spend?: string; impressions?: string; clicks?: string }[] }>(`${row.metaCampaignId}/insights?fields=spend,impressions,clicks&date_preset=maximum`, token, {}, f).catch(
    () => ({ data: [] }),
  );
  const i = ins.data?.[0];
  const review = Object.values(status.ad_review_feedback?.global ?? {})[0] ?? status.issues_info?.[0]?.error_message ?? null;
  return prisma.adCampaign.update({
    where: { id: row.id },
    data: {
      metaStatus: status.effective_status ?? null,
      reviewNote: review ? review.slice(0, 400) : null,
      spend: i?.spend != null ? Number(i.spend) : row.spend,
      impressions: i?.impressions != null ? Number(i.impressions) : row.impressions,
      clicks: i?.clicks != null ? Number(i.clicks) : row.clicks,
      syncedAt: new Date(),
    },
  });
}
