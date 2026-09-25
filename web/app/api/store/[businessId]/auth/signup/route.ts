import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import { hashPassword, setCustomerCookie, issueOtp } from "@/lib/store-auth";
import { storeExists } from "@/lib/store-backend";
import { getAuthMethods } from "@/lib/store-auth-methods";
import { recordReferralSignup } from "@/lib/referral";

/**
 * Register a storefront customer for THIS store. If the form sends a password we create a
 * password account and sign in now; otherwise we create a code account and send a login code
 * (verified via /auth/otp-verify). Which paths are allowed comes from `getAuthMethods`.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ businessId: string }> }) {
  const { businessId } = await params;
  if (!(await storeExists(businessId))) return NextResponse.json({ error: "Store not found." }, { status: 404 });

  const methods = await getAuthMethods(businessId);
  if (!methods.enabled) return NextResponse.json({ error: "This store doesn't use accounts." }, { status: 400 });

  const b = (await req.json()) as { name?: string; email?: string; phone?: string; password?: string };
  const name = (b.name ?? "").trim().slice(0, 120);
  const email = (b.email ?? "").trim().toLowerCase().slice(0, 160) || null;
  const phone = (b.phone ?? "").trim().slice(0, 40) || null;
  if (!name) return NextResponse.json({ error: "Name is required." }, { status: 400 });

  const wantsPassword = !!b.password;
  if (wantsPassword && !methods.password)
    return NextResponse.json({ error: "This store signs in by verification code." }, { status: 400 });
  if (!wantsPassword && !methods.otp)
    return NextResponse.json({ error: "A password is required." }, { status: 400 });

  if (wantsPassword) {
    if (!email || !b.password || b.password.length < 6)
      return NextResponse.json({ error: "Email and a password of at least 6 characters are required." }, { status: 400 });
  } else if (!phone && !email) {
    return NextResponse.json({ error: "A phone number is required." }, { status: 400 });
  }

  const clash = await prisma.storeCustomer.findFirst({
    where: { businessId, OR: [email ? { email } : {}, phone ? { phone } : {}].filter((x) => Object.keys(x).length) },
  });
  if (clash) return NextResponse.json({ error: "An account with those details already exists — sign in instead." }, { status: 409 });

  const customer = await prisma.storeCustomer.create({
    data: {
      businessId,
      name,
      email,
      phone,
      passwordHash: wantsPassword && b.password ? await hashPassword(b.password) : null,
    },
  });

  const refCode = (await cookies()).get(`ref_${businessId}`)?.value;
  if (refCode) await recordReferralSignup(businessId, refCode, customer.id).catch(() => {});

  if (wantsPassword) {
    await setCustomerCookie(businessId, customer.id);
    return NextResponse.json({ ok: true, customer: { id: customer.id, name: customer.name } });
  }

  // code mode: send the code, don't sign in until verified
  const channel = phone ? "phone" : "email";
  const otp = await issueOtp(businessId, channel, (phone || email)!);
  return NextResponse.json({ ok: true, needsOtp: true, channel, target: phone || email, devCode: otp.devCode });
}
