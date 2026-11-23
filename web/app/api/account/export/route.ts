import { NextRequest, NextResponse } from "next/server";
import { throttle } from "@/lib/guard";
import { getCurrentUser } from "@/lib/auth";
import { exportAccount } from "@/lib/account";

/** GET — download all of the owner's store data as one JSON file (no passwords or API keys). */
export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Log in first." }, { status: 401 });
  const limited = await throttle(req, "account-export", 5, 3600_000, user.id);
  if (limited) return limited;
  const data = await exportAccount(user.id);
  if (!data) return NextResponse.json({ error: "Account not found." }, { status: 404 });
  const day = new Date().toISOString().slice(0, 10);
  return new NextResponse(JSON.stringify(data, null, 2), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="orbit-export-${day}.json"`,
      "Cache-Control": "no-store",
    },
  });
}
