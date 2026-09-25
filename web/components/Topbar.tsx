import { Bell, Search } from "lucide-react";
import { ThemeToggle } from "@/components/ThemeToggle";

export function Topbar({
  title,
  subtitle,
}: {
  title: string;
  subtitle?: string;
}) {
  return (
    <header className="flex items-center justify-between border-b border-border px-10 py-6">
      <div>
        <h1 className="text-[22px] font-semibold tracking-tight">{title}</h1>
        {subtitle && (
          <p className="mt-1 text-[14.5px] text-text-dim">{subtitle}</p>
        )}
      </div>
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2 rounded-xl border border-border bg-panel-2 px-3.5 py-2 text-[13.5px] text-text-faint">
          <Search className="h-4 w-4" />
          <span>Search…</span>
        </div>
        <ThemeToggle />
        <button className="relative flex h-9 w-9 items-center justify-center rounded-xl border border-border text-text-dim hover:text-text">
          <Bell className="h-[18px] w-[18px]" />
          <span className="absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full bg-accent" />
        </button>
      </div>
    </header>
  );
}
