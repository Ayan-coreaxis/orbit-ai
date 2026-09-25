import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { listAllBundles, createBundle, updateBundleStatus, deleteBundle } from "@/lib/bundles";
import { getActiveBusinessId } from "@/lib/get-active-business-id";

/** Seller view: every bundle (active + disabled) plus the product catalog to build one from. */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ businessId: string }> }) {
  const { businessId } = await params;
  const active = await getActiveBusinessId();
  if (!active || active !== businessId) return NextResponse.json({ error: "Not authorized." }, { status: 403 });

  const [bundles, products] = await Promise.all([
    listAllBundles(businessId),
    prisma.product.findMany({
      where: { businessId },
      orderBy: { name: "asc" },
      select: { id: true, name: true, price: true, stock: true, variants: { select: { id: true, label: true, price: true, stock: true } } },
    }),
  ]);

  return NextResponse.json({ bundles, products });
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ businessId: string }> }) {
  const { businessId } = await params;
  const active = await getActiveBusinessId();
  if (!active || active !== businessId) return NextResponse.json({ error: "Not authorized." }, { status: 403 });

  const body = (await req.json().catch(() => ({}))) as {
    name?: string;
    description?: string;
    price?: number;
    items?: { productId: string; variantId?: string | null; qty: number }[];
  };
  try {
    const bundle = await createBundle(businessId, {
      name: body.name ?? "",
      description: body.description,
      price: Number(body.price),
      items: body.items ?? [],
    });
    return NextResponse.json({ ok: true, bundle });
  } catch (e) {
    return NextResponse.json({ error: String(e instanceof Error ? e.message : e).slice(0, 200) }, { status: 400 });
  }
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ businessId: string }> }) {
  const { businessId } = await params;
  const active = await getActiveBusinessId();
  if (!active || active !== businessId) return NextResponse.json({ error: "Not authorized." }, { status: 403 });

  const body = (await req.json().catch(() => ({}))) as { bundleId?: string; status?: "active" | "disabled" };
  if (!body.bundleId || (body.status !== "active" && body.status !== "disabled"))
    return NextResponse.json({ error: "Missing bundle or status." }, { status: 400 });
  await updateBundleStatus(businessId, body.bundleId, body.status);
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ businessId: string }> }) {
  const { businessId } = await params;
  const active = await getActiveBusinessId();
  if (!active || active !== businessId) return NextResponse.json({ error: "Not authorized." }, { status: 403 });

  const bundleId = req.nextUrl.searchParams.get("bundleId") || "";
  if (!bundleId) return NextResponse.json({ error: "Missing bundle." }, { status: 400 });
  await deleteBundle(businessId, bundleId);
  return NextResponse.json({ ok: true });
}
