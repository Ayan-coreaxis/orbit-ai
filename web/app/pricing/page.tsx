import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Check, Minus } from "lucide-react";
import { planMatrix, pricingTiers } from "@/lib/mock-data";
import { cn } from "@/lib/utils";
import { Reveal, RevealGroup } from "@/components/Reveal";
import { Faq } from "@/components/Faq";
import { SiteHeader } from "@/components/marketing/SiteHeader";
import { SiteFooter } from "@/components/marketing/SiteFooter";

export const metadata: Metadata = {
  title: "Pricing",
  description: "Starter $50, Growth $75, Scale $150 a month — your AI store team, one monthly price.",
};

export default function PricingPage() {
  return (
    <div className="min-h-screen overflow-x-clip bg-[#09090b] text-zinc-100">
      <SiteHeader />
      <div className="pointer-events-none absolute left-1/2 top-0 h-[520px] w-[1000px] -translate-x-1/2 rounded-full bg-[radial-gradient(closest-side,rgba(168,85,247,0.18),transparent)]" />

      <Reveal className="relative mx-auto max-w-2xl px-5 pb-14 pt-14 text-center sm:px-8">
        <p className="text-[13px] font-semibold uppercase tracking-[0.14em] text-fuchsia-400">Pricing</p>
        <h1 className="mt-3 text-balance text-4xl font-semibold tracking-tight md:text-5xl">One price for your whole AI team</h1>
        <p className="mx-auto mt-4 max-w-lg text-[16px] text-zinc-400">
          No per-agent add-ons. Change or cancel any time from Settings. Ad spend goes straight from your own Meta ad account — Orbit never holds it.
        </p>
      </Reveal>

      <section className="relative mx-auto max-w-7xl px-5 pb-20 sm:px-8">
        <RevealGroup className="grid gap-5 md:grid-cols-3">
          {pricingTiers.map((tier) => (
            <div
              key={tier.name}
              className={cn(
                "hover-lift relative flex flex-col rounded-2xl border p-7",
                tier.featured
                  ? "border-transparent [background:linear-gradient(#141417,#141417)_padding-box,linear-gradient(135deg,#a855f7,#ec4899,#f97316)_border-box] border-2 shadow-[0_20px_60px_-20px_rgba(217,70,239,0.45)]"
                  : "border-white/[0.07] bg-zinc-900/40",
              )}
            >
              {tier.featured && (
                <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-gradient-to-r from-violet-500 via-fuchsia-500 to-orange-500 px-3 py-1 text-[11.5px] font-semibold text-white">
                  Most popular
                </span>
              )}
              <div className="text-[15px] font-semibold">{tier.name}</div>
              <div className="mt-3 flex items-baseline gap-1">
                <span className="text-4xl font-semibold tracking-tight">${tier.price}</span>
                <span className="text-[14px] text-zinc-500">/month</span>
              </div>
              <p className="mt-3 text-[14px] leading-relaxed text-zinc-400">{tier.desc}</p>
              <ul className="mt-6 flex-1 space-y-2.5">
                {tier.features.map((f) => (
                  <li key={f} className="flex items-start gap-2.5 text-[14px] text-zinc-300">
                    <Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" /> {f}
                  </li>
                ))}
              </ul>
              <Link
                href="/signup"
                className={cn(
                  "press mt-8 rounded-xl px-4 py-3 text-center text-[14.5px] font-semibold transition-colors",
                  tier.featured ? "bg-white text-zinc-950 hover:bg-zinc-200" : "border border-white/10 hover:border-white/25",
                )}
              >
                Get started
              </Link>
            </div>
          ))}
        </RevealGroup>
      </section>

      <section className="mx-auto max-w-5xl px-5 pb-24 sm:px-8">
        <Reveal>
          <h2 className="text-center text-2xl font-semibold tracking-tight">Compare plans</h2>
          <div className="mt-8 overflow-x-auto rounded-2xl border border-white/[0.07]">
            <table className="w-full min-w-[560px] text-left text-[14px]">
              <thead>
                <tr className="border-b border-white/[0.07] bg-white/[0.02]">
                  <th className="px-5 py-4 font-medium text-zinc-400">Feature</th>
                  {pricingTiers.map((t) => (
                    <th key={t.name} className="px-5 py-4 text-center font-semibold">
                      {t.name}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {planMatrix.map((row) => (
                  <tr key={row.label} className="border-b border-white/[0.05] last:border-0 hover:bg-white/[0.015]">
                    <td className="px-5 py-3.5 text-zinc-300">{row.label}</td>
                    {row.values.map((v, i) => (
                      <td key={i} className="px-5 py-3.5 text-center">
                        {v === "✓" ? <Check className="mx-auto h-4 w-4 text-emerald-400" /> : v === "—" ? <Minus className="mx-auto h-4 w-4 text-zinc-700" /> : <span className="text-zinc-300">{v}</span>}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Reveal>
      </section>

      <section className="border-t border-white/5">
        <div className="mx-auto max-w-3xl px-5 py-24 sm:px-8">
          <Reveal className="text-center">
            <h2 className="text-3xl font-semibold tracking-tight">Questions</h2>
          </Reveal>
          <Reveal className="mt-10">
            <Faq />
          </Reveal>
          <div className="mt-12 text-center">
            <Link href="/signup" className="press group inline-flex items-center gap-2 rounded-xl bg-white px-6 py-3.5 text-[15px] font-semibold text-zinc-950 hover:bg-zinc-200">
              Get started <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
            </Link>
          </div>
        </div>
      </section>
      <SiteFooter />
    </div>
  );
}
