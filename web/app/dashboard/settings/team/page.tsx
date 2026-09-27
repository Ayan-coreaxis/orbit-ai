import { TeamManager } from "@/components/store/TeamManager";
import { SettingsHeader } from "@/components/settings/SettingsHeader";
import { getSettingsBusiness } from "@/lib/settings-data";

export default async function TeamSettingsPage() {
  const b = await getSettingsBusiness();
  return (
    <div>
      <SettingsHeader title="Team" description="Invite people to help run this store." />
      {b ? <TeamManager /> : <p className="text-[13.5px] text-text-faint">No business yet — finish setup first.</p>}
    </div>
  );
}
