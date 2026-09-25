import { NextRequest, NextResponse } from "next/server";
import { getActiveBusinessId } from "@/lib/get-active-business-id";
import { prisma } from "@/lib/prisma";

function clean(b: Record<string, unknown>) {
  const type = b.type === "fixed" ? "fixed" : "percent";
  const value = Math.max(0, Number(b.value) || 0);
  return {
    type,
    value: type === "percent" ? Math.min(100, value) : value,
    active: b.active !== false,
    usageLimit: b.usageLimit == null || b.usageLimit === "" ? null : Math.max(1, Math.floor(Number(b.usageLimit))),
    perCustomerLimit:
      b.perCustomerLimit == null || b.perCustomerLimit === "" ? null : Math.max(1, Math.floor(Number(b.perCustomerLimit))),
    minSubtotal: b.minSubtotal == null || b.minSubtotal === "" ? null : Math.max(0, Number(b.minSubtotal)),
    firstOrderOnly: !!b.firstOrderOnly,
    freeShipping: !!b.freeShipping,
    autoApply: !!b.autoApply,
    expiresAt: b.expiresAt ? new Date(String(b.expiresAt)) : null,
    productIds: Array.isArray(b.productIds) && b.productIds.length ? JSON.stringify(b.productIds.slice(0, 100)) : null,
  };
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ businessId: string }> }) {
  const { businessId } = await params;
  const active = await getActiveBusinessId();
  if (!active || active !== businessId) return NextResponse.json({ error: "Not authorized." }, { status: 403 });
  const coupons = await prisma.coupon.findMany({ where: { businessId }, orderBy: { createdAt: "desc" } });
  return NextResponse.json({ coupons });
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ businessId: string }> }) {
  const { businessId } = await params;
  const active = await getActiveBusinessId();
  if (!active || active !== businessId) return NextResponse.json({ error: "Not authorized." }, { status: 403 });

  const b = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const code = String(b.code ?? "").trim().toUpperCase().replace(/\s+/g, "");
  if (!/^[A-Z0-9_-]{3,32}$/.test(code)) return NextResponse.json({ error: "Code must be 3–32 letters / numbers." }, { status: 400 });

  const exists = await prisma.coupon.findUnique({ where: { businessId_code: { businessId, code } } });
  if (exists) return NextResponse.json({ error: "That code already exists." }, { status: 400 });

  const coupon = await prisma.coupon.create({ data: { businessId, code, ...clean(b) } });
  return NextResponse.json({ coupon });
}
