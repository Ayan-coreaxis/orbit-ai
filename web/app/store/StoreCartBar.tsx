"use client";

import { useState } from "react";
import { usePathname } from "next/navigation";
import { lineKey, setQty, useCart } from "./cart-store";
import { money } from "@/lib/money";
import { StoreChat } from "./StoreChat";

/** Floating cart pill that opens a slide-out drawer (line items + checkout). */
export function StoreCartBar({
  businessId,
  accent,
  accentText,
  currency,
  tokens,
  storeName,
}: {
  businessId: string;
  storeName?: string;
  accent: string;
  accentText: string;
  currency?: string;
  /** the store's design tokens — this component renders OUTSIDE #od-store, so var(--od-*) is undefined here unless we redeclare them */
  tokens?: { bg?: string; surface?: string; text?: string; muted?: string; border?: string; radius?: number; fontBody?: string };
}) {
  const t = tokens ?? {};
  const vars: React.CSSProperties = {
    ["--od-bg" as string]: t.bg || "#ffffff",
    ["--od-surface" as string]: t.surface || "#f6f6f6",
    ["--od-text" as string]: t.text || "#111111",
    ["--od-muted" as string]: t.muted || "#666666",
    ["--od-border" as string]: t.border || "#e5e5e5",
    ["--od-accent" as string]: safe(accent),
    ["--od-accent-text" as string]: safe(accentText),
    ["--od-radius" as string]: `${t.radius ?? 12}px`,
    ["--od-font-body" as string]: t.fontBody || "system-ui, sans-serif",
  };
  const lines = useCart(businessId);
  const count = lines.reduce((s, l) => s + l.qty, 0);
  const total = lines.reduce((s, l) => s + l.qty * l.price, 0);
  const [openWanted, setOpen] = useState(false);
  const open = openWanted && count > 0; // an emptied cart closes itself
  const pathname = usePathname() ?? "";

  // Nothing to show with an empty cart — and never on the cart / checkout page itself, where the
  // pill would sit on top of the checkout button.
  const chat = <StoreChat businessId={businessId} storeName={storeName} vars={vars} />;
  if (count === 0 || /\/cart\/?$/.test(pathname)) return chat;

  return (
    <>
      {chat}
      <button
        onClick={() => setOpen(true)}
        style={{
          position: "fixed",
          left: "50%",
          bottom: "20px",
          transform: "translateX(-50%)",
          background: safe(accent),
          color: safe(accentText),
          border: "none",
          borderRadius: "999px",
          padding: "13px 22px",
          fontSize: "14px",
          fontWeight: 600,
          cursor: "pointer",
          boxShadow: "0 10px 30px rgba(0,0,0,.18)",
          display: "flex",
          gap: "12px",
          alignItems: "center",
          whiteSpace: "nowrap",
          maxWidth: "calc(100vw - 32px)",
          zIndex: 60,
          fontFamily: "system-ui, sans-serif",
        }}
      >
        <span>{count} {count === 1 ? "item" : "items"}</span>
        <span style={{ opacity: 0.6 }}>·</span>
        <span>{money(total, currency)}</span>
        <span style={{ opacity: 0.6 }}>·</span>
        <span>View cart →</span>
      </button>

      {open && (
        <div
          onClick={() => setOpen(false)}
          style={{ ...vars, position: "fixed", inset: 0, background: "rgba(0,0,0,.4)", zIndex: 70, animation: "odFade .15s ease" }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              position: "absolute",
              top: 0,
              right: 0,
              height: "100%",
              width: "min(400px, 92vw)",
              background: "var(--od-bg)",
              color: "var(--od-text)",
              boxShadow: "-10px 0 40px rgba(0,0,0,.2)",
              display: "flex",
              flexDirection: "column",
              fontFamily: "var(--od-font-body)",
              animation: "odSlide .2s ease",
            }}
          >
            <style>{`@keyframes odSlide{from{transform:translateX(100%)}to{transform:translateX(0)}}@keyframes odFade{from{opacity:0}to{opacity:1}}`}</style>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "18px 20px", borderBottom: "1px solid var(--od-border)" }}>
              <strong style={{ fontSize: 16 }}>Your cart</strong>
              <button onClick={() => setOpen(false)} aria-label="Close" style={{ background: "none", border: "none", fontSize: 22, cursor: "pointer", color: "var(--od-muted)", lineHeight: 1 }}>
                ×
              </button>
            </div>

            <div style={{ flex: 1, overflowY: "auto", padding: "8px 20px" }}>
              {lines.map((l) => (
                <div key={lineKey(l)} style={{ display: "flex", gap: 12, padding: "14px 0", borderBottom: "1px solid var(--od-border)" }}>
                  {l.imageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={l.imageUrl} alt={l.name} style={{ width: 56, height: 56, objectFit: "cover", borderRadius: "calc(var(--od-radius)*.5)" }} />
                  ) : (
                    <div style={{ width: 56, height: 56, background: "var(--od-surface)", borderRadius: "calc(var(--od-radius)*.5)" }} />
                  )}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 14, fontWeight: 500 }}>{l.name}</div>
                    {l.variantLabel && <div style={{ fontSize: 12, color: "var(--od-muted)" }}>{l.variantLabel}</div>}
                    <div style={{ display: "flex", gap: 6, alignItems: "center", marginTop: 6 }}>
                      <button onClick={() => setQty(businessId, lineKey(l), l.qty - 1)} style={qbtn} aria-label="Decrease">−</button>
                      <span style={{ fontSize: 13, minWidth: 18, textAlign: "center" }}>{l.qty}</span>
                      <button onClick={() => setQty(businessId, lineKey(l), l.qty + 1)} style={qbtn} aria-label="Increase">+</button>
                    </div>
                  </div>
                  <div style={{ fontSize: 13, fontWeight: 600 }}>{money(l.qty * l.price, currency)}</div>
                </div>
              ))}
            </div>

            <div style={{ padding: "16px 20px", borderTop: "1px solid var(--od-border)" }}>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 15, fontWeight: 700, marginBottom: 12 }}>
                <span>Subtotal</span>
                <span>{money(total, currency)}</span>
              </div>
              <a
                href={`/store/${businessId}/cart`}
                style={{
                  display: "block",
                  textAlign: "center",
                  background: "var(--od-accent)",
                  color: "var(--od-accent-text)",
                  borderRadius: "var(--od-radius)",
                  padding: "13px",
                  fontSize: 15,
                  fontWeight: 600,
                  textDecoration: "none",
                }}
              >
                Checkout
              </a>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

const qbtn: React.CSSProperties = { background: "transparent", border: "1px solid var(--od-border)", borderRadius: 6, padding: "1px 8px", cursor: "pointer", color: "inherit", fontSize: 13 };

function safe(v: string): string {
  return /[{}();]|url\(/i.test(v) ? "#111" : v;
}
