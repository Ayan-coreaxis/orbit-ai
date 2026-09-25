import { NextRequest, NextResponse } from "next/server";
import { getActiveBusinessId } from "@/lib/get-active-business-id";
import { prisma } from "@/lib/prisma";

const STATUSES = ["pending", "confirmed", "shipped", "fulfilled", "cancelled"];

interface Item {
  name?: string;
  variantLabel?: string | null;
  qty?: number;
}

function csvCell(v: unknown): string {
  const s = String(v ?? "");
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** Seller CSV export of orders (respects the same status/date filters as the list). */
export async function GET(req: NextRequest, { params }: { params: Promise<{ businessId: string }> }) {
  const { businessId } = await params;
  const active = await getActiveBusinessId();
  if (!active || active !== businessId) return NextResponse.json({ error: "Not authorized." }, { status: 403 });

  const url = new URL(req.url);
  const status = url.searchParams.get("status");
  const from = url.searchParams.get("from");
  const to = url.searchParams.get("to");

  const rows = await prisma.order.findMany({
    where: {
      businessId,
      ...(status && STATUSES.includes(status) ? { status } : {}),
      ...(from || to
        ? { createdAt: { ...(from ? { gte: new Date(from) } : {}), ...(to ? { lte: new Date(`${to}T23:59:59`) } : {}) } }
        : {}),
    },
    orderBy: { createdAt: "desc" },
    take: 5000,
  });

  const header = [
    "Order",
    "Date",
    "Customer",
    "Phone",
    "Email",
    "Address",
    "Items",
    "Subtotal",
    "Discount",
    "Delivery",
    "Tax",
    "Total",
    "Payment",
    "Status",
    "Verified",
    "Flagged",
    "Courier",
    "Tracking",
  ];

  const lines = rows.map((o) => {
    let items: Item[] = [];
    try {
      items = JSON.parse(o.items) as Item[];
    } catch {
      items = [];
    }
    return [
      o.id.slice(-6).toUpperCase(),
      o.createdAt.toISOString().slice(0, 10),
      o.customerName,
      o.customerPhone,
      o.customerEmail ?? "",
      o.address,
      items.map((i) => `${i.name}${i.variantLabel ? ` (${i.variantLabel})` : ""} x${i.qty}`).join("; "),
      o.subtotal,
      o.discountAmount,
      o.shippingFee,
      o.taxAmount,
      o.total,
      o.paymentProvider,
      o.status,
      o.verified ? "yes" : "no",
      o.flagged ? o.flagReason ?? "yes" : "",
      o.courierName ?? "",
      o.trackingNumber ?? "",
    ]
      .map(csvCell)
      .join(",");
  });

  const csv = [header.join(","), ...lines].join("\n");
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="orders-${new Date().toISOString().slice(0, 10)}.csv"`,
    },
  });
}
