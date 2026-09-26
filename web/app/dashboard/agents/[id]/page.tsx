import Link from "next/link";
import { notFound } from "next/navigation";
import { Topbar } from "@/components/Topbar";
import { Card, SectionLabel, StatusBadge, Pill } from "@/components/ui";
import { agents } from "@/lib/mock-data";
import { getBusinessSummary } from "@/lib/get-business";
import { getAgentUsage } from "@/lib/get-agent-usage";
import { getAgentSettings, DEFAULT_AGENT_SETTINGS } from "@/lib/agent-settings";
import { AgentSettingsForm } from "@/components/AgentSettingsForm";
import { ArrowLeft, DollarSign, Activity } from "lucide-react";


// Which model each live agent actually runs on — cheaper Haiku for high-volume,
// lower-stakes specialist calls; Sonnet where reasoning quality matters most.
const AGENT_MODEL: Record<string, string> = {
  orchestrator: "claude-sonnet-4-5",
  competitor: "claude-sonnet-4-5",
  qa: "claude-sonnet-4-5",
  content: "claude-sonnet-4-5",
  seo: "claude-haiku-4-5",
  ads: "claude-haiku-4-5",
  retention: "claude-haiku-4-5",
  inventory: "claude-haiku-4-5",
  pricing: "claude-haiku-4-5",
  chatbot: "claude-haiku-4-5",
};

/** Runs as real deterministic code, not an AI call — no prompt, no spend, ever. */
const NO_AI_AGENTS = new Set(["fraud", "finance", "reviews", "personalization", "returns", "experimentation", "tax"]);
/** Makes real AI calls, triggered live by real customer messages. */
const NO_CYCLE_AI_AGENTS = new Set(["chatbot"]);

const NO_AI_DESCRIPTION: Record<string, React.ReactNode> = {
  fraud: (
    <>
      This isn&apos;t an AI agent — it&apos;s a real, deterministic rule checked on every order
      placed on your storefront (unusual quantity, rapid repeat orders from one phone number,
      order value far above your store&apos;s real average). Check{" "}
      <Link href="/dashboard" className="underline">
        your Store page
      </Link>{" "}
      for any orders it&apos;s flagged.
    </>
  ),
  finance: (
    <>
      This isn&apos;t an AI agent — it&apos;s real code that reconciles your real orders and real
      product cost prices into revenue and gross margin. See it on{" "}
      <Link href="/dashboard/finance" className="underline">
        the Finance page
      </Link>
      .
    </>
  ),
  reviews: (
    <>
      This isn&apos;t an AI agent — it&apos;s a real WhatsApp send triggered when you mark an order
      fulfilled in your Store page. See real requests and responses on{" "}
      <Link href="/dashboard/reviews" className="underline">
        the Reviews page
      </Link>
      .
    </>
  ),
  personalization: (
    <>
      This isn&apos;t an AI agent — it&apos;s real code that shows &quot;customers who viewed this
      also viewed&quot; on every product page, computed live from real visitor session data. Visit
      any real product page on your live store to see it.
    </>
  ),
  returns: (
    <>
      This isn&apos;t an AI agent — it&apos;s a real workflow. Customers request returns from their
      real order tracking page; you approve, reject, or refund on{" "}
      <Link href="/dashboard/returns" className="underline">
        the Returns page
      </Link>
      .
    </>
  ),
  experimentation: (
    <>
      This isn&apos;t an AI agent — it&apos;s a real A/B split on your storefront hero text, with real
      conversion tracking. Set it up and see real results on{" "}
      <Link href="/dashboard/experiments" className="underline">
        the Experiments page
      </Link>
      .
    </>
  ),
  tax: (
    <>
      This isn&apos;t an AI agent — it&apos;s real arithmetic: your real revenue × the real tax rate
      you enter. Set your rate on{" "}
      <Link href="/dashboard/tax" className="underline">
        the Tax page
      </Link>
      .
    </>
  ),
};

/** Milliseconds since `d`, at request time (this is a server component, rendered per request). */
function msSince(d: Date | string): number {
  return Date.now() - new Date(d).getTime();
}

export default async function AgentDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const agent = agents.find((a) => a.id === id);
  if (!agent) notFound();

  const real = await getBusinessSummary();
  const usage = await getAgentUsage(id);
  const settings = real ? await getAgentSettings(real.businessId) : DEFAULT_AGENT_SETTINGS;

  const realStatus = !usage?.lastRunAt
    ? ("never" as const)
    : msSince(usage.lastRunAt) < 60 * 60 * 1000
      ? ("active" as const)
      : ("idle" as const);

  return (
    <div>
      <Topbar title={agent.name} subtitle={agent.layer} />
      <div className="max-w-[900px] space-y-6 p-10">
        <Link
          href="/dashboard"
          className="inline-flex items-center gap-1.5 text-[13.5px] text-text-faint hover:text-text-dim"
        >
          <ArrowLeft className="h-3.5 w-3.5" /> Back to overview
        </Link>

        <Card className="p-7">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h2 className="text-xl font-semibold">{agent.name}</h2>
              <p className="mt-2 max-w-lg text-[14.5px] leading-relaxed text-text-dim">
                {agent.description}
              </p>
            </div>
            {agent.live ? (
              <StatusBadge status={realStatus} />
            ) : (
              <span className="rounded-full bg-panel-2 px-3 py-1 text-[12px] font-medium text-text-faint">
                Preview — not built yet
              </span>
            )}
          </div>
        </Card>

        {/* Real-time work */}
        <Card className="p-7">
          <div className="flex items-center gap-2">
            <Activity className="h-4 w-4 text-text-faint" />
            <SectionLabel>Real-time work</SectionLabel>
          </div>
          {!agent.live ? (
            <p className="mt-4 text-[14px] text-text-faint">
              This agent doesn&apos;t run yet — there&apos;s no real activity to show. It&apos;s on the roadmap.
            </p>
          ) : NO_AI_AGENTS.has(id) ? (
            <p className="mt-4 text-[14px] text-text-dim">{NO_AI_DESCRIPTION[id]}</p>
          ) : NO_CYCLE_AI_AGENTS.has(id) ? (
            <p className="mt-4 text-[14px] text-text-dim">
              This agent answers real customer questions on
              your live storefront in real time, grounded in your real product catalog. See real
              usage below; there&apos;s no single &quot;task&quot; to show.
            </p>
          ) : real ? (
            <p className="mt-4 text-[14px] text-text-dim">
              This agent works on the steps of your growth plan that need it — see what it&apos;s doing in{" "}
              <Link href="/dashboard/orchestrator" className="underline">
                Talk to your Orchestrator
              </Link>
              . Real usage is below.
            </p>
          ) : (
            <p className="mt-4 text-[14px] text-text-faint">
              No business yet.{" "}
              <Link href="/onboarding" className="underline">
                Complete onboarding
              </Link>{" "}
              to generate real activity.
            </p>
          )}
        </Card>

        {/* Spend */}
        <Card className="p-7">
          <div className="flex items-center gap-2">
            <DollarSign className="h-4 w-4 text-text-faint" />
            <SectionLabel>Spend so far</SectionLabel>
          </div>
          {!agent.live ? (
            <p className="mt-4 text-[14px] text-text-faint">
              $0.00 — this agent makes no API calls yet, so nothing has been spent.
            </p>
          ) : NO_AI_AGENTS.has(id) ? (
            <p className="mt-4 text-[14px] text-text-dim">
              $0.00 — and always will be. This agent is plain code, not a Claude API call, so it
              costs nothing to run no matter how many orders come in.
            </p>
          ) : usage && usage.totalCalls > 0 ? (
            <div className="mt-4 grid grid-cols-2 gap-5 sm:grid-cols-4">
              <div>
                <div className="text-[12.5px] text-text-faint">Total spent</div>
                <div className="mt-1 text-[18px] font-semibold">
                  ${usage.totalCostUsd.toFixed(4)}
                </div>
              </div>
              <div>
                <div className="text-[12.5px] text-text-faint">Runs</div>
                <div className="mt-1 text-[18px] font-semibold">{usage.totalCalls}</div>
              </div>
              <div>
                <div className="text-[12.5px] text-text-faint">Input tokens</div>
                <div className="mt-1 text-[18px] font-semibold">
                  {usage.totalInputTokens.toLocaleString()}
                </div>
              </div>
              <div>
                <div className="text-[12.5px] text-text-faint">Output tokens</div>
                <div className="mt-1 text-[18px] font-semibold">
                  {usage.totalOutputTokens.toLocaleString()}
                </div>
              </div>
              {usage.lastRunAt && (
                <div className="col-span-2 sm:col-span-4">
                  <span className="text-[12.5px] text-text-faint">
                    Last ran {usage.lastRunAt.toLocaleString()}
                  </span>
                </div>
              )}
            </div>
          ) : (
            <p className="mt-4 text-[14px] text-text-faint">
              $0.00 spent yet — this agent runs on your next competitor scan.
            </p>
          )}
          {agent.live && !NO_AI_AGENTS.has(id) && (
            <p className="mt-4 text-[11.5px] text-text-faint">
              Calculated from real token usage on every {agent.name} API call, priced at
              Anthropic&apos;s list rate for{" "}
              {AGENT_MODEL[id] === "claude-haiku-4-5"
                ? "claude-haiku-4-5 ($1 / $5 per million input / output tokens)"
                : "claude-sonnet-4-5 ($3 / $15 per million input / output tokens)"}
              .
            </p>
          )}
        </Card>

        {/* How it works */}
        <Card className="p-7">
          <SectionLabel>How this agent works</SectionLabel>
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <Pill tone={agent.live ? "good" : "neutral"}>
              {!agent.live ? "Not built yet" : NO_AI_AGENTS.has(id) ? "Live — real code, no AI" : "Live — real Claude API calls"}
            </Pill>
            {agent.live && !NO_AI_AGENTS.has(id) && (
              <Pill tone="neutral">Model: {AGENT_MODEL[id] ?? "claude-sonnet-4-5"}</Pill>
            )}
          </div>
        </Card>

        {/* The only agent setting still in use: COD auto-confirm (the old weekly-cycle settings are gone) */}
        {agent.live && id === "fraud" && <AgentSettingsForm agentId={id} initialSettings={settings} />}

        {/* External tools live in one shared pool now — this agent pulls in whatever fits its task at run time */}
        {agent.live && !NO_AI_AGENTS.has(id) && real && (
          <Card className="p-7">
            <SectionLabel>Tools &amp; skills</SectionLabel>
            <p className="mt-3 text-[14px] leading-relaxed text-text-dim">
              {agent.name} doesn&apos;t have its own tool list. Every agent shares one pool of
              connected MCP tools and skills, and when this agent runs it pulls in only the ones
              that fit the task in front of it, then drops them.
            </p>
            <Link
              href="/dashboard/settings/connections"
              className="mt-4 inline-flex items-center gap-1.5 text-[13.5px] font-medium text-accent-strong hover:underline"
            >
              Manage connections &amp; skills
            </Link>
          </Card>
        )}
      </div>
    </div>
  );
}
