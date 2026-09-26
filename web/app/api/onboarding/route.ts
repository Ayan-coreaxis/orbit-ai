import { throttle } from "@/lib/guard";
import { secureCookie } from "@/lib/signed-token";
import { NextRequest, NextResponse, after } from "next/server";
import { prisma } from "@/lib/prisma";
import { scanCompetitors } from "@/lib/competitor-intel";
import { importWebsiteProducts } from "@/lib/onboarding-products";
import { draftGrowthPlan } from "@/lib/strategy-planner";
import { getCurrentUser } from "@/lib/auth";
import { UsageCapExceededError, PLAN_DEFAULT_CAP_USD } from "@/lib/usage-limit";
import { VALID_BUSINESS_MODELS } from "@/lib/business-model";
import { cleanAnswers } from "@/lib/onboarding-questions";

export const maxDuration = 120;

interface OnboardingBody {
  businessName: string;
  niche: string;
  businessModel?: string | null;
  website?: string;
  instagram?: string;
  whatsapp?: string;
  competitors: string[];
  answers?: { question: string; answer: string }[];
}

export async function POST(req: NextRequest) {
  const limited = await throttle(req, "onboarding", 20, 86400000);
  if (limited) return limited;
  if (!process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_API_KEY === "paste_your_key_here") {
    return NextResponse.json(
      { error: "ANTHROPIC_API_KEY is not set in .env.local yet." },
      { status: 400 },
    );
  }

  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "You need an account first — sign up to generate a real plan." }, { status: 401 });
  }

  const body: OnboardingBody = await req.json();
  const competitorUrls = (body.competitors || []).filter(Boolean).slice(0, 5);

  // Store currency from real signals (their site's country domain / WhatsApp country code) —
  // a Pakistani store must not start in USD. The seller can change it in Settings anytime.
  const host = (body.website || "").toLowerCase().replace(/^https?:\/\//, "").split("/")[0];
  const phone = (body.whatsapp || "").replace(/[^\d+]/g, "");
  const storeCurrency =
    host.endsWith(".pk") || phone.startsWith("+92") || /^03\d{9}$/.test(phone) ? "pkr"
    : host.endsWith(".ae") || phone.startsWith("+971") ? "aed"
    : host.endsWith(".in") || phone.startsWith("+91") ? "inr"
    : host.endsWith(".uk") || phone.startsWith("+44") ? "gbp"
    : host.endsWith(".sa") || phone.startsWith("+966") ? "sar"
    : host.endsWith(".bd") || phone.startsWith("+880") ? "bdt"
    : undefined;

  const business = await prisma.business.create({
    data: {
      ownerId: user.id,
      ...(storeCurrency && { storeCurrency }),
      name: body.businessName,
      niche: body.niche,
      businessModel: body.businessModel && VALID_BUSINESS_MODELS.includes(body.businessModel) ? body.businessModel : null,
      website: body.website || null,
      instagram: body.instagram || null,
      whatsapp: body.whatsapp || null,
      onboardingAnswers: (() => {
        const a = cleanAnswers(body.answers);
        return a.length ? JSON.stringify(a) : null;
      })(),
      plan: "starter",
      monthlyUsageCapUsd: PLAN_DEFAULT_CAP_USD.starter,
      competitors: { create: competitorUrls.map((url) => ({ url })) },
    },
  });

  // Deliberately no StoreDesign row created here. That used to happen automatically (to avoid a
  // now-removed theme-picker gate), but it meant a store nobody had designed still rendered a
  // full default storefront the moment you visited its URL — even to the owner. Now the absence
  // of a StoreDesign row IS the real "hasn't designed their store yet" signal every /store route
  // checks; the row is only created once the seller actually does something in Orbit Design.
  // Kick off product import from the seller's own website alongside the growth report — both
  // run concurrently, and a failed import never blocks onboarding.
  const importPromise = importWebsiteProducts(business.id, body.website).catch(() => 0);

  try {
    const productsImported = await importPromise;
    // In the background: read the competitors (reference notes only), then draft the seller's first
    // growth plan so it's waiting for them to discuss. Nothing runs until they approve it.
    after(async () => {
      await scanCompetitors(business.id).catch((err) => console.warn("[onboarding] competitor scan failed", err));
      await draftGrowthPlan(business.id).catch((err) => console.warn("[onboarding] first plan draft failed", err));
    });
    const response = NextResponse.json({ businessId: business.id, productsImported });
    response.cookies.set("businessId", business.id, { httpOnly: true, secure: secureCookie(), sameSite: "lax", path: "/" });
    return response;
  } catch (e) {
    if (e instanceof UsageCapExceededError) {
      return NextResponse.json({ error: e.message }, { status: 402 });
    }
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Something went wrong generating your report." },
      { status: 500 },
    );
  }
}
