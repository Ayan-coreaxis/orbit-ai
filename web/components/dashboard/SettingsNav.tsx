"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { SETTINGS_GROUPS, SETTINGS_ITEMS } from "@/lib/settings-nav";
import { cn } from "@/lib/utils";

const isActive = (pathname: string, href: string) => (href === "/dashboard/settings" ? pathname === href : pathname.startsWith(href));

/** Settings menu: a grouped list on the left on desktop, a scrollable strip on phones. */
export function SettingsNav() {
  const pathname = usePathname();
  const strip = useRef<HTMLElement>(null);
  // Phones: keep the current section's chip in view in the scrolling strip.
  useEffect(() => {
    strip.current?.querySelector<HTMLElement>('[aria-current="page"]')?.scrollIntoView({ block: "nearest", inline: "center" });
  }, [pathname]);
  return (
    <>
      <nav ref={strip} aria-label="Settings" className="scrollbar-thin -mx-5 flex gap-1.5 overflow-x-auto border-b border-border px-5 pb-3 sm:-mx-8 sm:px-8 lg:hidden">
        {SETTINGS_ITEMS.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            aria-current={isActive(pathname, item.href) ? "page" : undefined}
            className={cn(
              "shrink-0 whitespace-nowrap rounded-full px-3 py-1.5 text-[12.5px] font-medium",
              isActive(pathname, item.href) ? "bg-accent text-white" : "bg-panel-2 text-text-dim hover:text-text",
            )}
          >
            {item.label}
          </Link>
        ))}
      </nav>
      <nav aria-label="Settings" className="sticky top-6 hidden w-56 shrink-0 space-y-5 self-start lg:block">
        {SETTINGS_GROUPS.map((g) => (
          <div key={g.title}>
            <div className="mb-1.5 px-3 text-[11px] font-semibold uppercase tracking-[0.08em] text-text-faint">{g.title}</div>
            <div className="space-y-0.5">
              {g.items.map((item) => {
                const Icon = item.icon;
                const active = isActive(pathname, item.href);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "flex items-center gap-2.5 rounded-lg px-3 py-2 text-[13.5px] transition-colors",
                      active ? "bg-accent-soft font-medium text-accent-strong" : "text-text-dim hover:bg-panel-2 hover:text-text",
                    )}
                  >
                    <Icon className="h-4 w-4 shrink-0" />
                    {item.label}
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </nav>
    </>
  );
}
