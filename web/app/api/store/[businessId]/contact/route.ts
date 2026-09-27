import { throttle } from "@/lib/guard";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { saveContactMessage } from "@/lib/contact-message";

/** Public storefront contact form → one ContactMessage row the seller sees in their dashboard. */
export async function POST(req: NextRequest, { params }: { params: Promise<{ businessId: string }> }) {
  const limited = await throttle(req, "shop-contact", 5, 600000);
  if (limited) return limited;
  const { businessId } = await params;
  const business = await prisma.business.findUnique({ where: { id: businessId }, select: { id: true } });
  if (!business) return NextResponse.json({ ok: false, error: "Store not found." }, { status: 404 });

  const b = (await req.json()) as { name?: string; email?: string; message?: string };
  const name = (b.name ?? "").trim();
  const email = (b.email ?? "").trim().toLowerCase();
  const message = (b.message ?? "").trim();
  if (!name || !message) return NextResponse.json({ ok: false, error: "Name and message are required." }, { status: 400 });
  if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return NextResponse.json({ ok: false, error: "Enter a valid email address." }, { status: 400 });
  }

  await saveContactMessage(businessId, { name, email, message });
  return NextResponse.json({ ok: true });
}
