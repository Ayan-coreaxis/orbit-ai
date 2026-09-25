import { NextRequest, NextResponse } from "next/server";
import { getKeyStatus, setKey, KEY_ENV_MAP } from "@/lib/env-file";
import { isAdminAuthenticated } from "@/lib/auth";

export async function GET() {
  const authed = await isAdminAuthenticated();
  if (!authed) return NextResponse.json({ error: "Not authorized." }, { status: 401 });
  return NextResponse.json({ status: getKeyStatus() });
}

export async function POST(req: NextRequest) {
  const authed = await isAdminAuthenticated();
  if (!authed) return NextResponse.json({ error: "Not authorized." }, { status: 401 });

  const { id, value } = await req.json();
  if (!id || !KEY_ENV_MAP[id]) {
    return NextResponse.json({ error: "Unknown key" }, { status: 400 });
  }
  if (!value || typeof value !== "string" || value.trim().length === 0) {
    return NextResponse.json({ error: "Value cannot be empty" }, { status: 400 });
  }
  setKey(id, value.trim());
  return NextResponse.json({ ok: true });
}
