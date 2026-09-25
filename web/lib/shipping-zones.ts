import { prisma } from "@/lib/prisma";

const round2 = (n: number) => Math.round(n * 100) / 100;

export interface ShippingZoneSummary {
  id: string;
  name: string;
  cities: string[];
  fee: number;
  freeOver: number | null;
  priority: number;
}

function normalizeCity(c: string): string {
  return c.trim().toLowerCase();
}

async function loadZones(businessId: string): Promise<ShippingZoneSummary[]> {
  const rows = await prisma.shippingZone.findMany({ where: { businessId }, orderBy: { priority: "asc" } });
  return rows.map((z) => ({
    id: z.id,
    name: z.name,
    cities: safeParseCities(z.cities),
    fee: z.fee,
    freeOver: z.freeOver,
    priority: z.priority,
  }));
}

function safeParseCities(raw: string): string[] {
  try {
    const arr = JSON.parse(raw) as unknown;
    return Array.isArray(arr) ? arr.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}

export async function listShippingZones(businessId: string): Promise<ShippingZoneSummary[]> {
  return loadZones(businessId);
}

export interface ShippingRate {
  fee: number;
  freeOver: number | null;
  zoneName: string | null;
}

/** The first configured zone (lowest `priority` first) whose city list contains this real shipping
 *  city (case-insensitive, exact match) — or null if none matches (or no zones exist). */
export async function matchShippingZone(businessId: string, city: string | null | undefined): Promise<ShippingZoneSummary | null> {
  const c = normalizeCity(city || "");
  if (!c) return null;
  const zones = await loadZones(businessId);
  return zones.find((z) => z.cities.some((zc) => normalizeCity(zc) === c)) ?? null;
}

/** Real delivery rate for a shopper's real shipping city — a matched zone's own rate, or the
 *  business's flat fallback rate when no zone matches (or none are configured). Convenience
 *  wrapper around `matchShippingZone` for callers that don't already have the business's flat
 *  rate on hand. */
export async function getShippingRate(businessId: string, city: string | null | undefined): Promise<ShippingRate> {
  const business = await prisma.business.findUnique({ where: { id: businessId }, select: { shippingFee: true, freeShippingOver: true } });
  const zone = await matchShippingZone(businessId, city);
  if (zone) return { fee: zone.fee, freeOver: zone.freeOver, zoneName: zone.name };
  return { fee: business?.shippingFee ?? 0, freeOver: business?.freeShippingOver ?? null, zoneName: null };
}

export async function createShippingZone(
  businessId: string,
  input: { name: string; cities: string[]; fee: number; freeOver?: number | null; priority?: number },
): Promise<{ id: string }> {
  const name = input.name.trim().slice(0, 120);
  if (!name) throw new Error("Give the zone a name.");
  const cities = [...new Set(input.cities.map((c) => c.trim()).filter(Boolean))].slice(0, 200);
  if (cities.length === 0) throw new Error("Add at least one city.");
  const fee = round2(Math.max(0, Number(input.fee) || 0));

  const zone = await prisma.shippingZone.create({
    data: {
      businessId,
      name,
      cities: JSON.stringify(cities),
      fee,
      freeOver: input.freeOver == null ? null : round2(Math.max(0, Number(input.freeOver))),
      priority: Math.floor(Number(input.priority) || 0),
    },
  });
  return { id: zone.id };
}

export async function updateShippingZone(
  businessId: string,
  zoneId: string,
  input: Partial<{ name: string; cities: string[]; fee: number; freeOver: number | null; priority: number }>,
): Promise<void> {
  const data: Record<string, unknown> = {};
  if (input.name !== undefined) data.name = input.name.trim().slice(0, 120);
  if (input.cities !== undefined) data.cities = JSON.stringify([...new Set(input.cities.map((c) => c.trim()).filter(Boolean))].slice(0, 200));
  if (input.fee !== undefined) data.fee = round2(Math.max(0, Number(input.fee) || 0));
  if (input.freeOver !== undefined) data.freeOver = input.freeOver == null ? null : round2(Math.max(0, Number(input.freeOver)));
  if (input.priority !== undefined) data.priority = Math.floor(Number(input.priority) || 0);
  await prisma.shippingZone.updateMany({ where: { id: zoneId, businessId }, data });
}

export async function deleteShippingZone(businessId: string, zoneId: string): Promise<void> {
  await prisma.shippingZone.deleteMany({ where: { id: zoneId, businessId } });
}
