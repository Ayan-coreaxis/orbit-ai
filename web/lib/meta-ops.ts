import { prisma } from "@/lib/prisma";
import { listProducts } from "@/lib/product-ops";
import { resolveMediaRef } from "@/lib/media";
import { MetaAdError, createPausedAd } from "@/lib/meta-ads";
import { queueSocialPost, runSocialPosts, type Platform } from "@/lib/meta-graph";
import { publicStoreUrl, publicFileUrl } from "@/lib/public-url";

/**
 * The Orchestrator's way to post to Facebook / Instagram and to set up Meta ads. Both touch the
 * seller's public accounts, so both are PROPOSALS (Apply). An ad is still only created PAUSED —
 * spending needs the owner's own Activate in Ads.
 */

export type SocialPostOp = { op: "social_post"; mediaId: string | null; mediaName: string | null; caption: string; platforms: Platform[] };
export type MetaAdOp = {
  op: "meta_ad";
  mediaId: string | null;
  productId: string | null;
  productName: string | null;
  headline: string;
  text: string;
  dailyBudget: number;
  days: number | null;
  countries: string[];
};

export const SOCIAL_POSTS_SCHEMA = {
  type: "array",
  description:
    "Post to the owner's Facebook Page / Instagram (see META). Only when they asked or agreed. A proposal — say they should press Apply; never that it's posted.",
  items: {
    type: "object",
    properties: {
      media: { type: "string", description: "Media ref (M…) of the photo or video to post. Leave out for a text-only Facebook post." },
      caption: { type: "string", description: "The exact caption, in the language the owner wants, with a few hashtags." },
      platforms: { type: "array", items: { type: "string", enum: ["facebook", "instagram"] } },
    },
    required: ["caption", "platforms"],
  },
} as const;

export const META_ADS_SCHEMA = {
  type: "array",
  description:
    "Set up a Meta (Facebook + Instagram) ad (see META). Only when the owner asked or agreed, with a budget they gave or approved. After Apply it is built PAUSED — the owner activates it in Ads; say that.",
  items: {
    type: "object",
    properties: {
      media: { type: "string", description: "Media ref (M…) of the photo or video. Leave out to use the product's own photo." },
      product: { type: "string", description: "Product ref (P…) the ad sends people to. Leave out for the store home page." },
      headline: { type: "string", description: "Max 40 characters." },
      text: { type: "string", description: "Ad text: a hook and a reason to buy. Never invent prices, discounts or claims." },
      daily_budget: { type: "number", description: "Per day, in the ad account's currency (see META)." },
      days: { type: "number", description: "How many days to run; 0 = until paused." },
      countries: { type: "array", items: { type: "string" }, description: "2-letter country codes, default ['PK']." },
    },
    required: ["headline", "text", "daily_budget"],
  },
} as const;

export async function sanitizeMetaOps(businessId: string, posts: unknown, ads: unknown): Promise<(SocialPostOp | MetaAdOp)[]> {
  const out: (SocialPostOp | MetaAdOp)[] = [];
  const media = async (ref: unknown) => {
    if (typeof ref !== "string" || !ref.trim()) return null;
    const m = await resolveMediaRef(businessId, ref);
    return m && (m.kind === "image" || m.kind === "video") ? m : null;
  };
  for (const p of Array.isArray(posts) ? posts.slice(0, 3) : []) {
    if (!p || typeof p !== "object") continue;
    const r = p as Record<string, unknown>;
    const m = await media(r.media);
    const platforms = (Array.isArray(r.platforms) ? r.platforms : []).filter((x): x is Platform => x === "facebook" || x === "instagram");
    const caption = typeof r.caption === "string" ? r.caption.trim().slice(0, 2200) : "";
    if (!caption || !platforms.length) continue;
    out.push({ op: "social_post", mediaId: m?.id ?? null, mediaName: m?.name ?? null, caption, platforms: m ? platforms : platforms.filter((x) => x === "facebook") });
  }
  const products = await listProducts(businessId);
  for (const a of Array.isArray(ads) ? ads.slice(0, 2) : []) {
    if (!a || typeof a !== "object") continue;
    const r = a as Record<string, unknown>;
    const budget = Number(r.daily_budget);
    const headline = typeof r.headline === "string" ? r.headline.trim().slice(0, 40) : "";
    const text = typeof r.text === "string" ? r.text.trim().slice(0, 1000) : "";
    if (!(budget > 0) || !headline || !text) continue;
    const i = typeof r.product === "string" ? Number(r.product.replace(/\D/g, "")) - 1 : -1;
    const product = products[i] ?? null;
    const m = await media(r.media);
    out.push({
      op: "meta_ad",
      mediaId: m?.id ?? null,
      productId: product?.id ?? null,
      productName: product?.name ?? null,
      headline,
      text,
      dailyBudget: budget,
      days: Number(r.days) > 0 ? Math.min(90, Math.round(Number(r.days))) : null,
      countries: (Array.isArray(r.countries) ? r.countries : ["PK"]).filter((c): c is string => typeof c === "string" && /^[A-Za-z]{2}$/.test(c)).map((c) => c.toUpperCase()).slice(0, 10),
    });
  }
  return out;
}

export function sanitizeStoredMetaOps(raw: unknown[]): (SocialPostOp | MetaAdOp)[] {
  return raw.filter((o): o is SocialPostOp | MetaAdOp => !!o && typeof o === "object" && ((o as SocialPostOp).op === "social_post" || (o as MetaAdOp).op === "meta_ad"));
}

export function describeMetaOps(ops: (SocialPostOp | MetaAdOp)[], currency: string): string[] {
  return ops.map((o) =>
    o.op === "social_post"
      ? `Post to ${o.platforms.map((p) => (p === "facebook" ? "Facebook" : "Instagram")).join(" + ")}${o.mediaName ? ` with "${o.mediaName}"` : ""}: "${o.caption.slice(0, 90)}${o.caption.length > 90 ? "…" : ""}"`
      : `Meta ad (built paused): "${o.headline}" → ${o.productName ?? "store home"}, ${o.dailyBudget} ${currency}/day${o.days ? ` for ${o.days} days` : ""} — you activate it in Ads`,
  );
}

/** After Apply, in the background; reports back into the chat. */
export async function runMetaOps(businessId: string, ops: (SocialPostOp | MetaAdOp)[]): Promise<void> {
  const say = (content: string) => prisma.orchestratorMessage.create({ data: { businessId, role: "assistant", speaker: "orchestrator", content } });
  for (const o of ops) {
    if (o.op === "social_post") {
      try {
        const { rows } = await queueSocialPost(businessId, { mediaId: o.mediaId, caption: o.caption, platforms: o.platforms, source: "orchestrator" });
        await runSocialPosts(businessId, rows.map((r) => r.id));
        const done = await prisma.socialPost.findMany({ where: { id: { in: rows.map((r) => r.id) } } });
        await say(
          done
            .map((p) => (p.status === "posted" ? `Posted to ${p.platform === "facebook" ? "Facebook" : "Instagram"}${p.permalink ? `: ${p.permalink}` : "."}` : `${p.platform === "facebook" ? "Facebook" : "Instagram"} post failed: ${p.error}`))
            .join("\n"),
        );
      } catch (e) {
        await say(`I couldn't post that: ${e instanceof Error ? e.message : "unknown error"}`);
      }
    } else {
      try {
        const row = await createPausedAd({
          businessId,
          name: o.headline,
          mediaId: o.mediaId,
          productId: o.productId,
          headline: o.headline,
          primaryText: o.text,
          dailyBudget: o.dailyBudget,
          days: o.days,
          countries: o.countries,
          reasoning: "Proposed in the Orchestrator chat and approved by you.",
          source: "orchestrator",
        });
        await say(`The ad "${o.headline}" is built in your Meta ad account — **paused**, ${row.dailyBudget} ${row.currency}/day. Check it and press Activate in Ads when you're ready: /dashboard/ads`);
      } catch (e) {
        await say(`I couldn't build the ad: ${e instanceof MetaAdError ? e.message : "unknown error"}. Nothing was created or charged.`);
      }
    }
  }
}

/** META section of the Orchestrator prompt (database only — no Meta calls per chat turn). */
export async function metaContext(businessId: string): Promise<string> {
  const b = await prisma.business.findUnique({
    where: { id: businessId },
    select: { metaPageId: true, metaPageName: true, metaInstagramUserId: true, metaAdAccountId: true, metaUserToken: true, storeCurrency: true },
  });
  if (!b?.metaPageId) return "\nMETA (Facebook / Instagram / ads): not connected. If they want to post or run ads, tell them to connect in Settings > Instagram & Facebook. social_posts and meta_ads must stay empty.";
  const last = await prisma.adCampaign.findFirst({ where: { businessId, currency: { not: null } }, orderBy: { createdAt: "desc" }, select: { currency: true } });
  const store = await publicStoreUrl(businessId);
  const igFiles = publicFileUrl("/uploads/x") !== null;
  return `
META: Facebook Page "${b.metaPageName}" connected${b.metaInstagramUserId ? ", Instagram linked" : ", NO Instagram linked (Facebook only)"}.
- Posting: propose with social_posts.${b.metaInstagramUserId && !igFiles ? " Instagram can't fetch files from this server yet (needs Cloudflare R2 or a public domain) — say so if they want Instagram." : ""}
- Ads: ${!b.metaAdAccountId || !b.metaUserToken ? "no usable ad account — they must reconnect Meta with ads access. meta_ads must stay empty." : !store ? "the store has no public address yet, so an ad can't send people anywhere — they need their own domain (Settings > Domain). meta_ads must stay empty." : `propose with meta_ads. Budget is per day in the ad account's currency${last?.currency ? ` (${last.currency})` : ` (probably ${b.storeCurrency?.toUpperCase() ?? "the store currency"})`}. Ads are built PAUSED; the owner activates them in Ads.`}`;
}
