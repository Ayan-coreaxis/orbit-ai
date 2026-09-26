import { NextResponse } from "next/server";
import { getActiveBusinessId } from "@/lib/get-active-business-id";
import { prisma } from "@/lib/prisma";
import { studioStatus } from "@/lib/studio/config";
import { jobViews } from "@/lib/studio/engine";
import { brandFace } from "@/lib/studio/refs";

/** Everything the Content page's Studio needs: allowance, products to pick from, recent work. */
export async function GET() {
  const businessId = await getActiveBusinessId();
  if (!businessId) return NextResponse.json({ error: "No active business." }, { status: 400 });
  const [status, products, jobs, face] = await Promise.all([
    studioStatus(businessId),
    prisma.product.findMany({ where: { businessId }, orderBy: { createdAt: "asc" }, take: 200, select: { id: true, name: true, imageUrl: true } }),
    prisma.studioJob.findMany({ where: { businessId, status: { not: "hidden" } }, orderBy: { createdAt: "desc" }, take: 40 }),
    brandFace(businessId),
  ]);
  return NextResponse.json({
    status,
    products,
    jobs: await jobViews(businessId, jobs),
    brandFace: face ? { id: face.id, url: face.url } : null,
  });
}
