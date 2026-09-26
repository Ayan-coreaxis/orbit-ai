import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { issueOtp } from "@/lib/store-auth";
import { storeExists } from "@/lib/store-backend";
import { getAuthMethods } from "@/lib/store-auth-methods";

/** Send a login code. Signup + login are the same step for code sign-in — a new phone/email just gets a customer row. */
export async function POST(req: NextRequest, { params }: { params: Promise<{ businessId: string }> }) {
  const { businessId } = await params;
  if (!(await storeExists(businessId))) return NextResponse.json({ error: "Store not found." }, { status: 404 });

  if (!(await getAuthMethods(businessId)).otp)
    return NextResponse.json({ error: "This store signs in with a password." }, { status: 400 });

  const b = (await req.json()) as { phone?: string; email?: string };
  const phone = (b.phone ?? "").trim().slice(0, 40);
  const email = (b.email ?? "").trim().toLowerCase().slice(0, 160);
  const channel: "phone" | "email" = phone ? "phone" : "email";
  const target = phone || email;
  if (!target) return NextResponse.json({ error: "Enter your phone number." }, { status: 400 });

  // ensure a customer row exists so the code can attach on verify
  await prisma.storeCustomer.upsert({
    where: channel === "phone" ? { businessId_phone: { businessId, phone } } : { businessId_email: { businessId, email } },
    create: { businessId, name: "", phone: phone || null, email: email || null },
    update: {},
  });

  const otp = await issueOtp(businessId, channel, target);
  // Never say "code sent" when it wasn't.
  if (!otp.sent && !otp.devCode) return NextResponse.json({ error: otp.error ?? "Couldn't send the code." }, { status: /wait|Too many/.test(otp.error ?? "") ? 429 : 503 });
  return NextResponse.json({ ok: true, channel, target, sent: otp.sent, devCode: otp.devCode });
}
