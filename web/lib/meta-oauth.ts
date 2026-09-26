import crypto from "crypto";

// v19.0 expired 2026-05-21 — keep this on a live version (see developers.facebook.com/docs/graph-api/changelog/versions).
const GRAPH_VERSION = "v26.0";
// META_GRAPH_BASE only exists so tests can point Orbit at a fake Graph API.
const GRAPH_BASE = process.env.META_GRAPH_BASE?.replace(/\/+$/, "") || `https://graph.facebook.com/${GRAPH_VERSION}`;
/** Video uploads go to Meta's upload host. */
const GRAPH_VIDEO_BASE = process.env.META_GRAPH_BASE?.replace(/\/+$/, "") || `https://graph-video.facebook.com/${GRAPH_VERSION}`;

/**
 * Real permissions requested. `instagram_content_publish` + `pages_manage_posts` let the
 * Content Agent actually post; `ads_management` lets the Ads Agent actually run campaigns.
 * Meta requires App Review before these work for anyone other than the app's own test users —
 * that's a real, external approval process this code can't skip.
 */
const SCOPES = [
  "pages_show_list",
  "pages_read_engagement",
  "pages_manage_posts",
  "instagram_basic",
  "instagram_content_publish",
  "ads_management",
  "ads_read",
  "business_management", // Pages / ad accounts owned by a Business portfolio need this
  "pages_messaging", // the store chatbot answers Messenger DMs
  "pages_manage_metadata", // subscribe the Page so its DMs reach Orbit
  "instagram_manage_messages", // …and Instagram DMs
].join(",");

/** The permissions each Orbit feature needs — the connection check reports what's missing. */
export const NEEDED_PERMISSIONS: Record<string, string[]> = {
  "Post to Facebook": ["pages_show_list", "pages_manage_posts"],
  "Post to Instagram": ["instagram_basic", "instagram_content_publish"],
  "Run Meta ads": ["ads_management"],
  "Read ad results": ["ads_read"],
  "Answer Messenger DMs": ["pages_messaging", "pages_manage_metadata"],
  "Answer Instagram DMs": ["instagram_manage_messages"],
};

function getAppCredentials(): { appId: string; appSecret: string } | null {
  const appId = process.env.META_APP_ID;
  const appSecret = process.env.META_APP_SECRET;
  if (!appId || !appSecret || appId === "paste_your_key_here" || appSecret === "paste_your_key_here") return null;
  return { appId, appSecret };
}

export function isMetaAppConfigured(): boolean {
  return getAppCredentials() !== null;
}

function getRedirectUri(): string {
  const base = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  return `${base}/api/oauth/meta/callback`;
}

/** Signs businessId into the OAuth `state` param so the callback can't be tricked into connecting the wrong business. */
function signState(businessId: string): string {
  const secret = process.env.AUTH_SECRET ?? "";
  const signature = crypto.createHmac("sha256", secret).update(businessId).digest("hex");
  return Buffer.from(`${businessId}.${signature}`).toString("base64url");
}

export function verifyState(state: string): string | null {
  try {
    const secret = process.env.AUTH_SECRET ?? "";
    const decoded = Buffer.from(state, "base64url").toString("utf-8");
    const [businessId, signature] = decoded.split(".");
    if (!businessId || !signature) return null;
    const expected = crypto.createHmac("sha256", secret).update(businessId).digest("hex");
    const a = Buffer.from(signature);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
    return businessId;
  } catch {
    return null;
  }
}

export function buildMetaAuthUrl(businessId: string): string | null {
  const creds = getAppCredentials();
  if (!creds) return null;
  const params = new URLSearchParams({
    client_id: creds.appId,
    redirect_uri: getRedirectUri(),
    state: signState(businessId),
    response_type: "code",
  });
  // Apps created with the "Facebook Login for Business" use cases grant permissions through a
  // Configuration (Facebook Login for Business → Configurations) instead of a raw `scope` list.
  const configId = process.env.META_LOGIN_CONFIG_ID;
  if (configId && configId !== "paste_your_key_here") params.set("config_id", configId);
  else params.set("scope", SCOPES);
  return `https://www.facebook.com/${GRAPH_VERSION}/dialog/oauth?${params.toString()}`;
}

interface TokenResponse {
  access_token: string;
  token_type?: string;
  expires_in?: number;
}

export async function exchangeCodeForToken(code: string): Promise<string> {
  const creds = getAppCredentials();
  if (!creds) throw new Error("Meta App isn't configured.");
  const params = new URLSearchParams({
    client_id: creds.appId,
    client_secret: creds.appSecret,
    redirect_uri: getRedirectUri(),
    code,
  });
  const res = await fetch(`${GRAPH_BASE}/oauth/access_token?${params.toString()}`);
  if (!res.ok) throw new Error(`Meta token exchange failed: ${await res.text()}`);
  const data = (await res.json()) as TokenResponse;
  return data.access_token;
}

/** A short-lived user token is only valid ~1-2 hours — exchange it for a real long-lived one (~60 days). */
export async function exchangeForLongLivedToken(shortToken: string): Promise<string> {
  return (await exchangeForLongLived(shortToken)).token;
}

export async function exchangeForLongLived(shortToken: string): Promise<{ token: string; expiresAt: Date | null }> {
  const creds = getAppCredentials();
  if (!creds) throw new Error("Meta App isn't configured.");
  const params = new URLSearchParams({
    grant_type: "fb_exchange_token",
    client_id: creds.appId,
    client_secret: creds.appSecret,
    fb_exchange_token: shortToken,
  });
  const res = await fetch(`${GRAPH_BASE}/oauth/access_token?${params.toString()}`);
  if (!res.ok) throw new Error(`Meta long-lived token exchange failed: ${await res.text()}`);
  const data = (await res.json()) as TokenResponse;
  return { token: data.access_token, expiresAt: data.expires_in ? new Date(Date.now() + data.expires_in * 1000) : null };
}

export interface ConnectedPage {
  id: string;
  name: string;
  access_token: string;
  instagram_business_account?: { id: string };
}

/** Real Pages the connected user manages, with each Page's own real access token and linked IG account if any. */
export async function getManagedPages(userAccessToken: string): Promise<ConnectedPage[]> {
  const params = new URLSearchParams({
    access_token: userAccessToken,
    fields: "id,name,access_token,instagram_business_account",
  });
  const res = await fetch(`${GRAPH_BASE}/me/accounts?${params.toString()}`);
  if (!res.ok) throw new Error(`Fetching Pages failed: ${await res.text()}`);
  const data = (await res.json()) as { data: ConnectedPage[] };
  return data.data ?? [];
}

/** Real ad accounts the connected user has access to — null-safe, only present if ads_management was granted and approved. */
export async function getAdAccounts(userAccessToken: string): Promise<AdAccountInfo[]> {
  const params = new URLSearchParams({ access_token: userAccessToken, fields: "id,name,currency,account_status" });
  const res = await fetch(`${GRAPH_BASE}/me/adaccounts?${params.toString()}`);
  if (!res.ok) return [];
  const data = (await res.json()) as { data: AdAccountInfo[] };
  // Active accounts first — account_status 1 = ACTIVE.
  return (data.data ?? []).sort((a, b) => Number(b.account_status === 1) - Number(a.account_status === 1));
}

export type AdAccountInfo = { id: string; name: string; currency?: string; account_status?: number };

export { GRAPH_BASE, GRAPH_VIDEO_BASE };
