"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Compass, LogOut, Menu, Search, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { NAV_GROUPS, isActive } from "@/components/dashboard/nav";
import { CommandPalette } from "@/components/dashboard/CommandPalette";

type Props = { businessName?: string; planLabel?: string; talkBadge?: boolean; userEmail?: string };

function Brand() {
  return (
    <Link href="/dashboard" className="group flex items-center gap-2.5">
      <span className="flex h-8 w-8 items-center justify-center rounded-lg gradient-fill transition-transform duration-300 group-hover:rotate-12">
        <Compass className="h-4.5 w-4.5 text-white" strokeWidth={2.5} />
      </span>
      <span className="text-[15px] font-semibold tracking-tight">
        orbit<span className="gradient-text">.ai</span>
      </span>
    </Link>
  );
}

function NavList({ talkBadge, onNavigate }: { talkBadge?: boolean; onNavigate?: () => void }) {
  const pathname = usePathname();
  return (
    <nav className="scrollbar-thin min-h-0 flex-1 space-y-5 overflow-y-auto px-3 pb-3">
      {NAV_GROUPS.map((g) => (
        <div key={g.title}>
          <div className="px-3 pb-1.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-text-faint">{g.title}</div>
          <div className="space-y-0.5">
            {g.items.map((item) => {
              const active = isActive(pathname, item.href);
              const Icon = item.icon;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={onNavigate}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "group relative flex items-center justify-between rounded-xl px-3 py-2 text-[14px] transition-all duration-200",
                    active ? "bg-accent-soft font-medium text-accent-strong" : "text-text-dim hover:bg-panel-2 hover:text-text",
                  )}
                >
                  {active && <span className="absolute left-0 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-r-full bg-accent orbit-fade" />}
                  <span className="flex items-center gap-3">
                    <Icon className={cn("h-[17px] w-[17px] transition-transform duration-200", !active && "group-hover:scale-110")} strokeWidth={2} />
                    {item.label}
                  </span>
                  {item.href === "/dashboard/orchestrator" && talkBadge && (
                    <span className="relative flex h-2 w-2" title="A growth plan is waiting for you">
                      <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-accent opacity-60" />
                      <span className="relative inline-flex h-2 w-2 rounded-full bg-accent" />
                    </span>
                  )}
                </Link>
              );
            })}
          </div>
        </div>
      ))}
    </nav>
  );
}

function Account({ businessName, planLabel, userEmail }: Props) {
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
    <div className="shrink-0 border-t border-border p-3">
      <div className="flex items-center gap-3 rounded-xl px-2.5 py-2">
        <div className="flex h-8 w-8 items-center justify-center rounded-full gradient-fill text-[12px] font-semibold text-white">{initials}</div>
        <div className="min-w-0 flex-1 leading-tight">
          <div className="truncate text-[13.5px] font-medium">{displayName}</div>
          <div className="truncate text-[12px] text-text-faint">{userEmail || planLabel || "No plan yet"}</div>
        </div>
        <button onClick={logOut} title="Log out" aria-label="Log out" className="shrink-0 rounded-lg p-1.5 text-text-faint transition-colors hover:bg-panel-2 hover:text-text">
          <LogOut className="h-4 w-4" strokeWidth={2} />
        </button>
      </div>
    </div>
  );
}

/** Desktop: fixed sidebar. Phones/tablets: a top bar with a slide-in drawer. ⌘K opens search everywhere. */
export function Sidebar(props: Props) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [palette, setPalette] = useState(false);

  // Close the drawer whenever the page changes.
  const [lastPath, setLastPath] = useState(pathname);
  if (pathname !== lastPath) {
    setLastPath(pathname);
    setOpen(false);
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPalette((p) => !p);
      }
    };
    const onOpen = () => setPalette(true);
    window.addEventListener("keydown", onKey);
    window.addEventListener("orbit:open-palette", onOpen);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("orbit:open-palette", onOpen);
    };
  }, []);

  const searchButton = (
    <button
      onClick={() => setPalette(true)}
      className="mx-3 mb-3 flex items-center gap-2 rounded-xl border border-border bg-panel-2 px-3 py-2 text-[13px] text-text-faint transition-colors hover:border-border-strong hover:text-text-dim"
    >
      <Search className="h-4 w-4" />
      <span className="flex-1 text-left">Search…</span>
      <kbd className="rounded-md border border-border px-1.5 py-0.5 text-[10.5px] font-medium">⌘K</kbd>
    </button>
  );

  return (
    <>
      {/* desktop */}
      <aside className="sticky top-0 hidden h-screen max-h-screen w-64 shrink-0 flex-col overflow-hidden border-r border-border bg-panel lg:flex">
        <div className="shrink-0 px-6 py-5">
          <Brand />
        </div>
        {searchButton}
        <NavList talkBadge={props.talkBadge} />
        <Account {...props} />
      </aside>

      {/* phone / tablet top bar */}
      <div className="fixed inset-x-0 top-0 z-40 flex h-14 items-center justify-between border-b border-border bg-panel/90 px-4 backdrop-blur-xl lg:hidden">
        <Brand />
        <div className="flex items-center gap-1">
          <button onClick={() => setPalette(true)} className="rounded-lg p-2 text-text-dim" aria-label="Search">
            <Search className="h-5 w-5" />
          </button>
          <button onClick={() => setOpen(true)} className="relative rounded-lg p-2 text-text-dim" aria-label="Open menu">
            <Menu className="h-5 w-5" />
            {props.talkBadge && <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-accent" />}
          </button>
        </div>
      </div>
      <div className="h-14 shrink-0 lg:hidden" />

      {open && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button className="orbit-fade absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setOpen(false)} aria-label="Close menu" />
          <aside className="orbit-slide-in absolute inset-y-0 left-0 flex w-[82%] max-w-[300px] flex-col border-r border-border bg-panel shadow-2xl">
            <div className="flex shrink-0 items-center justify-between px-5 py-4">
              <Brand />
              <button onClick={() => setOpen(false)} className="rounded-lg p-1.5 text-text-dim" aria-label="Close menu">
                <X className="h-5 w-5" />
              </button>
            </div>
            <NavList talkBadge={props.talkBadge} onNavigate={() => setOpen(false)} />
            <Account {...props} />
          </aside>
        </div>
      )}

      <CommandPalette open={palette} onClose={() => setPalette(false)} />
    </>
  );
}
