import { StoreOpsSettingsCard } from "@/components/store/StoreOpsSettingsCard";
import { ProductFeedsCard } from "@/components/settings/ProductFeedsCard";
import { SettingsHeader } from "@/components/settings/SettingsHeader";
import { getSettingsBusiness, opsInitial } from "@/lib/settings-data";
import { prisma } from "@/lib/prisma";
import { isPublicHttps, storeUrl } from "@/lib/public-url";

export default async function TrackingSettingsPage() {
  const b = await getSettingsBusiness();
  if (!b) {
    return (
      <div>
        <SettingsHeader title="Tracking & pixels" description="Measure visits and sales, and let your ads learn who buys." />
        <p className="text-[13.5px] text-text-faint">No business yet — finish setup first.</p>
      </div>
    );
  }
  const [base, design] = await Promise.all([storeUrl(b.businessId), prisma.storeDesign.findUnique({ where: { businessId: b.businessId }, select: { published: true, doc: true } })]);
  return (
    <div className="space-y-6">
      <div>
        <SettingsHeader title="Tracking & pixels" description="Measure visits and sales, let your ads learn who buys, and list your products on Google and Meta." />
        <StoreOpsSettingsCard initial={opsInitial(b)} parts={["tracking"]} title="Analytics & ads tracking" />
      </div>
      <ProductFeedsCard googleUrl={`${base}/feeds/google.xml`} metaUrl={`${base}/feeds/meta.csv`} published={!!design?.published && !!design.doc} reachable={isPublicHttps(base)} />
    </div>
  );
}
