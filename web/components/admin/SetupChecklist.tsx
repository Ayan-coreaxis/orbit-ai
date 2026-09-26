import Link from "next/link";
import { Check, CircleAlert, CircleDashed } from "lucide-react";
import { Card, SectionLabel, Pill } from "@/components/ui";
import type { SetupItem } from "@/lib/setup-check";

/** Super Admin: what's still missing before Orbit is fully live. */
export function SetupChecklist({ items }: { items: SetupItem[] }) {
  const required = items.filter((i) => i.required);
  const missingRequired = required.filter((i) => !i.ok).length;
  const done = items.filter((i) => i.ok).length;
  const groups = [...new Set(items.map((i) => i.group))];
  return (
    <Card className="p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <SectionLabel>Go-live checklist</SectionLabel>
        <div className="flex items-center gap-2">
          <Pill tone={missingRequired ? "bad" : "good"}>{missingRequired ? `${missingRequired} required left` : "All required done"}</Pill>
          <span className="text-[12.5px] text-text-faint">
            {done}/{items.length} set up
          </span>
        </div>
      </div>
      <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-panel-2">
        <div className="h-full rounded-full bg-accent transition-all duration-700" style={{ width: `${Math.round((done / items.length) * 100)}%` }} />
      </div>
      <div className="mt-5 grid gap-5 md:grid-cols-2">
        {groups.map((g) => (
          <div key={g}>
            <div className="text-[12px] font-semibold uppercase tracking-[0.06em] text-text-faint">{g}</div>
            <ul className="mt-2 space-y-2">
              {items
                .filter((i) => i.group === g)
                .map((i) => (
                  <li key={i.id} className="flex items-start gap-2.5 text-[13px]">
                    {i.ok ? (
                      <Check className="mt-0.5 h-4 w-4 shrink-0 text-good" />
                    ) : i.required ? (
                      <CircleAlert className="mt-0.5 h-4 w-4 shrink-0 text-bad" />
                    ) : (
                      <CircleDashed className="mt-0.5 h-4 w-4 shrink-0 text-text-faint" />
                    )}
                    <div>
                      <div className={i.ok ? "text-text-dim" : ""}>
                        {i.label}
                        {!i.ok && i.required && <span className="ml-1.5 text-[11px] font-semibold text-bad">required</span>}
                      </div>
                      {!i.ok && (
                        <div className="text-[12px] text-text-faint">
                          {i.fix}{" "}
                          {i.href && (
                            <Link href={i.href} className="text-accent-strong hover:underline">
                              Open
                            </Link>
                          )}
                        </div>
                      )}
                    </div>
                  </li>
                ))}
            </ul>
          </div>
        ))}
      </div>
    </Card>
  );
}
