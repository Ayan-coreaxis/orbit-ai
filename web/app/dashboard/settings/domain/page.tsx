import { DomainCard } from "@/components/settings/DomainCard";
import { SettingsHeader } from "@/components/settings/SettingsHeader";
import { getSettingsBusiness } from "@/lib/settings-data";

export default async function DomainSettingsPage() {
  const b = await getSettingsBusiness();
  return (
    <div>
      <SettingsHeader title="Domain" description="Put your store on your own web address, like yourbrand.com." />
      {b ? <DomainCard /> : <p className="text-[13.5px] text-text-faint">No business yet — finish setup first.</p>}
    </div>
  );
}
