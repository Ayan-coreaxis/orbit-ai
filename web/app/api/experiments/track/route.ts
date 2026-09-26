import { throttle } from "@/lib/guard";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

const VALID_TYPES = new Set(["view", "convert"]);

export async function POST(req: Request) {
  const limited = await throttle(req, "exp-track", 120, 600000);
  if (limited) return limited;
  try {
    const { experimentId, variant, type, sessionId } = await req.json();
    if (!experimentId || !["A", "B"].includes(variant) || !VALID_TYPES.has(type) || !sessionId) {
      return NextResponse.json({ ok: false }, { status: 400 });
    }
    await prisma.experimentEvent.create({ data: { experimentId, variant, type, sessionId } });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ ok: false });
  }
}
