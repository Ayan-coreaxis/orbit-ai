"use client";

import { useMemo, useRef, useState } from "react";
import { addToCart } from "../../app/store/cart-store";
import { money } from "@/lib/money";
import { comboKey, type OptionType } from "@/lib/variants";
import { Stars } from "./ProductReviews";
import { copyText, type WidgetCopyKey } from "@/lib/widget-copy";
import { flyToCart } from "@/lib/fly-to-cart";

export interface ProductWidgetVariant {
  id: string;
  label: string;
  options: Record<string, string>;
  price: number | null;
  stock: number;
  imageUrl: string | null;
}

export interface ProductWidgetData {
  id: string;
  name: string;
  price: number;
  stock: number;
  imageUrl: string | null;
  images: string[];
  descriptionHtml: string | null;
  optionTypes: OptionType[];
  variants: ProductWidgetVariant[];
}

/**
 * The working product block — gallery, options, price, quantity, add-to-cart, description.
 * Styled entirely through the store's `var(--od-*)` tokens so it sits inside whatever frame the
 * seller designed.
 */
export function ProductWidget({
  businessId,
  product,
  currency,
  rating,
  widgetCopy = {},
  widgetMotion = "standard",
}: {
  businessId: string;
  product: ProductWidgetData;
  currency?: string;
  rating?: { average: number; count: number };
  widgetCopy?: Partial<Record<WidgetCopyKey, string>>;
  widgetMotion?: string;
}) {
  const hasOpts = product.optionTypes.length > 0 && product.variants.length > 0;

  const [sel, setSel] = useState<Record<string, string>>({});
  const [active, setActive] = useState(0);
  const [qty, setQty] = useState(1);
  const [added, setAdded] = useState(false);
  const addBtnRef = useRef<HTMLButtonElement>(null);
  const [notifyEmail, setNotifyEmail] = useState("");
  const [notifyDone, setNotifyDone] = useState(false);
  const [zooming, setZooming] = useState(false);
  const [zoomPos, setZoomPos] = useState({ x: 50, y: 50 });

  const selected = useMemo(() => {
    if (!hasOpts) return null;
    if (product.optionTypes.some((t) => !sel[t.name])) return null;
    const key = comboKey(sel);
    return product.variants.find((v) => comboKey(v.options) === key) ?? null;
  }, [hasOpts, sel, product.optionTypes, product.variants]);

  const price = selected ? selected.price ?? product.price : product.price;
  const priceRange = useMemo(() => {
    if (!hasOpts) return null;
    const ps = product.variants.map((v) => v.price ?? product.price);
    const lo = Math.min(...ps);
    const hi = Math.max(...ps);
    return lo === hi ? null : { lo, hi };
  }, [hasOpts, product.variants, product.price]);

  const imgs = (() => {
    const base = product.images.length ? product.images : product.imageUrl ? [product.imageUrl] : [];
    if (selected?.imageUrl && !base.includes(selected.imageUrl)) return [selected.imageUrl, ...base];
    return base;
  })();

  // is a given option value still reachable given the other selections?
  function valueAvailable(typeName: string, value: string): boolean {
    return product.variants.some(
      (v) =>
        v.options[typeName] === value &&
        v.stock > 0 &&
        product.optionTypes.every((t) => t.name === typeName || !sel[t.name] || v.options[t.name] === sel[t.name]),
    );
  }

  function add() {
    if (hasOpts && !selected) return;
    addToCart(
      businessId,
      {
        productId: product.id,
        variantId: selected?.id ?? null,
        variantLabel: selected?.label ?? null,
        name: product.name,
        price,
        imageUrl: selected?.imageUrl ?? product.imageUrl,
      },
      qty,
    );
    flyToCart(addBtnRef.current, selected?.imageUrl ?? product.imageUrl, widgetMotion);
    setAdded(true);
    setTimeout(() => setAdded(false), 1600);
    fetch(`/api/store/${businessId}/event`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "add_to_cart", productId: product.id, referrer: document.referrer || undefined }),
      keepalive: true,
    }).catch(() => {});
  }

  const canBuy = hasOpts ? !!selected && selected.stock > 0 : product.stock > 0;
  const soldOut = hasOpts ? product.variants.every((v) => v.stock <= 0) : product.stock <= 0;
  const showNotify = soldOut || (hasOpts && !!selected && selected.stock <= 0);

  async function submitNotify() {
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(notifyEmail)) return;
    await fetch(`/api/store/${businessId}/stock-notify`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ productId: product.id, variantId: selected?.id ?? null, email: notifyEmail }),
    }).catch(() => {});
    setNotifyDone(true);
  }

  return (
    <div>
      <style>{`.od-pw{display:grid;gap:40px;grid-template-columns:1fr;align-items:start}
.od-pw>div:first-child{max-width:520px}
@media(min-width:820px){.od-pw{grid-template-columns:1fr 1fr}.od-pw>div:first-child{max-width:none}}
.od-opt{border:1px solid var(--od-border);background:var(--od-bg);color:var(--od-text);border-radius:calc(var(--od-radius)*.6);padding:8px 14px;font-size:13.5px;cursor:pointer}
.od-opt[aria-pressed="true"]{border-color:var(--od-accent);box-shadow:inset 0 0 0 1px var(--od-accent)}
.od-opt:disabled{opacity:.4;cursor:not-allowed;text-decoration:line-through}`}</style>
      <div className="od-pw">
        <div>
          {imgs[active] ? (
            <div
              style={{ position: "relative", overflow: "hidden", borderRadius: "var(--od-radius)", cursor: "zoom-in" }}
              onMouseMove={(e) => {
                const r = e.currentTarget.getBoundingClientRect();
                setZoomPos({ x: ((e.clientX - r.left) / r.width) * 100, y: ((e.clientY - r.top) / r.height) * 100 });
              }}
              onMouseEnter={() => setZooming(true)}
              onMouseLeave={() => setZooming(false)}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={imgs[active]}
                alt={product.name}
                style={{ width: "100%", aspectRatio: "1/1", objectFit: "cover", display: "block", background: "var(--od-surface)" }}
              />
              {zooming && (
                <div
                  aria-hidden
                  style={{
                    position: "absolute",
                    inset: 0,
                    backgroundImage: `url(${imgs[active]})`,
                    backgroundSize: "220%",
                    backgroundPosition: `${zoomPos.x}% ${zoomPos.y}%`,
                    backgroundRepeat: "no-repeat",
                    pointerEvents: "none",
                  }}
                />
              )}
            </div>
          ) : (
            <div style={{ width: "100%", aspectRatio: "1/1", borderRadius: "var(--od-radius)", background: "var(--od-surface)", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--od-muted)", fontSize: 13 }}>
              No photo yet
            </div>
          )}
          {imgs.length > 1 && (
            <div style={{ display: "flex", gap: 10, marginTop: 12, flexWrap: "wrap" }}>
              {imgs.map((src, i) => (
                <button
                  key={i}
                  onClick={() => setActive(i)}
                  style={{ padding: 0, border: i === active ? "2px solid var(--od-accent)" : "1px solid var(--od-border)", borderRadius: "calc(var(--od-radius)*.5)", background: "none", cursor: "pointer" }}
                  aria-label={`View image ${i + 1}`}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={src} alt="" style={{ width: 60, height: 60, objectFit: "cover", borderRadius: "calc(var(--od-radius)*.5 - 1px)", display: "block" }} />
                </button>
              ))}
            </div>
          )}
        </div>

        <div>
          <h1 style={{ fontFamily: "var(--od-font-heading)", fontWeight: "var(--od-heading-weight)" as unknown as number, fontSize: "clamp(24px,4vw,34px)", margin: 0, color: "var(--od-text)" }}>
            {product.name}
          </h1>
          {rating && (
            <a href="#reviews" style={{ display: "inline-flex", alignItems: "center", gap: 6, marginTop: 8, textDecoration: "none", color: "var(--od-muted)", fontSize: 13 }}>
              <Stars value={rating.average} size={14} />
              {rating.average.toFixed(1)} ({rating.count})
            </a>
          )}
          <div style={{ fontSize: 20, margin: "14px 0", color: "var(--od-text)" }}>
            {selected || !priceRange ? money(price, currency) : `${money(priceRange.lo, currency)} – ${money(priceRange.hi, currency)}`}
          </div>

          {/* option selectors */}
          {hasOpts && (
            <div style={{ display: "grid", gap: 14, marginBottom: 18 }}>
              {product.optionTypes.map((t) => (
                <div key={t.name}>
                  <div style={{ fontSize: 13, color: "var(--od-muted)", marginBottom: 6 }}>
                    {t.name}
                    {sel[t.name] ? `: ${sel[t.name]}` : ""}
                  </div>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    {t.values.map((v) => (
                      <button
                        key={v}
                        type="button"
                        className="od-opt"
                        aria-pressed={sel[t.name] === v}
                        disabled={!valueAvailable(t.name, v)}
                        onClick={() => setSel((s) => ({ ...s, [t.name]: s[t.name] === v ? "" : v }))}
                      >
                        {v}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}

          {showNotify ? (
            notifyDone ? (
              <p style={{ color: "var(--od-muted)", fontSize: 14 }}>{copyText("product.notifyThanks", widgetCopy)}</p>
            ) : (
              <div>
                <p style={{ color: "var(--od-muted)", fontSize: 14, margin: "0 0 8px" }}>
                  {selected ? `${selected.label} is sold out.` : "Currently sold out."} Get an email when it&apos;s back:
                </p>
                <div style={{ display: "flex", gap: 8, maxWidth: 340 }}>
                  <input
                    type="email"
                    placeholder="you@email.com"
                    value={notifyEmail}
                    onChange={(e) => setNotifyEmail(e.target.value)}
                    style={{ flex: 1, border: "1px solid var(--od-border)", borderRadius: "calc(var(--od-radius)*.6)", padding: "9px 12px", fontSize: 14, background: "var(--od-bg)", color: "var(--od-text)" }}
                  />
                  <button
                    onClick={submitNotify}
                    style={{ background: "var(--od-accent)", color: "var(--od-accent-text)", border: "none", borderRadius: "var(--od-radius)", padding: "9px 16px", fontSize: 14, fontWeight: 600, cursor: "pointer" }}
                  >
                    {copyText("product.notifyMe", widgetCopy)}
                  </button>
                </div>
              </div>
            )
          ) : (
            <>
              <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
                <div style={{ display: "flex", alignItems: "center", border: "1px solid var(--od-border)", borderRadius: "var(--od-radius)" }}>
                  <button aria-label="Decrease quantity" onClick={() => setQty((q) => Math.max(1, q - 1))} style={stepBtn}>−</button>
                  <span style={{ minWidth: 28, textAlign: "center", fontSize: 15 }}>{qty}</span>
                  <button aria-label="Increase quantity" onClick={() => setQty((q) => q + 1)} style={stepBtn}>+</button>
                </div>
                <button
                  ref={addBtnRef}
                  data-od-ripple
                  onClick={add}
                  disabled={!canBuy}
                  style={{
                    background: "var(--od-accent)",
                    color: "var(--od-accent-text)",
                    border: "none",
                    borderRadius: "var(--od-radius)",
                    padding: "12px 26px",
                    fontSize: 15,
                    fontWeight: 600,
                    cursor: canBuy ? "pointer" : "not-allowed",
                    opacity: canBuy ? 1 : 0.5,
                    transition: "transform .15s cubic-bezier(.34,1.56,.64,1)",
                    transform: added ? "scale(1.04)" : "scale(1)",
                  }}
                >
                  {added
                    ? copyText("product.added", widgetCopy)
                    : hasOpts && !selected
                      ? copyText("product.selectOptions", widgetCopy)
                      : copyText("product.addToCart", widgetCopy)}
                </button>
              </div>
              {hasOpts && selected && selected.stock <= 5 && selected.stock > 0 && (
                <p style={{ fontSize: 12.5, color: "var(--od-muted)", marginTop: 8 }}>Only {selected.stock} left in {selected.label}</p>
              )}
              {hasOpts && selected && selected.stock <= 0 && (
                <p style={{ fontSize: 12.5, color: "var(--od-muted)", marginTop: 8 }}>{selected.label} is out of stock</p>
              )}
              {!hasOpts && product.stock <= 5 && product.stock > 0 && (
                <p style={{ fontSize: 12.5, color: "var(--od-accent)", marginTop: 8 }}>Only {product.stock} left — order soon</p>
              )}
            </>
          )}

          {product.descriptionHtml && (
            <div
              style={{ marginTop: 24, color: "var(--od-muted)", fontSize: 15, lineHeight: 1.7 }}
              dangerouslySetInnerHTML={{ __html: product.descriptionHtml }}
            />
          )}
        </div>
      </div>
    </div>
  );
}

const stepBtn: React.CSSProperties = { background: "transparent", border: "none", fontSize: 18, padding: "8px 14px", cursor: "pointer", color: "inherit" };
