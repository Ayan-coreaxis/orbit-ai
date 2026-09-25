import { prisma } from "@/lib/prisma";

const round2 = (n: number) => Math.round(n * 100) / 100;

export interface BundleItemInput {
  productId: string;
  variantId?: string | null;
  qty: number;
}

export interface BundleSummary {
  id: string;
  name: string;
  description: string | null;
  imageUrl: string | null;
  price: number;
  status: string;
  items: {
    productId: string;
    variantId: string | null;
    qty: number;
    name: string;
    variantLabel: string | null;
    price: number; // real catalog price of that item, for the "worth Rs X" comparison
    stock: number;
  }[];
}

async function loadBundle(businessId: string, bundleId: string) {
  return prisma.bundle.findFirst({
    where: { id: bundleId, businessId },
    include: { items: { include: { product: true, variant: true } } },
  });
}

function summarize(b: NonNullable<Awaited<ReturnType<typeof loadBundle>>>): BundleSummary {
  return {
    id: b.id,
    name: b.name,
    description: b.description,
    imageUrl: b.imageUrl,
    price: b.price,
    status: b.status,
    items: b.items.map((it) => ({
      productId: it.productId,
      variantId: it.variantId,
      qty: it.qty,
      name: it.product.name,
      variantLabel: it.variant?.label ?? null,
      price: it.variant?.price ?? it.product.price,
      stock: it.variant ? it.variant.stock : it.product.stock,
    })),
  };
}

/** Every real, active bundle for the storefront to show — worth-comparison price comes along so
 *  the UI can show "Rs X worth for Rs Y" without a second round trip. */
export async function listActiveBundles(businessId: string): Promise<BundleSummary[]> {
  const bundles = await prisma.bundle.findMany({
    where: { businessId, status: "active" },
    orderBy: { createdAt: "desc" },
    include: { items: { include: { product: true, variant: true } } },
  });
  return bundles.map(summarize);
}

export async function getBundle(businessId: string, bundleId: string): Promise<BundleSummary | null> {
  const b = await loadBundle(businessId, bundleId);
  return b ? summarize(b) : null;
}

export interface ResolvedBundleLine {
  productId: string;
  variantId: string | null;
  variantLabel: string | null;
  name: string;
  catalogPrice: number; // real per-unit catalog price — for display only, not what's charged
  stock: number;
  qty: number; // units of this product needed per ONE bundle set
}

export interface BundleQuote {
  ok: boolean;
  error?: string;
  bundleId?: string;
  name?: string;
  price?: number; // flat price for ONE bundle set
  lines?: ResolvedBundleLine[];
}

/** Real, server-side resolution of a bundle for checkout — re-fetches the bundle, its items, and
 *  every constituent product/variant's REAL current stock so a stale client can't lie about either
 *  the bundle price or what's actually in stock. Mirrors `resolvePurchasable`'s "never trust the
 *  client" stance. */
export async function resolveBundleForCheckout(businessId: string, bundleId: string): Promise<BundleQuote> {
  const b = await loadBundle(businessId, bundleId);
  if (!b) return { ok: false, error: "This bundle is no longer available." };
  if (b.status !== "active") return { ok: false, error: "This bundle is no longer available." };
  if (b.items.length === 0) return { ok: false, error: "This bundle has no items." };

  const lines: ResolvedBundleLine[] = b.items.map((it) => ({
    productId: it.productId,
    variantId: it.variantId,
    variantLabel: it.variant?.label ?? null,
    name: it.product.name,
    catalogPrice: it.variant?.price ?? it.product.price,
    stock: it.variant ? it.variant.stock : it.product.stock,
    qty: it.qty,
  }));

  return { ok: true, bundleId: b.id, name: b.name, price: round2(b.price), lines };
}

// ---------------- seller admin ----------------

export async function listAllBundles(businessId: string) {
  const bundles = await prisma.bundle.findMany({
    where: { businessId },
    orderBy: { createdAt: "desc" },
    include: { items: { include: { product: true, variant: true } } },
  });
  return bundles.map(summarize);
}

export async function createBundle(
  businessId: string,
  input: { name: string; description?: string | null; imageUrl?: string | null; price: number; items: BundleItemInput[] },
): Promise<{ id: string }> {
  const name = input.name.trim().slice(0, 160);
  if (!name) throw new Error("Give the bundle a name.");
  const price = round2(Math.max(0, Number(input.price) || 0));
  if (price <= 0) throw new Error("Bundle price must be greater than 0.");
  const items = (input.items || []).filter((i) => i.productId && Number(i.qty) > 0);
  if (items.length === 0) throw new Error("Add at least one product to the bundle.");

  const products = await prisma.product.findMany({ where: { id: { in: items.map((i) => i.productId) }, businessId } });
  const byId = new Set(products.map((p) => p.id));
  for (const i of items) if (!byId.has(i.productId)) throw new Error("One of the chosen products doesn't exist.");

  const bundle = await prisma.bundle.create({
    data: {
      businessId,
      name,
      description: input.description?.trim().slice(0, 500) || null,
      imageUrl: input.imageUrl?.trim() || null,
      price,
      items: {
        create: items.map((i) => ({
          productId: i.productId,
          variantId: i.variantId || null,
          qty: Math.max(1, Math.floor(Number(i.qty) || 1)),
        })),
      },
    },
  });
  return { id: bundle.id };
}

export async function updateBundleStatus(businessId: string, bundleId: string, status: "active" | "disabled"): Promise<void> {
  await prisma.bundle.updateMany({ where: { id: bundleId, businessId }, data: { status } });
}

export async function deleteBundle(businessId: string, bundleId: string): Promise<void> {
  await prisma.bundle.deleteMany({ where: { id: bundleId, businessId } });
}
