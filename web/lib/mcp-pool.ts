import { prisma } from "@/lib/prisma";
import { anthropic, MODEL_FAST } from "@/lib/anthropic";
import { estimateCostUsd } from "@/lib/pricing";
import type { McpConnection } from "@prisma/client";

/**
 * The business-level MCP pool. Connections here belong to no single agent — when a specialist
 * runs, `pickRelevantConnections` decides which of these actually help with THAT cycle's task,
 * and only those are connected for real (see lib/agent-tools.ts). The session is dropped when the
 * run ends; nothing is kept warm or pinned to an agent.
 */

export async function getMcpPool(businessId: string): Promise<McpConnection[]> {
  return prisma.mcpConnection.findMany({
    where: { businessId },
    orderBy: { createdAt: "desc" },
  });
}

/** Shape returned to the browser — the real auth token is never included, only whether one is set. */
export function publicConnection(c: McpConnection) {
  return {
    id: c.id,
    name: c.name,
    connectorId: c.connectorId,
    mcpServerUrl: c.mcpServerUrl,
    authType: c.authType,
    hasAuthToken: !!c.authToken,
    oauthConnected: c.authType === "oauth" && !!c.oauthAccessToken,
    oauthPending: c.authType === "oauth" && !c.oauthAccessToken,
    skill: c.skill,
    enabled: c.enabled,
    lastStatus: c.lastStatus,
    lastCheckedAt: c.lastCheckedAt,
    lastToolNames: safeParseNames(c.lastToolNames),
    createdAt: c.createdAt,
  };
}

export function safeParseNames(raw: string | null): string[] {
  if (!raw) return [];
  try {
    const v = JSON.parse(raw);
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}

/**
 * One cheap Haiku call: given this cycle's real task and the pool, return the connection ids that
 * genuinely help. Returns them all when there's only one (a call isn't worth it) and returns []
 * on any parsing/model trouble rather than guessing — a run with no external tools is always safe.
 */
export async function pickRelevantConnections(
  businessId: string,
  agentId: string,
  agentName: string,
  taskContext: string,
  pool: McpConnection[],
): Promise<McpConnection[]> {
  // An OAuth connection the seller hasn't finished signing into can't be used — leave it out.
  const enabled = pool.filter((c) => c.enabled && !(c.authType === "oauth" && !c.oauthAccessToken));
  if (enabled.length === 0) return [];
  if (enabled.length === 1) return enabled;

  const list = enabled
    .map((c, i) => `${i + 1}. id=${c.id} — "${c.name}"${c.skill ? `: ${c.skill.slice(0, 240)}` : " (no usage notes given)"}`)
    .join("\n");

  const prompt = `You route external tools to an AI agent. The "${agentName}" agent is about to work on this task:

${taskContext.slice(0, 1500)}

These MCP tool servers are connected to the business:
${list}

Return a JSON array of the id strings for ONLY the servers that would genuinely help with THIS task. Most tasks need none — return [] freely. Never include a server just because it exists. Respond with ONLY the JSON array.`;

  try {
    const msg = await anthropic.messages.create({
      model: MODEL_FAST,
      max_tokens: 200,
      messages: [{ role: "user", content: prompt }],
    });
    await prisma.agentUsage.create({
      data: {
        businessId,
        agentId: `${agentId}-mcp-router`,
        model: MODEL_FAST,
        inputTokens: msg.usage.input_tokens,
        outputTokens: msg.usage.output_tokens,
        costUsd: estimateCostUsd(MODEL_FAST, msg.usage.input_tokens, msg.usage.output_tokens),
      },
    });
    const raw = msg.content[0]?.type === "text" ? msg.content[0].text : "[]";
    const parsed = JSON.parse(raw.replace(/```json|```/g, "").trim());
    if (!Array.isArray(parsed)) return [];
    const wanted = new Set(parsed.filter((x): x is string => typeof x === "string"));
    return enabled.filter((c) => wanted.has(c.id));
  } catch {
    return [];
  }
}

/** Best-effort health-status write after a real connection attempt — never throws. */
export async function recordConnectionStatus(id: string, status: "ok" | "error", toolNames?: string[]): Promise<void> {
  try {
    await prisma.mcpConnection.update({
      where: { id },
      data: {
        lastStatus: status,
        lastCheckedAt: new Date(),
        ...(status === "ok" && toolNames ? { lastToolNames: JSON.stringify(toolNames.slice(0, 40)) } : {}),
      },
    });
  } catch {
    /* status is display-only; a failed write must not break a run */
  }
}
