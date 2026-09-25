import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { prisma } from "@/lib/prisma";
import { getActiveBusinessId } from "@/lib/get-active-business-id";
import { getConnector } from "@/lib/known-mcp-connectors";
import { discoverOAuth, registerClient, pkce, buildAuthUrl, McpOAuthError } from "@/lib/mcp-oauth";

/**
 * Begins a real MCP OAuth flow: discover the server's auth endpoints, dynamically register
 * orbit.ai as a client, stash the PKCE verifier + state on the connection row (a new one, or an
 * existing `connectionId` — e.g. one a plugin install created as a placeholder), and hand back
 * the vendor sign-in URL for the browser to redirect to.
 */
export async function POST(req: NextRequest) {
  const businessId = await getActiveBusinessId();
  if (!businessId) return NextResponse.json({ error: "No active business." }, { status: 401 });

  const body = await req.json();
  const connectionId = typeof body.connectionId === "string" ? body.connectionId : null;

  let name = typeof body.name === "string" ? body.name.trim() : "";
  let mcpServerUrl = typeof body.mcpServerUrl === "string" ? body.mcpServerUrl.trim() : "";
  let skill = typeof body.skill === "string" ? body.skill.trim() : null;
  let connectorId = typeof body.connectorId === "string" && getConnector(body.connectorId) ? body.connectorId : null;

  let existing = null;
  if (connectionId) {
    existing = await prisma.mcpConnection.findUnique({ where: { id: connectionId } });
    if (!existing || existing.businessId !== businessId) {
      return NextResponse.json({ error: "Not found." }, { status: 404 });
    }
    name = existing.name;
    mcpServerUrl = existing.mcpServerUrl;
    skill = existing.skill;
    connectorId = existing.connectorId;
  }

  if (!name || !mcpServerUrl || !mcpServerUrl.startsWith("http")) {
    return NextResponse.json({ error: "Name and a valid MCP server URL are required." }, { status: 400 });
  }

  try {
    const endpoints = await discoverOAuth(mcpServerUrl);
    const client = await registerClient(endpoints.registrationEndpoint, endpoints.scope);
    const { verifier, challenge } = pkce();
    const state = crypto.randomBytes(24).toString("base64url");

    const data = {
      authType: "oauth",
      lastStatus: "pending_oauth",
      oauthState: state,
      oauthCodeVerifier: verifier,
      oauthClientId: client.clientId,
      oauthClientSecret: client.clientSecret ?? null,
      oauthTokenUrl: endpoints.tokenEndpoint,
      oauthResource: endpoints.resource,
      oauthScope: endpoints.scope ?? null,
    };

    if (existing) {
      await prisma.mcpConnection.update({ where: { id: existing.id }, data });
    } else {
      await prisma.mcpConnection.create({
        data: { businessId, name, mcpServerUrl, connectorId, skill: skill || null, ...data },
      });
    }

    const authUrl = buildAuthUrl({
      authorizationEndpoint: endpoints.authorizationEndpoint,
      clientId: client.clientId,
      state,
      challenge,
      resource: endpoints.resource,
      scope: endpoints.scope,
    });
    return NextResponse.json({ authUrl });
  } catch (e) {
    const msg = e instanceof McpOAuthError ? e.message : "Couldn't start the OAuth flow.";
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
