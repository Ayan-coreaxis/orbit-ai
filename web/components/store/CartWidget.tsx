"use client";

import { firePixel } from "@/lib/pixel-client";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { CART_EVENT, clearCart, lineKey, readCart, setQty, type CartLine } from "../../app/store/cart-store";
import { money } from "@/lib/money";
import { AuthWidget } from "./AuthWidget";
import { WidgetStyles, Tick, SuccessOverlay, MOTION_DURATION_MS } from "./widget-ui";
import { copyText, type WidgetCopyKey } from "@/lib/widget-copy";
import type { CheckoutCustomField } from "@/lib/checkout-fields";

/**
 * The working cart + checkout block — Bag → Checkout in two light steps, with a live totals
 * summary (subtotal, coupon, delivery, total) and a payment choice (cash on delivery and/or
 * card via the seller's own Stripe). Token-styled so it drops into whatever cart page the
 * seller designed; the design owns the heading / trust copy / layout around it.
 */

interface SavedAddress {
  id: string;
  label: string | null;
  name: string;
  phone: string;
  line1: string;
  city: string;
  area: string | null;
  postalCode: string | null;
  isDefault: boolean;
}

interface Quote {
  subtotal: number;
  discount: number;
  couponCode: string | null;
  couponLabel: string | null;
  shipping: number;
  freeShipping: boolean;
  tax: number;
  taxLabel: string;
  giftCardCode: string | null;
  giftCardDiscount: number;
  loyaltyPointsRedeemed: number;
  loyaltyDiscount: number;
  bundleDiscount: number;
  shippingZoneName: string | null;
  total: number;
}

interface LoyaltyInfo {
  enabled: boolean;
  signedIn: boolean;
  points: number;
  redeemRate: number;
  minRedeem: number;
}

function newClientToken(): string {
  // randomUUID needs a secure context (https / localhost); fall back so http custom domains still work.
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}${Math.random().toString(36).slice(2)}`;
}

export function CartWidget({
  businessId,
  storeName,
  currency,
  widgetCopy = {},
  widgetMotion = "standard",
  checkoutCustomFields = [],
}: {
  businessId: string;
  storeName: string;
  currency?: string;
  widgetCopy?: Partial<Record<WidgetCopyKey, string>>;
  widgetMotion?: string;
  checkoutCustomFields?: CheckoutCustomField[];
}) {
  const router = useRouter();
  const [lines, setLines] = useState<CartLine[]>([]);
  const [step, setStep] = useState<"bag" | "account" | "checkout">("bag");
  const [auth, setAuth] = useState<{ mode: "otp" | "password" | "none" | "both"; enabled: boolean; signedIn: boolean }>({
    mode: "both",
    enabled: true,
    signedIn: false,
  });
  const [form, setForm] = useState({
    customerName: "",
    customerPhone: "",
    customerEmail: "",
    line1: "",
    city: "",
    area: "",
    postalCode: "",
  });
  const [couponInput, setCouponInput] = useState("");
  const [couponMsg, setCouponMsg] = useState<string | null>(null);
  const [giftCardInput, setGiftCardInput] = useState("");
  const [giftCardApplied, setGiftCardApplied] = useState("");
  const [giftCardMsg, setGiftCardMsg] = useState<string | null>(null);
  const [loyalty, setLoyalty] = useState<LoyaltyInfo | null>(null);
  const [useLoyalty, setUseLoyalty] = useState(false);
  const [loyaltyPointsInput, setLoyaltyPointsInput] = useState("");
  const [quote, setQuote] = useState<Quote | null>(null);
  const [options, setOptions] = useState<("cod" | "stripe")[]>(["cod"]);
  const [payment, setPayment] = useState<"cod" | "stripe">("cod");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [placed, setPlaced] = useState<null | { needsVerify: boolean }>(null);
  const [customFieldValues, setCustomFieldValues] = useState<Record<string, string | boolean>>({});
  const [showSuccess, setShowSuccess] = useState(false);
  const [savedAddresses, setSavedAddresses] = useState<SavedAddress[]>([]);
  const [addrChoice, setAddrChoice] = useState<string>(""); // "" = new address, else an address id
  const prefilled = useRef(false);
  const [reloadMe, setReloadMe] = useState(0);
  // One id per checkout attempt, so a double-submitted order is only created once.
  const [clientToken] = useState(newClientToken);

  const items = useMemo(
    () =>
      lines.map((l) =>
        l.bundleId
          ? { bundleId: l.bundleId, qty: l.qty }
          : { productId: l.productId, variantId: l.variantId ?? undefined, qty: l.qty },
      ),
    [lines],
  );
  const rawTotal = lines.reduce((s, l) => s + l.qty * l.price, 0);

  useEffect(() => {
    const sync = () => setLines(readCart(businessId));
    sync();
    window.addEventListener(CART_EVENT, sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(CART_EVENT, sync);
      window.removeEventListener("storage", sync);
    };
  }, [businessId]);

  // signed-in shopper: prefill name/phone/email + saved addresses, default one selected
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const meRes = await fetch(`/api/store/${businessId}/auth/me`).then((r) => r.json());
        if (!alive) return;
        setAuth({
          mode: meRes?.authMode ?? "both",
          enabled: meRes?.methods?.enabled !== false,
          signedIn: !!meRes?.customer,
        });
        if (!meRes?.customer) return;
        const c = meRes.customer as { name: string; email: string | null; phone: string | null };
        const addrs: SavedAddress[] = await fetch(`/api/store/${businessId}/account/addresses`)
          .then((r) => r.json())
          .then((d) => (Array.isArray(d.addresses) ? d.addresses : []))
          .catch(() => []);
        if (!alive) return;
        setSavedAddresses(addrs);
        if (prefilled.current) return;
        prefilled.current = true;
        const def = addrs.find((a) => a.isDefault) ?? addrs[0];
        setForm((f) => ({
          ...f,
          customerName: f.customerName || def?.name || c.name || "",
          customerPhone: f.customerPhone || def?.phone || c.phone || "",
          customerEmail: f.customerEmail || c.email || "",
          line1: f.line1 || def?.line1 || "",
          city: f.city || def?.city || "",
          area: f.area || def?.area || "",
          postalCode: f.postalCode || def?.postalCode || "",
        }));
        if (def) setAddrChoice(def.id);
      } catch {
        /* guest checkout — no prefill */
      }
    })();
    return () => {
      alive = false;
    };
  }, [businessId, reloadMe]);

  function chooseAddress(id: string) {
    setAddrChoice(id);
    if (!id) return; // "Use a new address" — leave fields as-is
    const a = savedAddresses.find((x) => x.id === id);
    if (!a) return;
    setForm((f) => ({
      ...f,
      customerName: a.name,
      customerPhone: a.phone,
      line1: a.line1,
      city: a.city,
      area: a.area ?? "",
      postalCode: a.postalCode ?? "",
    }));
  }

  // payment methods + shipping rule
  useEffect(() => {
    fetch(`/api/store/${businessId}/checkout/options`)
      .then((r) => r.json())
      .then((d) => {
        if (Array.isArray(d.options) && d.options.length) {
          setOptions(d.options);
          setPayment(d.options[0]);
        }
      })
      .catch(() => {});
  }, [businessId]);

  // loyalty balance, so the "use my points" control knows what's available
  useEffect(() => {
    fetch(`/api/store/${businessId}/loyalty`)
      .then((r) => r.json())
      .then((d) => setLoyalty(d as LoyaltyInfo))
      .catch(() => {});
  }, [businessId, reloadMe]);

  const requestedPoints = useLoyalty ? Math.max(0, Math.floor(Number(loyaltyPointsInput) || 0)) : 0;

  // recompute the quote whenever the cart, applied coupon, gift card, requested points, or city change
  const applied = quote?.couponCode ?? "";
  useEffect(() => {
    if (lines.length === 0) return;
    fetch(`/api/store/${businessId}/coupon`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        items,
        code: applied,
        phone: form.customerPhone,
        giftCardCode: giftCardApplied,
        loyaltyPointsRedeem: requestedPoints,
        city: form.city,
      }),
    })
      .then((r) => r.json())
      .then((d) => {
        if (d.ok) setQuote(d as Quote);
      })
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [businessId, JSON.stringify(items), applied, giftCardApplied, requestedPoints, form.city]);

  // city suggestions (delivery-zone cities + main Pakistani cities) so the delivery fee matches
  const [cities, setCities] = useState<string[]>([]);
  useEffect(() => {
    let alive = true;
    fetch(`/api/store/${businessId}/cities`)
      .then((r) => r.json())
      .then((d: { cities?: string[] }) => alive && setCities(d.cities ?? []))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [businessId]);

  // "started checkout" — once, when the shopper opens the cart with items
  const tracked = useRef(false);
  useEffect(() => {
    if (tracked.current || lines.length === 0) return;
    tracked.current = true;
    fetch(`/api/store/${businessId}/event`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "checkout_start", referrer: document.referrer || undefined }),
      keepalive: true,
    }).catch(() => {});
    firePixel("checkout_start", {
      content_ids: lines.map((l) => l.productId).filter((x): x is string => !!x),
      num_items: lines.reduce((s, l) => s + l.qty, 0),
      ...(currency ? { value: lines.reduce((s, l) => s + l.price * l.qty, 0), currency } : {}),
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [businessId, lines.length]);

  async function applyCoupon() {
    setCouponMsg(null);
    const code = couponInput.trim();
    if (!code) return;
    const r = await fetch(`/api/store/${businessId}/coupon`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ items, code, phone: form.customerPhone, giftCardCode: giftCardApplied, loyaltyPointsRedeem: requestedPoints, city: form.city }),
    });
    const d = await r.json();
    if (d.ok && d.couponCode) {
      setQuote(d as Quote);
      setCouponMsg(`Applied: ${d.couponLabel}`);
    } else {
      setCouponMsg(d.error ?? "That code isn't valid.");
    }
  }

  async function applyGiftCard() {
    setGiftCardMsg(null);
    const code = giftCardInput.trim();
    if (!code) return;
    const r = await fetch(`/api/store/${businessId}/coupon`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ items, code: applied, phone: form.customerPhone, giftCardCode: code, loyaltyPointsRedeem: requestedPoints, city: form.city }),
    });
    const d = await r.json();
    if (d.ok && d.giftCardCode) {
      setQuote(d as Quote);
      setGiftCardApplied(code);
      setGiftCardMsg(`Gift card applied — ${money(d.giftCardDiscount, currency)} off`);
    } else {
      setGiftCardMsg(d.error ?? "That gift card code isn't valid.");
    }
  }

  function seedAbandoned() {
    const phone = form.customerPhone.trim();
    if (phone.length < 7) return;
    fetch(`/api/store/${businessId}/abandoned`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ items, phone }),
      keepalive: true,
    }).catch(() => {});
  }

  async function placeOrder(e?: React.FormEvent) {
    e?.preventDefault();
    setError(null);
    if (!form.customerName || !form.customerPhone || !form.line1 || !form.city) {
      setError(copyText("cart.validationError", widgetCopy));
      return;
    }
    for (const f of checkoutCustomFields) {
      if (f.required && f.type !== "checkbox" && !String(customFieldValues[f.key] ?? "").trim()) {
        setError(`Please fill in "${f.label}".`);
        return;
      }
      if (f.required && f.type === "checkbox" && !customFieldValues[f.key]) {
        setError(`Please fill in "${f.label}".`);
        return;
      }
    }
    setSubmitting(true);
    try {
      const res = await fetch(`/api/store/${businessId}/checkout`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customerName: form.customerName,
          customerPhone: form.customerPhone,
          customerEmail: form.customerEmail,
          shipping: { line1: form.line1, city: form.city, area: form.area, postalCode: form.postalCode },
          items,
          couponCode: quote?.couponCode ?? undefined,
          giftCardCode: quote?.giftCardCode ?? undefined,
          loyaltyPointsRedeem: quote?.loyaltyPointsRedeemed ?? undefined,
          payment,
          clientToken,
          customFields: customFieldValues,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Something went wrong placing your order.");
        setSubmitting(false);
        return;
      }
      if (data.redirect) {
        window.location.href = data.redirect; // off to Stripe
        return;
      }
      clearCart(businessId);
      if (data.needsVerify) {
        setPlaced({ needsVerify: true });
        setSubmitting(false);
        return;
      }
      setShowSuccess(true);
      await new Promise((r) => setTimeout(r, MOTION_DURATION_MS[widgetMotion] ?? 550));
      router.push(`/store/${businessId}/order/${data.orderId}`);
    } catch {
      setError(copyText("cart.networkError", widgetCopy));
      setSubmitting(false);
    }
  }

  if (placed?.needsVerify) {
    return (
      <div className="odw" style={{ maxWidth: 440 }}>
        <WidgetStyles />
        <div className="odw-card" style={{ display: "grid", gap: 10 }}>
          <h2 className="odw-h">{copyText("cart.confirmTitle", widgetCopy)}</h2>
          <p className="odw-sub" style={{ margin: 0 }}>
            We&apos;ve sent a confirmation to <strong style={{ color: "var(--od-text)" }}>{form.customerPhone}</strong>. Tap the link
            (or reply <strong style={{ color: "var(--od-text)" }}>YES</strong>) and {storeName} gets your order moving. Unconfirmed
            orders are cancelled after 48 hours.
          </p>
          <a href={`/store/${businessId}`} className="odw-link" style={{ justifySelf: "start", marginTop: 4 }}>
            {copyText("cart.keepShopping", widgetCopy)}
          </a>
        </div>
      </div>
    );
  }

  if (lines.length === 0) {
    return (
      <div className="odw" style={{ maxWidth: 440 }}>
        <WidgetStyles />
        <div className="odw-card" style={{ textAlign: "center", display: "grid", gap: 8 }}>
          <p className="odw-h" style={{ fontSize: 16 }}>{copyText("cart.empty", widgetCopy)}</p>
          <a href={`/store/${businessId}`} className="odw-btn" style={{ width: "auto", justifySelf: "center" }}>
            {copyText("cart.browse", widgetCopy, { store: storeName })}
          </a>
        </div>
      </div>
    );
  }

  const totalShown = quote?.total ?? rawTotal;
  const gateOn = auth.enabled && auth.mode !== "none" && !auth.signedIn;

  const summaryRows = (
    <>
      <div className="odw-row">
        <span>Subtotal</span>
        <span>{money(quote?.subtotal ?? rawTotal, currency)}</span>
      </div>
      {quote && quote.bundleDiscount > 0 && (
        <p className="odw-note" style={{ margin: "-2px 0 2px" }}>
          Bundle pricing already saved you {money(quote.bundleDiscount, currency)}
        </p>
      )}
      {quote && quote.discount > 0 && (
        <div className="odw-row pos">
          <span>Discount{quote.couponCode ? ` · ${quote.couponCode}` : ""}</span>
          <span>−{money(quote.discount, currency)}</span>
        </div>
      )}
      {quote && quote.giftCardDiscount > 0 && (
        <div className="odw-row pos">
          <span>Gift card</span>
          <span>−{money(quote.giftCardDiscount, currency)}</span>
        </div>
      )}
      {quote && quote.loyaltyDiscount > 0 && (
        <div className="odw-row pos">
          <span>Points redeemed · {quote.loyaltyPointsRedeemed}</span>
          <span>−{money(quote.loyaltyDiscount, currency)}</span>
        </div>
      )}
      <div className="odw-row">
        <span>Delivery{quote?.shippingZoneName ? ` (${quote.shippingZoneName})` : ""}</span>
        <span>{quote ? (quote.freeShipping || quote.shipping === 0 ? "Free" : money(quote.shipping, currency)) : "—"}</span>
      </div>
      {quote && quote.tax > 0 && (
        <div className="odw-row">
          <span>{quote.taxLabel}</span>
          <span>{money(quote.tax, currency)}</span>
        </div>
      )}
      <div className="odw-total">
        <span>Total</span>
        <span>{money(totalShown, currency)}</span>
      </div>
    </>
  );

  const summaryCard = (
    <aside className="odw-card odw-summary-sticky" style={{ display: "grid", gap: 12 }}>
      <p className="odw-eyebrow">Order summary</p>
      <div>
        {lines.map((l) => (
          <div key={lineKey(l)} className="odw-mini">
            <span>
              {l.qty}× {l.name}
              {l.variantLabel ? ` · ${l.variantLabel}` : ""}
            </span>
            <span>{money(l.qty * l.price, currency)}</span>
          </div>
        ))}
      </div>
      <div style={{ display: "grid", gap: 7, borderTop: "1px solid var(--od-border)", paddingTop: 12 }}>{summaryRows}</div>
    </aside>
  );

  return (
    <div className="odw" style={{ display: "grid", gap: 28 }}>
      <WidgetStyles />
      {showSuccess && <SuccessOverlay motion={widgetMotion} label={copyText("cart.orderPlacedLabel", widgetCopy)} />}

      {step === "bag" && (
        <div className="odw-checkout">
          <div style={{ display: "grid", gap: 14 }}>
            <div>
              {lines.map((l) => (
                <div key={lineKey(l)} className="odw-item">
                  {l.imageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={l.imageUrl} alt={l.name} className="odw-thumb" />
                  ) : (
                    <div className="odw-thumb" />
                  )}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 14.5, fontWeight: 500 }}>{l.name}</div>
                    {l.variantLabel && <div style={{ fontSize: 12.5, color: "var(--od-muted)" }}>{l.variantLabel}</div>}
                    <div style={{ fontSize: 12.5, color: "var(--od-muted)", marginTop: 1 }}>{money(l.price, currency)}</div>
                    <div style={{ display: "flex", gap: 12, alignItems: "center", marginTop: 8 }}>
                      <span className="odw-qty">
                        <button onClick={() => setQty(businessId, lineKey(l), l.qty - 1)} aria-label="Decrease">−</button>
                        <span>{l.qty}</span>
                        <button onClick={() => setQty(businessId, lineKey(l), l.qty + 1)} aria-label="Increase">+</button>
                      </span>
                      <button className="odw-link" style={{ fontSize: 12 }} onClick={() => setQty(businessId, lineKey(l), 0)}>
                        Remove
                      </button>
                    </div>
                  </div>
                  <div style={{ fontSize: 14, fontWeight: 600 }}>{money(l.qty * l.price, currency)}</div>
                </div>
              ))}
            </div>

            <div style={{ display: "grid", gap: 6, maxWidth: 340 }}>
              <span className="odw-label">{copyText("cart.discountCode", widgetCopy)}</span>
              <div style={{ display: "flex", gap: 8 }}>
                <input
                  className="odw-input"
                  value={couponInput}
                  onChange={(e) => setCouponInput(e.target.value.toUpperCase())}
                  placeholder="Enter code"
                />
                <button type="button" className="odw-btn odw-btn-ghost" style={{ padding: "0 16px" }} onClick={applyCoupon}>
                  {copyText("cart.apply", widgetCopy)}
                </button>
              </div>
              {couponMsg && <p className="odw-note">{couponMsg}</p>}
            </div>

            <div style={{ display: "grid", gap: 6, maxWidth: 340 }}>
              <span className="odw-label">{copyText("cart.giftCard", widgetCopy)}</span>
              <div style={{ display: "flex", gap: 8 }}>
                <input
                  className="odw-input"
                  value={giftCardInput}
                  onChange={(e) => setGiftCardInput(e.target.value.toUpperCase())}
                  placeholder="Enter gift card code"
                />
                <button type="button" className="odw-btn odw-btn-ghost" style={{ padding: "0 16px" }} onClick={applyGiftCard}>
                  {copyText("cart.apply", widgetCopy)}
                </button>
              </div>
              {giftCardMsg && <p className="odw-note">{giftCardMsg}</p>}
            </div>

            {loyalty?.enabled && loyalty.signedIn && loyalty.points >= loyalty.minRedeem && (
              <div style={{ display: "grid", gap: 6, maxWidth: 340 }}>
                <span className="odw-label">Your points — {loyalty.points.toLocaleString()} available</span>
                {useLoyalty ? (
                  <div style={{ display: "flex", gap: 8 }}>
                    <input
                      className="odw-input"
                      type="number"
                      min={0}
                      max={loyalty.points}
                      value={loyaltyPointsInput}
                      onChange={(e) => setLoyaltyPointsInput(e.target.value)}
                      placeholder={`Up to ${loyalty.points}`}
                    />
                    <button
                      type="button"
                      className="odw-btn odw-btn-ghost"
                      style={{ padding: "0 16px" }}
                      onClick={() => {
                        setUseLoyalty(false);
                        setLoyaltyPointsInput("");
                      }}
                    >
                      {copyText("cart.clear", widgetCopy)}
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    className="odw-btn odw-btn-ghost"
                    style={{ width: "fit-content" }}
                    onClick={() => {
                      setUseLoyalty(true);
                      setLoyaltyPointsInput(String(loyalty.points));
                    }}
                  >
                    {copyText("cart.usePoints", widgetCopy)}
                  </button>
                )}
              </div>
            )}
          </div>

          <div style={{ display: "grid", gap: 12 }}>
            {summaryCard}
            <button
              className="odw-btn"
              onClick={() => setStep(gateOn ? "account" : "checkout")}
            >
              {gateOn ? copyText("cart.continueToCheckout", widgetCopy) : copyText("cart.checkout", widgetCopy)} · {money(totalShown, currency)}
            </button>
          </div>
        </div>
      )}

      {step === "account" && (
        <div style={{ maxWidth: 440, margin: "0 auto", display: "grid", gap: 16 }}>
          <button type="button" className="odw-link" style={{ justifySelf: "start" }} onClick={() => setStep("bag")}>
            ← Back to bag
          </button>
          <div className="odw-card" style={{ display: "grid", gap: 12 }}>
            <h2 className="odw-h">{copyText("cart.createAccountToContinue", widgetCopy)}</h2>
            <p className="odw-sub" style={{ margin: 0 }}>Proceeding with your checkout — an account lets you:</p>
            <div style={{ display: "grid", gap: 9 }}>
              {[
                copyText("cart.benefit1", widgetCopy),
                copyText("cart.benefit2", widgetCopy),
                copyText("cart.benefit3", widgetCopy),
              ].map((b) => (
                <div key={b} className="odw-bul">
                  <Tick />
                  {b}
                </div>
              ))}
            </div>
          </div>

          <AuthWidget
            businessId={businessId}
            authMode={auth.mode}
            initialTab="up"
            onDone={() => {
              prefilled.current = false;
              setReloadMe((n) => n + 1);
              setStep("checkout");
            }}
          />

          <button type="button" className="odw-link" style={{ justifySelf: "center" }} onClick={() => setStep("checkout")}>
            {copyText("cart.skipGuest", widgetCopy)}
          </button>
        </div>
      )}

      {step === "checkout" && (
        <div className="odw-checkout">
          <form onSubmit={placeOrder} style={{ display: "grid", gap: 18 }}>
            <div className="odw-steps">
              <button type="button" className="odw-link" style={{ textDecoration: "none" }} onClick={() => setStep("bag")}>
                Bag
              </button>
              <span>›</span>
              {gateOn && (
                <>
                  <button type="button" className="odw-link" style={{ textDecoration: "none" }} onClick={() => setStep("account")}>
                    Account
                  </button>
                  <span>›</span>
                </>
              )}
              <span className="cur">Delivery &amp; payment</span>
            </div>

            <div className="odw-card" style={{ display: "grid", gap: 14 }}>
              <h2 className="odw-h">{copyText("cart.deliveryDetails", widgetCopy)}</h2>
              {savedAddresses.length > 0 && (
                <label className="odw-field">
                  <span className="odw-label">Deliver to</span>
                  <select className="odw-input" value={addrChoice} onChange={(e) => chooseAddress(e.target.value)}>
                    {savedAddresses.map((a) => (
                      <option key={a.id} value={a.id}>
                        {(a.label ? `${a.label} — ` : "") + [a.line1, a.city].filter(Boolean).join(", ")}
                        {a.isDefault ? " (default)" : ""}
                      </option>
                    ))}
                    <option value="">Use a new address</option>
                  </select>
                </label>
              )}
              <label className="odw-field">
                <span className="odw-label">Full name</span>
                <input className="odw-input" required value={form.customerName} onChange={(e) => setForm({ ...form, customerName: e.target.value })} autoComplete="name" />
              </label>
              <label className="odw-field">
                <span className="odw-label">Phone</span>
                <input
                  className="odw-input"
                  required
                  type="tel"
                  value={form.customerPhone}
                  onChange={(e) => setForm({ ...form, customerPhone: e.target.value })}
                  onBlur={seedAbandoned}
                  autoComplete="tel"
                />
              </label>
              <label className="odw-field">
                <span className="odw-label">
                  Email <span className="opt">— optional, for order updates</span>
                </span>
                <input className="odw-input" type="email" value={form.customerEmail} onChange={(e) => setForm({ ...form, customerEmail: e.target.value })} autoComplete="email" />
              </label>
              <label className="odw-field">
                <span className="odw-label">Address (house / street)</span>
                <textarea className="odw-input" required value={form.line1} onChange={(e) => setForm({ ...form, line1: e.target.value })} autoComplete="address-line1" />
              </label>
              <div className="odw-grid2">
                <label className="odw-field">
                  <span className="odw-label">City</span>
                  <input className="odw-input" required list="odw-cities" value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} autoComplete="address-level2" />
                  <datalist id="odw-cities">
                    {cities.map((c) => (
                      <option key={c} value={c} />
                    ))}
                  </datalist>
                </label>
                <label className="odw-field">
                  <span className="odw-label">
                    Area / sector <span className="opt">— optional</span>
                  </span>
                  <input className="odw-input" value={form.area} onChange={(e) => setForm({ ...form, area: e.target.value })} />
                </label>
              </div>
              <label className="odw-field" style={{ maxWidth: 180 }}>
                <span className="odw-label">
                  Postal code <span className="opt">— optional</span>
                </span>
                <input className="odw-input" value={form.postalCode} onChange={(e) => setForm({ ...form, postalCode: e.target.value })} autoComplete="postal-code" />
              </label>
            </div>

            {checkoutCustomFields.length > 0 && (
              <div className="odw-card" style={{ display: "grid", gap: 12 }}>
                {checkoutCustomFields.map((f) =>
                  f.type === "checkbox" ? (
                    <label key={f.key} style={{ display: "flex", gap: 9, alignItems: "center", fontSize: 13.5, cursor: "pointer" }}>
                      <input
                        type="checkbox"
                        checked={!!customFieldValues[f.key]}
                        onChange={(e) => setCustomFieldValues((v) => ({ ...v, [f.key]: e.target.checked }))}
                      />
                      {f.label}
                      {f.required && " *"}
                    </label>
                  ) : (
                    <label key={f.key} className="odw-field">
                      <span className="odw-label">
                        {f.label} {!f.required && <span className="opt">— optional</span>}
                      </span>
                      {f.type === "textarea" ? (
                        <textarea
                          className="odw-input"
                          value={String(customFieldValues[f.key] ?? "")}
                          onChange={(e) => setCustomFieldValues((v) => ({ ...v, [f.key]: e.target.value }))}
                        />
                      ) : (
                        <input
                          className="odw-input"
                          value={String(customFieldValues[f.key] ?? "")}
                          onChange={(e) => setCustomFieldValues((v) => ({ ...v, [f.key]: e.target.value }))}
                        />
                      )}
                    </label>
                  ),
                )}
              </div>
            )}

            {options.length > 1 && (
              <div className="odw-card" style={{ display: "grid", gap: 10 }}>
                <h2 className="odw-h" style={{ fontSize: 16 }}>Payment</h2>
                {options.map((o) => (
                  <label key={o} style={{ display: "flex", gap: 10, alignItems: "center", fontSize: 14, cursor: "pointer" }}>
                    <input type="radio" name="pay" checked={payment === o} onChange={() => setPayment(o)} style={{ accentColor: "var(--od-accent)" }} />
                    {o === "cod" ? copyText("cart.cod", widgetCopy) : copyText("cart.payByCard", widgetCopy)}
                  </label>
                ))}
              </div>
            )}
          </form>

          <div style={{ display: "grid", gap: 12 }}>
            {summaryCard}
            {error && <p role="alert" className="odw-err">{error}</p>}
            <button type="button" className="odw-btn" disabled={submitting} onClick={() => placeOrder()}>
              {submitting
                ? copyText("cart.placingOrder", widgetCopy)
                : payment === "stripe"
                  ? copyText("cart.payAmount", widgetCopy, { total: money(totalShown, currency) })
                  : copyText("cart.placeOrder", widgetCopy, { total: money(totalShown, currency) })}
            </button>
            {payment === "cod" && (
              <p className="odw-note">Cash on delivery — {copyText("cart.codNote", widgetCopy, { store: storeName })}</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
