import { Topbar } from "@/components/Topbar";
import { Card, SectionLabel } from "@/components/ui";
import { getActiveBusinessId } from "@/lib/get-active-business-id";
import { getTaxSummary } from "@/lib/tax";
import { TaxRateEditor } from "@/components/store/TaxRateEditor";

export default async function TaxPage() {
  const businessId = await getActiveBusinessId();
  const summary = businessId ? await getTaxSummary(businessId) : null;

  return (
    <div>
      <Topbar title="Tax & Compliance" subtitle="Real tax owed, from your real rate and real revenue" />
      <div className="max-w-[900px] space-y-6 p-10">
        {!businessId || !summary ? (
          <Card className="p-6">
            <p className="text-[13.5px] text-text-faint">No real business yet — complete onboarding first.</p>
          </Card>
        ) : (
          <>
            <Card className="p-7">
              <SectionLabel>Your tax rate</SectionLabel>
              <p className="mt-2 text-[13px] leading-relaxed text-text-dim">
                Enter the real tax rate (GST/VAT/sales tax %) that applies to your sales. This
                platform doesn&apos;t know tax law for your region — it only does the real
                arithmetic once you tell it the rate. Nothing is filed automatically.
              </p>
              <TaxRateEditor initialRate={summary.taxRatePercent} />
            </Card>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Card className="p-5">
                <div className="text-[12.5px] font-medium text-text-faint">This month</div>
                <div className="mt-2.5 text-xl font-semibold">Rs {summary.revenueThisMonth.toLocaleString()} revenue</div>
                <div className="mt-1 text-[14px] text-text-dim">
                  {summary.taxOwedThisMonth !== null
                    ? `Rs ${summary.taxOwedThisMonth.toLocaleString(undefined, { maximumFractionDigits: 0 })} tax owed`
                    : "Set a tax rate to see tax owed"}
                </div>
              </Card>
              <Card className="p-5">
                <div className="text-[12.5px] font-medium text-text-faint">Last month</div>
                <div className="mt-2.5 text-xl font-semibold">Rs {summary.revenueLastMonth.toLocaleString()} revenue</div>
                <div className="mt-1 text-[14px] text-text-dim">
                  {summary.taxOwedLastMonth !== null
                    ? `Rs ${summary.taxOwedLastMonth.toLocaleString(undefined, { maximumFractionDigits: 0 })} tax owed`
                    : "Set a tax rate to see tax owed"}
                </div>
              </Card>
            </div>

            <Card className="p-6">
              <p className="text-[13px] leading-relaxed text-text-dim">
                No jurisdiction-specific rules, no filing, no due dates — this platform doesn&apos;t
                have real tax-law data to ground that in, so it&apos;s honestly not shown rather than
                guessed. What&apos;s real: revenue × your real rate.
              </p>
            </Card>
          </>
        )}
      </div>
    </div>
  );
}
