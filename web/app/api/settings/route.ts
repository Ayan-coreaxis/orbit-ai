import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getActiveBusinessId } from "@/lib/get-active-business-id";
import { parseAgentSettings, DEFAULT_AGENT_SETTINGS, type AgentSettings } from "@/lib/agent-settings";

export async function GET() {
  const businessId = await getActiveBusinessId();
  if (!businessId) return NextResponse.json({ settings: DEFAULT_AGENT_SETTINGS });

  const business = await prisma.business.findUnique({
    where: { id: businessId },
    select: { agentSettings: true },
  });
  return NextResponse.json({ settings: parseAgentSettings(business?.agentSettings) });
}

export async function PATCH(req: Request) {
  const businessId = await getActiveBusinessId();
  if (!businessId) {
    return NextResponse.json({ error: "No active business" }, { status: 401 });
  }

  const patch = (await req.json()) as Partial<AgentSettings>;

  const business = await prisma.business.findUnique({
    where: { id: businessId },
    select: { agentSettings: true },
  });
  const current = parseAgentSettings(business?.agentSettings);
  const next: AgentSettings = { ...current, ...patch };

  await prisma.business.update({
    where: { id: businessId },
    data: { agentSettings: JSON.stringify(next) },
  });

  return NextResponse.json({ settings: next });
}
