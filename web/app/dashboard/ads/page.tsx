import { Topbar } from "@/components/Topbar";
import { Card } from "@/components/ui";
import { getActiveBusinessId } from "@/lib/get-active-business-id";
import { AdsManager } from "@/components/ads/AdsManager";

export default async function AdsPage() {
  const businessId = await getActiveBusinessId();
  return (
    <div>
      <Topbar title="Ads" subtitle="Real Meta ads on Facebook & Instagram — built paused, you start the spend" />
      <div className="max-w-[1100px] p-5 sm:p-8 lg:p-10">
        {businessId ? (
          <AdsManager />
        ) : (
          <Card className="p-6">
            <p className="text-[13.5px] text-text-faint">No business yet — complete onboarding first.</p>
          </Card>
        )}
      </div>
    </div>
  );
}
