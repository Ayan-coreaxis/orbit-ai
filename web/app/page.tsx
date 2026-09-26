import Link from "next/link";
import {
  ArrowRight,
  Check,
  Clapperboard,
  Globe,
  LineChart,
  Megaphone,
  MessageCircle,
  PackageCheck,
  ShieldCheck,
  Sparkles,
  Store,
  Truck,
  Hand,
  Wand2,
} from "lucide-react";
import { pricingTiers } from "@/lib/mock-data";
import { cn } from "@/lib/utils";
import { Reveal, RevealGroup } from "@/components/Reveal";
import { HeroReveal } from "@/components/HeroReveal";
import { Faq } from "@/components/Faq";
import { SiteHeader } from "@/components/marketing/SiteHeader";
import { SiteFooter } from "@/components/marketing/SiteFooter";
import { HeroDemo } from "@/components/marketing/HeroDemo";
import { FacebookIcon, InstagramIcon, StripeIcon, WhatsAppIcon } from "@/components/icons/BrandIcons";

const STEPS = [
  {
    n: "01",
    title: "Tell Orbit about your business",
    body: "Share your website (or just what you sell). Orbit reads it, imports your products, and asks a few questions only you can answer.",
  },
  {
    n: "02",
    title: "Plan it together",
    body: "Your Orchestrator drafts a growth plan from your real numbers. Discuss it in Roman Urdu or English, change anything, then approve it.",
  },
  {
    n: "03",
    title: "Your AI team does the work",
    body: "Store edits, photos, reels, posts, ads and customer replies — each change waits for your Apply. Ads start paused until you say go.",
  },
];

const FEATURES = [
  {
    icon: Sparkles,
    title: "One Orchestrator, one plan",
    body: "A senior growth expert that knows your products, orders and customers — and coordinates every agent around the same goal: more real orders.",
    span: "md:col-span-2",
  },
  { icon: Store, title: "Store that builds itself", body: "Describe the look you want; Orbit Design builds and edits your storefront live. Your own domain, https included." },
  { icon: Clapperboard, title: "Orbit Studio", body: "Product photos, reels, UGC, try-on and ad creatives made from your real product photos. Growth & Scale." },
  { icon: MessageCircle, title: "Replies everywhere", body: "WhatsApp, Messenger and Instagram DMs answered from your real catalog — order updates and COD confirmations included." },
  { icon: Megaphone, title: "Posts & Meta ads", body: "Posts to Facebook and Instagram, builds complete Meta ads optimised for sales with your Pixel. Always paused until you activate." },
  { icon: Truck, title: "COD & couriers", body: "WhatsApp order confirmation, fraud flags, PostEx / Leopards / TCS booking and automatic delivery tracking." },
  {
    icon: LineChart,
    title: "Only real numbers",
    body: "Revenue, margin, conversion and ad results computed from your own data. If Orbit can't verify something, it tells you instead of guessing.",
    span: "md:col-span-2",
  },
];

const CONTROL = [
  { icon: Hand, title: "Nothing changes without your Apply", body: "Prices, products, store design, posts and ads are proposals first." },
  { icon: ShieldCheck, title: "Ads never spend on their own", body: "Every ad is built paused. Pause stops spend instantly." },
  { icon: PackageCheck, title: "Your store keeps selling", body: "Even if the AI hits its monthly limit, checkout and orders keep working." },
];

export default function Home() {
  return (
    <div className="min-h-screen overflow-x-clip bg-[#09090b] text-zinc-100">
      <SiteHeader />

      {/* ---------- Hero ---------- */}
      <section className="relative">
        <div className="pointer-events-none absolute inset-0 -top-24 overflow-hidden">
          <div className="absolute left-1/2 top-0 h-[720px] w-[1100px] -translate-x-1/2 rounded-full bg-[radial-gradient(closest-side,rgba(168,85,247,0.22),transparent)]" />
          <div className="absolute right-[-10%] top-[30%] h-[420px] w-[420px] rounded-full bg-[radial-gradient(closest-side,rgba(251,146,60,0.12),transparent)]" />
          <div className="absolute inset-0 bg-[linear-gradient(to_right,rgba(255,255,255,0.03)_1px,transparent_1px),linear-gradient(to_bottom,rgba(255,255,255,0.03)_1px,transparent_1px)] bg-[size:56px_56px] [mask-image:radial-gradient(ellipse_at_top,black_30%,transparent_70%)]" />
        </div>
        <HeroReveal>
          <div className="relative mx-auto grid max-w-7xl items-center gap-14 px-5 pb-20 pt-10 sm:px-8 lg:grid-cols-[1.05fr_1fr] lg:pb-28 lg:pt-16">
            <div className="text-center lg:text-left">
              <div data-hero-item className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-3.5 py-1.5 text-[12.5px] text-zinc-300">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse-dot" />
                Built for COD-first online stores
              </div>
              <h1 data-hero-item className="mt-6 text-balance text-[42px] font-semibold leading-[1.04] tracking-tight sm:text-6xl lg:text-[68px]">
                The AI team that{" "}
                <span className="bg-gradient-to-r from-violet-400 via-fuchsia-400 to-amber-300 bg-clip-text text-transparent">runs your store.</span>
              </h1>
              <p data-hero-item className="mx-auto mt-6 max-w-xl text-balance text-[17px] leading-relaxed text-zinc-400 lg:mx-0">
                Store, product photos, reels, posts, Meta ads and customer chats — planned by one AI Orchestrator on your real numbers, and done by its team. You
                just press Apply.
              </p>
              <div data-hero-item className="mt-9 flex flex-wrap items-center justify-center gap-3 lg:justify-start">
                <Link
                  href="/signup"
                  className="press group inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-violet-500 via-fuchsia-500 to-orange-500 px-6 py-3.5 text-[15px] font-semibold text-white shadow-[0_10px_40px_-10px_rgba(217,70,239,0.6)] transition-transform hover:scale-[1.02]"
                >
                  Get started
                  <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
                </Link>
                <Link href="#how" className="press inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.03] px-6 py-3.5 text-[15px] font-medium text-zinc-200 transition-colors hover:border-white/25">
                  See how it works
                </Link>
              </div>
              <div data-hero-item className="mt-8 flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-[12.5px] text-zinc-500 lg:justify-start">
                {["Set up in minutes", "Roman Urdu or English", "Your own domain"].map((t) => (
                  <span key={t} className="inline-flex items-center gap-1.5">
                    <Check className="h-3.5 w-3.5 text-emerald-400" /> {t}
                  </span>
                ))}
              </div>
            </div>
            <div data-hero-item>
              <HeroDemo />
            </div>
          </div>
        </HeroReveal>
      </section>

      {/* ---------- Works with ---------- */}
      <section className="border-y border-white/5 bg-white/[0.015]">
        <div className="mx-auto flex max-w-7xl flex-col items-center gap-5 px-5 py-8 sm:flex-row sm:justify-between sm:px-8">
          <span className="text-[12.5px] font-medium uppercase tracking-[0.12em] text-zinc-500">Works with what you already use</span>
          <div className="flex flex-wrap items-center justify-center gap-x-8 gap-y-4 text-[14px] font-medium text-zinc-400">
            <span className="flex items-center gap-2"><WhatsAppIcon size={18} /> WhatsApp</span>
            <span className="flex items-center gap-2"><InstagramIcon size={18} /> Instagram</span>
            <span className="flex items-center gap-2"><FacebookIcon size={18} /> Facebook &amp; Meta Ads</span>
            <span className="flex items-center gap-2"><StripeIcon size={18} /> Stripe</span>
            <span className="flex items-center gap-2"><Truck className="h-[18px] w-[18px] text-zinc-400" /> PostEx · Leopards · TCS</span>
          </div>
        </div>
      </section>

      {/* ---------- How it works ---------- */}
      <section id="how" className="scroll-mt-20">
        <div className="mx-auto max-w-7xl px-5 py-24 sm:px-8">
          <Reveal className="mx-auto max-w-2xl text-center">
            <p className="text-[13px] font-semibold uppercase tracking-[0.14em] text-fuchsia-400">How it works</p>
            <h2 className="mt-3 text-balance text-3xl font-semibold tracking-tight sm:text-4xl">From &quot;what do I do next?&quot; to done — in three steps</h2>
          </Reveal>
          <RevealGroup className="relative mt-14 grid gap-5 md:grid-cols-3">
            {STEPS.map((s) => (
              <div key={s.n} className="hover-lift relative rounded-2xl border border-white/[0.07] bg-gradient-to-b from-white/[0.04] to-transparent p-7">
                <div className="font-mono text-[13px] text-fuchsia-400">{s.n}</div>
                <h3 className="mt-3 text-[18px] font-semibold text-white">{s.title}</h3>
                <p className="mt-2 text-[14.5px] leading-relaxed text-zinc-400">{s.body}</p>
              </div>
            ))}
          </RevealGroup>
        </div>
      </section>

      {/* ---------- Features ---------- */}
      <section id="features" className="scroll-mt-20 border-t border-white/5">
        <div className="mx-auto max-w-7xl px-5 py-24 sm:px-8">
          <Reveal className="mx-auto max-w-2xl text-center">
            <p className="text-[13px] font-semibold uppercase tracking-[0.14em] text-fuchsia-400">Everything in one place</p>
            <h2 className="mt-3 text-balance text-3xl font-semibold tracking-tight sm:text-4xl">Not 18 tools that ignore each other. One team.</h2>
            <p className="mt-4 text-[16px] text-zinc-400">Every part of your store works from the same plan and the same data.</p>
          </Reveal>
          <RevealGroup className="mt-14 grid gap-4 md:grid-cols-3">
            {FEATURES.map((f) => (
              <div
                key={f.title}
                className={cn(
                  "hover-lift group relative overflow-hidden rounded-2xl border border-white/[0.07] bg-zinc-900/40 p-7",
                  f.span,
                )}
              >
                <div className="pointer-events-none absolute -right-16 -top-16 h-40 w-40 rounded-full bg-fuchsia-500/10 opacity-0 blur-2xl transition-opacity duration-500 group-hover:opacity-100" />
                <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br from-violet-500/20 via-fuchsia-500/15 to-orange-400/20 ring-1 ring-white/10">
                  <f.icon className="h-5 w-5 text-fuchsia-300" />
                </div>
                <h3 className="mt-5 text-[17px] font-semibold text-white">{f.title}</h3>
                <p className="mt-2 text-[14.5px] leading-relaxed text-zinc-400">{f.body}</p>
              </div>
            ))}
          </RevealGroup>
        </div>
      </section>

      {/* ---------- You stay in control ---------- */}
      <section className="border-t border-white/5">
        <div className="mx-auto grid max-w-7xl items-center gap-12 px-5 py-24 sm:px-8 lg:grid-cols-2">
          <Reveal>
            <p className="text-[13px] font-semibold uppercase tracking-[0.14em] text-fuchsia-400">You stay in control</p>
            <h2 className="mt-3 text-balance text-3xl font-semibold tracking-tight sm:text-4xl">An AI team that asks before it acts</h2>
            <p className="mt-4 max-w-lg text-[16px] leading-relaxed text-zinc-400">
              Orbit is honest by design: it never invents a number, never claims it did something it didn&apos;t, and never touches your live store or your money
              without your say.
            </p>
            <Link href="/signup" className="press group mt-8 inline-flex items-center gap-2 rounded-xl bg-white px-5 py-3 text-[14.5px] font-semibold text-zinc-950 hover:bg-zinc-200">
              Try it on your store <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
            </Link>
          </Reveal>
          <RevealGroup className="grid gap-3">
            {CONTROL.map((c) => (
              <div key={c.title} className="flex items-start gap-4 rounded-2xl border border-white/[0.07] bg-zinc-900/40 p-5">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-300">
                  <c.icon className="h-5 w-5" />
                </span>
                <div>
                  <div className="text-[15.5px] font-semibold text-white">{c.title}</div>
                  <div className="mt-1 text-[14px] text-zinc-400">{c.body}</div>
                </div>
              </div>
            ))}
          </RevealGroup>
        </div>
      </section>

      {/* ---------- Pricing ---------- */}
      <section id="pricing" className="scroll-mt-20 border-t border-white/5">
        <div className="mx-auto max-w-7xl px-5 py-24 sm:px-8">
          <Reveal className="mx-auto max-w-2xl text-center">
            <p className="text-[13px] font-semibold uppercase tracking-[0.14em] text-fuchsia-400">Pricing</p>
            <h2 className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">One monthly price. No per-agent add-ons.</h2>
            <p className="mt-4 text-[16px] text-zinc-400">Ad spend is billed by Meta directly to your own ad account — Orbit never holds your budget.</p>
          </Reveal>
          <RevealGroup className="mt-14 grid gap-5 md:grid-cols-3">
            {pricingTiers.map((t) => (
              <PriceCard key={t.name} tier={t} />
            ))}
          </RevealGroup>
          <div className="mt-8 text-center">
            <Link href="/pricing" className="inline-flex items-center gap-1.5 text-[14px] text-zinc-400 hover:text-white">
              Compare every feature <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>
        </div>
      </section>

      {/* ---------- FAQ ---------- */}
      <section id="faq" className="scroll-mt-20 border-t border-white/5">
        <div className="mx-auto max-w-3xl px-5 py-24 sm:px-8">
          <Reveal className="text-center">
            <p className="text-[13px] font-semibold uppercase tracking-[0.14em] text-fuchsia-400">FAQ</p>
            <h2 className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">Questions sellers ask us</h2>
          </Reveal>
          <Reveal className="mt-12">
            <Faq />
          </Reveal>
        </div>
      </section>

      {/* ---------- Final CTA ---------- */}
      <section className="relative overflow-hidden border-t border-white/5">
        <div className="pointer-events-none absolute left-1/2 top-1/2 h-[500px] w-[900px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[radial-gradient(closest-side,rgba(217,70,239,0.18),transparent)]" />
        <Reveal className="relative mx-auto max-w-3xl px-5 py-28 text-center sm:px-8">
          <Wand2 className="orbit-float mx-auto h-10 w-10 text-fuchsia-300" />
          <h2 className="mt-6 text-balance text-4xl font-semibold tracking-tight sm:text-5xl">Your store&apos;s AI team is ready when you are.</h2>
          <p className="mx-auto mt-5 max-w-lg text-[16px] text-zinc-400">Sign up, tell Orbit what you sell, and see your first growth plan the same day.</p>
          <div className="mt-9 flex flex-wrap justify-center gap-3">
            <Link
              href="/signup"
              className="press group inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-violet-500 via-fuchsia-500 to-orange-500 px-7 py-4 text-[15.5px] font-semibold text-white shadow-[0_10px_40px_-10px_rgba(217,70,239,0.6)] transition-transform hover:scale-[1.02]"
            >
              Get started <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
            </Link>
            <Link href="/pricing" className="press inline-flex items-center gap-2 rounded-xl border border-white/10 px-7 py-4 text-[15.5px] font-medium text-zinc-200 hover:border-white/25">
              <Globe className="h-4 w-4" /> See pricing
            </Link>
          </div>
        </Reveal>
      </section>

      <SiteFooter />
    </div>
  );
}

function PriceCard({ tier }: { tier: (typeof pricingTiers)[number] }) {
  return (
    <div
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
      <div className="text-[15px] font-semibold text-white">{tier.name}</div>
      <div className="mt-3 flex items-baseline gap-1">
        <span className="text-4xl font-semibold tracking-tight text-white">${tier.price}</span>
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
          tier.featured ? "bg-white text-zinc-950 hover:bg-zinc-200" : "border border-white/10 text-white hover:border-white/25",
        )}
      >
        Get started
      </Link>
    </div>
  );
}
