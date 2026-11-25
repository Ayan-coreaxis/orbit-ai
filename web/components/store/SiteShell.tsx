import type { Metadata } from "next";
import { prisma } from "@/lib/prisma";
import { manifest } from "@/lib/store-site";
import { loadSite, siteData } from "@/lib/store-site-data";
import { StoreAnalyticsBeacon } from "@/components/store/StoreAnalyticsBeacon";
import { StoreChat } from "@/app/store/StoreChat";
import { LiveSite } from "./SiteFrame";

const HEX = /^#[0-9a-f]{3,8}$/i;

/** The live page of an agent-built store, or null when this store wasn't built that way / has no such page. */
export async function SiteShell({ businessId, slug, productId = null }: { businessId: string; slug: string; productId?: string | null }) {
  const { live, published } = await loadSite(businessId);
  if (!live || !published) return null;
  const m = manifest(live);
  if (!m.pages.some((p) => p.slug === slug)) return null;
  const data = await siteData(businessId);
  if (!data) return null;
  const c = (k: "bg" | "surface" | "text" | "muted" | "border" | "accent" | "accentText", or: string) => {
    const v = m.theme[k];
    return typeof v === "string" && HEX.test(v) ? v : or;
  };
  const vars = {
    "--od-bg": c("bg", "#ffffff"),
    "--od-surface": c("surface", "#f6f6f6"),
    "--od-text": c("text", "#111111"),
    "--od-muted": c("muted", "#666666"),
    "--od-border": c("border", "#e5e5e5"),
    "--od-accent": c("accent", "#111111"),
    "--od-accent-text": c("accentText", "#ffffff"),
    "--od-radius": `${Number(m.theme.radius) || 10}px`,
    "--od-font-body": "system-ui, sans-serif",
  } as React.CSSProperties;
  const money = data.store.currency.toUpperCase();
  return (
    <>
      <LiveSite businessId={businessId} storeName={data.store.name} slug={slug} productId={productId} pages={m.pages.map((p) => p.slug)} products={data.products} bg={c("bg", "#ffffff")} />
      {/* The store itself is in a frame; this is the same catalogue as plain text for search engines and readers without scripts. */}
      <noscript>
        <h1>{data.store.name}</h1>
        <ul>
          {data.products.map((p) => (
            <li key={p.id}>
              <a href={`/store/${businessId}/product/${p.id}`}>{p.name}</a> {money} {p.fromPrice ?? p.price}
            </li>
          ))}
        </ul>
      </noscript>
      <StoreAnalyticsBeacon businessId={businessId} type={productId ? "view_product" : "view_store"} productId={productId ?? undefined} />
      <StoreChat businessId={businessId} storeName={data.store.name} vars={vars} />
    </>
  );
}

export async function siteMeta(businessId: string, slug: string): Promise<Metadata | null> {
  const { live, published } = await loadSite(businessId);
  if (!live || !published) return null;
  const m = manifest(live);
  const page = m.pages.find((p) => p.slug === slug);
  if (!page) return null;
  const b = await prisma.business.findUnique({ where: { id: businessId }, select: { name: true, niche: true } });
  return slug === "home" ? { title: { absolute: b?.name ?? "Store" }, description: m.tagline ?? b?.niche } : { title: page.title };
}
