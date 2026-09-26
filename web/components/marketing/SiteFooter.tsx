import Link from "next/link";
import { Logo } from "@/components/marketing/Logo";

export function SiteFooter() {
  const cols = [
    { title: "Product", links: [["/#features", "Features"], ["/pricing", "Pricing"], ["/#how", "How it works"], ["/#faq", "FAQ"]] },
    { title: "Account", links: [["/signup", "Get started"], ["/login", "Log in"], ["/dashboard", "Dashboard"]] },
    { title: "Legal", links: [["/privacy", "Privacy Policy"], ["/terms", "Terms of Service"], ["/privacy#data-deletion", "Delete my data"]] },
  ];
  return (
    <footer className="border-t border-white/5 bg-zinc-950">
      <div className="mx-auto grid max-w-7xl gap-10 px-5 py-14 sm:px-8 md:grid-cols-[1.4fr_1fr_1fr_1fr]">
        <div>
          <Logo />
          <p className="mt-4 max-w-xs text-[13.5px] leading-relaxed text-zinc-500">
            Your store, content, ads and customer chats — run by one AI Orchestrator, on your real numbers.
          </p>
        </div>
        {cols.map((c) => (
          <div key={c.title}>
            <div className="text-[12px] font-semibold uppercase tracking-[0.08em] text-zinc-500">{c.title}</div>
            <ul className="mt-4 space-y-2.5">
              {c.links.map(([href, label]) => (
                <li key={href}>
                  <Link href={href} className="text-[14px] text-zinc-400 transition-colors hover:text-white">
                    {label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <div className="border-t border-white/5">
        <div className="mx-auto flex max-w-7xl flex-col gap-2 px-5 py-6 text-[12.5px] text-zinc-600 sm:flex-row sm:justify-between sm:px-8">
          <span>© {new Date().getFullYear()} orbit.ai</span>
          <span>Made for online sellers who&apos;d rather sell than juggle tools.</span>
        </div>
      </div>
    </footer>
  );
}
