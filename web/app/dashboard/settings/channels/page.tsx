import { Card, SectionLabel, Pill } from "@/components/ui";
import { MetaConnectCard } from "@/components/store/MetaConnectCard";
import { WhatsAppIcon } from "@/components/icons/BrandIcons";
import { SettingsHeader } from "@/components/settings/SettingsHeader";
import { getSettingsBusiness } from "@/lib/settings-data";
import { isMetaAppConfigured } from "@/lib/meta-oauth";

export default async function ChannelsSettingsPage({ searchParams }: { searchParams: Promise<{ meta?: string }> }) {
  const { meta } = await searchParams;
  const b = await getSettingsBusiness();
  if (!b) return <p className="text-[13.5px] text-text-faint">No business yet — finish setup first.</p>;

  return (
    <div className="space-y-6">
      <SettingsHeader title="Facebook, Instagram & WhatsApp" description="Connect where your customers are, so Orbit can post, run ads and answer messages." />

      <MetaConnectCard
        appConfigured={isMetaAppConfigured()}
        connected={!!b.metaPageId}
        pageName={b.metaPageName ?? null}
        hasInstagram={!!b.metaInstagramUserId}
        hasAdAccount={!!b.metaAdAccountId}
        connectedAt={b.metaConnectedAt ? b.metaConnectedAt.toISOString() : null}
        metaStatus={meta}
      />

      <Card className="p-6 sm:p-7">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <WhatsAppIcon size={18} />
            <SectionLabel>WhatsApp</SectionLabel>
          </div>
          <Pill tone={b.whatsappInboundNumber ? "good" : "neutral"}>{b.whatsappInboundNumber ? "Connected" : "Not connected"}</Pill>
        </div>
        <div className="mt-3 space-y-2 text-[13px] leading-relaxed text-text-dim">
          {b.whatsappInboundNumber ? (
            <p>
              Customers who message <b className="text-text">{b.whatsappInboundNumber}</b> get answers from your Chatbot, and order updates go out from this number.
            </p>
          ) : (
            <p>
              No store WhatsApp number yet. WhatsApp Business numbers can&apos;t be connected with a login like Facebook — the Orbit team assigns one to your store. Ask
              them from the chat.
            </p>
          )}
          {b.whatsapp && <p className="text-text-faint">Your own number (for order alerts and weekly updates): {b.whatsapp}</p>}
        </div>
      </Card>
    </div>
  );
}
