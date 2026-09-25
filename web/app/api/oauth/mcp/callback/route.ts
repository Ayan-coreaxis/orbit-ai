import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { exchangeCode } from "@/lib/mcp-oauth";

const DONE = "/dashboard/settings/connections";

function back(req: NextRequest, status: string) {
  return NextResponse.redirect(new URL(`${DONE}?mcp=${status}`, req.nextUrl.origin));
}

/** The vendor redirects the seller's browser back here after they sign in. Exchange the code for tokens. */
export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get("code");
  const state = req.nextUrl.searchParams.get("state");
  const err = req.nextUrl.searchParams.get("error");

  if (err || !code || !state) return back(req, "error");

  const conn = await prisma.mcpConnection.findUnique({ where: { oauthState: state } });
  if (!conn || !conn.oauthCodeVerifier || !conn.oauthTokenUrl || !conn.oauthClientId) return back(req, "error");

  try {
    const t = await exchangeCode({
      tokenUrl: conn.oauthTokenUrl,
      code,
      verifier: conn.oauthCodeVerifier,
      clientId: conn.oauthClientId,
      clientSecret: conn.oauthClientSecret,
      resource: conn.oauthResource ?? new URL(conn.mcpServerUrl).origin,
    });
    await prisma.mcpConnection.update({
      where: { id: conn.id },
      data: {
        oauthAccessToken: t.access_token,
        oauthRefreshToken: t.refresh_token ?? null,
        oauthExpiresAt: t.expires_in ? new Date(Date.now() + t.expires_in * 1000) : null,
        oauthState: null,
        oauthCodeVerifier: null,
        lastStatus: null,
      },
    });
    return back(req, "connected");
  } catch {
    return back(req, "error");
  }
}
