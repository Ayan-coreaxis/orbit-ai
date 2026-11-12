import { PaymentSettingsCard } from "@/components/store/PaymentSettingsCard";
import { SettingsHeader } from "@/components/settings/SettingsHeader";
import { getSettingsBusiness } from "@/lib/settings-data";
import { walletStatus } from "@/lib/payment-methods";
import { appBaseUrl } from "@/lib/public-url";

export default async function PaymentsSettingsPage() {
  const b = await getSettingsBusiness();
  return (
    <div>
      <SettingsHeader title="Payments" description="How customers pay you, and the currency your store charges in." />
      {b ? (
        <PaymentSettingsCard initialProvider={b.paymentProvider ?? "cod"} initialStripeConfigured={!!b.stripeSecretKey && !!b.stripePublishableKey} initialCurrency={b.storeCurrency ?? "usd"}
          // only "saved" + last 4 characters cross to the browser — never the credentials
          initialWallets={walletStatus(b)}
          easypaisaIpnUrl={`${appBaseUrl()}/api/store/${b.id}/pay/easypaisa/ipn`}
        />
      ) : (
        <p className="text-[13.5px] text-text-faint">No business yet — finish setup first.</p>
      )}
    </div>
  );
}
