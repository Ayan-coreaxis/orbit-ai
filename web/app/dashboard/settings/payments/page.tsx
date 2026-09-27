import { PaymentSettingsCard } from "@/components/store/PaymentSettingsCard";
import { SettingsHeader } from "@/components/settings/SettingsHeader";
import { getSettingsBusiness } from "@/lib/settings-data";

export default async function PaymentsSettingsPage() {
  const b = await getSettingsBusiness();
  return (
    <div>
      <SettingsHeader title="Payments" description="How customers pay you, and the currency your store charges in." />
      {b ? (
        <PaymentSettingsCard initialProvider={b.paymentProvider ?? "cod"} initialStripeConfigured={!!b.stripeSecretKey && !!b.stripePublishableKey} initialCurrency={b.storeCurrency ?? "usd"} />
      ) : (
        <p className="text-[13.5px] text-text-faint">No business yet — finish setup first.</p>
      )}
    </div>
  );
}
