import { Topbar } from "@/components/Topbar";
import { Card, SectionLabel } from "@/components/ui";
import { prisma } from "@/lib/prisma";
import { CompetitorTracker } from "@/components/CompetitorTracker";
import { getBusinessSummary } from "@/lib/get-business";
import { ExternalLink, Sparkles, Package, Megaphone, Lightbulb } from "lucide-react";

export default async function CompetitorsPage() {
  const real = await getBusinessSummary();
  const list = real && real.competitors.length > 0 ? real.competitors : null;
  const tracked = real ? await prisma.competitor.findMany({ where: { businessId: real.businessId }, orderBy: { createdAt: "asc" }, select: { id: true, url: true } }) : [];

  return (
    <div>
      <Topbar
        title="Watching Your Competitors"
        subtitle={
          list
            ? `${list.length} competitor${list.length === 1 ? "" : "s"} analyzed for ${real!.businessName}`
            : "No competitor notes yet"
        }
      />
      <div className="max-w-[1200px] space-y-6 p-5 sm:p-8 lg:p-10">
        {!real && (
          <div className="flex items-start gap-3 rounded-xl border border-accent/25 bg-accent-soft px-4 py-3.5">
            <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-accent-strong" />
            <p className="text-[13.5px] leading-relaxed text-accent-strong">
              <a href="/onboarding" className="underline">Complete onboarding</a> first — nothing fake is shown here in the meantime.
            </p>
          </div>
        )}

        {real && <CompetitorTracker initial={tracked} />}

        <div className="flex items-center justify-between">
          <SectionLabel>What we found</SectionLabel>
          {real?.competitorsScannedAt && <span className="text-[12px] text-text-faint">Last read {real.competitorsScannedAt.toLocaleDateString()}</span>}
        </div>

        <div className="space-y-4">
          {list ? (
            list.map((c) => (
              <Card key={c.url} className="p-6">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <span className="text-[15px] font-semibold">{c.name}</span>
                    <a
                      href={c.url.startsWith("http") ? c.url : `https://${c.url}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1 text-[13px] text-text-faint hover:text-accent"
                    >
                      {c.url} <ExternalLink className="h-3 w-3" />
                    </a>
                  </div>
                </div>
                {c.topProduct && (
                  <div className="mt-4 flex items-start gap-2">
                    <Package className="mt-0.5 h-3.5 w-3.5 shrink-0 text-text-faint" />
                    <div>
                      <span className="text-[12.5px] font-medium text-text-faint">Top product: </span>
                      <span className="text-[13.5px] text-text-dim">{c.topProduct}</span>
                      {c.pricing && (
                        <span className="ml-1.5 rounded-md bg-panel-2 px-1.5 py-0.5 text-[11.5px] font-mono text-text-dim">
                          {c.pricing}
                        </span>
                      )}
                    </div>
                  </div>
                )}
                <div className="mt-5 grid grid-cols-1 gap-5 sm:grid-cols-2">
                  <div>
                    <div className="text-[12.5px] font-medium text-text-faint">What&apos;s trending for them</div>
                    <div className="mt-1 text-[14.5px] text-text-dim">{c.trending}</div>
                    {c.whyTrending && (
                      <div className="mt-2 flex items-start gap-1.5">
                        <Lightbulb className="mt-0.5 h-3 w-3 shrink-0 text-accent" />
                        <span className="text-[12.5px] italic text-text-faint">{c.whyTrending}</span>
                      </div>
                    )}
                  </div>
                  <div>
                    <div className="text-[12.5px] font-medium text-text-faint">Where you could win</div>
                    <div className="mt-1 text-[14.5px] text-text-dim">{c.gap}</div>
                  </div>
                </div>
                {c.adActivity && (
                  <div className="mt-4 flex items-start gap-2 rounded-lg bg-panel-2 px-3 py-2.5">
                    <Megaphone className="mt-0.5 h-3.5 w-3.5 shrink-0 text-text-faint" />
                    <span className="text-[13px] text-text-dim">{c.adActivity}</span>
                  </div>
                )}
              </Card>
            ))
          ) : (
            <Card className="p-8 text-center text-[13.5px] text-text-faint">
              {tracked.length ? "Press Refresh analysis to read the competitors you track." : "Add a competitor above to get notes on what they sell and where you could win."}
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
