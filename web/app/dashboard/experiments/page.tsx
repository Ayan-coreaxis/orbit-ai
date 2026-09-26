import { Topbar } from "@/components/Topbar";
import { Card } from "@/components/ui";
import { getActiveBusinessId } from "@/lib/get-active-business-id";
import { prisma } from "@/lib/prisma";
import { getExperimentResults } from "@/lib/experiment";
import { ExperimentsManager } from "@/components/store/ExperimentsManager";

export default async function ExperimentsPage() {
  const businessId = await getActiveBusinessId();
  const experiments = businessId
    ? await prisma.experiment.findMany({ where: { businessId }, orderBy: { createdAt: "desc" } })
    : [];

  const withResults = await Promise.all(
    experiments.map(async (e) => ({
      id: e.id,
      name: e.name,
      active: e.active,
      variantAText: e.variantAText,
      variantBText: e.variantBText,
      createdAt: e.createdAt.toISOString(),
      results: await getExperimentResults(e.id),
    })),
  );

  return (
    <div>
      <Topbar
        title="Experimentation (A/B)"
        subtitle={businessId ? `${experiments.length} real experiment${experiments.length === 1 ? "" : "s"}` : "No business yet"}
      />
      <div className="max-w-[1000px] space-y-6 p-5 sm:p-8 lg:p-10">
        {!businessId ? (
          <Card className="p-6">
            <p className="text-[13.5px] text-text-faint">No business yet — finish setup first.</p>
          </Card>
        ) : (
          <>
            <Card className="p-6">
              <p className="text-[13px] leading-relaxed text-text-dim">
                Real A/B test on your storefront&apos;s hero text — each real visitor is deterministically
                split into variant A or B (same visitor always sees the same one), and conversion is a
                real completed order, not a click estimate. Only one experiment can be active at a time.
              </p>
            </Card>
            <ExperimentsManager experiments={withResults} />
          </>
        )}
      </div>
    </div>
  );
}
