import { throttle } from "@/lib/guard";
import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { generateOnboardingQuestions } from "@/lib/onboarding-questions";

/** { name, niche, businessModel?, website? } → 4–5 questions written for this seller. */
export async function POST(req: NextRequest) {
  const limited = await throttle(req, "onb-questions", 20, 3600000);
  if (limited) return limited;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Sign up first." }, { status: 401 });
  const b = (await req.json().catch(() => ({}))) as { name?: string; niche?: string; businessModel?: string | null; website?: string };
  if (!b.name?.trim() || !b.niche?.trim()) return NextResponse.json({ error: "Business name and what you sell come first." }, { status: 400 });
  return NextResponse.json(await generateOnboardingQuestions({ name: b.name, niche: b.niche, businessModel: b.businessModel, website: b.website }));
}
