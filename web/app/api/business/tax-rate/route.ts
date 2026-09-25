import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getActiveBusinessId } from "@/lib/get-active-business-id";

export async function PATCH(req: NextRequest) {
  const businessId = await getActiveBusinessId();
  if (!businessId) return NextResponse.json({ error: "No active business." }, { status: 400 });

  const { taxRatePercent } = (await req.json()) as { taxRatePercent?: number | null };
  if (taxRatePercent !== null) {
    const rate = Number(taxRatePercent);
    if (!Number.isFinite(rate) || rate < 0 || rate > 100) {
      return NextResponse.json({ error: "Tax rate must be between 0 and 100." }, { status: 400 });
    }
  }

  const business = await prisma.business.update({
    where: { id: businessId },
    data: { taxRatePercent: taxRatePercent === null ? null : Number(taxRatePercent) },
  });
  return NextResponse.json({ taxRatePercent: business.taxRatePercent });
}
