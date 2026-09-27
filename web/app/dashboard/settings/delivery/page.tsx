import { StoreOpsSettingsCard } from "@/components/store/StoreOpsSettingsCard";
import { ShippingZonesManager } from "@/components/store/ShippingZonesManager";
import { CourierCard } from "@/components/store/CourierCard";
import { SettingsHeader } from "@/components/settings/SettingsHeader";
import { getSettingsBusiness, opsInitial } from "@/lib/settings-data";

export default async function DeliverySettingsPage() {
  const b = await getSettingsBusiness();
  return (
    <div className="space-y-6">
      <SettingsHeader title="Delivery & courier" description="What delivery costs your customers, per city if you like, and the courier that carries the parcels." />
      {b ? (
        <>
          <StoreOpsSettingsCard initial={opsInitial(b)} parts={["delivery"]} title="Standard delivery fee" />
          <ShippingZonesManager businessId={b.businessId} currency={b.storeCurrency ?? "usd"} />
          <CourierCard />
        </>
      ) : (
        <p className="text-[13.5px] text-text-faint">No business yet — finish setup first.</p>
      )}
    </div>
  );
}
