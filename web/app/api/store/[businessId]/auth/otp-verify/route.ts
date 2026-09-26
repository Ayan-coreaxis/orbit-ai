import { throttle } from "@/lib/guard";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { consumeOtp, setCustomerCookie } from "@/lib/store-auth";
import { storeExists } from "@/lib/store-backend";

/** Verify a login code → sign the customer in. Also captures their name if this was a first sign-in. */
export async function POST(req: NextRequest, { params }: { params: Promise<{ businessId: string }> }) {
  const limited = await throttle(req, "shop-otp-verify", 20, 600000);
  if (limited) return limited;
  const { businessId } = await params;
  if (!(await storeExists(businessId))) return NextResponse.json({ error: "Store not found." }, { status: 404 });

  const b = (await req.json()) as { phone?: string; email?: string; code?: string; name?: string };
  const phone = (b.phone ?? "").trim().slice(0, 40);
  const email = (b.email ?? "").trim().toLowerCase().slice(0, 160);
  const target = phone || email;
  const code = (b.code ?? "").trim();
  if (!target || !code) return NextResponse.json({ error: "Enter the code we sent you." }, { status: 400 });

  if (!(await consumeOtp(businessId, target, code)))
    return NextResponse.json({ error: "That code is wrong or has expired. After 5 wrong tries, ask for a new code." }, { status: 401 });

  const customer = await prisma.storeCustomer.findFirst({
    where: { businessId, ...(phone ? { phone } : { email }) },
  });
  if (!customer) return NextResponse.json({ error: "Account not found." }, { status: 404 });

  const name = (b.name ?? "").trim().slice(0, 120);
  if (name && !customer.name) await prisma.storeCustomer.update({ where: { id: customer.id }, data: { name } });

  await setCustomerCookie(businessId, customer.id);
  return NextResponse.json({ ok: true, customer: { id: customer.id, name: name || customer.name } });
}
