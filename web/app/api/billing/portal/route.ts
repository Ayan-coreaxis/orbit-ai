import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getActiveBusinessId } from "@/lib/get-active-business-id";
import { getPlatformStripe } from "@/lib/platform-stripe";

/** Stripe's billing portal: update card, see invoices, cancel. */
export async function POST(req: NextRequest) {
  const businessId = await getActiveBusinessId();
  if (!businessId) return NextResponse.json({ error: "No active business." }, { status: 401 });
  const stripe = getPlatformStripe();
  if (!stripe) return NextResponse.json({ error: "Billing isn't connected yet." }, { status: 501 });
  const b = await prisma.business.findUnique({ where: { id: businessId }, select: { stripeCustomerId: true } });
  if (!b?.stripeCustomerId) return NextResponse.json({ error: "You don't have a subscription yet — pick a plan first." }, { status: 400 });
  try {
    const session = await stripe.billingPortal.sessions.create({ customer: b.stripeCustomerId, return_url: `${req.nextUrl.origin}/dashboard/settings` });
    return NextResponse.json({ url: session.url });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "";
    return NextResponse.json(
      {
        error: /configuration/i.test(msg)
          ? "The billing portal isn't switched on in Stripe yet — the platform owner saves it once in Stripe > Settings > Billing > Customer portal."
          : `Stripe: ${msg || "couldn't open billing"}`.slice(0, 300),
      },
      { status: 502 },
    );
  }
}
