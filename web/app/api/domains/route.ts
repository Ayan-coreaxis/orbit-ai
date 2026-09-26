import { NextRequest, NextResponse } from "next/server";
import { getActiveBusinessId } from "@/lib/get-active-business-id";
import { prisma } from "@/lib/prisma";
import { DomainError, dnsTargets, removeDomain, requiredRecords, setDomain } from "@/lib/domains";
import { storeUrl } from "@/lib/public-url";

async function view(businessId: string) {
  const b = await prisma.business.findUnique({
    where: { id: businessId },
    select: { customDomain: true, customDomainToken: true, customDomainStatus: true, customDomainNote: true, customDomainCheckedAt: true, customDomainVerifiedAt: true },
  });
  const t = dnsTargets();
  return {
    domain: b?.customDomain ?? null,
    status: b?.customDomainStatus ?? null,
    note: b?.customDomainNote ?? null,
    checkedAt: b?.customDomainCheckedAt?.toISOString() ?? null,
    verifiedAt: b?.customDomainVerifiedAt?.toISOString() ?? null,
    records: b?.customDomain && b.customDomainToken ? requiredRecords(b.customDomain, b.customDomainToken) : [],
    storeUrl: await storeUrl(businessId),
    hostingReady: !!t.cname || !!t.ip,
  };
}

export async function GET() {
  const businessId = await getActiveBusinessId();
  if (!businessId) return NextResponse.json({ error: "No active business." }, { status: 400 });
  return NextResponse.json(await view(businessId));
}

/** { domain } — connect (or change) the store's domain. */
export async function POST(req: NextRequest) {
  const businessId = await getActiveBusinessId();
  if (!businessId) return NextResponse.json({ error: "No active business." }, { status: 400 });
  const { domain } = (await req.json().catch(() => ({}))) as { domain?: string };
  try {
    await setDomain(businessId, domain ?? "");
    return NextResponse.json(await view(businessId));
  } catch (e) {
    return NextResponse.json({ error: e instanceof DomainError ? e.message : "Couldn't save the domain." }, { status: 400 });
  }
}

export async function DELETE() {
  const businessId = await getActiveBusinessId();
  if (!businessId) return NextResponse.json({ error: "No active business." }, { status: 400 });
  await removeDomain(businessId);
  return NextResponse.json(await view(businessId));
}
