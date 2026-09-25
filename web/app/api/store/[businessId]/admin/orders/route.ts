import { NextRequest, NextResponse } from "next/server";
import { getActiveBusinessId } from "@/lib/get-active-business-id";
import { prisma } from "@/lib/prisma";

const PAGE = 30;
const STATUSES = ["pending", "confirmed", "shipped", "fulfilled", "cancelled"];

/** Seller-only order list for the active business. */
export async function GET(req: NextRequest, { params }: { params: Promise<{ businessId: string }> }) {
  const { businessId } = await params;
  const active = await getActiveBusinessId();
  if (!active || active !== businessId) return NextResponse.json({ error: "Not authorized." }, { status: 403 });

  const url = new URL(req.url);
  const status = url.searchParams.get("status");
  const q = (url.searchParams.get("q") || "").trim();
  const from = url.searchParams.get("from");
  const to = url.searchParams.get("to");
  const skip = Math.max(0, Number(url.searchParams.get("skip")) || 0);

  const where = {
    businessId,
    ...(status === "unconfirmed"
      ? { verified: false }
      : status === "flagged"
        ? { flagged: true }
        : status && STATUSES.includes(status)
          ? { status }
          : {}),
    ...(from || to
      ? { createdAt: { ...(from ? { gte: new Date(from) } : {}), ...(to ? { lte: new Date(`${to}T23:59:59`) } : {}) } }
      : {}),
    ...(q
      ? {
          OR: [
            { customerName: { contains: q } },
            { customerPhone: { contains: q } },
            { id: { contains: q } },
          ],
        }
      : {}),
  };

  const [rows, total, counts, unconfirmed, flagged] = await Promise.all([
    prisma.order.findMany({ where, orderBy: { createdAt: "desc" }, skip, take: PAGE }),
    prisma.order.count({ where }),
    prisma.order.groupBy({ by: ["status"], where: { businessId }, _count: { _all: true } }),
    prisma.order.count({ where: { businessId, verified: false, status: { not: "cancelled" } } }),
    prisma.order.count({ where: { businessId, flagged: true, status: { not: "cancelled" } } }),
  ]);

  const byStatus: Record<string, number> = { unconfirmed, flagged };
  for (const c of counts) byStatus[c.status] = c._count._all;

  return NextResponse.json({
    total,
    skip,
    pageSize: PAGE,
    byStatus,
    orders: rows.map((o) => {
      let items: unknown[] = [];
      try {
        items = JSON.parse(o.items);
      } catch {
        items = [];
      }
      return {
        id: o.id,
        number: o.id.slice(-6).toUpperCase(),
        createdAt: o.createdAt,
        customerName: o.customerName,
        customerPhone: o.customerPhone,
        customerEmail: o.customerEmail,
        address: o.address,
        customFields: (() => {
          try {
            return o.customFieldsData ? JSON.parse(o.customFieldsData) : null;
          } catch {
            return null;
          }
        })(),
        items,
        total: o.total,
        discountAmount: o.discountAmount,
        couponCode: o.couponCode,
        status: o.status,
        verified: o.verified,
        flagged: o.flagged,
        flagReason: o.flagReason,
        subtotal: o.subtotal,
        shippingFee: o.shippingFee,
        taxAmount: o.taxAmount,
        paymentProvider: o.paymentProvider,
        paymentStatus: o.paymentStatus,
        courierName: o.courierName,
        trackingNumber: o.trackingNumber,
        trackingUrl: o.trackingUrl,
        sellerNote: o.sellerNote,
        confirmationNotifiedAt: o.confirmationNotifiedAt,
        confirmationNotifyError: o.confirmationNotifyError,
        trackingNotifiedAt: o.trackingNotifiedAt,
        trackingNotifyError: o.trackingNotifyError,
        shippedAt: o.shippedAt,
        fulfilledAt: o.fulfilledAt,
        cancelledAt: o.cancelledAt,
      };
    }),
  });
}
