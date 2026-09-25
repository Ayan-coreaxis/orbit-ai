import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getActiveBusinessId } from "@/lib/get-active-business-id";

export async function POST(req: NextRequest) {
  const businessId = await getActiveBusinessId();
  if (!businessId) return NextResponse.json({ error: "No active business." }, { status: 400 });

  const { name, variantAText, variantBText } = (await req.json()) as {
    name?: string;
    variantAText?: string;
    variantBText?: string;
  };
  if (!name?.trim() || !variantAText?.trim() || !variantBText?.trim()) {
    return NextResponse.json({ error: "Name and both variant texts are required." }, { status: 400 });
  }

  // Only one active experiment at a time — deactivate any others so the storefront banner is unambiguous.
  await prisma.experiment.updateMany({ where: { businessId, active: true }, data: { active: false } });

  const experiment = await prisma.experiment.create({
    data: { businessId, name: name.trim(), variantAText: variantAText.trim(), variantBText: variantBText.trim() },
  });
  return NextResponse.json({ experiment });
}
