import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { tokenCss, defaultTokens, type OrbitDesignDoc } from "@/lib/orbit-design";
import { money } from "@/lib/money";
import { finalizeStripeOrder } from "@/lib/checkout-finalize";
import { copyText, parseWidgetCopy, statusLabel } from "@/lib/widget-copy";

export const dynamic = "force-dynamic";

interface Line {
  name: string;
  price: number;
  qty: number;
}

const STEPS = ["pending", "confirmed", "shipped", "fulfilled"] as const;

export default async function OrderConfirmationPage({
  params,
  searchParams,
}: {
  params: Promise<{ businessId: string; orderId: string }>;
  searchParams: Promise<{ session_id?: string }>;
}) {
  const { businessId, orderId } = await params;
  const { session_id } = await searchParams;

  // Coming back from Stripe — confirm the payment before we render "order placed".
  if (session_id) {
    const h = await headers();
    const origin = `${h.get("x-forwarded-proto") || "http"}://${h.get("x-forwarded-host") || h.get("host")}`;
    await finalizeStripeOrder(businessId, session_id, origin).catch(() => {});
  }

  let order = await prisma.order.findUnique({ where: { id: orderId } });
  if (!order || order.businessId !== businessId) notFound();

  const business = await prisma.business.findUnique({
    where: { id: businessId },
    select: { name: true, storeCurrency: true, storeDesign: { select: { doc: true } }, widgetCopy: true },
  });
  const widgetCopy = parseWidgetCopy(business?.widgetCopy);
  let doc: OrbitDesignDoc | null = null;
  try {
    doc = business?.storeDesign?.doc ? (JSON.parse(business.storeDesign.doc) as OrbitDesignDoc) : null;
  } catch {
    doc = null;
  }
  const tokens = doc?.tokens ?? defaultTokens();
  const storeName = doc?.storeName ?? business?.name ?? "Store";

  let lines: Line[] = [];
  try {
    lines = JSON.parse(order.items) as Line[];
  } catch {
    lines = [];
  }

  const css = `${tokenCss(tokens).replace(":root{", "body{")}
*{box-sizing:border-box}body{margin:0;font-family:var(--od-font-body);color:var(--od-text);background:var(--od-bg);line-height:1.6}`;

  const awaitingPayment = order.paymentProvider === "stripe" && order.paymentStatus !== "paid";
  const cancelled = order.status === "cancelled";
  const stepIdx = cancelled ? -1 : STEPS.indexOf(order.status as (typeof STEPS)[number]);

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: css }} />
      <div style={{ maxWidth: 560, margin: "0 auto", padding: "72px var(--od-gutter) 96px" }}>
        <div style={{ fontSize: 40 }} aria-hidden>
          {awaitingPayment ? "⏳" : cancelled ? "✕" : "🎉"}
        </div>
        <h1 style={{ fontFamily: "var(--od-font-heading)", fontSize: 28, margin: "8px 0" }}>
          {awaitingPayment
            ? copyText("order.paymentPendingHeading", widgetCopy)
            : cancelled
              ? copyText("order.cancelledHeading", widgetCopy)
              : copyText("order.placedHeading", widgetCopy)}
        </h1>
        <p style={{ color: "var(--od-muted)" }}>
          {awaitingPayment
            ? `We haven't received payment for this order yet. If you completed checkout, refresh in a moment.`
            : cancelled
              ? `This order was cancelled. If that's a surprise, contact ${storeName}.`
              : `Thanks, ${order.customerName.split(" ")[0]}. ${storeName} has your order and will call ${order.customerPhone} to confirm delivery.`}
        </p>

        {!awaitingPayment && !cancelled && (
          <div style={{ display: "flex", gap: 0, marginTop: 20 }}>
            {STEPS.map((s, i) => (
              <div key={s} style={{ flex: 1, textAlign: "center" }}>
                <div
                  style={{
                    height: 4,
                    borderRadius: 2,
                    background: i <= stepIdx ? "var(--od-accent)" : "var(--od-border)",
                    margin: "0 2px",
                  }}
                />
                <div style={{ fontSize: 11, marginTop: 6, color: i <= stepIdx ? "var(--od-text)" : "var(--od-muted)" }}>
                  {statusLabel(s, widgetCopy)}
                </div>
              </div>
            ))}
          </div>
        )}
        {order.courierName && order.trackingNumber && (
          <p style={{ color: "var(--od-muted)", fontSize: 13, marginTop: 12 }}>
            {order.courierName} · {order.trackingNumber}
            {order.trackingUrl ? (
              <>
                {" · "}
                <a href={order.trackingUrl} style={{ color: "var(--od-accent)" }}>track</a>
              </>
            ) : null}
          </p>
        )}
        <div style={{ border: "1px solid var(--od-border)", borderRadius: "var(--od-radius)", padding: 20, marginTop: 24 }}>
          <div style={{ fontSize: 12, color: "var(--od-muted)", letterSpacing: ".05em", textTransform: "uppercase" }}>
            {copyText("order.numberLabel", widgetCopy, { number: order.id.slice(-6) })}
          </div>
          {lines.map((l, i) => (
            <div key={i} style={{ display: "flex", justifyContent: "space-between", marginTop: 10, fontSize: 14 }}>
              <span>
                {l.name} × {l.qty}
              </span>
              <span>{money(l.price * l.qty, business?.storeCurrency)}</span>
            </div>
          ))}
          {order.discountAmount > 0 && (
            <div style={{ display: "flex", justifyContent: "space-between", marginTop: 10, fontSize: 14, color: "var(--od-accent)" }}>
              <span>Discount{order.couponCode ? ` (${order.couponCode})` : ""}</span>
              <span>−{money(order.discountAmount, business?.storeCurrency)}</span>
            </div>
          )}
          <div style={{ display: "flex", justifyContent: "space-between", marginTop: 14, paddingTop: 14, borderTop: "1px solid var(--od-border)", fontWeight: 700 }}>
            <span>Total ({order.paymentProvider === "stripe" ? "paid by card" : "cash on delivery"})</span>
            <span>{money(order.total, business?.storeCurrency)}</span>
          </div>
        </div>
        <a href={`/store/${businessId}`} style={{ display: "inline-block", marginTop: 24, color: "var(--od-accent)", textDecoration: "none", fontSize: 14 }}>
          ← Back to {storeName}
        </a>
      </div>
    </>
  );
}
