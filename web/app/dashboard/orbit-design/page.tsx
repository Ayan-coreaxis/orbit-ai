import { Card } from "@/components/ui";
import { getActiveBusinessId } from "@/lib/get-active-business-id";
import { prisma } from "@/lib/prisma";
import { loadDoc } from "@/lib/orbit-design-generate";
import type { StorefrontProduct } from "@/lib/orbit-design";
import { toStorefrontProducts } from "@/lib/storefront-products";
import { Studio } from "@/components/orbit-design/Studio";

export const dynamic = "force-dynamic";

export default async function OrbitDesignPage() {
  const businessId = await getActiveBusinessId();

  if (!businessId) {
    return (
      <div className="p-5 sm:p-8 lg:p-10">
        <Card className="p-6">
          <p className="text-[13.5px] text-text-faint">No business yet — complete onboarding first.</p>
        </Card>
      </div>
    );
  }

  const [doc, design, business, products, turns] = await Promise.all([
    loadDoc(businessId),
    prisma.storeDesign.findUnique({ where: { businessId }, select: { published: true, backendWiredAt: true } }),
    prisma.business.findUnique({ where: { id: businessId }, select: { website: true, name: true, storeCurrency: true } }),
    prisma.product.findMany({
      where: { businessId },
      orderBy: { createdAt: "desc" },
      take: 24,
      include: { category: { select: { name: true } }, variants: { select: { price: true, stock: true } } },
    }),
    prisma.orbitDesignTurn.findMany({ where: { businessId }, orderBy: { createdAt: "asc" }, take: 40 }),
  ]);

  const sfProducts: StorefrontProduct[] = toStorefrontProducts(
    products.map((p) => ({
      id: p.id,
      name: p.name,
      price: p.price,
      imageUrl: p.imageUrl,
      description: p.description,
      stock: p.stock,
      optionTypes: p.optionTypes,
      category: p.category,
      variants: p.variants,
    })),
  );

  return (
    <Studio
      businessId={businessId}
      initialDoc={doc}
      initialPublished={design?.published ?? false}
      initialWired={!!design?.backendWiredAt}
      website={business?.website ?? ""}
      currency={business?.storeCurrency ?? "pkr"}
      products={sfProducts}
      history={turns.map((t) => ({ role: t.role as "user" | "assistant", content: t.content }))}
    />
  );
}
