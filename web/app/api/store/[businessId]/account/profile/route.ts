import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getStoreCustomer } from "@/lib/store-auth";

/** The signed-in customer edits their own name / email / phone. */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ businessId: string }> }) {
  const { businessId } = await params;
  const customer = await getStoreCustomer(businessId);
  if (!customer) return NextResponse.json({ error: "Sign in first." }, { status: 401 });

  const b = (await req.json().catch(() => ({}))) as { name?: string; email?: string; phone?: string };
  const data: Record<string, unknown> = {};
  if (b.name !== undefined) {
    const name = b.name.trim().slice(0, 120);
    if (!name) return NextResponse.json({ error: "Name can't be empty." }, { status: 400 });
    data.name = name;
  }
  if (b.email !== undefined) data.email = b.email.trim().toLowerCase().slice(0, 160) || null;
  if (b.phone !== undefined) data.phone = b.phone.trim().slice(0, 40) || null;

  // don't let an edit collide with another customer of this store
  if (data.email || data.phone) {
    const clash = await prisma.storeCustomer.findFirst({
      where: {
        businessId,
        id: { not: customer.id },
        OR: [data.email ? { email: data.email as string } : {}, data.phone ? { phone: data.phone as string } : {}].filter(
          (x) => Object.keys(x).length,
        ),
      },
    });
    if (clash) return NextResponse.json({ error: "Another account already uses those details." }, { status: 409 });
  }

  const updated = await prisma.storeCustomer.update({
    where: { id: customer.id },
    data,
    select: { id: true, name: true, email: true, phone: true },
  });
  return NextResponse.json({ ok: true, customer: updated });
}
