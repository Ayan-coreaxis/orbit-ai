"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  LayoutDashboard,
  Users,
  Activity,
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

const nav = [
  { href: "/admin", label: "Overview", icon: LayoutDashboard },
  { href: "/admin/sellers", label: "Sellers", icon: Users },
  { href: "/admin/usage", label: "AI Usage & Cost", icon: Gauge },
  { href: "/admin/agents", label: "Agent Health", icon: Activity },
  { href: "/admin/ai-model", label: "AI Model", icon: Cpu },
  { href: "/admin/api-keys", label: "API Keys", icon: KeyRound },
  { href: "/admin/storage", label: "Storage", icon: Cloud },
  { href: "/admin/web-search", label: "Web Search", icon: Search },
  { href: "/admin/studio", label: "Studio", icon: Clapperboard },
  { href: "/admin/whatsapp", label: "WhatsApp", icon: MessageCircle },
  { href: "/admin/billing", label: "Billing & MRR", icon: CreditCard },
];

export function AdminSidebar() {
  const pathname = usePathname();
  const router = useRouter();

  async function logOut() {
    await fetch("/api/admin/logout", { method: "POST" });
    router.push("/admin-login");
    router.refresh();
  }

  return (
    <aside className="flex h-screen w-64 shrink-0 flex-col border-r border-border bg-panel">
      <div className="flex items-center gap-2.5 px-6 py-6">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-900">
          <ShieldCheck className="h-4.5 w-4.5 text-white" strokeWidth={2.5} />
        </div>
        <div className="leading-tight">
          <span className="text-[15px] font-semibold tracking-tight">orbit.ai</span>
          <div className="text-[11px] font-medium text-text-faint">Platform Admin</div>
        </div>
      </div>

      <nav className="flex-1 space-y-1 px-4">
        {nav.map((item) => {
          const active = item.href === "/admin" ? pathname === "/admin" : pathname.startsWith(item.href);
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-3 rounded-xl px-3.5 py-2.5 text-[14.5px] transition-colors",
                active
                  ? "bg-slate-900 font-medium text-white"
                  : "text-text-dim hover:bg-panel-2 hover:text-text",
              )}
            >
              <Icon className="h-[18px] w-[18px]" strokeWidth={2} />
              {item.label}
            </Link>
          );
        })}
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
  );
}
