import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getActiveBusinessId } from "@/lib/get-active-business-id";
import { getMcpPool, publicConnection } from "@/lib/mcp-pool";
import { getConnector } from "@/lib/known-mcp-connectors";

export async function GET() {
  const businessId = await getActiveBusinessId();
  if (!businessId) return NextResponse.json({ error: "No active business." }, { status: 401 });
  const pool = await getMcpPool(businessId);
  return NextResponse.json({ connections: pool.map(publicConnection) });
}

export async function POST(req: NextRequest) {
  const businessId = await getActiveBusinessId();
  if (!businessId) return NextResponse.json({ error: "No active business." }, { status: 401 });

  const body = await req.json();
  const name = typeof body.name === "string" ? body.name.trim() : "";
  const mcpServerUrl = typeof body.mcpServerUrl === "string" ? body.mcpServerUrl.trim() : "";
  const authToken = typeof body.authToken === "string" ? body.authToken.trim() : null;
  const skill = typeof body.skill === "string" ? body.skill.trim() : null;
  const connectorId = typeof body.connectorId === "string" && getConnector(body.connectorId) ? body.connectorId : null;

  if (!name || !mcpServerUrl) {
    return NextResponse.json({ error: "Name and MCP server URL are required." }, { status: 400 });
  }
  if (!mcpServerUrl.startsWith("https://") && !mcpServerUrl.startsWith("http://")) {
    return NextResponse.json({ error: "That doesn't look like a real server URL." }, { status: 400 });
  }

  const connection = await prisma.mcpConnection.create({
    data: {
      businessId,
      name,
      mcpServerUrl,
      connectorId,
      authToken: authToken || null,
      authType: authToken ? "api_key" : "none",
      skill: skill || null,
    },
  });
  return NextResponse.json(publicConnection(connection));
}
