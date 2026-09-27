import { StoreOpsSettingsCard } from "@/components/store/StoreOpsSettingsCard";
import { WidgetCustomizationCard } from "@/components/store/WidgetCustomizationCard";
import { SettingsHeader } from "@/components/settings/SettingsHeader";
import { getSettingsBusiness, opsInitial, widgetInitial } from "@/lib/settings-data";

export default async function CheckoutSettingsPage() {
  const b = await getSettingsBusiness();
  return (
    <div className="space-y-6">
      <SettingsHeader title="Checkout & orders" description="What happens when someone places an order." />
      {b ? (
        <>
          <StoreOpsSettingsCard initial={opsInitial(b)} parts={["orders"]} title="Orders" />
          <StoreOpsSettingsCard initial={opsInitial(b)} parts={["tax"]} title="Tax" description="Added at checkout — leave the rate empty if you don't charge tax." />
          <WidgetCustomizationCard
            initial={widgetInitial(b)}
            parts={["fields"]}
            title="Extra checkout fields"
            description="Name, phone, email and address are always asked. Add anything else you need — a gift message, a preferred delivery time."
          />
        </>
      ) : (
        <p className="text-[13.5px] text-text-faint">No business yet — finish setup first.</p>
      )}
    </div>
  );
}
