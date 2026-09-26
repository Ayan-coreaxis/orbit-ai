import { prisma } from "@/lib/prisma";

/**
 * Public addresses — what Meta (Instagram, ads) and customers can actually open.
 * The app's own address is NEXT_PUBLIC_APP_URL; a seller's verified custom domain wins for
 * their store. Files are public when they live on R2, or on this server once it has a public URL.
 */

const PRIVATE_HOST = /^(localhost|0\.0\.0\.0|127\.|10\.|192\.168\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.|\[(::1|f[cd]))/i;

export function isPublicHttps(url: string | null | undefined): boolean {
  if (!url) return false;
  try {
    const u = new URL(url);
    return u.protocol === "https:" && !PRIVATE_HOST.test(u.hostname) && !u.hostname.endsWith(".local") && !u.hostname.endsWith(".internal");
  } catch {
    return false;
  }
}

export function appBaseUrl(): string {
  return (process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000").replace(/\/+$/, "");
}

/** Is Orbit itself reachable from the internet (deployed with https)? */
export function appIsPublic(): boolean {
  return isPublicHttps(appBaseUrl());
}

/** A stored file's public https URL, or null when Meta couldn't fetch it (local disk on a private server). */
export function publicFileUrl(url: string): string | null {
  if (/^https?:\/\//i.test(url)) return isPublicHttps(url) ? url : null;
  if (url.startsWith("/") && appIsPublic()) return `${appBaseUrl()}${url}`;
  return null;
}

export const NOT_PUBLIC_REASON =
  "Instagram and Meta ads fetch your photo or video from a public link, and this Orbit server isn't public yet. Connect Cloudflare R2 (Super Admin > Storage) or put Orbit on its public domain.";

/** The store's public address (its verified custom domain when it has one), plus an optional path. */
export async function storeUrl(businessId: string, path = ""): Promise<string> {
  const b = await prisma.business.findUnique({ where: { id: businessId }, select: { customDomain: true, customDomainStatus: true } });
  const clean = path && !path.startsWith("/") ? `/${path}` : path;
  if (b?.customDomain && b.customDomainStatus === "verified") return `https://${b.customDomain}${clean}`;
  return `${appBaseUrl()}/store/${businessId}${clean}`;
}

/** Same as storeUrl, but only when a customer on the internet could really open it. */
export async function publicStoreUrl(businessId: string, path = ""): Promise<string | null> {
  const url = await storeUrl(businessId, path);
  return isPublicHttps(url) ? url : null;
}

export const STORE_NOT_PUBLIC_REASON =
  "Your store doesn't have a public address yet, so an ad would send people nowhere. Connect your own domain (Settings > Domain) or put Orbit on its public domain first.";

export function withUtm(url: string, campaign: string, source = "meta", medium = "paid"): string {
  const u = new URL(url);
  u.searchParams.set("utm_source", source);
  u.searchParams.set("utm_medium", medium);
  u.searchParams.set("utm_campaign", campaign);
  return u.toString();
}
