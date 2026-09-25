import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import crypto from "crypto";
import { prisma } from "@/lib/prisma";
import { getStoreCustomer } from "@/lib/store-auth";

/**
 * Server-side cart mirror. localStorage is still the fast path in the browser, but this keeps a
 * copy keyed to the shopper: `customer:<id>` for a signed-in shopper (follows them across
 * devices) or the anonymous `sc_sess` cookie for a guest (survives a cleared localStorage / a
 * fresh tab on the same browser).
 */

const SESS_COOKIE = "sc_sess";

interface Line {
  productId: string;
  variantId?: string | null;
  variantLabel?: string | null;
  name?: string;
  price?: number;
  imageUrl?: string | null;
  qty: number;
}

async function visitorKey(businessId: string): Promise<string> {
  const customer = await getStoreCustomer(businessId);
  if (customer) return `customer:${customer.id}`;
  const store = await cookies();
  let sess = store.get(SESS_COOKIE)?.value;
  if (!sess) {
    sess = crypto.randomUUID();
    store.set(SESS_COOKIE, sess, { httpOnly: true, sameSite: "lax", path: "/", maxAge: 60 * 60 * 24 * 365 });
  }
  return sess;
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ businessId: string }> }) {
  const { businessId } = await params;
  const key = await visitorKey(businessId);
  const row = await prisma.cart.findUnique({ where: { businessId_visitorId: { businessId, visitorId: key } } });
  let items: Line[] = [];
  try {
    items = row ? (JSON.parse(row.items) as Line[]) : [];
  } catch {
    items = [];
  }
  return NextResponse.json({ items });
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ businessId: string }> }) {
  const { businessId } = await params;
  const key = await visitorKey(businessId);
  const body = (await req.json().catch(() => ({}))) as { items?: Line[] };

  const items: Line[] = Array.isArray(body.items)
    ? body.items
        .filter((l) => l && typeof l.productId === "string" && Number(l.qty) > 0)
        .slice(0, 100)
        .map((l) => ({
          productId: l.productId,
          variantId: l.variantId ?? null,
          variantLabel: l.variantLabel ?? null,
          name: l.name?.slice(0, 200),
          price: Number(l.price) || 0,
          imageUrl: l.imageUrl ?? null,
          qty: Math.min(999, Math.max(1, Math.floor(Number(l.qty)))),
        }))
    : [];

  await prisma.cart.upsert({
    where: { businessId_visitorId: { businessId, visitorId: key } },
    create: { businessId, visitorId: key, items: JSON.stringify(items) },
    update: { items: JSON.stringify(items) },
  });
  return NextResponse.json({ ok: true });
}
