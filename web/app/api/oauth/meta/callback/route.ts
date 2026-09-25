import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyState, exchangeCodeForToken, exchangeForLongLivedToken, getManagedPages, getAdAccounts } from "@/lib/meta-oauth";

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

function redirect(status: string) {
  return NextResponse.redirect(new URL(`/dashboard/settings?meta=${status}`, APP_URL));
}

export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get("code");
  const state = req.nextUrl.searchParams.get("state");
  const oauthError = req.nextUrl.searchParams.get("error");

  if (oauthError) return redirect("denied");
  if (!code || !state) return redirect("error");

  const businessId = verifyState(state);
  if (!businessId) return redirect("error");

  try {
    const shortToken = await exchangeCodeForToken(code);
    const longToken = await exchangeForLongLivedToken(shortToken);
    const pages = await getManagedPages(longToken);

    if (pages.length === 0) {
      return redirect("no_pages");
    }

    // Real, but simplified: connect the first real Page returned. A multi-Page picker is a
    // reasonable future improvement — most sellers manage exactly one Page for their store.
    const page = pages[0];
    const adAccounts = await getAdAccounts(longToken);

    await prisma.business.update({
      where: { id: businessId },
      data: {
        metaAccessToken: page.access_token,
        metaPageId: page.id,
        metaPageName: page.name,
        metaInstagramUserId: page.instagram_business_account?.id ?? null,
        metaAdAccountId: adAccounts[0]?.id ?? null,
        metaConnectedAt: new Date(),
      },
    });

    return redirect("connected");
  } catch (e) {
    console.error("Meta OAuth callback failed:", e);
    return redirect("error");
  }
}
