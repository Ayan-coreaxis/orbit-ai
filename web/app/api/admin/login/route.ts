import { throttle } from "@/lib/guard";
import { NextRequest, NextResponse } from "next/server";
import { verifyAdminPassword, setAdminSessionCookie } from "@/lib/auth";

export async function POST(req: NextRequest) {
  const limited = await throttle(req, "admin-login", 5, 900000);
  if (limited) return limited;
  if (!process.env.ADMIN_PASSWORD) {
    return NextResponse.json({ error: "ADMIN_PASSWORD is not set on the server." }, { status: 500 });
  }

  const { password } = (await req.json()) as { password?: string };
  if (!password || !verifyAdminPassword(password)) {
    return NextResponse.json({ error: "Incorrect password." }, { status: 401 });
  }

  await setAdminSessionCookie();
  return NextResponse.json({ ok: true });
}
