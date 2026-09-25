import { NextRequest, NextResponse } from "next/server";
import { getActiveBusinessId } from "@/lib/get-active-business-id";
import { listMembers, inviteMember, removeMember } from "@/lib/team";

export async function GET() {
  const businessId = await getActiveBusinessId();
  if (!businessId) return NextResponse.json({ error: "No active business." }, { status: 400 });

  const members = await listMembers(businessId);
  return NextResponse.json({ members });
}

export async function POST(req: NextRequest) {
  const businessId = await getActiveBusinessId();
  if (!businessId) return NextResponse.json({ error: "No active business." }, { status: 400 });

  const body = (await req.json().catch(() => ({}))) as { email?: string; role?: "staff" | "admin" };
  try {
    await inviteMember(businessId, body.email ?? "", body.role === "admin" ? "admin" : "staff");
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: String(e instanceof Error ? e.message : e).slice(0, 200) }, { status: 400 });
  }
}

export async function DELETE(req: NextRequest) {
  const businessId = await getActiveBusinessId();
  if (!businessId) return NextResponse.json({ error: "No active business." }, { status: 400 });

  const memberId = req.nextUrl.searchParams.get("memberId") || "";
  if (!memberId) return NextResponse.json({ error: "Missing member." }, { status: 400 });
  await removeMember(businessId, memberId);
  return NextResponse.json({ ok: true });
}
