import { prisma } from "@/lib/prisma";
import { parseSpec, type StoreBackendSpec } from "@/lib/orbit-backend-spec";

/** Loads the published/normalized StoreBackendSpec for a store (defaultSpec if none). */
export async function loadSpec(businessId: string): Promise<StoreBackendSpec> {
  const d = await prisma.storeDesign.findUnique({ where: { businessId }, select: { backend: true } });
  return parseSpec(d?.backend);
}

/** True if the store exists. Cheap guard for every public store route. */
export async function storeExists(businessId: string): Promise<boolean> {
  const b = await prisma.business.findUnique({ where: { id: businessId }, select: { id: true } });
  return !!b;
}
