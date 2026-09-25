import { NextResponse } from "next/server";
import { getStoreCustomer } from "@/lib/store-auth";
import { getAuthMethods } from "@/lib/store-auth-methods";

export async function GET(_req: Request, { params }: { params: Promise<{ businessId: string }> }) {
  const { businessId } = await params;
  const [customer, methods] = await Promise.all([getStoreCustomer(businessId), getAuthMethods(businessId)]);
  // legacy compat: the slot-era AuthWidget/AccountWidget still read a single `authMode`
  const authMode = !methods.enabled ? "none" : methods.otp && methods.password ? "both" : methods.otp ? "otp" : "password";
  return NextResponse.json({ methods, authMode, customer });
}
