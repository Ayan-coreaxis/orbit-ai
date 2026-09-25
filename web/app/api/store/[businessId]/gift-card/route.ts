import { NextRequest, NextResponse } from "next/server";
import { lookupGiftCard, getGiftCardSettings } from "@/lib/gift-cards";

/** Public balance check — anyone holding the code can look up what's left on it, no sign-in needed
 *  (same as a real physical gift card). */
export async function GET(req: NextRequest, { params }: { params: Promise<{ businessId: string }> }) {
  const { businessId } = await params;
  const settings = await getGiftCardSettings(businessId);
  if (!settings.enabled) return NextResponse.json({ enabled: false });

  const code = req.nextUrl.searchParams.get("code") || "";
  if (!code) return NextResponse.json({ enabled: true });

  const gc = await lookupGiftCard(businessId, code);
  if (!gc.ok) return NextResponse.json({ enabled: true, ok: false, error: gc.error });
  return NextResponse.json({ enabled: true, ok: true, code: gc.code, balance: gc.balance });
}
