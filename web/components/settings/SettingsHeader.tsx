/** Title + one-line explanation at the top of each settings page. */
export function SettingsHeader({ title, description, children }: { title: string; description?: string; children?: React.ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h2 className="text-[19px] font-semibold tracking-tight">{title}</h2>
        {description && <p className="mt-1 max-w-2xl text-[13.5px] text-text-dim">{description}</p>}
      </div>
      {children}
    </div>
  );
}
