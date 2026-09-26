import { NextResponse } from "next/server";
import { getActiveBusinessId } from "@/lib/get-active-business-id";
import { DomainError, checkDomain } from "@/lib/domains";

/** Look the DNS records up now and verify the domain if they're right. */
export async function POST() {
  const businessId = await getActiveBusinessId();
  if (!businessId) return NextResponse.json({ error: "No active business." }, { status: 400 });
  try {
    return NextResponse.json(await checkDomain(businessId));
  } catch (e) {
    return NextResponse.json({ error: e instanceof DomainError ? e.message : "Couldn't check DNS — try again." }, { status: 400 });
  }
}
