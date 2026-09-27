import { StoreOpsSettingsCard } from "@/components/store/StoreOpsSettingsCard";
import { WidgetCustomizationCard } from "@/components/store/WidgetCustomizationCard";
import { SettingsHeader } from "@/components/settings/SettingsHeader";
import { getSettingsBusiness, opsInitial, widgetInitial } from "@/lib/settings-data";

export default async function StorefrontSettingsPage() {
  const b = await getSettingsBusiness();
  return (
    <div className="space-y-6">
      <SettingsHeader
        title="Storefront"
        description="Extras on your store's pages. Page design itself (layout, colours, photos, text) is done in Orbit Design."
      />
      {b ? (
        <>
          <StoreOpsSettingsCard initial={opsInitial(b)} parts={["storefront"]} title="On your store" />
          <WidgetCustomizationCard
            initial={widgetInitial(b)}
            parts={["motion", "tabs"]}
            title="Cart, checkout & account screens"
            description="These screens run on shared logic so every store gets a working checkout — choose how they feel and which account tabs customers see."
          />
          <WidgetCustomizationCard
            initial={widgetInitial(b)}
            parts={["copy"]}
            title="Wording"
            description="Every button, label and message on the cart, checkout, sign-in, account and tracking screens."
          />
        </>
      ) : (
        <p className="text-[13.5px] text-text-faint">No business yet — finish setup first.</p>
      )}
    </div>
  );
}
