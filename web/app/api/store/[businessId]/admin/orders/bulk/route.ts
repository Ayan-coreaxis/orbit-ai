import { NextRequest, NextResponse } from "next/server";
import { getActiveBusinessId } from "@/lib/get-active-business-id";
import { prisma } from "@/lib/prisma";
import { applyStockDelta } from "@/lib/checkout";

const STATUSES = ["confirmed", "shipped", "fulfilled", "cancelled"] as const;

interface Item {
  productId?: string;
  variantId?: string | null;
  qty?: number;
}

/** Apply one status change to many orders at once. Cancelling restocks each. */
export async function POST(req: NextRequest, { params }: { params: Promise<{ businessId: string }> }) {
  const { businessId } = await params;
  const active = await getActiveBusinessId();
  if (!active || active !== businessId) return NextResponse.json({ error: "Not authorized." }, { status: 403 });

  const { ids, status } = (await req.json().catch(() => ({}))) as { ids?: string[]; status?: string };
  if (!Array.isArray(ids) || !ids.length) return NextResponse.json({ error: "No orders selected." }, { status: 400 });
  if (!STATUSES.includes(status as (typeof STATUSES)[number])) return NextResponse.json({ error: "Bad status." }, { status: 400 });

  const orders = await prisma.order.findMany({ where: { id: { in: ids.slice(0, 200) }, businessId } });
  const now = new Date();
  let updated = 0;

  for (const o of orders) {
    if (o.status === status || o.status === "cancelled") continue;
    const data: Record<string, unknown> = { status, verified: true };
    if (status === "confirmed") data.confirmedAt = o.confirmedAt ?? now;
    if (status === "shipped") {
      data.shippedAt = o.shippedAt ?? now;
      if (!o.confirmedAt) data.confirmedAt = now;
    }
    if (status === "fulfilled") data.fulfilledAt = o.fulfilledAt ?? now;
    if (status === "cancelled") data.cancelledAt = now;

    await prisma.$transaction(async (tx) => {
      if (status === "cancelled") {
        let items: Item[] = [];
        try {
          items = JSON.parse(o.items) as Item[];
        } catch {
          items = [];
        }
        await applyStockDelta(
          tx,
          businessId,
          items.filter((it): it is Item & { productId: string; qty: number } => !!it.productId && !!it.qty),
          1,
        );
      }
      await tx.order.update({ where: { id: o.id }, data });
    });
    updated += 1;
  }

  return NextResponse.json({ ok: true, updated });
}
