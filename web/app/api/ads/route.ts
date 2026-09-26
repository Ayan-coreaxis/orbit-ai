import { NextRequest, NextResponse } from "next/server";
import { getActiveBusinessId } from "@/lib/get-active-business-id";
import { prisma } from "@/lib/prisma";
import { MetaAdError, adAccountInfo, accountStatusLabel, createPausedAd, syncAd, type Cta } from "@/lib/meta-ads";
import { publicStoreUrl, STORE_NOT_PUBLIC_REASON } from "@/lib/public-url";
import { parseList } from "@/lib/media";

export const maxDuration = 300; // a video ad uploads and waits for Meta to process it

/** Ads page data: what's connected, the ad account's currency + minimum, campaigns with results, and creatives to pick from. */
export async function GET() {
  const businessId = await getActiveBusinessId();
  if (!businessId) return NextResponse.json({ error: "No active business." }, { status: 400 });
  const b = await prisma.business.findUnique({
    where: { id: businessId },
    select: { metaPageId: true, metaPageName: true, metaAdAccountId: true, metaUserToken: true, metaAccessToken: true, storeCurrency: true },
  });

  let account: { currency: string; minDailyBudget: number | null; status: string; ok: boolean; name: string } | null = null;
  let accountError: string | null = null;
  if (b?.metaAdAccountId && b.metaUserToken) {
    try {
      const a = await adAccountInfo(b.metaAdAccountId, b.metaUserToken);
      account = { currency: a.currency, minDailyBudget: a.minDailyBudget, status: accountStatusLabel(a.status), ok: a.status === 1, name: a.name };
    } catch (e) {
      accountError = e instanceof MetaAdError ? e.message : "Couldn't read your ad account.";
    }
  }

  // Refresh review status + results for recent live ads (older than 5 minutes since the last look).
  const rows = await prisma.adCampaign.findMany({ where: { businessId, status: { not: "deleted" } }, orderBy: { createdAt: "desc" }, take: 30 });
  const stale = rows.filter((r) => r.metaAdId && (!r.syncedAt || Date.now() - r.syncedAt.getTime() > 5 * 60 * 1000)).slice(0, 5);
  const synced = new Map<string, (typeof rows)[number]>();
  await Promise.all(stale.map(async (r) => synced.set(r.id, await syncAd(r).catch(() => r))));

  const media = await prisma.mediaAsset.findMany({ where: { businessId, kind: { in: ["image", "video"] } }, orderBy: { createdAt: "desc" }, take: 60 });
  const products = await prisma.product.findMany({ where: { businessId }, orderBy: { createdAt: "asc" }, take: 200, select: { id: true, name: true } });
  const storeLink = await publicStoreUrl(businessId);

  return NextResponse.json({
    ready: {
      page: b?.metaPageId ? (b.metaPageName ?? "Connected") : null,
      adAccount: !!b?.metaAdAccountId,
      userToken: !!b?.metaUserToken,
      store: storeLink,
      storeReason: storeLink ? null : STORE_NOT_PUBLIC_REASON,
    },
    account,
    accountError,
    campaigns: rows.map((r) => {
      const x = synced.get(r.id) ?? r;
      return {
        id: x.id,
        name: x.name,
        status: x.status,
        metaStatus: x.metaStatus,
        reviewNote: x.reviewNote,
        dailyBudget: x.dailyBudget ?? x.dailyBudgetUsd,
        currency: x.currency ?? (x.dailyBudgetUsd != null ? "USD" : null),
        hasAd: !!x.metaAdId,
        headline: x.headline,
        primaryText: x.primaryText,
        reasoning: x.reasoning,
        link: x.link,
        thumbUrl: x.thumbUrl ?? media.find((m) => m.id === x.mediaId && m.kind === "image")?.url ?? null,
        isVideo: media.find((m) => m.id === x.mediaId)?.kind === "video",
        spend: x.spend,
        impressions: x.impressions,
        clicks: x.clicks,
        objective: x.objective,
        purchases: x.purchases,
        purchaseValue: x.purchaseValue,
        endsAt: x.endsAt?.toISOString() ?? null,
        source: x.source,
        createdAt: x.createdAt.toISOString(),
      };
    }),
    media: media.map((m) => ({ id: m.id, kind: m.kind, name: m.name, url: m.url, poster: parseList(m.frames)[0] ?? null, source: m.source })),
    products,
  });
}

/** Owner creates an ad — it's built in Meta PAUSED; Activate is a separate, explicit step. */
export async function POST(req: NextRequest) {
  const businessId = await getActiveBusinessId();
  if (!businessId) return NextResponse.json({ error: "No active business." }, { status: 400 });
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const str = (v: unknown) => (typeof v === "string" ? v : "");
  try {
    const row = await createPausedAd({
      businessId,
      name: str(body.name),
      mediaId: str(body.mediaId),
      headline: str(body.headline),
      primaryText: str(body.primaryText),
      callToAction: str(body.callToAction) as Cta,
      dailyBudget: Number(body.dailyBudget),
      countries: Array.isArray(body.countries) ? body.countries.filter((c): c is string => typeof c === "string") : undefined,
      ageMin: Number(body.ageMin) || undefined,
      ageMax: Number(body.ageMax) || undefined,
      days: Number(body.days) || null,
      productId: str(body.productId) || null,
      reasoning: str(body.reasoning) || "Created by you in Orbit.",
      source: "owner",
    });
    return NextResponse.json({ id: row.id });
  } catch (e) {
    if (e instanceof MetaAdError) return NextResponse.json({ error: e.message }, { status: 400 });
    console.warn("[ads] create failed:", String(e).slice(0, 300));
    return NextResponse.json({ error: "Couldn't create the ad — try again." }, { status: 500 });
  }
}
