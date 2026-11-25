import type { Metadata } from "next";
import { prisma } from "@/lib/prisma";
import { isSystemPage, manifest } from "@/lib/store-site";
import { loadSite, siteData } from "@/lib/store-site-data";
import { StoreAnalyticsBeacon } from "@/components/store/StoreAnalyticsBeacon";
import { StoreChat } from "@/app/store/StoreChat";
import { CartSync } from "@/components/store/CartSync";
import { pageWords } from "@/lib/store-site-serve";
import { storeUrl } from "@/lib/public-url";
import type { SiteData, StoreSite } from "@/lib/store-site";
import { LiveSite } from "./SiteFrame";

const HEX = /^#[0-9a-f]{3,8}$/i;

/** The live page of an agent-built store, or null when this store wasn't built that way / has no such page. */
export async function SiteShell({ businessId, slug, productId = null, orderId = null }: { businessId: string; slug: string; productId?: string | null; orderId?: string | null }) {
  const { live, published } = await loadSite(businessId);
  if (!live || !published) return null;
  const m = manifest(live);
  if (!isSystemPage(slug) && !m.pages.some((p) => p.slug === slug)) return null;
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
  return (
    <>
      <LiveSite businessId={businessId} storeName={data.store.name} slug={slug} productId={productId} orderId={orderId} pages={m.pages.map((p) => p.slug)} products={data.products} bg={c("bg", "#ffffff")} />
      {!isSystemPage(slug) && <SeoText businessId={businessId} site={live} slug={slug} productId={productId} data={data} />}
      <CartSync businessId={businessId} />
      {!isSystemPage(slug) && <StoreAnalyticsBeacon businessId={businessId} type={productId ? "view_product" : "view_store"} productId={productId ?? undefined} />}
      <StoreChat businessId={businessId} storeName={data.store.name} vars={vars} />
    </>
  );
}

/**
 * The store is shown in a frame, which search engines read poorly. The same page's own words, its
 * products and its structured data are here as plain HTML, under the frame and out of the tab order.
 */
async function SeoText({ businessId, site, slug, productId, data }: { businessId: string; site: StoreSite; slug: string; productId: string | null; data: SiteData }) {
  const base = await storeUrl(businessId);
  const m = manifest(site);
  const abs = (u: string) => (/^https?:/.test(u) ? u : new URL(u, base).href);
  const p = productId ? data.products.find((x) => x.id === productId) : null;
  const ld = p
    ? {
        "@context": "https://schema.org",
        "@type": "Product",
        name: p.name,
        description: p.description.replace(/<[^>]+>/g, " ").trim().slice(0, 500) || undefined,
        image: p.images.slice(0, 5).map(abs),
        ...(p.rating ? { aggregateRating: { "@type": "AggregateRating", ratingValue: p.rating.average, reviewCount: p.rating.count } } : {}),
        offers: { "@type": "Offer", url: `${base}/product/${p.id}`, priceCurrency: data.store.currency.toUpperCase(), price: p.fromPrice ?? p.price, availability: `https://schema.org/${p.stock > 0 ? "InStock" : "OutOfStock"}` },
      }
    : slug === "home"
      ? { "@context": "https://schema.org", "@type": "OnlineStore", name: data.store.name, url: base, sameAs: Object.values(data.store.socials).filter((x) => /^https?:/.test(x)) }
      : null;
  const words = p ? [] : pageWords(site, slug);
  return (
    <>
      {ld && <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(ld).replace(/</g, "\\u003c") }} />}
      <div aria-hidden style={{ height: 0, overflow: "hidden" }}>
        {p ? (
          <article>
            <h1>{p.name}</h1>
            <p>{data.store.currency.toUpperCase()} {p.fromPrice ?? p.price}</p>
            <div dangerouslySetInnerHTML={{ __html: p.description }} />
          </article>
        ) : (
          words.map((w, i) => <w.tag key={i}>{w.text}</w.tag>)
        )}
        <nav>
          {m.pages.filter((x) => x.slug !== "product").map((x) => (
            <a key={x.slug} tabIndex={-1} href={x.slug === "home" ? base : `${base}/p/${x.slug}`}>{x.title}</a>
          ))}
        </nav>
        <ul>
          {data.products.map((x) => (
            <li key={x.id}>
              <a tabIndex={-1} href={`${base}/product/${x.id}`}>{x.name}</a>
            </li>
          ))}
        </ul>
      </div>
    </>
  );
}

export async function siteMeta(businessId: string, slug: string): Promise<Metadata | null> {
  const { live, published } = await loadSite(businessId);
  if (!live || !published) return null;
  const m = manifest(live);
  const page = m.pages.find((p) => p.slug === slug);
  if (!page) return null;
  const [b, base] = await Promise.all([prisma.business.findUnique({ where: { id: businessId }, select: { name: true, niche: true } }), storeUrl(businessId)]);
  const words = pageWords(live, slug);
  const description = (slug === "home" ? (m.tagline ?? b?.niche) : undefined) ?? words.find((w) => w.tag === "p" && w.text.length > 40)?.text.slice(0, 160) ?? b?.niche;
  const url = slug === "home" ? base : `${base}/p/${slug}`;
  const title = slug === "home" ? (b?.name ?? "Store") : page.title;
  return { title: slug === "home" ? { absolute: title } : title, description, alternates: { canonical: url }, openGraph: { title, description, url, type: "website" } };
}
