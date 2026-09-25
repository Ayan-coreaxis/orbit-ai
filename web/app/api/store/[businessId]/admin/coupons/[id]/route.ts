import { NextRequest, NextResponse } from "next/server";
import { getActiveBusinessId } from "@/lib/get-active-business-id";
import { prisma } from "@/lib/prisma";

async function guard(businessId: string, id: string) {
  const active = await getActiveBusinessId();
  if (!active || active !== businessId) return null;
  const c = await prisma.coupon.findUnique({ where: { id } });
  return c && c.businessId === businessId ? c : null;
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ businessId: string; id: string }> }) {
  const { businessId, id } = await params;
  if (!(await guard(businessId, id))) return NextResponse.json({ error: "Not found." }, { status: 404 });

  const b = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const data: Record<string, unknown> = {};
  if (b.active !== undefined) data.active = !!b.active;
  if (b.value !== undefined) data.value = Math.max(0, Number(b.value) || 0);
  if (b.autoApply !== undefined) data.autoApply = !!b.autoApply;
  if (b.expiresAt !== undefined) data.expiresAt = b.expiresAt ? new Date(String(b.expiresAt)) : null;

  const coupon = await prisma.coupon.update({ where: { id }, data });
  return NextResponse.json({ coupon });
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ businessId: string; id: string }> }) {
  const { businessId, id } = await params;
  if (!(await guard(businessId, id))) return NextResponse.json({ error: "Not found." }, { status: 404 });
  await prisma.coupon.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
