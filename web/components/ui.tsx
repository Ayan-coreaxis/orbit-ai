import { cn } from "@/lib/utils";
import type { AgentStatus } from "@/lib/mock-data";

export function Card({
  className,
  style,
  children,
}: {
  className?: string;
  style?: React.CSSProperties;
  children: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        "rounded-2xl border border-border bg-panel shadow-[0_1px_2px_rgba(30,28,24,0.04)]",
        className,
      )}
      style={style}
    >
      {children}
    </div>
  );
}

export function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-[13px] font-semibold uppercase tracking-[0.04em] text-text-dim">
      {children}
    </div>
  );
}

export function StatusDot({ status }: { status: AgentStatus }) {
  const color = status === "active" ? "bg-good" : status === "idle" ? "bg-text-dim" : "bg-text-faint";
  return (
    <span className="relative flex h-2 w-2">
      {status === "active" && (
        <span
          className={cn(
            "absolute inline-flex h-full w-full rounded-full opacity-75 animate-pulse-dot",
            color,
          )}
        />
      )}
      <span className={cn("relative inline-flex h-2 w-2 rounded-full", color)} />
    </span>
  );
}

export function StatusBadge({ status }: { status: AgentStatus }) {
  const map = {
    active: { label: "Ran recently", cls: "bg-good-soft text-good" },
    idle: { label: "Ran before", cls: "bg-panel-2 text-text-dim" },
    never: { label: "Not run yet", cls: "bg-panel-2 text-text-faint" },
  };
  const s = map[status];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-3 py-1 text-[12px] font-medium",
        s.cls,
      )}
    >
      <StatusDot status={status} />
      {s.label}
    </span>
  );
}

export function Pill({
  children,
  tone = "neutral",
}: {
  children: React.ReactNode;
  tone?: "neutral" | "good" | "warn" | "bad" | "accent";
}) {
  const tones = {
    neutral: "bg-panel-2 text-text-dim border-border",
    good: "bg-good-soft text-good border-transparent",
    warn: "bg-warn-soft text-warn border-transparent",
    bad: "bg-bad-soft text-bad border-transparent",
    accent: "bg-accent-soft text-accent-strong border-transparent",
  };
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2.5 py-0.5 text-[12px] font-medium",
        tones[tone],
      )}
    >
      {children}
    </span>
  );
}

export function Button({
  children,
  variant = "primary",
  className,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "ghost";
}) {
  const variants = {
    primary: "gradient-fill text-white hover:opacity-90 shadow-sm",
    secondary:
      "bg-panel text-text border border-border-strong hover:border-accent/50",
    ghost: "text-text-dim hover:text-text hover:bg-panel-2",
  };
  return (
    <button
      className={cn(
        "inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-[14px] font-medium transition-colors",
        variants[variant],
        className,
      )}
      {...props}
    >
      {children}
    </button>
  );
}

export function ProgressBar({ value }: { value: number }) {
  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-panel-2">
      <div
        className="h-full rounded-full gradient-fill transition-all"
        style={{ width: `${Math.min(100, value)}%` }}
      />
    </div>
  );
}
