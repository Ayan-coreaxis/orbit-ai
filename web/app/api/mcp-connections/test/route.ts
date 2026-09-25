import { NextRequest, NextResponse } from "next/server";
import { getActiveBusinessId } from "@/lib/get-active-business-id";
import { connectMcp, listMcpTools } from "@/lib/mcp-client";

/** Real, live check of an MCP server before the seller saves it — actually connects and lists real tools. */
export async function POST(req: NextRequest) {
  const businessId = await getActiveBusinessId();
  if (!businessId) return NextResponse.json({ error: "No active business." }, { status: 401 });

  const { mcpServerUrl, authToken } = (await req.json()) as { mcpServerUrl?: string; authToken?: string };
  if (!mcpServerUrl) return NextResponse.json({ error: "MCP server URL is required." }, { status: 400 });

  try {
    const { sessionId } = await connectMcp(mcpServerUrl, authToken);
    const tools = await listMcpTools(mcpServerUrl, authToken, sessionId);
    return NextResponse.json({ ok: true, toolCount: tools.length, toolNames: tools.map((t) => t.name).slice(0, 20) });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : "Couldn't connect." }, { status: 502 });
  }
}
