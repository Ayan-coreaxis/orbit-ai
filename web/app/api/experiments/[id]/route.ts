import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getActiveBusinessId } from "@/lib/get-active-business-id";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const businessId = await getActiveBusinessId();
  if (!businessId) return NextResponse.json({ error: "No active business." }, { status: 400 });

  const existing = await prisma.experiment.findUnique({ where: { id } });
  if (!existing || existing.businessId !== businessId) {
    return NextResponse.json({ error: "Experiment not found." }, { status: 404 });
  }

  const { active } = (await req.json()) as { active?: boolean };
  const experiment = await prisma.experiment.update({ where: { id }, data: { active: Boolean(active) } });
  return NextResponse.json({ experiment });
}
