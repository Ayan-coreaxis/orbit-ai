import { NextResponse } from "next/server";
import { getStoreCustomer } from "@/lib/store-auth";
import { getReferralSettings, getReferralStats } from "@/lib/referral";

/** The signed-in shopper's own referral code + stats. */
export async function GET(_req: Request, { params }: { params: Promise<{ businessId: string }> }) {
  const { businessId } = await params;
  const customer = await getStoreCustomer(businessId);
  const settings = await getReferralSettings(businessId);
  if (!customer) return NextResponse.json({ enabled: settings.enabled, signedIn: false });

  const stats = await getReferralStats(businessId, customer.id);
  return NextResponse.json({
    enabled: settings.enabled,
    signedIn: true,
    referrerPoints: settings.referrerPoints,
    refereePoints: settings.refereePoints,
    ...stats,
  });
}
