import { NextRequest, NextResponse } from "next/server";
import { after } from "next/server";
import { getActiveBusinessId } from "@/lib/get-active-business-id";
import { prisma } from "@/lib/prisma";
import { saveProductVariants } from "@/lib/product-variants-save";
import { fireBackInStock } from "@/lib/stock-notify";
import { originFromRequest } from "@/lib/order-notify";

async function ownedProduct(id: string, businessId: string) {
  const p = await prisma.product.findUnique({ where: { id }, select: { businessId: true } });
  return p && p.businessId === businessId;
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const businessId = await getActiveBusinessId();
  if (!businessId) return NextResponse.json({ error: "No active business." }, { status: 400 });
  const { id } = await params;
  if (!(await ownedProduct(id, businessId))) return NextResponse.json({ error: "Not found." }, { status: 404 });

  const before = await prisma.product.findUnique({
    where: { id },
    select: { stock: true, variants: { select: { id: true, stock: true } } },
  });

  const b = (await req.json()) as Record<string, unknown>;
  const data: Record<string, unknown> = {};
  if (typeof b.name === "string" && b.name.trim()) data.name = b.name.trim().slice(0, 140);
  if (b.price !== undefined && Number.isFinite(Number(b.price)) && Number(b.price) >= 0) data.price = Number(b.price);
  if (b.stock !== undefined && Number.isFinite(Number(b.stock))) data.stock = Math.max(0, Math.floor(Number(b.stock)));
  if (b.description !== undefined) data.description = String(b.description ?? "").slice(0, 4000) || null;
  if (b.imageUrl !== undefined) data.imageUrl = String(b.imageUrl ?? "").trim().slice(0, 500) || null;
  if (b.costPrice !== undefined) data.costPrice = b.costPrice === null ? null : Number(b.costPrice);

  if (b.optionTypes !== undefined || b.variants !== undefined) {
    data.optionTypes = await saveProductVariants(id, b);
  }

  const product = await prisma.product.update({
    where: { id },
    data,
    include: { variants: { orderBy: { createdAt: "asc" } } },
  });

  // anything that just went from 0 → in stock triggers the "back in stock" emails
  const origin = originFromRequest(req);
  const beforeVar = new Map((before?.variants ?? []).map((v) => [v.id, v.stock]));
  after(async () => {
    if ((before?.stock ?? 0) <= 0 && product.stock > 0) await fireBackInStock(businessId, id, origin).catch(() => {});
    for (const v of product.variants) {
      if ((beforeVar.get(v.id) ?? 0) <= 0 && v.stock > 0) await fireBackInStock(businessId, id, origin, v.id).catch(() => {});
    }
  });

  return NextResponse.json({ product });
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const businessId = await getActiveBusinessId();
  if (!businessId) return NextResponse.json({ error: "No active business." }, { status: 400 });
  const { id } = await params;
  if (!(await ownedProduct(id, businessId))) return NextResponse.json({ error: "Not found." }, { status: 404 });
  await prisma.product.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
