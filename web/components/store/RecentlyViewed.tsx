"use client";

import { useEffect, useMemo, useSyncExternalStore } from "react";
import { money } from "@/lib/money";

interface Item {
  id: string;
  name: string;
  price: number;
  imageUrl: string | null;
}

const KEY = (b: string) => `od_recent_${b}`;
const MAX = 8;

const noSubscribe = () => () => {};

function readRaw(businessId: string): string {
  try {
    return localStorage.getItem(KEY(businessId)) || "[]";
  } catch {
    return "[]";
  }
}

function parse(raw: string): Item[] {
  try {
    const v = JSON.parse(raw);
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

/** Records the current product into a per-browser "recently viewed" list, and renders the rest. */
export function RecentlyViewed({
  businessId,
  current,
  currency,
}: {
  businessId: string;
  current?: Item;
  currency?: string;
}) {
  // Read this browser's list (empty on the server), and record the current product after render.
  const raw = useSyncExternalStore(noSubscribe, () => readRaw(businessId), () => "[]");
  const items = useMemo(() => parse(raw).filter((x) => !current || x.id !== current.id).slice(0, 6), [raw, current]);

  useEffect(() => {
    if (!current) return;
    const list = [current, ...parse(readRaw(businessId)).filter((x) => x.id !== current.id)].slice(0, MAX);
    try {
      localStorage.setItem(KEY(businessId), JSON.stringify(list));
    } catch {
      /* ignore */
    }
  }, [businessId, current]);

  if (items.length < 2) return null;

  return (
    <section style={{ maxWidth: 1200, margin: "0 auto", padding: "calc(40px * var(--od-density, 1)) var(--od-gutter, 24px)" }}>
      <h2 style={{ fontFamily: "var(--od-font-heading)", fontSize: "var(--od-text-xl, 1.25rem)", margin: "0 0 16px" }}>Recently viewed</h2>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))", gap: 16 }}>
        {items.map((p) => (
          <a key={p.id} href={`/store/${businessId}/product/${p.id}`} style={{ textDecoration: "none", color: "inherit", minWidth: 0 }}>
            <div style={{ width: "100%", height: "clamp(130px, 16vw, 180px)", overflow: "hidden", borderRadius: "var(--od-radius, 10px)", background: "var(--od-surface, #f4f4f4)" }}>
              {p.imageUrl && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={p.imageUrl} alt={p.name} style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
              )}
            </div>
            <div style={{ marginTop: 8, fontSize: 13, fontWeight: 500 }}>{p.name}</div>
            <div style={{ fontSize: 12.5, color: "var(--od-muted)" }}>{money(p.price, currency)}</div>
          </a>
        ))}
      </div>
    </section>
  );
}
