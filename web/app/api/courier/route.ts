import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getActiveBusinessId } from "@/lib/get-active-business-id";
import { COURIERS, CRED_FIELDS, parseCreds, testCourier, type CourierCreds, type CourierProvider } from "@/lib/courier";

/** Settings > Courier: which courier, which details are saved (secrets never sent back). */
export async function GET() {
  const businessId = await getActiveBusinessId();
  if (!businessId) return NextResponse.json({ error: "No business." }, { status: 401 });
  const b = await prisma.business.findUnique({ where: { id: businessId }, select: { courierProvider: true, courierApiKey: true } });
  const creds = parseCreds(b?.courierApiKey, b?.courierProvider);
  const saved: Record<string, Record<string, string | boolean>> = {};
  for (const p of COURIERS) {
    const c = (creds[p as keyof CourierCreds] ?? {}) as Record<string, string>;
    saved[p] = Object.fromEntries(CRED_FIELDS[p as Exclude<CourierProvider, "manual">].map((f) => [f.key, f.secret ? !!c[f.key] : (c[f.key] ?? "")]));
  }
  return NextResponse.json({ provider: b?.courierProvider ?? "manual", fields: CRED_FIELDS, saved });
}

/** { provider, values } — save (blank secret = keep the saved one), then test the connection. */
export async function POST(req: NextRequest) {
  const businessId = await getActiveBusinessId();
  if (!businessId) return NextResponse.json({ error: "No business." }, { status: 401 });
  const body = (await req.json().catch(() => ({}))) as { provider?: string; values?: Record<string, string> };
  const provider = body.provider as CourierProvider;
  if (provider !== "manual" && !COURIERS.includes(provider)) return NextResponse.json({ error: "Unknown courier." }, { status: 400 });
  const b = await prisma.business.findUnique({ where: { id: businessId }, select: { courierProvider: true, courierApiKey: true } });
  const creds = parseCreds(b?.courierApiKey, b?.courierProvider);
  if (provider !== "manual") {
    const prev = (creds[provider] ?? {}) as Record<string, string>;
    const next: Record<string, string> = {};
    for (const f of CRED_FIELDS[provider]) {
      const v = String(body.values?.[f.key] ?? "").trim().slice(0, 300);
      next[f.key] = v || (f.secret ? (prev[f.key] ?? "") : "");
    }
    (creds as Record<string, unknown>)[provider] = next;
  }
  await prisma.business.update({ where: { id: businessId }, data: { courierProvider: provider, courierApiKey: JSON.stringify(creds) } });
  if (provider === "manual") return NextResponse.json({ ok: true, message: "Saved — you'll type tracking numbers by hand." });
  return NextResponse.json(await testCourier(provider, creds));
}
