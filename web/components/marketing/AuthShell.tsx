import { Check, Sparkles } from "lucide-react";
import { Logo } from "@/components/marketing/Logo";

const POINTS = [
  "Your store, built and edited by AI — you approve every change",
  "Photos, reels, posts and Meta ads from your real products",
  "WhatsApp, Messenger & Instagram answered for you",
  "COD confirmation, couriers and delivery tracking built in",
];

/** Split-screen frame for login / signup / password pages: form on the left, story on the right. */
export function AuthShell({ title, subtitle, children, footer }: { title: string; subtitle?: string; children: React.ReactNode; footer?: React.ReactNode }) {
  return (
    <div className="grid min-h-dvh bg-[#09090b] text-zinc-100 lg:grid-cols-[1fr_1.05fr]">
      <div className="flex flex-col px-6 py-8 sm:px-12">
        <Logo />
        <div className="flex flex-1 items-center justify-center py-10">
          <div className="orbit-fade-up w-full max-w-sm">
            <h1 className="text-[26px] font-semibold tracking-tight text-white">{title}</h1>
            {subtitle && <p className="mt-2 text-[14.5px] leading-relaxed text-zinc-400">{subtitle}</p>}
            <div className="mt-8">{children}</div>
            {footer && <div className="mt-8 text-center text-[13.5px] text-zinc-500">{footer}</div>}
          </div>
        </div>
      </div>
      <aside className="relative hidden overflow-hidden border-l border-white/5 lg:block">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_20%,rgba(139,92,246,0.35),transparent_55%),radial-gradient(circle_at_80%_80%,rgba(249,115,22,0.22),transparent_50%),#0c0c10]" />
        <div className="absolute inset-0 bg-[linear-gradient(to_right,rgba(255,255,255,0.035)_1px,transparent_1px),linear-gradient(to_bottom,rgba(255,255,255,0.035)_1px,transparent_1px)] bg-[size:48px_48px] [mask-image:radial-gradient(ellipse_at_center,black_30%,transparent_75%)]" />
        <div className="orbit-spin-slow absolute -right-40 -top-40 h-[520px] w-[520px] rounded-full border border-white/5" />
        <div className="orbit-spin-slow absolute -right-24 -top-24 h-[360px] w-[360px] rounded-full border border-dashed border-white/[0.07]" style={{ animationDirection: "reverse" }} />
        <div className="relative flex h-full flex-col justify-center px-14">
          <div className="orbit-float inline-flex w-fit items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-[12.5px] text-zinc-300 backdrop-blur">
            <Sparkles className="h-3.5 w-3.5 text-fuchsia-300" /> Your AI store team
          </div>
          <h2 className="mt-6 max-w-md text-balance text-4xl font-semibold leading-tight tracking-tight">
            Sell more, juggle less. <span className="bg-gradient-to-r from-violet-300 via-fuchsia-300 to-amber-200 bg-clip-text text-transparent">Orbit does the rest.</span>
          </h2>
          <ul className="orbit-stagger mt-10 space-y-4">
            {POINTS.map((p) => (
              <li key={p} className="flex items-start gap-3 text-[15px] text-zinc-300">
                <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-emerald-500/15">
                  <Check className="h-3 w-3 text-emerald-300" />
                </span>
                {p}
              </li>
            ))}
          </ul>
        </div>
      </aside>
    </div>
  );
}

/** Input with an icon, label and focus glow — shared by the auth forms. */
export function AuthField({
  label,
  icon,
  trailing,
  ...input
}: React.InputHTMLAttributes<HTMLInputElement> & { label: string; icon: React.ReactNode; trailing?: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-[13px] font-medium text-zinc-400">{label}</span>
      <span className="flex items-center gap-2.5 rounded-xl border border-white/10 bg-white/[0.03] px-3.5 py-3 transition-all focus-within:border-fuchsia-500/60 focus-within:shadow-[0_0_0_4px_rgba(217,70,239,0.12)]">
        <span className="text-zinc-500">{icon}</span>
        <input {...input} className="w-full bg-transparent text-[15px] text-white outline-none placeholder:text-zinc-600" />
        {trailing}
      </span>
    </label>
  );
}
