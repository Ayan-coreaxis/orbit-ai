import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getActiveBusinessId } from "@/lib/get-active-business-id";

/** Seller-only: moderate a customer record (publish / hide). */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ businessId: string; collection: string; id: string }> },
) {
  const { businessId, id } = await params;
  const active = await getActiveBusinessId();
  if (!active || active !== businessId) return NextResponse.json({ error: "Not authorised." }, { status: 403 });

  const b = (await req.json()) as { status?: string };
  const status = ["published", "pending", "hidden"].includes(b.status ?? "") ? b.status! : null;
  if (!status) return NextResponse.json({ error: "Bad status." }, { status: 400 });

  const rec = await prisma.storeRecord.findFirst({ where: { id, businessId }, select: { id: true } });
  if (!rec) return NextResponse.json({ error: "Not found." }, { status: 404 });

  await prisma.storeRecord.update({ where: { id: rec.id }, data: { status } });
  return NextResponse.json({ ok: true, status });
}
