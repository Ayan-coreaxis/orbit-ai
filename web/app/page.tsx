import Link from "next/link";
import {
  Compass,
  ArrowRight,
  Radar,
  PenSquare,
  MessageSquare,
  TrendingUp,
  ShieldCheck,
  Check,
  X,
  Package,
} from "lucide-react";
import { pricingTiers, agents } from "@/lib/mock-data";
import { cn } from "@/lib/utils";
import { Reveal, RevealGroup } from "@/components/Reveal";
import { HeroReveal } from "@/components/HeroReveal";
import { Faq } from "@/components/Faq";

const comparisons = [
  { bad: "18 separate tools that don't know what the others are doing", good: "One Orchestrator, every agent working off the same plan" },
  { bad: "You write the strategy yourself, every week", good: "Competitor analysis becomes a real growth plan, automatically" },
  { bad: "Content, ads, and support all say something different", good: "Every agent is checked against the same plan before it goes live" },
  { bad: "You stitch Shopify + Klaviyo + Gorgias + more together", good: "One store, one price, one team that already talks to itself" },
];

const agentPreview = [
  { icon: Radar, name: "Watches your competitors", desc: "So you always know what they're doing better — or worse" },
  { icon: PenSquare, name: "Writes your content", desc: "Posts, captions, and ads that match what's actually working" },
  { icon: MessageSquare, name: "Answers your customers", desc: "On WhatsApp, Instagram, and your website, day or night" },
  { icon: TrendingUp, name: "Spends your ad budget", desc: "On whatever's already converting, not guesswork" },
  { icon: ShieldCheck, name: "Double-checks everything", desc: "Nothing goes live until it's been reviewed" },
  { icon: Package, name: "Watches your stock", desc: "Pauses ads before you oversell, not after" },
];

export default function Home() {
  return (
    <div className="min-h-screen bg-[#0a0a0c] text-zinc-100">
      <header className="mx-auto flex max-w-7xl items-center justify-between px-8 py-6">
        <div className="flex items-center gap-2.5">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-violet-500 via-fuchsia-500 to-orange-400">
            <Compass className="h-5 w-5 text-white" strokeWidth={2.5} />
          </div>
          <span className="text-[17px] font-semibold tracking-tight">
            orbit<span className="bg-gradient-to-r from-violet-400 via-fuchsia-400 to-orange-400 bg-clip-text text-transparent">.ai</span>
          </span>
        </div>
        <nav className="hidden items-center gap-9 text-[14.5px] text-zinc-400 md:flex">
          <a href="#how" className="hover:text-white">How it works</a>
          <a href="#agents" className="hover:text-white">Your AI team</a>
          <Link href="/pricing" className="hover:text-white">Pricing</Link>
          <a href="#faq" className="hover:text-white">FAQ</a>
        </nav>
        <div className="flex items-center gap-3">
          <Link href="/login" className="hidden text-[14px] text-zinc-400 hover:text-white sm:block">
            Log in
          </Link>
          <Link
            href="/onboarding"
            className="inline-flex items-center gap-2 rounded-xl border border-zinc-700 bg-zinc-900 px-4 py-2 text-[14px] font-medium hover:border-zinc-500"
          >
            Get started <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </div>
      </header>

      {/* Hero */}
      <section className="relative overflow-hidden">
        <div
          className="pointer-events-none absolute inset-x-0 top-0 h-[600px] opacity-40"
          style={{
            background:
              "radial-gradient(600px circle at 50% 0%, rgba(168,85,247,0.25), transparent 60%)",
          }}
        />
        <HeroReveal>
          <div className="relative mx-auto max-w-5xl px-8 pb-20 pt-20 text-center">
            <Link
              href="#agents"
              data-hero-item
              className="mx-auto mb-7 inline-flex items-center gap-2 rounded-full border border-zinc-800 bg-zinc-900/80 px-4 py-1.5 text-[13px] text-zinc-400"
            >
              <span className="rounded-full bg-zinc-800 px-2 py-0.5 text-[11px] font-medium text-zinc-200">New</span>
              Free growth report — no card needed
              <ArrowRight className="h-3 w-3" />
            </Link>

            <h1 data-hero-item className="mx-auto max-w-3xl text-balance text-5xl font-semibold leading-[1.08] tracking-tight md:text-6xl">
              An AI team that runs
              <br />
              your store —{" "}
              <span className="bg-gradient-to-r from-violet-400 via-fuchsia-400 to-amber-400 bg-clip-text text-transparent">
                not 18 tools
              </span>{" "}
              that ignore each other.
            </h1>
            <p data-hero-item className="mx-auto mt-6 max-w-xl text-balance text-[17px] leading-relaxed text-zinc-400">
              Give us your business and your competitors. Get a real store, a
              real strategy, and a coordinated team of AI agents that execute
              it together — content, SEO, ads, support, all from one plan.
            </p>
            <div data-hero-item className="mt-9 flex flex-wrap items-center justify-center gap-3">
              <Link
                href="/onboarding"
                className="group inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-violet-500 via-fuchsia-500 to-orange-500 px-6 py-3.5 text-[15px] font-semibold text-white shadow-[0_0_30px_rgba(217,70,239,0.25)] transition-transform hover:scale-[1.02]"
              >
                Get my free growth report
                <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
              </Link>
              <Link
                href="/dashboard"
                className="inline-flex items-center gap-2 rounded-xl border border-zinc-700 bg-zinc-900 px-6 py-3.5 text-[15px] font-medium text-zinc-200 hover:border-zinc-500"
              >
                See it in action
              </Link>
            </div>

            {/* Product preview (illustrative example, not live data) */}
            <div data-hero-item className="relative mx-auto mt-16 max-w-4xl">
              <div className="rounded-2xl border border-zinc-800 bg-zinc-950/80 p-2 shadow-2xl backdrop-blur">
                <div className="rounded-xl border border-zinc-800 bg-[#0e0e11] p-6 text-left">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-[11px] uppercase tracking-wide text-zinc-500">
                        Example — this week, focused on
                      </div>
                      <div className="mt-1 text-lg font-semibold text-white">
                        Your top product
                      </div>
                    </div>
                    <span className="rounded-full bg-fuchsia-500/10 px-3 py-1 text-[11px] font-medium text-fuchsia-300">
                      Decided by your AI
                    </span>
                  </div>
                  <div className="mt-5 grid grid-cols-3 gap-3">
                    {agents.slice(0, 3).map((a) => (
                      <div key={a.id} className="rounded-lg border border-zinc-800 bg-zinc-900/60 p-3">
                        <div className="flex items-center gap-1.5">
                          <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                          <span className="text-[12.5px] font-medium text-zinc-200">{a.name}</span>
                        </div>
                        <div className="mt-1.5 truncate text-[11.5px] text-zinc-500">{a.description}</div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </HeroReveal>
      </section>

      {/* Comparison */}
      <section id="how" className="border-b border-zinc-900">
        <div className="mx-auto max-w-5xl px-8 py-24">
          <Reveal className="text-center">
            <p className="text-[13.5px] font-semibold uppercase tracking-wide text-fuchsia-400">
              Why this is different
            </p>
            <h2 className="mt-2 text-3xl font-semibold tracking-tight">
              What most &quot;AI for ecommerce&quot; tools get wrong
            </h2>
          </Reveal>
          <RevealGroup className="mt-12 grid grid-cols-1 gap-4">
            {comparisons.map((c) => (
              <div key={c.bad} className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="flex items-start gap-3 rounded-xl border border-zinc-800 bg-zinc-900/40 p-4">
                  <X className="mt-0.5 h-4 w-4 shrink-0 text-red-400" />
                  <span className="text-[14px] text-zinc-400">{c.bad}</span>
                </div>
                <div className="flex items-start gap-3 rounded-xl border border-emerald-900/40 bg-emerald-500/[0.04] p-4">
                  <Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" />
                  <span className="text-[14px] font-medium text-zinc-100">{c.good}</span>
                </div>
              </div>
            ))}
          </RevealGroup>
        </div>
      </section>

      {/* Agents */}
      <section id="agents" className="border-b border-zinc-900">
        <div className="mx-auto max-w-7xl px-8 py-24">
          <Reveal>
            <p className="text-[13.5px] font-semibold uppercase tracking-wide text-fuchsia-400">
              Meet your team
            </p>
            <h2 className="mt-2 text-3xl font-semibold tracking-tight">
              19 AI teammates, all working from the same plan
            </h2>
          </Reveal>
          <RevealGroup className="mt-12 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {agentPreview.map((a) => (
              <div
                key={a.name}
                className="group rounded-2xl border border-zinc-800 bg-zinc-900/40 p-6 transition-colors hover:border-zinc-700"
              >
                <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br from-violet-500/20 via-fuchsia-500/20 to-orange-500/20">
                  <a.icon className="h-5 w-5 text-fuchsia-300" strokeWidth={2} />
                </div>
                <div className="mt-4 text-[15.5px] font-semibold text-white">{a.name}</div>
                <div className="mt-1.5 text-[14px] leading-relaxed text-zinc-400">{a.desc}</div>
              </div>
            ))}
          </RevealGroup>
          <Link
            href="/dashboard"
            className="mt-8 flex items-center justify-center gap-1.5 text-[14px] text-zinc-400 hover:text-white"
          >
            See all 19 agents in the live dashboard <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </div>
      </section>

      {/* Pricing */}
      <section id="pricing" className="border-b border-zinc-900">
        <div className="mx-auto max-w-7xl px-8 py-24">
          <Reveal className="text-center">
            <p className="text-[13.5px] font-semibold uppercase tracking-wide text-fuchsia-400">
              Pricing
            </p>
            <h2 className="mt-2 text-3xl font-semibold tracking-tight">
              One flat price. No surprises.
            </h2>
            <p className="mx-auto mt-3 max-w-md text-[15px] text-zinc-400">
              Every plan has a limit built in. If you go over, top up with credits — we never force an upgrade mid-month.
            </p>
          </Reveal>
          <RevealGroup className="mt-12 grid grid-cols-1 gap-6 md:grid-cols-3">
            {pricingTiers.map((tier) => (
              <div
                key={tier.name}
                className={cn(
                  "relative flex flex-col rounded-2xl border p-7",
                  tier.featured
                    ? "border-transparent bg-zinc-900 [background:linear-gradient(#18181b,#18181b)_padding-box,linear-gradient(135deg,#a855f7,#ec4899,#f97316)_border-box] border-2"
                    : "border-zinc-800 bg-zinc-900/40",
                )}
              >
                <div className="text-[13px] font-semibold uppercase tracking-wide text-zinc-400">
                  {tier.name}{" "}
                  {tier.featured && (
                    <span className="bg-gradient-to-r from-violet-400 to-orange-400 bg-clip-text text-transparent">
                      · most popular
                    </span>
                  )}
                </div>
                <div className="mt-3 text-4xl font-semibold text-white">
                  ${tier.price}
                  <span className="text-[15px] font-normal text-zinc-500">/mo</span>
                </div>
                <p className="mt-2.5 text-[13.5px] text-zinc-500">{tier.desc}</p>
                <ul className="mt-6 flex-1 space-y-3">
                  {tier.features.map((f) => (
                    <li key={f} className="flex items-start gap-2.5 text-[13.5px] text-zinc-400">
                      <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-fuchsia-400" />
                      {f}
                    </li>
                  ))}
                </ul>
                <Link
                  href="/onboarding"
                  className={cn(
                    "mt-7 inline-flex items-center justify-center rounded-xl px-4 py-3 text-[14.5px] font-medium",
                    tier.featured
                      ? "bg-gradient-to-r from-violet-500 via-fuchsia-500 to-orange-500 text-white shadow-[0_0_20px_rgba(217,70,239,0.2)]"
                      : "border border-zinc-700 bg-zinc-900 text-zinc-200 hover:border-zinc-500",
                  )}
                >
                  Start with {tier.name}
                </Link>
              </div>
            ))}
          </RevealGroup>
          <Reveal className="mt-6 text-center">
            <Link href="/pricing" className="text-[14px] text-zinc-400 hover:text-white">
              See the full plan comparison <ArrowRight className="ml-1 inline h-3.5 w-3.5" />
            </Link>
          </Reveal>
        </div>
      </section>

      {/* FAQ */}
      <section id="faq" className="border-b border-zinc-900 bg-zinc-950/40">
        <div className="mx-auto max-w-3xl px-8 py-24">
          <Reveal className="text-center">
            <p className="text-[13.5px] font-semibold uppercase tracking-wide text-fuchsia-400">
              Questions
            </p>
            <h2 className="mt-2 text-3xl font-semibold tracking-tight">
              Before you get started
            </h2>
          </Reveal>
          <Reveal delay={0.1} className="mt-12">
            <Faq />
          </Reveal>
        </div>
      </section>

      {/* Final CTA */}
      <section className="relative overflow-hidden">
        <div
          className="pointer-events-none absolute inset-x-0 bottom-0 h-[400px] opacity-30"
          style={{
            background:
              "radial-gradient(600px circle at 50% 100%, rgba(249,115,22,0.2), transparent 60%)",
          }}
        />
        <Reveal className="relative mx-auto max-w-2xl px-8 py-28 text-center">
          <h2 className="text-3xl font-semibold tracking-tight md:text-4xl">
            Your first growth report is free
          </h2>
          <p className="mx-auto mt-4 max-w-md text-[15px] text-zinc-400">
            Takes about 3 minutes. No credit card, no commitment — just a real look at where you stand against your competitors.
          </p>
          <Link
            href="/onboarding"
            className="mt-8 inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-violet-500 via-fuchsia-500 to-orange-500 px-7 py-3.5 text-[15px] font-semibold text-white shadow-[0_0_30px_rgba(217,70,239,0.25)] transition-transform hover:scale-[1.02]"
          >
            Get my free growth report
            <ArrowRight className="h-4 w-4" />
          </Link>
        </Reveal>
      </section>

      <footer className="border-t border-zinc-900">
        <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-4 px-8 py-10 text-[13.5px] text-zinc-600 sm:flex-row">
          <span>orbit.ai — one plan, every part of your store, working together.</span>
          <div className="flex items-center gap-6">
            <Link href="/pricing" className="hover:text-zinc-300">Pricing</Link>
            <Link href="/login" className="hover:text-zinc-300">Log in</Link>
            <Link href="/dashboard" className="hover:text-zinc-300">Dashboard</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
