import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { adjustPoints } from "@/lib/loyalty";
import { getActiveBusinessId } from "@/lib/get-active-business-id";

/** Seller view: top balances + the most recent ledger activity across all customers. */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ businessId: string }> }) {
  const { businessId } = await params;
  const active = await getActiveBusinessId();
  if (!active || active !== businessId) return NextResponse.json({ error: "Not authorized." }, { status: 403 });

  const [accounts, recent] = await Promise.all([
    prisma.loyaltyAccount.findMany({
      where: { businessId, points: { gt: 0 } },
      orderBy: { points: "desc" },
      take: 50,
      include: { customer: { select: { name: true, email: true, phone: true } } },
    }),
    prisma.loyaltyTransaction.findMany({
      where: { businessId },
      orderBy: { createdAt: "desc" },
      take: 30,
      include: { customer: { select: { name: true } } },
    }),
  ]);

  return NextResponse.json({
    accounts: accounts.map((a) => ({
      customerId: a.customerId,
      name: a.customer.name,
      email: a.customer.email,
      phone: a.customer.phone,
      points: a.points,
    })),
    recent: recent.map((t) => ({
      id: t.id,
      customerName: t.customer.name,
      points: t.points,
      reason: t.reason,
      note: t.note,
      orderId: t.orderId,
      createdAt: t.createdAt.toISOString(),
    })),
  });
}

/** Seller manually credits/debits one customer — goodwill, or correcting a support issue. */
export async function POST(req: NextRequest, { params }: { params: Promise<{ businessId: string }> }) {
  const { businessId } = await params;
  const active = await getActiveBusinessId();
  if (!active || active !== businessId) return NextResponse.json({ error: "Not authorized." }, { status: 403 });

  const body = (await req.json().catch(() => ({}))) as { customerId?: string; points?: number; note?: string };
  const points = Math.trunc(Number(body.points));
  if (!body.customerId) return NextResponse.json({ error: "Missing customer." }, { status: 400 });
  if (!Number.isFinite(points) || points === 0) return NextResponse.json({ error: "Enter a non-zero point amount." }, { status: 400 });

  const customer = await prisma.storeCustomer.findFirst({ where: { id: body.customerId, businessId } });
  if (!customer) return NextResponse.json({ error: "Customer not found." }, { status: 404 });

  await adjustPoints(businessId, customer.id, points, (body.note || "Manual adjustment").slice(0, 300));
  return NextResponse.json({ ok: true });
}
