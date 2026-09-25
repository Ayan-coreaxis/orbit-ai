import type { ProductReviewSummary } from "@/lib/product-reviews";

/** Star row + review list, rendered in the storefront's design tokens. */
export function Stars({ value, size = 15 }: { value: number; size?: number }) {
  return (
    <span style={{ display: "inline-flex", gap: 1, verticalAlign: "middle" }} aria-label={`${value} out of 5`}>
      {[1, 2, 3, 4, 5].map((i) => (
        <svg key={i} width={size} height={size} viewBox="0 0 24 24" aria-hidden>
          <path
            d="M12 2l2.9 6.3 6.9.8-5.1 4.7 1.3 6.8L12 17.8 5.9 21l1.3-6.8L2.2 9.5l6.9-.8z"
            fill={i <= Math.round(value) ? "var(--od-accent)" : "var(--od-border)"}
          />
        </svg>
      ))}
    </span>
  );
}

export function ProductReviews({ summary }: { summary: ProductReviewSummary }) {
  if (summary.count === 0) return null;
  return (
    <section id="reviews" style={{ maxWidth: 1200, margin: "0 auto", padding: "calc(48px * var(--od-density, 1)) var(--od-gutter, 24px)", scrollMarginTop: 80 }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 12, marginBottom: 20 }}>
        <h2 style={{ fontFamily: "var(--od-font-heading)", fontSize: "var(--od-text-2xl, 1.5rem)", margin: 0 }}>Reviews</h2>
        <Stars value={summary.average} />
        <span style={{ fontSize: 14, color: "var(--od-muted)" }}>
          {summary.average.toFixed(1)} · {summary.count} review{summary.count === 1 ? "" : "s"}
        </span>
      </div>
      <div style={{ display: "grid", gap: 18, maxWidth: 720 }}>
        {summary.items.map((r, i) => (
          <div key={i} style={{ borderTop: "1px solid var(--od-border)", paddingTop: 14 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <Stars value={r.rating} size={13} />
              <span style={{ fontSize: 12, color: "var(--od-muted)" }}>
                {new Date(r.date).toLocaleDateString(undefined, { month: "short", year: "numeric" })}
              </span>
            </div>
            {r.title && <div style={{ fontSize: 14, fontWeight: 600, marginTop: 6 }}>{r.title}</div>}
            {r.body && <p style={{ fontSize: 14, color: "var(--od-muted)", margin: "6px 0 0", lineHeight: 1.6 }}>{r.body}</p>}
            <div style={{ fontSize: 12.5, color: "var(--od-muted)", marginTop: 6 }}>{r.name}</div>
          </div>
        ))}
      </div>
    </section>
  );
}
