import { money } from "@/lib/money";
import type { RelatedProduct } from "@/lib/personalization";

/**
 * "You may also like" — real co-view recommendations from `getRelatedProducts`. Rendered in the
 * storefront's own design tokens so it sits naturally under whatever product page was designed.
 */
export function RelatedProducts({
  businessId,
  items,
  currency,
}: {
  businessId: string;
  items: RelatedProduct[];
  currency?: string;
}) {
  return (
    <section
      style={{
        maxWidth: 1200,
        margin: "0 auto",
        padding: "calc(56px * var(--od-density, 1)) var(--od-gutter, 24px)",
      }}
    >
      <h2 style={{ fontFamily: "var(--od-font-heading)", fontSize: "var(--od-text-2xl, 1.5rem)", margin: "0 0 20px" }}>
        You may also like
      </h2>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))",
          gap: 20,
          alignItems: "start",
        }}
      >
        {items.map((p) => (
          <a
            key={p.id}
            href={`/store/${businessId}/product/${p.id}`}
            style={{ textDecoration: "none", color: "inherit", display: "block", minWidth: 0 }}
          >
            <div
              style={{
                width: "100%",
                height: "clamp(160px, 20vw, 220px)",
                overflow: "hidden",
                borderRadius: "var(--od-radius, 10px)",
                background: "var(--od-surface, #f4f4f4)",
              }}
            >
              {p.imageUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={p.imageUrl} alt={p.name} style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
              ) : null}
            </div>
            <div style={{ marginTop: 10, fontSize: 14, fontWeight: 500 }}>{p.name}</div>
            <div style={{ fontSize: 13, color: "var(--od-muted, #666)" }}>{money(p.price, currency)}</div>
          </a>
        ))}
      </div>
    </section>
  );
}
