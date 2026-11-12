import { NextRequest, NextResponse } from "next/server";
import { getActiveBusinessId } from "@/lib/get-active-business-id";
import { prisma } from "@/lib/prisma";
import { nameKey } from "@/lib/product-import";
import { ImportError, existingProductNames, importFromFile, importFromUrl, type ImportResult } from "@/lib/product-import-server";

export const runtime = "nodejs";
export const maxDuration = 120;

const MAX_FILE_BYTES = 10 * 1024 * 1024;

/**
 * Step 1 of bulk import: read the seller's shop link (JSON body `{ url }`) or an uploaded
 * CSV / XLSX (multipart `file`) and return what was found — nothing is saved. Each product says
 * whether the store already has one with that name (those are skipped on import).
 */
export async function POST(req: NextRequest) {
  const businessId = await getActiveBusinessId();
  if (!businessId) return NextResponse.json({ error: "No active business." }, { status: 400 });
  const storeCurrency = (await prisma.business.findUnique({ where: { id: businessId }, select: { storeCurrency: true } }))?.storeCurrency || "usd";

  try {
    let result: ImportResult;
    if ((req.headers.get("content-type") ?? "").includes("multipart/form-data")) {
      const file = (await req.formData()).get("file");
      if (!(file instanceof File)) return NextResponse.json({ error: "No file." }, { status: 400 });
      if (file.size > MAX_FILE_BYTES) return NextResponse.json({ error: "That file is over 10 MB — split it into smaller files." }, { status: 413 });
      result = await importFromFile(file.name, Buffer.from(await file.arrayBuffer()), { businessId });
    } else {
      const body = (await req.json().catch(() => ({}))) as { url?: unknown };
      if (typeof body.url !== "string" || !body.url.trim()) return NextResponse.json({ error: "Paste a link or choose a file." }, { status: 400 });
      result = await importFromUrl(body.url, { businessId, storeCurrency });
    }
    const have = await existingProductNames(businessId);
    return NextResponse.json({
      source: result.source,
      truncated: result.truncated,
      notes: result.notes,
      products: result.products.map((p) => ({ ...p, exists: have.has(nameKey(p.name)) })),
    });
  } catch (e) {
    if (e instanceof ImportError) return NextResponse.json({ error: e.message }, { status: 422 });
    return NextResponse.json({ error: "Couldn't read that — please try again, or upload a CSV / Excel file." }, { status: 502 });
  }
}
