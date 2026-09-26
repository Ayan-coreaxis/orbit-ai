import Link from "next/link";
import { Compass, ArrowRight, Check, Minus } from "lucide-react";
import { pricingTiers } from "@/lib/mock-data";
import { cn } from "@/lib/utils";
import { Reveal, RevealGroup } from "@/components/Reveal";
import { Faq } from "@/components/Faq";

const matrix: { label: string; values: [string, string, string] }[] = [
  { label: "Every agent included", values: ["✓", "✓", "✓"] },
  { label: "Growth plan from the Strategy Orchestrator", values: ["✓", "✓", "✓"] },
  { label: "Real competitor intelligence", values: ["✓", "✓", "✓"] },
  { label: "AI builds and runs ads for you", values: ["—", "✓", "✓"] },
  { label: "AI builds and sends deliverables directly", values: ["—", "✓", "✓"] },
  { label: "Usage limit", values: ["Standard", "Higher", "Highest"] },
  { label: "Support", values: ["Standard", "Priority", "Priority"] },
];

export default function PricingPage() {
  return (
    <div className="min-h-screen bg-[#0a0a0c] text-zinc-100">
      <header className="mx-auto flex max-w-7xl items-center justify-between px-8 py-6">
        <Link href="/" className="flex items-center gap-2.5">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-violet-500 via-fuchsia-500 to-orange-400">
            <Compass className="h-5 w-5 text-white" strokeWidth={2.5} />
          </div>
          <span className="text-[17px] font-semibold tracking-tight">
            orbit<span className="bg-gradient-to-r from-violet-400 via-fuchsia-400 to-orange-400 bg-clip-text text-transparent">.ai</span>
          </span>
        </Link>
        <nav className="hidden items-center gap-9 text-[14.5px] text-zinc-400 md:flex">
          <Link href="/#how" className="hover:text-white">How it works</Link>
          <Link href="/#agents" className="hover:text-white">Your AI team</Link>
          <span className="text-white">Pricing</span>
        </nav>
        <Link
          href="/onboarding"
          className="inline-flex items-center gap-2 rounded-xl border border-zinc-700 bg-zinc-900 px-4 py-2 text-[14px] font-medium hover:border-zinc-500"
        >
          Get started <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      </header>

      <Reveal className="mx-auto max-w-2xl px-8 pb-14 pt-14 text-center">
        <p className="text-[13.5px] font-semibold uppercase tracking-wide text-fuchsia-400">Pricing</p>
        <h1 className="mt-2 text-4xl font-semibold tracking-tight md:text-5xl">
          Simple pricing, every agent included
        </h1>
        <p className="mx-auto mt-4 max-w-md text-[16px] text-zinc-400">
          No per-agent add-ons. Pick a limit that fits your store, and top up with credits whenever you need more.
        </p>
      </Reveal>

      <section className="mx-auto max-w-7xl px-8 pb-24">
        <RevealGroup className="grid grid-cols-1 gap-6 md:grid-cols-3">
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
              <Link
                href="/onboarding"
                className={cn(
                  "mt-6 inline-flex items-center justify-center rounded-xl px-4 py-3 text-[14.5px] font-medium",
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
      </section>

      {/* Comparison matrix */}
      <section className="border-t border-zinc-900">
        <div className="mx-auto max-w-5xl px-8 py-24">
          <Reveal className="text-center">
            <h2 className="text-3xl font-semibold tracking-tight">Compare every plan</h2>
          </Reveal>
          <Reveal delay={0.1} className="mt-10 overflow-x-auto rounded-2xl border border-zinc-800">
            <table className="w-full min-w-[600px] text-[14px]">
              <thead>
                <tr className="border-b border-zinc-800 bg-zinc-900/60">
                  <th className="px-6 py-4 text-left font-medium text-zinc-400">Feature</th>
                  {pricingTiers.map((t) => (
                    <th key={t.name} className="px-6 py-4 text-left font-medium text-zinc-200">
                      {t.name}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {matrix.map((row) => (
                  <tr key={row.label} className="border-b border-zinc-800 last:border-0">
                    <td className="px-6 py-4 text-zinc-400">{row.label}</td>
                    {row.values.map((v, i) => (
                      <td key={i} className="px-6 py-4">
                        {v === "✓" ? (
                          <Check className="h-4 w-4 text-emerald-400" />
                        ) : v === "—" ? (
                          <Minus className="h-4 w-4 text-zinc-700" />
                        ) : (
                          <span className="text-zinc-200">{v}</span>
                        )}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </Reveal>
        </div>
      </section>

      {/* FAQ */}
      <section className="border-t border-zinc-900 bg-zinc-950/40">
        <div className="mx-auto max-w-3xl px-8 py-24">
          <Reveal className="text-center">
            <h2 className="text-3xl font-semibold tracking-tight">Questions about pricing</h2>
          </Reveal>
          <Reveal delay={0.1} className="mt-12">
            <Faq />
          </Reveal>
        </div>
      </section>

      <footer className="border-t border-zinc-900">
        <div className="mx-auto max-w-7xl px-8 py-10 text-center text-[13.5px] text-zinc-600">
          orbit.ai — one plan, every part of your store, working together.
          <div className="mt-3 flex justify-center gap-6">
            <Link href="/privacy" className="hover:text-zinc-300">Privacy</Link>
            <Link href="/terms" className="hover:text-zinc-300">Terms</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
