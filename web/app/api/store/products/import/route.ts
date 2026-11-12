import { NextRequest, NextResponse } from "next/server";
import { getActiveBusinessId } from "@/lib/get-active-business-id";
import { prisma } from "@/lib/prisma";
import { MAX_IMPORT_PRODUCTS, parseStock, sanitizeImportedProducts } from "@/lib/product-import";
import { createImportedProducts } from "@/lib/product-import-server";

export const runtime = "nodejs";
export const maxDuration = 120;

/**
 * Step 2 of bulk import: create the products the seller left ticked in the preview. The list is
 * validated again here; names the store already has are skipped (never overwritten).
 * `defaultStock` is the seller's own number for items whose source gave no stock.
 */
export async function POST(req: NextRequest) {
  const businessId = await getActiveBusinessId();
  if (!businessId) return NextResponse.json({ error: "No active business." }, { status: 400 });

  const body = (await req.json().catch(() => ({}))) as { products?: unknown; defaultStock?: unknown };
  if (Array.isArray(body.products) && body.products.length > MAX_IMPORT_PRODUCTS)
    return NextResponse.json({ error: `At most ${MAX_IMPORT_PRODUCTS} products per import.` }, { status: 400 });
  const products = sanitizeImportedProducts(body.products);
  if (!products.length) return NextResponse.json({ error: "Nothing to import." }, { status: 400 });
  const defaultStock = body.defaultStock == null || body.defaultStock === "" ? null : parseStock(typeof body.defaultStock === "number" ? body.defaultStock : String(body.defaultStock));

  const { created, skipped } = await createImportedProducts(businessId, products, defaultStock);
  const all = await prisma.product.findMany({
    where: { businessId },
    orderBy: { createdAt: "desc" },
    include: { variants: { orderBy: { createdAt: "asc" } } },
  });
  return NextResponse.json({ created, skipped, products: all });
}
