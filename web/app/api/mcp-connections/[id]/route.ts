import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getActiveBusinessId } from "@/lib/get-active-business-id";
import { publicConnection } from "@/lib/mcp-pool";

async function assertOwned(businessId: string, id: string) {
  const conn = await prisma.mcpConnection.findUnique({ where: { id } });
  return conn && conn.businessId === businessId ? conn : null;
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const businessId = await getActiveBusinessId();
  if (!businessId) return NextResponse.json({ error: "No active business." }, { status: 401 });
  const { id } = await params;
  if (!(await assertOwned(businessId, id))) return NextResponse.json({ error: "Not found." }, { status: 404 });

  const body = await req.json();
  const updated = await prisma.mcpConnection.update({
    where: { id },
    data: {
      ...(typeof body.enabled === "boolean" && { enabled: body.enabled }),
      ...(typeof body.name === "string" && body.name.trim() && { name: body.name.trim() }),
      ...(typeof body.skill === "string" && { skill: body.skill.trim() || null }),
      ...(typeof body.authToken === "string" && {
        authToken: body.authToken.trim() || null,
        authType: body.authToken.trim() ? "api_key" : "none",
      }),
      ...(typeof body.mcpServerUrl === "string" && body.mcpServerUrl.trim() && { mcpServerUrl: body.mcpServerUrl.trim() }),
    },
  });
  return NextResponse.json(publicConnection(updated));
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const businessId = await getActiveBusinessId();
  if (!businessId) return NextResponse.json({ error: "No active business." }, { status: 401 });
  const { id } = await params;
  if (!(await assertOwned(businessId, id))) return NextResponse.json({ error: "Not found." }, { status: 404 });
  await prisma.mcpConnection.delete({ where: { id } });
  return NextResponse.json({ deleted: true });
}
