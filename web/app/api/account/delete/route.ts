import { NextRequest, NextResponse } from "next/server";
import { throttle } from "@/lib/guard";
import { clearSessionCookie, getCurrentUser } from "@/lib/auth";
import { deleteAccount } from "@/lib/account";

/** POST { confirm: "<the account email>" } — permanently deletes the account and every store it owns. */
export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Log in first." }, { status: 401 });
  const limited = await throttle(req, "account-delete", 5, 3600_000, user.id);
  if (limited) return limited;
  const { confirm } = (await req.json().catch(() => ({}))) as { confirm?: string };
  if ((confirm ?? "").trim().toLowerCase() !== user.email.toLowerCase()) {
    return NextResponse.json({ error: "Type your account email exactly to confirm." }, { status: 400 });
  }
  try {
    const r = await deleteAccount(user.id);
    await clearSessionCookie();
    const res = NextResponse.json({ ok: true, ...r });
    res.cookies.delete("businessId");
    return res;
  } catch (e) {
    console.error("[account/delete]", e);
    return NextResponse.json({ error: "Couldn't delete the account — nothing was removed. Contact support." }, { status: 500 });
  }
}
