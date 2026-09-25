import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getActiveBusinessId } from "@/lib/get-active-business-id";

export async function POST(req: Request) {
  const businessId = await getActiveBusinessId();
  if (!businessId) return NextResponse.json({ ok: false }, { status: 400 });

  const { reportId } = await req.json();
  if (!reportId || typeof reportId !== "string") {
    return NextResponse.json({ error: "reportId is required." }, { status: 400 });
  }

  await prisma.business.update({
    where: { id: businessId },
    data: { lastSeenReportId: reportId },
  });
  return NextResponse.json({ ok: true });
}
