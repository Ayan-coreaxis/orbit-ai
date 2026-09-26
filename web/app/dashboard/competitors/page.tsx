import { Topbar } from "@/components/Topbar";
import { Card, SectionLabel, Button } from "@/components/ui";
import { getRealPlan } from "@/lib/get-business";
import { RefreshAnalysisButton } from "@/components/RefreshAnalysisButton";
import { ExternalLink, Plus, Sparkles, Package, Megaphone, Lightbulb } from "lucide-react";

export default async function CompetitorsPage() {
  const real = await getRealPlan();
  const list = real && real.competitors.length > 0 ? real.competitors : null;

  return (
    <div>
      <Topbar
        title="Watching Your Competitors"
        subtitle={
          list
            ? `${list.length} competitor${list.length === 1 ? "" : "s"} analyzed for ${real!.businessName}`
            : "No real competitor analysis yet"
        }
      />
      <div className="max-w-[1200px] space-y-6 p-10">
        {!list && (
          <div className="flex items-start gap-3 rounded-xl border border-accent/25 bg-accent-soft px-4 py-3.5">
            <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-accent-strong" />
            <p className="text-[13.5px] leading-relaxed text-accent-strong">
              No real competitor analysis yet.{" "}
              <a href="/onboarding" className="underline">Complete onboarding</a> to get a real
              analysis of your competitors — nothing fake is shown here in the meantime.
            </p>
          </div>
        )}

        <div className="flex items-center justify-between">
          <SectionLabel>What we found</SectionLabel>
          <div className="flex items-center gap-2.5">
            {list && <RefreshAnalysisButton />}
            <Button variant="secondary">
              <Plus className="h-4 w-4" /> Track a competitor
            </Button>
          </div>
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
              No competitors analyzed yet.
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
