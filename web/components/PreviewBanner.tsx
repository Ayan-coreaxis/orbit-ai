import { Sparkles } from "lucide-react";

export function PreviewBanner() {
  return (
    <div className="mx-10 mt-6 flex items-start gap-3 rounded-xl border border-accent/25 bg-accent-soft px-4 py-3.5">
      <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-accent-strong" />
      <p className="text-[13.5px] leading-relaxed text-accent-strong">
        <b>Preview only.</b> We&apos;re building the Competitor Intelligence and
        Growth Report core first — this screen shows what&apos;s coming, but
        nothing here is powered by real AI yet.
      </p>
    </div>
  );
}
