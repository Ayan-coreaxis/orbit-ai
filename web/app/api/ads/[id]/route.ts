import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getActiveBusinessId } from "@/lib/get-active-business-id";
import { activateCampaign, pauseCampaign } from "@/lib/meta-graph";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const businessId = await getActiveBusinessId();
  if (!businessId) return NextResponse.json({ error: "No active business." }, { status: 400 });

  const campaign = await prisma.adCampaign.findUnique({ where: { id } });
  if (!campaign || campaign.businessId !== businessId) {
    return NextResponse.json({ error: "Campaign not found." }, { status: 404 });
  }

  const business = await prisma.business.findUnique({ where: { id: businessId }, select: { metaAccessToken: true } });
  if (!business?.metaAccessToken) {
    return NextResponse.json({ error: "Meta isn't connected for this business anymore." }, { status: 400 });
  }

  const { action } = (await req.json()) as { action?: "activate" | "pause" };
  if (action !== "activate" && action !== "pause") {
    return NextResponse.json({ error: "Invalid action." }, { status: 400 });
  }

  const result =
    action === "activate"
      ? await activateCampaign(campaign.metaCampaignId, business.metaAccessToken)
      : await pauseCampaign(campaign.metaCampaignId, business.metaAccessToken);

  if (!result.ok) {
    await prisma.adCampaign.update({ where: { id }, data: { status: "error" } });
    return NextResponse.json({ error: result.error }, { status: 502 });
  }

  const updated = await prisma.adCampaign.update({
    where: { id },
    data: {
      status: action === "activate" ? "active" : "paused",
      activatedAt: action === "activate" ? new Date() : campaign.activatedAt,
    },
  });
  return NextResponse.json({ campaign: updated });
}
