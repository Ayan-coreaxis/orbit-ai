import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const review = await prisma.review.findUnique({
    where: { id },
    include: { business: { select: { name: true } } },
  });
  if (!review) return NextResponse.json({ error: "Review request not found." }, { status: 404 });
  return NextResponse.json({
    businessName: review.business.name,
    productNames: review.productNames,
    status: review.status,
    rating: review.rating,
    comment: review.comment,
  });
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const review = await prisma.review.findUnique({ where: { id } });
  if (!review) return NextResponse.json({ error: "Review request not found." }, { status: 404 });
  if (review.status === "submitted") {
    return NextResponse.json({ error: "This review has already been submitted." }, { status: 400 });
  }

  const { rating, comment } = (await req.json()) as { rating?: number; comment?: string };
  const ratingNum = Number(rating);
  if (!Number.isInteger(ratingNum) || ratingNum < 1 || ratingNum > 5) {
    return NextResponse.json({ error: "Rating must be 1 to 5." }, { status: 400 });
  }

  const updated = await prisma.review.update({
    where: { id },
    data: {
      rating: ratingNum,
      comment: typeof comment === "string" ? comment.trim().slice(0, 1000) || null : null,
      status: ratingNum <= 2 ? "flagged" : "submitted",
      respondedAt: new Date(),
    },
  });

  return NextResponse.json({ ok: true, status: updated.status });
}
