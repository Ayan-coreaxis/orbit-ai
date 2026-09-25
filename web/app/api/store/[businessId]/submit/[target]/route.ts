import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getStoreCustomer } from "@/lib/store-auth";
import { storeExists } from "@/lib/store-backend";

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/**
 * Generic form endpoint for the fixed targets a designed page can point at without declaring a
 * collection: `newsletter`, `contact`, `support`. (Collection forms POST straight to
 * /records/[collection]; the cart posts to /order.)
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ businessId: string; target: string }> }) {
  const { businessId, target } = await params;
  if (!(await storeExists(businessId))) return NextResponse.json({ error: "Store not found." }, { status: 404 });

  const body = (await req.json().catch(() => ({}))) as { data?: Record<string, unknown>; email?: string; name?: string; message?: string };
  const d = body.data ?? body;
  const email = String((d as Record<string, unknown>).email ?? "").trim().toLowerCase().slice(0, 160);
  const name = String((d as Record<string, unknown>).name ?? "").trim().slice(0, 120);
  const message = String((d as Record<string, unknown>).message ?? (d as Record<string, unknown>).body ?? "").trim().slice(0, 4000);

  if (target === "newsletter") {
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return NextResponse.json({ error: "Enter a valid email." }, { status: 400 });
    await prisma.newsletterSubscriber.upsert({
      where: { businessId_email: { businessId, email } },
      create: { businessId, email },
      update: {},
    });
    return NextResponse.json({ ok: true });
  }

  if (target === "contact") {
    if (!name || !message) return NextResponse.json({ error: "Name and message are required." }, { status: 400 });
    await prisma.contactMessage.create({ data: { businessId, name, email, message } });
    return NextResponse.json({ ok: true });
  }

  if (target === "support") {
    const customer = await getStoreCustomer(businessId);
    // store every field the designed form had, generically (keys come from the spec, not fixed)
    const rec: Record<string, string> = { _name: esc(customer?.name || name || "Customer") };
    let hasContent = false;
    for (const [k, v] of Object.entries(d as Record<string, unknown>)) {
      if (v == null || v === "") continue;
      rec[k.slice(0, 40)] = esc(String(v).slice(0, 4000));
      if (String(v).trim().length > 2) hasContent = true;
    }
    if (customer?.email && !rec.email) rec.email = esc(customer.email);
    if (!hasContent) return NextResponse.json({ error: "Tell us what's wrong." }, { status: 400 });
    await prisma.storeRecord.create({
      data: { businessId, collection: "support", customerId: customer?.id ?? null, data: JSON.stringify(rec), status: "pending" },
    });
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "Unknown form." }, { status: 400 });
}
