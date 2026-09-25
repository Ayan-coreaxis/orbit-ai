import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getStoreCustomer } from "@/lib/store-auth";

/** The signed-in customer's saved delivery addresses for THIS store. */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ businessId: string }> }) {
  const { businessId } = await params;
  const customer = await getStoreCustomer(businessId);
  if (!customer) return NextResponse.json({ error: "Sign in first." }, { status: 401 });

  const addresses = await prisma.customerAddress.findMany({
    where: { businessId, customerId: customer.id },
    orderBy: [{ isDefault: "desc" }, { createdAt: "desc" }],
  });
  return NextResponse.json({ addresses });
}

interface AddressBody {
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

function clean(b: AddressBody) {
  return {
    label: (b.label ?? "").trim().slice(0, 40) || null,
    name: (b.name ?? "").trim().slice(0, 120),
    phone: (b.phone ?? "").trim().slice(0, 40),
    line1: (b.line1 ?? "").trim().slice(0, 200),
    city: (b.city ?? "").trim().slice(0, 80),
    area: (b.area ?? "").trim().slice(0, 80) || null,
    postalCode: (b.postalCode ?? "").trim().slice(0, 20) || null,
    province: (b.province ?? "").trim().slice(0, 60) || null,
  };
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ businessId: string }> }) {
  const { businessId } = await params;
  const customer = await getStoreCustomer(businessId);
  if (!customer) return NextResponse.json({ error: "Sign in first." }, { status: 401 });

  const body = (await req.json().catch(() => ({}))) as AddressBody;
  const data = clean(body);
  if (!data.name || !data.phone || !data.line1 || !data.city)
    return NextResponse.json({ error: "Name, phone, address and city are required." }, { status: 400 });

  const count = await prisma.customerAddress.count({ where: { businessId, customerId: customer.id } });
  if (count >= 20) return NextResponse.json({ error: "You can save up to 20 addresses." }, { status: 400 });

  const makeDefault = body.isDefault === true || count === 0;
  if (makeDefault)
    await prisma.customerAddress.updateMany({ where: { businessId, customerId: customer.id }, data: { isDefault: false } });

  const address = await prisma.customerAddress.create({
    data: { businessId, customerId: customer.id, ...data, isDefault: makeDefault },
  });
  return NextResponse.json({ ok: true, address });
}
