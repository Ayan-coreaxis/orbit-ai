import Link from "next/link";
import { Check, CircleAlert, CircleDashed } from "lucide-react";
import { Card, SectionLabel, Pill } from "@/components/ui";
import type { SetupItem } from "@/lib/setup-check";

/** Super Admin: what's still missing before Orbit is fully live. Missing items first, done ones folded away. */
export function SetupChecklist({ items }: { items: SetupItem[] }) {
  const missingRequired = items.filter((i) => i.required && !i.ok);
  const missingOptional = items.filter((i) => !i.required && !i.ok);
  const done = items.filter((i) => i.ok);
  return (
    <Card className="p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <SectionLabel>Go-live checklist</SectionLabel>
        <div className="flex items-center gap-2">
          <Pill tone={missingRequired.length ? "bad" : "good"}>{missingRequired.length ? `${missingRequired.length} required left` : "All required done"}</Pill>
          <span className="text-[12.5px] text-text-faint">
            {done.length}/{items.length} done
          </span>
        </div>
      </div>
      <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-panel-2">
        <div className="h-full rounded-full bg-accent transition-all duration-700" style={{ width: `${Math.round((done.length / items.length) * 100)}%` }} />
      </div>

      <div className="mt-5 grid gap-6 md:grid-cols-2">
        <Column title="Required to go live" items={missingRequired} empty="Everything required is set." />
        <Column title="Optional — turns on extra features" items={missingOptional} empty="All optional features are set up." />
      </div>

      {done.length > 0 && (
        <details className="mt-5 border-t border-border pt-4">
          <summary className="cursor-pointer text-[12.5px] font-medium text-text-dim hover:text-text">Show {done.length} done</summary>
          <ul className="mt-3 grid gap-1.5 md:grid-cols-2">
            {done.map((i) => (
              <li key={i.id} className="flex items-start gap-2 text-[13px] text-text-dim">
                <Check className="mt-0.5 h-4 w-4 shrink-0 text-good" />
                {i.label}
              </li>
            ))}
          </ul>
        </details>
      )}
    </Card>
  );
}

function Column({ title, items, empty }: { title: string; items: SetupItem[]; empty: string }) {
  return (
    <div>
      <div className="text-[12px] font-semibold uppercase tracking-[0.06em] text-text-faint">{title}</div>
      <ul className="mt-2 space-y-2.5">
        {items.map((i) => (
          <li key={i.id} className="flex items-start gap-2.5 text-[13px]">
            {i.required ? <CircleAlert className="mt-0.5 h-4 w-4 shrink-0 text-bad" /> : <CircleDashed className="mt-0.5 h-4 w-4 shrink-0 text-text-faint" />}
            <div>
              <div>
                <span className="mr-1.5 text-[11px] font-medium uppercase tracking-wide text-text-faint">{i.group}</span>
                {i.label}
              </div>
              <div className="text-[12px] text-text-faint">
                {i.fix}{" "}
                {i.href && (
                  <Link href={i.href} className="font-medium text-accent-strong hover:underline">
                    Open →
                  </Link>
                )}
              </div>
            </div>
          </li>
        ))}
        {items.length === 0 && <li className="text-[13px] text-text-faint">{empty}</li>}
      </ul>
    </div>
  );
}
