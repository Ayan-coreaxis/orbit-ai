import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getActiveBusinessId } from "@/lib/get-active-business-id";
import { getSkills, publicSkill } from "@/lib/skills";

export async function GET() {
  const businessId = await getActiveBusinessId();
  if (!businessId) return NextResponse.json({ error: "No active business." }, { status: 401 });
  const skills = await getSkills(businessId);
  return NextResponse.json({ skills: skills.map(publicSkill) });
}

export async function POST(req: NextRequest) {
  const businessId = await getActiveBusinessId();
  if (!businessId) return NextResponse.json({ error: "No active business." }, { status: 401 });

  const body = await req.json();
  const name = typeof body.name === "string" ? body.name.trim() : "";
  const description = typeof body.description === "string" ? body.description.trim() : "";
  const instructions = typeof body.instructions === "string" ? body.instructions.trim() : "";
  const alwaysOn = body.alwaysOn === true;

  if (!name || !description || !instructions) {
    return NextResponse.json({ error: "Name, description and instructions are all required." }, { status: 400 });
  }

  const skill = await prisma.skill.create({ data: { businessId, name, description, instructions, alwaysOn } });
  return NextResponse.json(publicSkill(skill));
}
