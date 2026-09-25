import crypto from "crypto";
import { prisma } from "@/lib/prisma";
import type { McpConnection } from "@prisma/client";

/**
 * Real MCP OAuth — the flow a modern remote MCP server (Notion, Linear, Sentry, …) expects:
 *   1. RFC 9728 — discover the protected-resource metadata, which names the authorization server
 *   2. RFC 8414 — discover that server's authorize/token/registration endpoints
 *   3. RFC 7591 — dynamically register orbit.ai as a client (no manual app setup per server)
 *   4. RFC 7636 — authorization-code + PKCE, with the RFC 8707 `resource` indicator
 * The seller signs in on the vendor's own page; orbit.ai only ever receives the resulting tokens.
 */

export function getRedirectUri(): string {
  const base = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  return `${base}/api/oauth/mcp/callback`;
}

export interface OAuthEndpoints {
  authorizationEndpoint: string;
  tokenEndpoint: string;
  registrationEndpoint?: string;
  resource: string;
  scope?: string;
}

export class McpOAuthError extends Error {}

async function fetchJson(url: string, init?: RequestInit): Promise<Record<string, unknown> | null> {
  try {
    const res = await fetch(url, { ...init, signal: AbortSignal.timeout(12000) });
    if (!res.ok) return null;
    return (await res.json()) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function wellKnownVariants(target: string, suffix: string): string[] {
  const u = new URL(target);
  const path = u.pathname.replace(/\/$/, "");
  const out = [`${u.origin}/.well-known/${suffix}`];
  if (path) out.push(`${u.origin}/.well-known/${suffix}${path}`, `${u.origin}${path}/.well-known/${suffix}`);
  return [...new Set(out)];
}

/** Steps 1-2: everything needed to start an auth flow against this MCP server. */
export async function discoverOAuth(mcpServerUrl: string): Promise<OAuthEndpoints> {
  // Probe the server — an unauthenticated MCP request should 401 with a pointer to its metadata.
  let resourceMetadataUrl: string | null = null;
  try {
    const probe = await fetch(mcpServerUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json, text/event-stream" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "orbit.ai", version: "1.0.0" } } }),
      signal: AbortSignal.timeout(12000),
    });
    const wwwAuth = probe.headers.get("www-authenticate") ?? "";
    const m = wwwAuth.match(/resource_metadata="([^"]+)"/i);
    if (m) resourceMetadataUrl = m[1];
  } catch {
    /* fall through to well-known guesses */
  }

  const prmCandidates = resourceMetadataUrl ? [resourceMetadataUrl] : wellKnownVariants(mcpServerUrl, "oauth-protected-resource");
  let prm: Record<string, unknown> | null = null;
  for (const c of prmCandidates) {
    prm = await fetchJson(c);
    if (prm) break;
  }

  const authServers = Array.isArray(prm?.authorization_servers) ? (prm!.authorization_servers as string[]) : [];
  const resource = (typeof prm?.resource === "string" && prm.resource) || new URL(mcpServerUrl).origin;
  const prmScopes = Array.isArray(prm?.scopes_supported) ? (prm!.scopes_supported as string[]).join(" ") : undefined;

  // If no protected-resource metadata, fall back to treating the MCP origin as its own auth server.
  const asBase = authServers[0] ?? new URL(mcpServerUrl).origin;

  let asMeta: Record<string, unknown> | null = null;
  for (const c of [...wellKnownVariants(asBase, "oauth-authorization-server"), ...wellKnownVariants(asBase, "openid-configuration")]) {
    asMeta = await fetchJson(c);
    if (asMeta) break;
  }

  const authorizationEndpoint = typeof asMeta?.authorization_endpoint === "string" ? asMeta.authorization_endpoint : "";
  const tokenEndpoint = typeof asMeta?.token_endpoint === "string" ? asMeta.token_endpoint : "";
  const registrationEndpoint = typeof asMeta?.registration_endpoint === "string" ? asMeta.registration_endpoint : undefined;
  const asScopes = Array.isArray(asMeta?.scopes_supported) ? (asMeta!.scopes_supported as string[]).join(" ") : undefined;

  if (!authorizationEndpoint || !tokenEndpoint) {
    throw new McpOAuthError(
      "This server didn't advertise an OAuth authorization server we could use. If it accepts a plain API key or token instead, use that option.",
    );
  }

  return { authorizationEndpoint, tokenEndpoint, registrationEndpoint, resource, scope: prmScopes ?? asScopes };
}

/** Step 3: register orbit.ai as a client with this authorization server. */
export async function registerClient(
  registrationEndpoint: string | undefined,
  scope?: string,
): Promise<{ clientId: string; clientSecret?: string }> {
  if (!registrationEndpoint) {
    throw new McpOAuthError(
      "This server requires a manually pre-registered OAuth client, which isn't supported yet. Use an API key instead if the server offers one.",
    );
  }
  const res = await fetch(registrationEndpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      client_name: "orbit.ai",
      redirect_uris: [getRedirectUri()],
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
      token_endpoint_auth_method: "none",
      ...(scope ? { scope } : {}),
    }),
    signal: AbortSignal.timeout(12000),
  });
  if (!res.ok) throw new McpOAuthError(`Client registration failed (HTTP ${res.status}).`);
  const data = (await res.json()) as { client_id?: string; client_secret?: string };
  if (!data.client_id) throw new McpOAuthError("Client registration didn't return a client id.");
  return { clientId: data.client_id, clientSecret: data.client_secret };
}

export function pkce(): { verifier: string; challenge: string } {
  const verifier = crypto.randomBytes(32).toString("base64url");
  const challenge = crypto.createHash("sha256").update(verifier).digest("base64url");
  return { verifier, challenge };
}

export function buildAuthUrl(o: {
  authorizationEndpoint: string;
  clientId: string;
  state: string;
  challenge: string;
  resource: string;
  scope?: string;
}): string {
  const params = new URLSearchParams({
    response_type: "code",
    client_id: o.clientId,
    redirect_uri: getRedirectUri(),
    state: o.state,
    code_challenge: o.challenge,
    code_challenge_method: "S256",
    resource: o.resource,
  });
  if (o.scope) params.set("scope", o.scope);
  return `${o.authorizationEndpoint}?${params.toString()}`;
}

interface TokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in?: number;
  token_type?: string;
}

async function postToken(tokenUrl: string, body: Record<string, string>): Promise<TokenResponse> {
  const res = await fetch(tokenUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
    body: new URLSearchParams(body).toString(),
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) throw new McpOAuthError(`Token endpoint returned HTTP ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const data = (await res.json()) as TokenResponse;
  if (!data.access_token) throw new McpOAuthError("Token response had no access_token.");
  return data;
}

export async function exchangeCode(o: {
  tokenUrl: string;
  code: string;
  verifier: string;
  clientId: string;
  clientSecret?: string | null;
  resource: string;
}): Promise<TokenResponse> {
  return postToken(o.tokenUrl, {
    grant_type: "authorization_code",
    code: o.code,
    redirect_uri: getRedirectUri(),
    client_id: o.clientId,
    code_verifier: o.verifier,
    resource: o.resource,
    ...(o.clientSecret ? { client_secret: o.clientSecret } : {}),
  });
}

export async function refreshAccessToken(c: McpConnection): Promise<TokenResponse> {
  if (!c.oauthTokenUrl || !c.oauthRefreshToken || !c.oauthClientId) {
    throw new McpOAuthError("Missing refresh details.");
  }
  return postToken(c.oauthTokenUrl, {
    grant_type: "refresh_token",
    refresh_token: c.oauthRefreshToken,
    client_id: c.oauthClientId,
    ...(c.oauthResource ? { resource: c.oauthResource } : {}),
    ...(c.oauthClientSecret ? { client_secret: c.oauthClientSecret } : {}),
  });
}

/**
 * The access token to actually use for this connection right now — refreshed and persisted if the
 * stored one has expired. `null` if this isn't an OAuth connection or it isn't connected yet.
 */
export async function getValidAccessToken(c: McpConnection): Promise<string | null> {
  if (c.authType !== "oauth") return c.authToken ?? null;
  if (!c.oauthAccessToken) return null;

  const stillValid = !c.oauthExpiresAt || c.oauthExpiresAt.getTime() - Date.now() > 60_000;
  if (stillValid) return c.oauthAccessToken;
  if (!c.oauthRefreshToken) return c.oauthAccessToken; // best effort — let the call fail loudly if it's dead

  try {
    const t = await refreshAccessToken(c);
    await prisma.mcpConnection.update({
      where: { id: c.id },
      data: {
        oauthAccessToken: t.access_token,
        ...(t.refresh_token ? { oauthRefreshToken: t.refresh_token } : {}),
        oauthExpiresAt: t.expires_in ? new Date(Date.now() + t.expires_in * 1000) : null,
      },
    });
    return t.access_token;
  } catch {
    return c.oauthAccessToken;
  }
}
