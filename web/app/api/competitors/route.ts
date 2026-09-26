import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getActiveBusinessId } from "@/lib/get-active-business-id";

const MAX = 10;

/** The competitor links a seller tracks (reference notes only). */
export async function GET() {
  const businessId = await getActiveBusinessId();
  if (!businessId) return NextResponse.json({ error: "No business." }, { status: 401 });
  const list = await prisma.competitor.findMany({ where: { businessId }, orderBy: { createdAt: "asc" }, select: { id: true, url: true } });
  return NextResponse.json({ competitors: list });
}

/** { url } — a website or @handle. */
export async function POST(req: NextRequest) {
  const businessId = await getActiveBusinessId();
  if (!businessId) return NextResponse.json({ error: "No business." }, { status: 401 });
  const { url } = (await req.json().catch(() => ({}))) as { url?: string };
  const clean = (url ?? "").trim().replace(/\/+$/, "").slice(0, 300);
  if (!clean || !/^(@[\w.]{2,}|(https?:\/\/)?[\w-]+(\.[\w-]+)+(\/\S*)?)$/i.test(clean))
    return NextResponse.json({ error: "Type a website like theirshop.pk or an Instagram @handle." }, { status: 400 });
  const existing = await prisma.competitor.findMany({ where: { businessId }, select: { url: true } });
  const key = (u: string) => u.toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "");
  if (existing.some((c) => key(c.url) === key(clean))) return NextResponse.json({ error: "Already tracking that one." }, { status: 409 });
  if (existing.length >= MAX) return NextResponse.json({ error: `You can track up to ${MAX} competitors.` }, { status: 400 });
  const c = await prisma.competitor.create({ data: { businessId, url: clean }, select: { id: true, url: true } });
  return NextResponse.json({ competitor: c });
}

export async function DELETE(req: NextRequest) {
  const businessId = await getActiveBusinessId();
  if (!businessId) return NextResponse.json({ error: "No business." }, { status: 401 });
  const id = req.nextUrl.searchParams.get("id") ?? "";
  await prisma.competitor.deleteMany({ where: { id, businessId } });
  return NextResponse.json({ ok: true });
}
