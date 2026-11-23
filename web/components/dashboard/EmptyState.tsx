import Link from "next/link";
import type { LucideIcon } from "lucide-react";

/**
 * Whole-area empty state: one icon, one line of what goes here, ONE primary action that fixes it
 * (and optionally one quiet secondary). Polaris rule — never a wall of text with no way forward.
 */
export function EmptyState({
  icon: Icon,
  title,
  body,
  action,
  secondary,
  compact,
}: {
  icon: LucideIcon;
  title: string;
  body?: string;
  action?: { label: string; href: string };
  secondary?: { label: string; href: string };
  compact?: boolean;
}) {
  return (
    <div className={`app-card orbit-scale-in flex flex-col items-center text-center ${compact ? "px-6 py-9" : "px-6 py-14"}`}>
      <span className="flex h-14 w-14 items-center justify-center rounded-full bg-panel-2 text-accent">
        <Icon className="h-6 w-6" strokeWidth={1.8} />
      </span>
      <h3 className="mt-4 text-[18px] font-semibold tracking-tight">{title}</h3>
      {body && <p className="mt-1.5 max-w-md text-[14.5px] leading-relaxed text-text-dim">{body}</p>}
      {(action || secondary) && (
        <div className="mt-5 flex flex-wrap items-center justify-center gap-2.5">
          {action && (
            <Link href={action.href} className="btn-primary">
              {action.label}
            </Link>
          )}
          {secondary && (
            <Link href={secondary.href} className="btn-soft">
              {secondary.label}
            </Link>
          )}
        </div>
      )}
    </div>
  );
}
