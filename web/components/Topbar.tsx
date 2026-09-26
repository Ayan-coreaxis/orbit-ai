import { ThemeToggle } from "@/components/ThemeToggle";

/** Page header inside the dashboard: title, one-line subtitle, optional actions on the right. */
export function Topbar({ title, subtitle, actions }: { title: string; subtitle?: string; actions?: React.ReactNode }) {
  return (
    <header className="orbit-fade flex flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-5 sm:px-8 lg:px-10 lg:py-6">
      <div className="min-w-0">
        <h1 className="truncate text-[20px] font-semibold tracking-tight sm:text-[22px]">{title}</h1>
        {subtitle && <p className="mt-1 truncate text-[13.5px] text-text-dim sm:text-[14.5px]">{subtitle}</p>}
      </div>
      <div className="flex items-center gap-2.5">
        {actions}
        <ThemeToggle />
      </div>
    </header>
  );
}
