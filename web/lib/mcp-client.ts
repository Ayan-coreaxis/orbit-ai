import { safeFetch } from "@/lib/safe-fetch";
/**
 * A real MCP (Model Context Protocol) client — speaks JSON-RPC 2.0 over the "Streamable HTTP"
 * transport to a real remote MCP server (e.g. Higgsfield's real server at mcp.higgsfield.ai).
 * Handles the real `initialize` handshake (MCP servers require this before any other call, and
 * many return a session id that must be echoed back on every following request), then real
 * `tools/list` and `tools/call`. Responses can come back as a plain JSON body or as an SSE
 * stream (`text/event-stream`) — both are real, spec-allowed shapes, so both are parsed.
 */

interface JsonRpcResponse<T> {
  jsonrpc: "2.0";
  id: number | string;
  result?: T;
  error?: { code: number; message: string };
}

export interface McpTool {
  name: string;
  description?: string;
  inputSchema: Record<string, unknown>;
}

export interface McpToolCallResult {
  content: { type: string; text?: string; [key: string]: unknown }[];
  isError?: boolean;
}

/** Parses either a raw JSON body or an SSE (`data: {...}`) body into the JSON-RPC response. */
async function parseRpcResponse<T>(res: Response): Promise<JsonRpcResponse<T>> {
  const contentType = res.headers.get("content-type") ?? "";
  const raw = await res.text();
  if (contentType.includes("text/event-stream")) {
    const lines = raw.split("\n").filter((l) => l.startsWith("data:"));
    const last = lines[lines.length - 1]?.slice(5).trim();
    if (!last) throw new Error("MCP server sent an empty SSE stream.");
    return JSON.parse(last);
  }
  return JSON.parse(raw);
}

export class McpClientError extends Error {}

/**
 * Opens a real session against a real MCP server: the real `initialize` handshake, capturing
 * the real session id header if the server issues one. Returns a small handle used for the
 * real `listTools`/`callTool` calls that follow.
 */
export async function connectMcp(serverUrl: string, authToken?: string | null): Promise<{ sessionId: string | null }> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Accept: "application/json, text/event-stream",
  };
  if (authToken) headers.Authorization = `Bearer ${authToken}`;

  const res = await safeFetch(serverUrl, {
    method: "POST",
    headers,
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: {
        protocolVersion: "2025-06-18",
        capabilities: {},
        clientInfo: { name: "orbit.ai", version: "1.0.0" },
      },
    }),
    signal: AbortSignal.timeout(15000),
  });

  if (!res.ok) {
    throw new McpClientError(`MCP server rejected the connection (HTTP ${res.status}).`);
  }

  const sessionId = res.headers.get("mcp-session-id");
  const parsed = await parseRpcResponse(res).catch(() => null);
  if (parsed?.error) {
    throw new McpClientError(`MCP server error: ${parsed.error.message}`);
  }

  return { sessionId };
}

function withSession(headers: Record<string, string>, sessionId: string | null): Record<string, string> {
  return sessionId ? { ...headers, "Mcp-Session-Id": sessionId } : headers;
}

/** Real `tools/list` call — the actual tools this specific MCP server offers, never guessed. */
export async function listMcpTools(serverUrl: string, authToken: string | null | undefined, sessionId: string | null): Promise<McpTool[]> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Accept: "application/json, text/event-stream",
  };
  if (authToken) headers.Authorization = `Bearer ${authToken}`;

  const res = await safeFetch(serverUrl, {
    method: "POST",
    headers: withSession(headers, sessionId),
    body: JSON.stringify({ jsonrpc: "2.0", id: 2, method: "tools/list", params: {} }),
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) throw new McpClientError(`Couldn't list tools (HTTP ${res.status}).`);
  const parsed = await parseRpcResponse<{ tools: McpTool[] }>(res);
  if (parsed.error) throw new McpClientError(parsed.error.message);
  return parsed.result?.tools ?? [];
}

/** Real `tools/call` — actually invokes the tool on the real MCP server with the model's real chosen arguments. */
export async function callMcpTool(
  serverUrl: string,
  authToken: string | null | undefined,
  sessionId: string | null,
  toolName: string,
  args: Record<string, unknown>,
): Promise<McpToolCallResult> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Accept: "application/json, text/event-stream",
  };
  if (authToken) headers.Authorization = `Bearer ${authToken}`;

  const res = await safeFetch(serverUrl, {
    method: "POST",
    headers: withSession(headers, sessionId),
    body: JSON.stringify({ jsonrpc: "2.0", id: 3, method: "tools/call", params: { name: toolName, arguments: args } }),
    signal: AbortSignal.timeout(60000), // real generation tools (video/image) can genuinely take a while
  });
  if (!res.ok) throw new McpClientError(`Tool call failed (HTTP ${res.status}).`);
  const parsed = await parseRpcResponse<McpToolCallResult>(res);
  if (parsed.error) throw new McpClientError(parsed.error.message);
  // A real remote MCP server (third-party, dynamically connected) doesn't always return a
  // spec-compliant shape — validate `content` is actually an array here rather than trusting it,
  // so one misbehaving server can't crash every caller that does `result.content.map(...)`.
  const result = parsed.result;
  if (!result || !Array.isArray(result.content)) return { content: [], isError: true };
  return result;
}
