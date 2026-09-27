"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  LayoutDashboard,
  Users,
  KeyRound,
  CreditCard,
  ShieldCheck,
  ArrowLeftRight,
  Gauge,
  LogOut,
  Cpu,
  Cloud,
  Search,
  Clapperboard,
  MessageCircle,
} from "lucide-react";
import { cn } from "@/lib/utils";

type NavItem = { href: string; label: string; icon: typeof Users };

/** Grouped by what the owner is doing: watching the business, tuning the AI, or wiring up services. */
const sections: { title: string | null; items: NavItem[] }[] = [
  { title: null, items: [{ href: "/admin", label: "Overview", icon: LayoutDashboard }] },
  {
    title: "Business",
    items: [
      { href: "/admin/sellers", label: "Sellers", icon: Users },
      { href: "/admin/billing", label: "Revenue & cost", icon: CreditCard },
      { href: "/admin/usage", label: "AI usage & cost", icon: Gauge },
    ],
  },
  {
    title: "AI",
    items: [
      { href: "/admin/ai-model", label: "AI model", icon: Cpu },
      { href: "/admin/web-search", label: "Web search", icon: Search },
      { href: "/admin/studio", label: "Studio (images & reels)", icon: Clapperboard },
    ],
  },
  {
    title: "Setup",
    items: [
      { href: "/admin/api-keys", label: "API keys", icon: KeyRound },
      { href: "/admin/storage", label: "Storage", icon: Cloud },
      { href: "/admin/whatsapp", label: "WhatsApp", icon: MessageCircle },
    ],
  },
];
const nav = sections.flatMap((s) => s.items);

export function AdminSidebar() {
  const pathname = usePathname();
  const router = useRouter();

  async function logOut() {
    await fetch("/api/admin/logout", { method: "POST" });
    router.push("/admin-login");
    router.refresh();
  }

  return (
    <>
    {/* phones: a scrollable strip of sections */}
    <nav className="scrollbar-thin flex shrink-0 gap-1 overflow-x-auto border-b border-border bg-panel px-3 py-2 lg:hidden">
      {nav.map((item) => {
        const active = item.href === "/admin" ? pathname === "/admin" : pathname.startsWith(item.href);
        return (
          <Link key={item.href} href={item.href} className={`shrink-0 whitespace-nowrap rounded-full px-3 py-1.5 text-[12.5px] font-medium ${active ? "bg-accent text-white" : "bg-panel-2 text-text-dim"}`}>
            {item.label}
          </Link>
        );
      })}
    </nav>
    <aside className="hidden h-screen w-64 shrink-0 flex-col border-r border-border bg-panel lg:flex">
      <div className="flex items-center gap-2.5 px-6 py-5">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-900">
          <ShieldCheck className="h-4.5 w-4.5 text-white" strokeWidth={2.5} />
        </div>
        <div className="leading-tight">
          <span className="text-[15px] font-semibold tracking-tight">orbit.ai</span>
          <div className="text-[11px] font-medium text-text-faint">Platform Admin</div>
        </div>
      </div>

      <nav className="scrollbar-thin flex-1 space-y-5 overflow-y-auto px-4 pb-4">
        {sections.map((section) => (
          <div key={section.title ?? "top"}>
            {section.title && (
              <div className="mb-1.5 px-3.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-text-faint">{section.title}</div>
            )}
            <div className="space-y-0.5">
              {section.items.map((item) => {
                const active = item.href === "/admin" ? pathname === "/admin" : pathname.startsWith(item.href);
                const Icon = item.icon;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={cn(
                      "flex items-center gap-3 rounded-xl px-3.5 py-2 text-[14px] transition-colors",
                      active ? "bg-accent font-medium text-white" : "text-text-dim hover:bg-panel-2 hover:text-text",
                    )}
                  >
                    <Icon className="h-[17px] w-[17px]" strokeWidth={2} />
                    {item.label}
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      <div className="border-t border-border p-4">
        <Link
          href="/dashboard"
          className="flex items-center gap-3 rounded-xl px-3.5 py-2.5 text-[14.5px] text-text-dim transition-colors hover:bg-panel-2 hover:text-text"
        >
          <ArrowLeftRight className="h-[18px] w-[18px]" strokeWidth={2} />
          Switch to seller view
        </Link>
        <div className="mt-2 flex items-center gap-3 rounded-xl px-3.5 py-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-900 text-[12px] font-medium text-white">
            OW
          </div>
          <div className="flex-1 leading-tight">
            <div className="text-[13.5px] font-medium">Owner</div>
            <div className="text-[12px] text-text-faint">Full access</div>
          </div>
          <button
            onClick={logOut}
            title="Log out"
            className="shrink-0 rounded-lg p-1.5 text-text-faint hover:bg-panel-2 hover:text-text"
          >
            <LogOut className="h-4 w-4" strokeWidth={2} />
          </button>
        </div>
      </div>
    </aside>
    </>
  );
}
