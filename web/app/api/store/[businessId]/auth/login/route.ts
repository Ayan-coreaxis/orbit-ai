import { throttle } from "@/lib/guard";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyPassword, setCustomerCookie } from "@/lib/store-auth";
import { storeExists } from "@/lib/store-backend";
import { getAuthMethods } from "@/lib/store-auth-methods";

/** Password sign in. Code sign-in uses /auth/otp-request + /auth/otp-verify instead. */
export async function POST(req: NextRequest, { params }: { params: Promise<{ businessId: string }> }) {
  const limited = await throttle(req, "shop-login", 15, 600000);
  if (limited) return limited;
  const { businessId } = await params;
  if (!(await storeExists(businessId))) return NextResponse.json({ error: "Store not found." }, { status: 404 });

  if (!(await getAuthMethods(businessId)).password)
    return NextResponse.json({ error: "This store signs in by verification code." }, { status: 400 });

  const b = (await req.json()) as { email?: string; password?: string };
  const email = (b.email ?? "").trim().toLowerCase().slice(0, 160);
  if (!email || !b.password) return NextResponse.json({ error: "Email and password are required." }, { status: 400 });

  const customer = await prisma.storeCustomer.findFirst({ where: { businessId, email } });
  if (!customer?.passwordHash || !(await verifyPassword(b.password, customer.passwordHash)))
    return NextResponse.json({ error: "Wrong email or password." }, { status: 401 });

  await setCustomerCookie(businessId, customer.id);
  return NextResponse.json({ ok: true, customer: { id: customer.id, name: customer.name } });
}
