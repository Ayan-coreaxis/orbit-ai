import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getActiveBusinessId } from "@/lib/get-active-business-id";
import { MetaAdError, activateAd, deleteAd, pauseAd } from "@/lib/meta-ads";
import { adProductSoldOut } from "@/lib/inventory-ads";

/** { action: "activate" | "pause" | "delete" } — the owner's own buttons; activate is the only thing that starts real spend. */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const businessId = await getActiveBusinessId();
  if (!businessId) return NextResponse.json({ error: "No active business." }, { status: 400 });

  const campaign = await prisma.adCampaign.findFirst({ where: { id, businessId } });
  if (!campaign) return NextResponse.json({ error: "Campaign not found." }, { status: 404 });

  const { action } = (await req.json().catch(() => ({}))) as { action?: string };
  if (action === "activate") {
    const gone = await adProductSoldOut(campaign);
    if (gone) return NextResponse.json({ error: `${gone} is sold out — restock it first, or the ad pays for clicks nobody can buy.` }, { status: 409 });
  }
  try {
    const updated =
      action === "activate" ? await activateAd(campaign) : action === "pause" ? await pauseAd(campaign) : action === "delete" ? await deleteAd(campaign) : null;
    if (!updated) return NextResponse.json({ error: "Invalid action." }, { status: 400 });
    if (campaign.pausedReason) await prisma.adCampaign.update({ where: { id }, data: { pausedReason: null } }).catch(() => {});
    return NextResponse.json({ campaign: { id: updated.id, status: updated.status } });
  } catch (e) {
    return NextResponse.json({ error: e instanceof MetaAdError ? e.message : "Couldn't reach Meta — try again." }, { status: 502 });
  }
}
