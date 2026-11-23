/** Page header inside the dashboard: a big title, one plain-language line under it, actions on the right. */
export function Topbar({ title, subtitle, actions }: { title: string; subtitle?: string; actions?: React.ReactNode }) {
  return (
    <header className="flex flex-wrap items-end justify-between gap-4 px-5 pb-2 pt-7 sm:px-8 sm:pt-9 xl:pl-2 xl:pr-10">
      <div className="min-w-0">
        <h1 className="text-[32px] font-semibold leading-[1.08] tracking-[-0.03em] sm:text-[42px]">{title}</h1>
        {subtitle && <p className="mt-2 max-w-2xl text-[15.5px] leading-relaxed text-text-dim sm:text-[16.5px]">{subtitle}</p>}
      </div>
      {actions && <div className="flex items-center gap-2.5">{actions}</div>}
    </header>
  );
}
