"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from "react";
import { Compass, Images, LogOut, Menu, MessageCircle, Moon, Plug, Search, Settings, Sparkles, Sun, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { NAV_GROUPS, isActive } from "@/components/dashboard/nav";
import { CommandPalette } from "@/components/dashboard/CommandPalette";

type Props = { businessName?: string; talkBadge?: boolean; userEmail?: string };

/** Top-level sections (the glass pill nav). `also` = pages that belong to the section. */
const SECTIONS: { label: string; href: string; also?: string[] }[] = [
  { label: "Overview", href: "/dashboard" },
  { label: "Orchestrator", href: "/dashboard/orchestrator" },
  { label: "Inbox", href: "/dashboard/inbox" },
  { label: "Store", href: "/dashboard/store", also: ["/dashboard/media", "/dashboard/reviews", "/dashboard/returns"] },
  { label: "Design", href: "/dashboard/orbit-design" },
  { label: "Marketing", href: "/dashboard/content", also: ["/dashboard/ads", "/dashboard/competitors", "/dashboard/experiments"] },
  { label: "Money", href: "/dashboard/finance", also: ["/dashboard/tax"] },
];

/** Pages inside a section, shown as a glass segmented control under the nav. */
const SUBNAV: Record<string, { label: string; href: string }[]> = {
  "/dashboard/store": [
    { label: "Products & orders", href: "/dashboard/store" },
    { label: "Media", href: "/dashboard/media" },
    { label: "Reviews", href: "/dashboard/reviews" },
    { label: "Returns", href: "/dashboard/returns" },
  ],
  "/dashboard/content": [
    { label: "Content", href: "/dashboard/content" },
    { label: "Ads", href: "/dashboard/ads" },
    { label: "Competitors", href: "/dashboard/competitors" },
    { label: "Experiments", href: "/dashboard/experiments" },
  ],
  "/dashboard/finance": [
    { label: "Money", href: "/dashboard/finance" },
    { label: "Tax", href: "/dashboard/tax" },
  ],
};

const under = (pathname: string, href: string) => (href === "/dashboard" ? pathname === "/dashboard" : pathname === href || pathname.startsWith(`${href}/`));

function sectionOf(pathname: string) {
  return SECTIONS.find((s) => under(pathname, s.href) || (s.also ?? []).some((a) => under(pathname, a)));
}

// ---- app theme (oat / forest) — its own switch, so the landing page keeps its look ----
const readAppTheme = () => (document.documentElement.getAttribute("data-app-theme") === "forest" ? "forest" : "oat");
function subscribeAppTheme(cb: () => void) {
  const obs = new MutationObserver(cb);
  obs.observe(document.documentElement, { attributes: true, attributeFilter: ["data-app-theme"] });
  return () => obs.disconnect();
}
function useAppTheme() {
  const theme = useSyncExternalStore(subscribeAppTheme, readAppTheme, () => "oat" as const);
  const set = (t: "oat" | "forest") => {
    if (t === "forest") document.documentElement.setAttribute("data-app-theme", "forest");
    else document.documentElement.removeAttribute("data-app-theme");
    try {
      localStorage.setItem("appTheme", t);
    } catch {
      /* private mode */
    }
  };
  return [theme, set] as const;
}

/** A pill row whose dark "active" pill slides to the current item. */
function SlidingPills({ items, activeHref, size = "md" }: { items: { label: string; href: string; badge?: boolean }[]; activeHref?: string; size?: "md" | "sm" }) {
  const wrap = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState<{ x: number; w: number } | null>(null);
  useLayoutEffect(() => {
    const measure = () => {
      const el = wrap.current?.querySelector<HTMLElement>(`[data-href="${activeHref}"]`);
      setBox(el ? { x: el.offsetLeft, w: el.offsetWidth } : null);
    };
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [activeHref, items.length]);
  return (
    <div ref={wrap} className={cn("relative flex items-center", size === "md" ? "gap-1 p-1.5" : "gap-0.5 p-1")}>
      {box && (
        <span
          aria-hidden
          className="absolute rounded-full bg-accent transition-[transform,width] duration-500 ease-[cubic-bezier(0.22,1,0.36,1)]"
          style={{ top: size === "md" ? 6 : 4, bottom: size === "md" ? 6 : 4, left: 0, width: box.w, transform: `translateX(${box.x}px)` }}
        />
      )}
      {items.map((it) => {
        const active = it.href === activeHref;
        return (
          <Link
            key={it.href}
            href={it.href}
            data-href={it.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "relative z-10 whitespace-nowrap rounded-full font-medium transition-colors duration-300",
              size === "md" ? "px-4 py-2 text-[14.5px]" : "px-3.5 py-1.5 text-[13.5px]",
              active ? "text-panel" : "text-text-dim hover:text-text",
            )}
          >
            {it.label}
            {it.badge && <span className="absolute right-1.5 top-1.5 h-1.5 w-1.5 rounded-full bg-tomato" />}
          </Link>
        );
      })}
    </div>
  );
}

function Brand() {
  return (
    <Link href="/dashboard" className="glass group flex items-center gap-2.5 rounded-full py-1.5 pl-1.5 pr-4">
      <span className="flex h-9 w-9 items-center justify-center rounded-full bg-tomato text-white transition-transform duration-500 group-hover:rotate-[24deg]">
        <Compass className="h-[18px] w-[18px]" strokeWidth={2.4} />
      </span>
      <span className="text-[16px] font-semibold tracking-tight">Orbit</span>
    </Link>
  );
}

function initialsOf(name: string) {
  return (
    name
      .split(" ")
      .filter(Boolean)
      .slice(0, 2)
      .map((w) => w[0])
      .join("")
      .toUpperCase() || "?"
  );
}

function RailButton({ href, onClick, label, children, active }: { href?: string; onClick?: () => void; label: string; children: React.ReactNode; active?: boolean }) {
  const cls = cn(
    "group relative flex h-11 w-11 items-center justify-center rounded-full transition-all duration-200",
    active ? "bg-accent text-panel" : "text-text-dim hover:bg-panel hover:text-text",
  );
  const tip = (
    <span className="pointer-events-none absolute left-full ml-3 whitespace-nowrap rounded-full bg-accent px-3 py-1 text-[12.5px] font-medium text-panel opacity-0 shadow-lg transition-all duration-200 group-hover:translate-x-0.5 group-hover:opacity-100">
      {label}
    </span>
  );
  return href ? (
    <Link href={href} aria-label={label} className={cls}>
      {children}
      {tip}
    </Link>
  ) : (
    <button onClick={onClick} aria-label={label} className={cls}>
      {children}
      {tip}
    </button>
  );
}

export function AppShell({ businessName, talkBadge, userEmail, children }: Props & { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [theme, setTheme] = useAppTheme();
  const [drawer, setDrawer] = useState(false);
  const [palette, setPalette] = useState(false);
  const focus = pathname.startsWith("/dashboard/orbit-design");
  const section = sectionOf(pathname);
  const sub = section ? SUBNAV[section.href] : undefined;
  const subActive = sub?.slice().sort((a, b) => b.href.length - a.href.length).find((s) => under(pathname, s.href))?.href;
  const name = businessName || "Your business";

  const [lastPath, setLastPath] = useState(pathname);
  if (pathname !== lastPath) {
    setLastPath(pathname);
    setDrawer(false);
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPalette((p) => !p);
      }
    };
    const onOpen = () => setPalette(true);
    const onOpenNav = () => setDrawer(true);
    window.addEventListener("keydown", onKey);
    window.addEventListener("orbit:open-palette", onOpen);
    window.addEventListener("orbit:open-nav", onOpenNav);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("orbit:open-palette", onOpen);
      window.removeEventListener("orbit:open-nav", onOpenNav);
    };
  }, []);

  async function logOut() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }

  const drawerEl = drawer && (
    <div className="fixed inset-0 z-[60]">
      <button className="orbit-fade absolute inset-0 bg-black/30 backdrop-blur-sm" onClick={() => setDrawer(false)} aria-label="Close menu" />
      <aside className="orbit-slide-in glass-strong absolute inset-y-2 left-2 flex w-[84%] max-w-[320px] flex-col rounded-[28px]">
        <div className="flex items-center justify-between p-4">
          <Brand />
          <button onClick={() => setDrawer(false)} className="rounded-full p-2 text-text-dim hover:bg-panel" aria-label="Close menu">
            <X className="h-5 w-5" />
          </button>
        </div>
        <nav className="scrollbar-thin min-h-0 flex-1 space-y-5 overflow-y-auto px-3 pb-3">
          {NAV_GROUPS.map((g) => (
            <div key={g.title}>
              <div className="px-3 pb-1.5 text-[12.5px] font-semibold text-text-faint">{g.title}</div>
              {g.items.map((item) => {
                const active = isActive(pathname, item.href);
                const Icon = item.icon;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={cn("flex items-center gap-3 rounded-full px-3.5 py-2.5 text-[15px] transition-colors", active ? "bg-accent font-medium text-panel" : "text-text-dim hover:bg-panel hover:text-text")}
                  >
                    <Icon className="h-[18px] w-[18px]" />
                    {item.label}
                  </Link>
                );
              })}
            </div>
          ))}
        </nav>
        <div className="flex items-center gap-3 border-t border-border p-4">
          <span className="flex h-9 w-9 items-center justify-center rounded-full bg-accent text-[12.5px] font-semibold text-panel">{initialsOf(name)}</span>
          <div className="min-w-0 flex-1 leading-tight">
            <div className="truncate text-[14px] font-semibold">{name}</div>
            <div className="truncate text-[12.5px] text-text-faint">{userEmail}</div>
          </div>
          <button onClick={() => setTheme(theme === "oat" ? "forest" : "oat")} className="rounded-full p-2 text-text-dim hover:bg-panel" aria-label="Switch theme">
            {theme === "oat" ? <Moon className="h-4 w-4" /> : <Sun className="h-4 w-4" />}
          </button>
          <button onClick={logOut} className="rounded-full p-2 text-text-dim hover:bg-panel" aria-label="Log out">
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </aside>
    </div>
  );

  if (focus) {
    return (
      <>
        {children}
        {drawerEl}
        <CommandPalette open={palette} onClose={() => setPalette(false)} />
      </>
    );
  }

  return (
    <>
      {/* ---------- top bar ---------- */}
      <header className="sticky top-0 z-40 px-3 pt-3 sm:px-5 xl:px-6">
        <div className="flex items-center gap-3">
          <Brand />
          <nav className="glass hidden min-w-0 rounded-full xl:block" aria-label="Main">
            <SlidingPills
              items={SECTIONS.map((s) => ({ label: s.label, href: s.href, badge: s.href === "/dashboard/orchestrator" && talkBadge }))}
              activeHref={section?.href}
            />
          </nav>
          <div className="ml-auto flex items-center gap-2">
            <div className="glass flex items-center gap-1 rounded-full p-1.5">
              <button onClick={() => setPalette(true)} className="flex h-10 w-10 items-center justify-center rounded-full text-text-dim transition-colors hover:bg-panel hover:text-text" aria-label="Search (Ctrl K)" title="Search · Ctrl K">
                <Search className="h-[18px] w-[18px]" />
              </button>
              <Link href="/dashboard/orchestrator" className="relative flex h-10 w-10 items-center justify-center rounded-full text-text-dim transition-colors hover:bg-panel hover:text-text" aria-label="Ask the Orchestrator" title="Ask the Orchestrator">
                <Sparkles className="h-[18px] w-[18px]" />
                {talkBadge && <span className="absolute right-2 top-2 h-2 w-2 rounded-full bg-tomato ring-2 ring-[var(--panel)]" />}
              </Link>
              <button onClick={() => setDrawer(true)} className="flex h-10 w-10 items-center justify-center rounded-full text-text-dim hover:bg-panel hover:text-text xl:hidden" aria-label="Open menu">
                <Menu className="h-[18px] w-[18px]" />
              </button>
            </div>
            <Link href="/dashboard/settings" className="glass hidden items-center gap-3 rounded-full py-1.5 pl-1.5 pr-5 transition-transform hover:-translate-y-px md:flex">
              <span className="flex h-10 w-10 items-center justify-center rounded-full bg-accent text-[13px] font-semibold text-panel">{initialsOf(name)}</span>
              <span className="leading-tight">
                <span className="block max-w-[160px] truncate text-[14.5px] font-semibold">{name}</span>
                <span className="block max-w-[160px] truncate text-[12.5px] text-text-faint">{userEmail}</span>
              </span>
            </Link>
          </div>
        </div>
      </header>

      <div className="relative z-10 flex">
        {/* ---------- left rail ---------- */}
        <aside className="sticky top-[88px] hidden h-[calc(100dvh-104px)] w-[84px] shrink-0 flex-col items-center gap-4 py-4 xl:flex">
          <div className="glass flex flex-col gap-1 rounded-full p-1.5">
            <RailButton label="Light" onClick={() => setTheme("oat")} active={theme === "oat"}>
              <Sun className="h-[18px] w-[18px]" />
            </RailButton>
            <RailButton label="Dark" onClick={() => setTheme("forest")} active={theme === "forest"}>
              <Moon className="h-[18px] w-[18px]" />
            </RailButton>
          </div>
          <div className="glass flex flex-col gap-1 rounded-full p-1.5">
            <RailButton label="Search  ·  Ctrl K" onClick={() => setPalette(true)}>
              <Search className="h-[18px] w-[18px]" />
            </RailButton>
            <RailButton label="Inbox" href="/dashboard/inbox" active={under(pathname, "/dashboard/inbox")}>
              <MessageCircle className="h-[18px] w-[18px]" />
            </RailButton>
            <RailButton label="Media library" href="/dashboard/media" active={under(pathname, "/dashboard/media")}>
              <Images className="h-[18px] w-[18px]" />
            </RailButton>
            <RailButton label="Connections" href="/dashboard/settings/connections" active={under(pathname, "/dashboard/settings/connections")}>
              <Plug className="h-[18px] w-[18px]" />
            </RailButton>
            <RailButton label="Settings" href="/dashboard/settings" active={under(pathname, "/dashboard/settings") && !under(pathname, "/dashboard/settings/connections")}>
              <Settings className="h-[18px] w-[18px]" />
            </RailButton>
          </div>
          <div className="glass mt-auto flex flex-col gap-1 rounded-full p-1.5">
            <RailButton label="Log out" onClick={logOut}>
              <LogOut className="h-[18px] w-[18px]" />
            </RailButton>
          </div>
        </aside>

        <main id="main" className="min-w-0 flex-1 pb-16">
          {sub && (
            <div className="px-5 pt-5 sm:px-8 xl:pl-2 xl:pr-10">
              <div className="glass scrollbar-thin inline-flex max-w-full overflow-x-auto rounded-full">
                <SlidingPills items={sub} activeHref={subActive} size="sm" />
              </div>
            </div>
          )}
          <div key={pathname} className="page-enter">
            {children}
          </div>
        </main>
      </div>

      {drawerEl}
      <CommandPalette open={palette} onClose={() => setPalette(false)} />
    </>
  );
}
