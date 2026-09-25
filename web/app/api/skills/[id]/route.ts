import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getActiveBusinessId } from "@/lib/get-active-business-id";
import { publicSkill } from "@/lib/skills";

async function assertOwned(businessId: string, id: string) {
  const s = await prisma.skill.findUnique({ where: { id } });
  return s && s.businessId === businessId ? s : null;
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const businessId = await getActiveBusinessId();
  if (!businessId) return NextResponse.json({ error: "No active business." }, { status: 401 });
  const { id } = await params;
  if (!(await assertOwned(businessId, id))) return NextResponse.json({ error: "Not found." }, { status: 404 });

  const body = await req.json();
  const updated = await prisma.skill.update({
    where: { id },
    data: {
      ...(typeof body.name === "string" && body.name.trim() && { name: body.name.trim() }),
      ...(typeof body.description === "string" && body.description.trim() && { description: body.description.trim() }),
      ...(typeof body.instructions === "string" && body.instructions.trim() && { instructions: body.instructions.trim() }),
      ...(typeof body.alwaysOn === "boolean" && { alwaysOn: body.alwaysOn }),
      ...(typeof body.enabled === "boolean" && { enabled: body.enabled }),
    },
  });
  return NextResponse.json(publicSkill(updated));
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const businessId = await getActiveBusinessId();
  if (!businessId) return NextResponse.json({ error: "No active business." }, { status: 401 });
  const { id } = await params;
  if (!(await assertOwned(businessId, id))) return NextResponse.json({ error: "Not found." }, { status: 404 });
  await prisma.skill.delete({ where: { id } });
  return NextResponse.json({ deleted: true });
}
