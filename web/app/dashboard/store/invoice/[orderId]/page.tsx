import { notFound } from "next/navigation";
import { getActiveBusinessId } from "@/lib/get-active-business-id";
import { prisma } from "@/lib/prisma";
import { money } from "@/lib/money";
import { PrintButton } from "@/components/store/PrintButton";

export const dynamic = "force-dynamic";

interface Line {
  name?: string;
  variantLabel?: string | null;
  price?: number;
  qty?: number;
}

/** A clean, printable invoice + packing slip. Opened in a new tab from the Orders list; use the browser's Print. */
export default async function InvoicePage({ params }: { params: Promise<{ orderId: string }> }) {
  const { orderId } = await params;
  const businessId = await getActiveBusinessId();
  if (!businessId) notFound();

  const order = await prisma.order.findUnique({ where: { id: orderId } });
  if (!order || order.businessId !== businessId) notFound();

  const business = await prisma.business.findUnique({
    where: { id: businessId },
    select: { name: true, storeCurrency: true, whatsapp: true },
  });
  const currency = business?.storeCurrency;

  let lines: Line[] = [];
  try {
    lines = JSON.parse(order.items) as Line[];
  } catch {
    lines = [];
  }
  let addr: Record<string, string> | null = null;
  try {
    addr = order.shippingAddress ? JSON.parse(order.shippingAddress) : null;
  } catch {
    addr = null;
  }

  return (
    <div style={{ maxWidth: 720, margin: "0 auto", padding: "40px 32px", fontFamily: "system-ui, sans-serif", color: "#111", background: "#fff" }}>
      <style>{`@media print { .noprint { display: none } body { background: #fff } }`}</style>
      <div className="noprint" style={{ marginBottom: 24 }}>
        <PrintButton />
      </div>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", borderBottom: "2px solid #111", paddingBottom: 16 }}>
        <div>
          <div style={{ fontSize: 22, fontWeight: 700 }}>{business?.name}</div>
          {business?.whatsapp && <div style={{ fontSize: 13, color: "#555" }}>{business.whatsapp}</div>}
        </div>
        <div style={{ textAlign: "right" }}>
          <div style={{ fontSize: 18, fontWeight: 700 }}>INVOICE</div>
          <div style={{ fontSize: 13, color: "#555" }}>#{order.id.slice(-6).toUpperCase()}</div>
          <div style={{ fontSize: 13, color: "#555" }}>{order.createdAt.toLocaleDateString()}</div>
        </div>
      </div>

      <div style={{ display: "flex", gap: 40, marginTop: 20 }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: ".05em", color: "#888" }}>Ship to</div>
          <div style={{ fontSize: 14, marginTop: 4, lineHeight: 1.6 }}>
            {order.customerName}
            <br />
            {order.customerPhone}
            <br />
            {addr ? (
              <>
                {addr.line1}
                <br />
                {[addr.area, addr.city, addr.province, addr.postalCode].filter(Boolean).join(", ")}
              </>
            ) : (
              order.address
            )}
          </div>
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: ".05em", color: "#888" }}>Payment</div>
          <div style={{ fontSize: 14, marginTop: 4 }}>
            {order.paymentProvider === "stripe" ? "Paid by card" : "Cash on delivery"} · {order.paymentStatus}
          </div>
          {order.courierName && (
            <div style={{ fontSize: 13, marginTop: 6, color: "#555" }}>
              {order.courierName}
              {order.trackingNumber ? ` · ${order.trackingNumber}` : ""}
            </div>
          )}
        </div>
      </div>

      <table style={{ width: "100%", marginTop: 24, borderCollapse: "collapse", fontSize: 14 }}>
        <thead>
          <tr style={{ borderBottom: "1px solid #ccc", textAlign: "left" }}>
            <th style={{ padding: "8px 0" }}>Item</th>
            <th style={{ padding: "8px 0", textAlign: "center", width: 60 }}>Qty</th>
            <th style={{ padding: "8px 0", textAlign: "right", width: 100 }}>Price</th>
            <th style={{ padding: "8px 0", textAlign: "right", width: 110 }}>Total</th>
          </tr>
        </thead>
        <tbody>
          {lines.map((l, i) => (
            <tr key={i} style={{ borderBottom: "1px solid #eee" }}>
              <td style={{ padding: "8px 0" }}>
                {l.name}
                {l.variantLabel ? ` — ${l.variantLabel}` : ""}
              </td>
              <td style={{ padding: "8px 0", textAlign: "center" }}>{l.qty}</td>
              <td style={{ padding: "8px 0", textAlign: "right" }}>{money(l.price ?? 0, currency)}</td>
              <td style={{ padding: "8px 0", textAlign: "right" }}>{money((l.price ?? 0) * (l.qty ?? 0), currency)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <div style={{ marginLeft: "auto", width: 260, marginTop: 16, fontSize: 14 }}>
        <Row label="Subtotal" value={money(order.subtotal || order.total, currency)} />
        {order.discountAmount > 0 && <Row label={`Discount${order.couponCode ? ` (${order.couponCode})` : ""}`} value={`−${money(order.discountAmount, currency)}`} />}
        {order.shippingFee > 0 && <Row label="Delivery" value={money(order.shippingFee, currency)} />}
        {order.taxAmount > 0 && <Row label="Tax" value={money(order.taxAmount, currency)} />}
        <div style={{ display: "flex", justifyContent: "space-between", borderTop: "2px solid #111", paddingTop: 8, marginTop: 8, fontWeight: 700, fontSize: 16 }}>
          <span>Total</span>
          <span>{money(order.total, currency)}</span>
        </div>
      </div>

      {order.sellerNote && <p style={{ marginTop: 24, fontSize: 12, color: "#888" }}>Note: {order.sellerNote}</p>}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", padding: "3px 0" }}>
      <span style={{ color: "#555" }}>{label}</span>
      <span>{value}</span>
    </div>
  );
}

