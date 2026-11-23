import Link from "next/link";
import { Geist } from "next/font/google";
import { Check, Compass } from "lucide-react";

const appFont = Geist({ subsets: ["latin"], variable: "--font-app", display: "swap" });

const POINTS = [
  "Your store, built and edited by AI — you approve every change",
  "Photos, reels, posts and Meta ads from your real products",
  "WhatsApp, Messenger and Instagram answered for you",
  "Cash on delivery, couriers and tracking built in",
];

/** Login / signup / password pages: the form on a glass card, the promise on a forest panel. */
export function AuthShell({ title, subtitle, children, footer }: { title: string; subtitle?: string; children: React.ReactNode; footer?: React.ReactNode }) {
  return (
    <div className={`orbit-app ${appFont.variable} relative min-h-dvh`}>
      <div className="orbit-ambient" aria-hidden>
        <span />
      </div>
      <div className="relative z-10 grid min-h-dvh gap-4 p-3 sm:p-4 lg:grid-cols-[1fr_1fr]">
        <div className="flex flex-col px-3 py-4 sm:px-8">
          <Link href="/" className="glass flex w-fit items-center gap-2.5 rounded-full py-1.5 pl-1.5 pr-4">
            <span className="flex h-9 w-9 items-center justify-center rounded-full bg-tomato text-white">
              <Compass className="h-[18px] w-[18px]" strokeWidth={2.4} />
            </span>
            <span className="text-[16px] font-semibold tracking-tight">Orbit</span>
          </Link>
          <div className="flex flex-1 items-center justify-center py-10">
            <div className="orbit-fade-up app-card w-full max-w-[420px] p-7 sm:p-9">
              <h1 className="text-[30px] font-semibold leading-tight tracking-[-0.03em]">{title}</h1>
              {subtitle && <p className="mt-2 text-[15.5px] leading-relaxed text-text-dim">{subtitle}</p>}
              <div className="mt-7">{children}</div>
              {footer && <div className="mt-7 text-center text-[14px] text-text-dim">{footer}</div>}
            </div>
          </div>
        </div>
        <aside className="relative hidden overflow-hidden rounded-[32px] bg-[#1f4a37] text-[#f3ede2] lg:block">
          <div className="absolute -right-24 -top-24 h-[420px] w-[420px] rounded-full bg-[#f2462e]/25 blur-[80px]" />
          <div className="absolute -bottom-32 -left-20 h-[380px] w-[380px] rounded-full bg-[#ece4d6]/10 blur-[70px]" />
          <div className="orbit-spin-slow absolute -right-40 -top-40 h-[560px] w-[560px] rounded-full border border-white/10" />
          <div className="relative flex h-full flex-col justify-center px-14">
            <span className="w-fit rounded-full bg-white/10 px-3.5 py-1.5 text-[13px] font-medium backdrop-blur">Your AI store team</span>
            <h2 className="mt-6 max-w-md text-balance text-[44px] font-semibold leading-[1.05] tracking-[-0.035em]">
              Sell more, juggle less. <span className="text-[#ff8a73]">Orbit does the rest.</span>
            </h2>
            <ul className="orbit-stagger mt-10 space-y-4">
              {POINTS.map((p) => (
                <li key={p} className="flex items-start gap-3 text-[16px] text-[#e9e1d2]">
                  <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#f2462e]">
                    <Check className="h-3.5 w-3.5 text-white" strokeWidth={3} />
                  </span>
                  {p}
                </li>
              ))}
            </ul>
          </div>
        </aside>
      </div>
    </div>
  );
}

/** Input with an icon, label and focus ring — shared by the auth forms. */
export function AuthField({
  label,
  icon,
  trailing,
  ...input
}: React.InputHTMLAttributes<HTMLInputElement> & { label: string; icon: React.ReactNode; trailing?: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-[14px] font-medium text-text-dim">{label}</span>
      <span className="flex items-center gap-2.5 rounded-2xl border border-border-strong bg-panel-2 px-4 py-3.5 transition-all focus-within:border-accent focus-within:shadow-[0_0_0_4px_var(--accent-soft)]">
        <span className="text-text-faint">{icon}</span>
        <input {...input} className="w-full bg-transparent text-[15.5px] text-text outline-none placeholder:text-text-faint" />
        {trailing}
      </span>
    </label>
  );
}
