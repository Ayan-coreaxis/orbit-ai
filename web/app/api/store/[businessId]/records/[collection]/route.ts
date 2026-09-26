import { clientIp } from "@/lib/guard";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getStoreCustomer } from "@/lib/store-auth";
import { loadSpec } from "@/lib/store-backend";
import { findCollection, type SpecField } from "@/lib/orbit-backend-spec";

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** Coerce a submitted value to the field's type, length-capped and HTML-escaped for safe render. */
function clean(field: SpecField, raw: unknown): string | number | null {
  if (raw == null || raw === "") return field.required ? null : "";
  if (field.t === "stars") {
    const n = Math.round(Number(raw));
    return Number.isFinite(n) ? Math.min(5, Math.max(1, n)) : null;
  }
  let s = String(raw).slice(0, field.t === "textarea" ? 4000 : 300).trim();
  if (field.t === "select" && field.options && !field.options.includes(s)) return field.required ? null : "";
  s = esc(s);
  return s;
}

/** GET — published rows for this collection (or, with ?mine=1, the signed-in customer's own rows). */
export async function GET(req: NextRequest, { params }: { params: Promise<{ businessId: string; collection: string }> }) {
  const { businessId, collection } = await params;
  const spec = await loadSpec(businessId);
  const col = findCollection(spec, collection);
  if (!col) return NextResponse.json({ error: "Unknown collection." }, { status: 400 });

  const url = new URL(req.url);
  const productId = url.searchParams.get("productId") || undefined;
  const mine = url.searchParams.get("mine") === "1";

  let customerId: string | undefined;
  if (mine || col.mineOnly) {
    const c = await getStoreCustomer(businessId);
    if (!c) return NextResponse.json({ error: "Sign in to see these." }, { status: 401 });
    customerId = c.id;
  }

  const rows = await prisma.storeRecord.findMany({
    where: {
      businessId,
      collection: col.name,
      ...(customerId ? { customerId } : { status: "published" }),
      ...(col.onProduct && productId ? { productId } : {}),
    },
    orderBy: { createdAt: "desc" },
    take: 100,
    select: { id: true, data: true, status: true, productId: true, createdAt: true, customerId: true },
  });

  return NextResponse.json({
    collection: col.name,
    label: col.label,
    fields: col.fields,
    items: rows.map((r) => {
      let data: Record<string, unknown> = {};
      try {
        data = JSON.parse(r.data);
      } catch {
        /* ignore */
      }
      return { id: r.id, data, status: r.status, productId: r.productId, createdAt: r.createdAt };
    }),
  });
}

/** POST — create a row. Moderated collections land as "pending". Rate-limited per IP. */
const hits = new Map<string, { n: number; t: number }>();
function rateLimited(key: string): boolean {
  const now = Date.now();
  const h = hits.get(key);
  if (!h || now - h.t > 60_000) {
    hits.set(key, { n: 1, t: now });
    return false;
  }
  h.n += 1;
  return h.n > 8;
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ businessId: string; collection: string }> }) {
  const { businessId, collection } = await params;
  const spec = await loadSpec(businessId);
  const col = findCollection(spec, collection);
  if (!col) return NextResponse.json({ error: "Unknown collection." }, { status: 400 });

  const ip = clientIp(req);
  if (rateLimited(`${businessId}:${collection}:${ip}`))
    return NextResponse.json({ error: "Too many submissions — try again in a minute." }, { status: 429 });

  const body = (await req.json().catch(() => ({}))) as { data?: Record<string, unknown>; productId?: string; name?: string };
  const customer = await getStoreCustomer(businessId);

  const data: Record<string, string | number> = {};
  for (const f of col.fields) {
    const v = clean(f, body.data?.[f.k]);
    if (v == null) return NextResponse.json({ error: `"${f.label}" is required.` }, { status: 400 });
    if (v !== "") data[f.k] = v;
  }
  // capture a display name when not signed in
  const submitterName = customer?.name || esc(String(body.name ?? "").slice(0, 80).trim());
  if (submitterName) data._name = submitterName;

  const productId =
    col.onProduct && body.productId
      ? (await prisma.product.findFirst({ where: { id: String(body.productId), businessId }, select: { id: true } }))?.id ?? null
      : null;

  const rec = await prisma.storeRecord.create({
    data: {
      businessId,
      collection: col.name,
      customerId: customer?.id ?? null,
      productId,
      data: JSON.stringify(data),
      status: col.moderated ? "pending" : "published",
    },
  });

  return NextResponse.json({ ok: true, id: rec.id, status: rec.status });
}
