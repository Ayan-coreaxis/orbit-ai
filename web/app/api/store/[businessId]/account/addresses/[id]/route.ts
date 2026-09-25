import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getStoreCustomer } from "@/lib/store-auth";

interface PatchBody {
  label?: string;
  name?: string;
  phone?: string;
  line1?: string;
  city?: string;
  area?: string;
  postalCode?: string;
  province?: string;
  isDefault?: boolean;
}

async function own(businessId: string, id: string) {
  const customer = await getStoreCustomer(businessId);
  if (!customer) return { error: NextResponse.json({ error: "Sign in first." }, { status: 401 }) };
  const address = await prisma.customerAddress.findFirst({ where: { id, businessId, customerId: customer.id } });
  if (!address) return { error: NextResponse.json({ error: "Address not found." }, { status: 404 }) };
  return { customer, address };
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ businessId: string; id: string }> }) {
  const { businessId, id } = await params;
  const o = await own(businessId, id);
  if ("error" in o) return o.error;

  const b = (await req.json().catch(() => ({}))) as PatchBody;
  const data: Record<string, unknown> = {};
  const str = (v: string | undefined, max: number) => (v === undefined ? undefined : v.trim().slice(0, max));
  if (b.label !== undefined) data.label = str(b.label, 40) || null;
  if (b.name !== undefined) data.name = str(b.name, 120);
  if (b.phone !== undefined) data.phone = str(b.phone, 40);
  if (b.line1 !== undefined) data.line1 = str(b.line1, 200);
  if (b.city !== undefined) data.city = str(b.city, 80);
  if (b.area !== undefined) data.area = str(b.area, 80) || null;
  if (b.postalCode !== undefined) data.postalCode = str(b.postalCode, 20) || null;
  if (b.province !== undefined) data.province = str(b.province, 60) || null;

  if (b.isDefault === true) {
    await prisma.customerAddress.updateMany({ where: { businessId, customerId: o.customer.id }, data: { isDefault: false } });
    data.isDefault = true;
  }

  const address = await prisma.customerAddress.update({ where: { id }, data });
  return NextResponse.json({ ok: true, address });
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ businessId: string; id: string }> }) {
  const { businessId, id } = await params;
  const o = await own(businessId, id);
  if ("error" in o) return o.error;

  await prisma.customerAddress.delete({ where: { id } });
  // if we removed the default, promote the newest remaining one
  if (o.address.isDefault) {
    const next = await prisma.customerAddress.findFirst({
      where: { businessId, customerId: o.customer.id },
      orderBy: { createdAt: "desc" },
    });
    if (next) await prisma.customerAddress.update({ where: { id: next.id }, data: { isDefault: true } });
  }
  return NextResponse.json({ ok: true });
}
