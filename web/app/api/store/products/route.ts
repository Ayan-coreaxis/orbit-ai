import { NextRequest, NextResponse } from "next/server";
import { getActiveBusinessId } from "@/lib/get-active-business-id";
import { prisma } from "@/lib/prisma";
import { saveProductVariants } from "@/lib/product-variants-save";

export async function GET() {
  const businessId = await getActiveBusinessId();
  if (!businessId) return NextResponse.json({ error: "No active business." }, { status: 400 });
  const products = await prisma.product.findMany({
    where: { businessId },
    orderBy: { createdAt: "desc" },
    include: { variants: { orderBy: { createdAt: "asc" } } },
  });
  return NextResponse.json({ products });
}

export async function POST(req: NextRequest) {
  const businessId = await getActiveBusinessId();
  if (!businessId) return NextResponse.json({ error: "No active business." }, { status: 400 });

  const b = (await req.json()) as {
    name?: string;
    price?: number;
    stock?: number;
    description?: string;
    imageUrl?: string;
    costPrice?: number | null;
    optionTypes?: unknown;
    variants?: unknown;
  };
  const name = (b.name ?? "").trim();
  const price = Number(b.price);
  if (!name) return NextResponse.json({ error: "Product needs a name." }, { status: 400 });
  if (!Number.isFinite(price) || price < 0) return NextResponse.json({ error: "Price must be a positive number." }, { status: 400 });
  const cost = b.costPrice === null || b.costPrice === undefined || (b.costPrice as unknown) === "" ? null : Number(b.costPrice);
  if (cost !== null && (!Number.isFinite(cost) || cost < 0))
    return NextResponse.json({ error: "Cost price must be a positive number." }, { status: 400 });

  const product = await prisma.product.create({
    data: {
      businessId,
      name: name.slice(0, 140),
      price,
      stock: Number.isFinite(Number(b.stock)) ? Math.max(0, Math.floor(Number(b.stock))) : 0,
      description: b.description?.slice(0, 4000) || null,
      imageUrl: b.imageUrl?.trim().slice(0, 500) || null,
      costPrice: cost,
    },
  });

  const optionTypes = await saveProductVariants(product.id, b);
  const withVariants = await prisma.product.update({
    where: { id: product.id },
    data: { optionTypes },
    include: { variants: { orderBy: { createdAt: "asc" } } },
  });
  return NextResponse.json({ product: withVariants });
}
