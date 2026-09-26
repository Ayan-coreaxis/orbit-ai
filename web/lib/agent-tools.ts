import { connectMcp, listMcpTools, callMcpTool, type McpToolCallResult } from "@/lib/mcp-client";
import { getMcpPool, pickRelevantConnections, recordConnectionStatus } from "@/lib/mcp-pool";
import { getValidAccessToken } from "@/lib/mcp-oauth";
import type { McpConnection } from "@prisma/client";

export interface AnthropicToolDef {
  name: string;
  description: string;
  input_schema: { type: "object"; [key: string]: unknown };
}

interface ToolMapEntry {
  connection: McpConnection;
  realToolName: string;
  sessionId: string | null;
  authToken: string | null;
}

export interface AgentToolSet {
  tools: AnthropicToolDef[];
  /** Seller-written usage instructions for each connected tool — appended to the agent's system prompt. */
  skillLines: string[];
  toolMap: Map<string, ToolMapEntry>;
  /** Names of the connections that were actually loaded this run — for honest activity logging. */
  loadedNames: string[];
}

const EMPTY: AgentToolSet = { tools: [], skillLines: [], toolMap: new Map(), loadedNames: [] };

function namespacedName(connectionId: string, realToolName: string): string {
  return `mcp_${connectionId.slice(0, 8)}_${realToolName}`.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 64);
}

/**
 * Loads the MCP tools relevant to THIS agent run. Flow:
 *   1. read the business-level pool
 *   2. a cheap router call decides which connections actually help with `taskContext`
 *   3. only those are contacted for real (real `initialize` + `tools/list`) and their `skill`
 *      instructions loaded alongside the tools
 * The returned session ids live only for this run — the caller drops the whole set afterwards.
 * A connection that fails is skipped honestly, with a line telling the model not to try it.
 */
export async function loadAgentTools(
  businessId: string,
  agentId: string,
  agentName: string,
  taskContext: string,
): Promise<AgentToolSet> {
  const pool = await getMcpPool(businessId);
  if (pool.filter((c) => c.enabled).length === 0) return EMPTY;

  const chosen = await pickRelevantConnections(businessId, agentId, agentName, taskContext, pool);
  if (chosen.length === 0) return EMPTY;

  const tools: AnthropicToolDef[] = [];
  const skillLines: string[] = [];
  const toolMap = new Map<string, ToolMapEntry>();
  const loadedNames: string[] = [];

  for (const conn of chosen) {
    try {
      const token = await getValidAccessToken(conn);
      if (conn.authType === "oauth" && !token) {
        skillLines.push(`Note: the "${conn.name}" tool isn't signed in yet — skip it this run.`);
        continue;
      }
      const { sessionId } = await connectMcp(conn.mcpServerUrl, token);
      const realTools = await listMcpTools(conn.mcpServerUrl, token, sessionId);
      for (const t of realTools) {
        const name = namespacedName(conn.id, t.name);
        tools.push({
          name,
          description: `[${conn.name}] ${t.description ?? t.name}`,
          input_schema:
            // Anthropic requires a top-level object schema; MCP servers sometimes omit "type".
            t.inputSchema && Object.keys(t.inputSchema).length > 0 ? { ...t.inputSchema, type: "object" } : { type: "object", properties: {} },
        });
        toolMap.set(name, { connection: conn, realToolName: t.name, sessionId, authToken: token });
      }
      if (conn.skill) skillLines.push(`For the "${conn.name}" tool: ${conn.skill}`);
      loadedNames.push(conn.name);
      void recordConnectionStatus(conn.id, "ok", realTools.map((t) => t.name));
    } catch (e) {
      skillLines.push(
        `Note: the "${conn.name}" tool couldn't be reached this run (${e instanceof Error ? e.message : "unknown error"}) — don't attempt to use it, just proceed without it.`,
      );
      void recordConnectionStatus(conn.id, "error");
    }
  }

  return { tools, skillLines, toolMap, loadedNames };
}

/** Executes a real tool call against the real MCP server it actually came from. */
export async function executeAgentTool(
  toolMap: Map<string, ToolMapEntry>,
  name: string,
  args: Record<string, unknown>,
): Promise<McpToolCallResult> {
  const entry = toolMap.get(name);
  if (!entry) return { content: [{ type: "text", text: "Unknown tool." }], isError: true };
  return callMcpTool(entry.connection.mcpServerUrl, entry.authToken, entry.sessionId, entry.realToolName, args);
}
