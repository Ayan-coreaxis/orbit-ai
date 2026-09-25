"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  Images,
  LayoutDashboard,
  Radar,
  PenSquare,
  Inbox,
  Store,
  Sparkles,
  Wallet,
  Settings,
  Compass,
  Mic,
  LogOut,
  Star,
  RotateCcw,
  FlaskConical,
  Receipt,
  Megaphone,
  Plug,
} from "lucide-react";
import { cn } from "@/lib/utils";

const nav = [
  { href: "/dashboard", label: "Overview", icon: LayoutDashboard, live: true },
  { href: "/dashboard/competitors", label: "Competitors", icon: Radar, live: true },
  { href: "/dashboard/orchestrator", label: "Orchestrator", icon: Mic, live: true },
  { href: "/dashboard/content", label: "Content", icon: PenSquare, live: true },
  { href: "/dashboard/inbox", label: "Inbox", icon: Inbox, live: true },
  { href: "/dashboard/store", label: "Store", icon: Store, live: true },
  { href: "/dashboard/orbit-design", label: "Orbit Design", icon: Sparkles, live: true },
  { href: "/dashboard/media", label: "Media", icon: Images, live: true },
  { href: "/dashboard/ads", label: "Ads", icon: Megaphone, live: true },
  { href: "/dashboard/finance", label: "Money", icon: Wallet, live: true },
  { href: "/dashboard/reviews", label: "Reviews", icon: Star, live: true },
  { href: "/dashboard/returns", label: "Returns", icon: RotateCcw, live: true },
  { href: "/dashboard/experiments", label: "Experiments", icon: FlaskConical, live: true },
  { href: "/dashboard/tax", label: "Tax", icon: Receipt, live: true },
  { href: "/dashboard/settings/connections", label: "Connections", icon: Plug, live: true },
];

export function Sidebar({
  businessName,
  planLabel,
  talkBadge,
  userEmail,
}: {
  businessName?: string;
  planLabel?: string;
  talkBadge?: boolean;
  userEmail?: string;
}) {
  const pathname = usePathname();
  const router = useRouter();

  async function logOut() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }
  const displayName = businessName || "Your Business";
  const initials =
    displayName
      .split(" ")
      .filter(Boolean)
      .slice(0, 2)
      .map((w) => w[0])
      .join("")
      .toUpperCase() || "?";

  return (
    <aside className="sticky top-0 flex h-screen max-h-screen w-64 shrink-0 flex-col overflow-hidden border-r border-border bg-panel">
      <div className="flex shrink-0 items-center gap-2.5 px-6 py-5">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg gradient-fill">
          <Compass className="h-4.5 w-4.5 text-white" strokeWidth={2.5} />
        </div>
        <span className="text-[15px] font-semibold tracking-tight">
          orbit<span className="gradient-text">.ai</span>
        </span>
      </div>

      <nav className="scrollbar-thin min-h-0 flex-1 space-y-1 overflow-y-auto px-4 pb-2">
        {nav.map((item) => {
          const active =
            item.href === "/dashboard"
              ? pathname === "/dashboard"
              : pathname.startsWith(item.href);
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center justify-between rounded-xl px-3.5 py-2.5 text-[14.5px] transition-colors",
                active
                  ? "bg-accent-soft font-medium text-accent-strong"
                  : "text-text-dim hover:bg-panel-2 hover:text-text",
              )}
            >
              <span className="flex items-center gap-3">
                <Icon className="h-[18px] w-[18px]" strokeWidth={2} />
                {item.label}
              </span>
              {!item.live && (
                <span className="rounded-full bg-panel-2 px-2 py-0.5 text-[10px] font-medium text-text-faint">
                  Soon
                </span>
              )}
              {item.href === "/dashboard/orchestrator" && talkBadge && (
                <span className="h-2 w-2 rounded-full bg-accent" />
              )}
            </Link>
          );
        })}
      </nav>

      <div className="shrink-0 border-t border-border p-3">
        <Link
          href="/dashboard/settings"
          className={cn(
            "flex items-center gap-3 rounded-xl px-3.5 py-2.5 text-[14.5px] transition-colors",
            pathname.startsWith("/dashboard/settings") && !pathname.startsWith("/dashboard/settings/connections")
              ? "bg-accent-soft font-medium text-accent-strong"
              : "text-text-dim hover:bg-panel-2 hover:text-text",
          )}
        >
          <Settings className="h-[18px] w-[18px]" strokeWidth={2} />
          Settings &amp; Billing
        </Link>
        <div className="mt-2 flex items-center gap-3 rounded-xl px-3.5 py-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-panel-2 text-[12px] font-medium text-text-dim">
            {initials}
          </div>
          <div className="min-w-0 flex-1 leading-tight">
            <div className="truncate text-[13.5px] font-medium">{displayName}</div>
            <div className="truncate text-[12px] text-text-faint">{userEmail || planLabel || "No plan yet"}</div>
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
