import { StoreOpsSettingsCard } from "@/components/store/StoreOpsSettingsCard";
import { SettingsHeader } from "@/components/settings/SettingsHeader";
import { getSettingsBusiness, opsInitial } from "@/lib/settings-data";

export default async function TrackingSettingsPage() {
  const b = await getSettingsBusiness();
  return (
    <div>
      <SettingsHeader title="Tracking & pixels" description="Measure visits and sales, and let your ads learn who buys." />
      {b ? <StoreOpsSettingsCard initial={opsInitial(b)} parts={["tracking"]} title="Analytics & ads tracking" /> : <p className="text-[13.5px] text-text-faint">No business yet — finish setup first.</p>}
    </div>
  );
}
