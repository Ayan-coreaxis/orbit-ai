import { Topbar } from "@/components/Topbar";
import { Card, SectionLabel } from "@/components/ui";
import { getActiveBusinessId } from "@/lib/get-active-business-id";
import { prisma } from "@/lib/prisma";
import { AdCampaignsManager } from "@/components/store/AdCampaignsManager";
import { AlertTriangle } from "lucide-react";

export default async function AdsPage() {
  const businessId = await getActiveBusinessId();
  const business = businessId ? await prisma.business.findUnique({ where: { id: businessId } }) : null;
  const campaigns = businessId
    ? await prisma.adCampaign.findMany({ where: { businessId }, orderBy: { createdAt: "desc" } })
    : [];

  return (
    <div>
      <Topbar title="Ads" subtitle="Real Meta campaigns — created paused, you activate real spend" />
      <div className="max-w-[1000px] space-y-6 p-10">
        {!businessId || !business ? (
          <Card className="p-6">
            <p className="text-[13.5px] text-text-faint">No real business yet — complete onboarding first.</p>
          </Card>
        ) : !business.metaAdAccountId ? (
          <Card className="p-6">
            <div className="flex items-start gap-3">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-text-faint" />
              <div>
                <SectionLabel>No real Meta Ad Account connected</SectionLabel>
                <p className="mt-2 text-[13px] leading-relaxed text-text-dim">
                  Connect Instagram/Facebook with ads access in{" "}
                  <a href="/dashboard/settings" className="underline">
                    Settings
                  </a>{" "}
                  to let the Ads Agent create real campaigns. Nothing here is fabricated in the
                  meantime.
                </p>
              </div>
            </div>
          </Card>
        ) : (
          <Card className="p-6">
            <p className="text-[13px] leading-relaxed text-text-dim">
              The Ads Agent creates every real campaign <b>paused</b> — it never starts real spend
              on its own. Review the budget and reasoning below, then activate it yourself. Every
              campaign here is a real object in your real Meta Ad Account, not a preview.
            </p>
          </Card>
        )}

        <AdCampaignsManager
          campaigns={campaigns.map((c) => ({
            id: c.id,
            name: c.name,
            dailyBudgetUsd: c.dailyBudgetUsd,
            reasoning: c.reasoning,
            status: c.status,
            createdAt: c.createdAt.toISOString(),
            activatedAt: c.activatedAt ? c.activatedAt.toISOString() : null,
          }))}
        />
      </div>
    </div>
  );
}
