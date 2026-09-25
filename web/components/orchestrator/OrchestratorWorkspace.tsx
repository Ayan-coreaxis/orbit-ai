"use client";

import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import { OrchestratorChat, type ChatMessage } from "@/components/orchestrator/OrchestratorChat";
import { PlanPanel } from "@/components/strategy/PlanPanel";
import type { PlanView } from "@/lib/strategy-lab";

/**
 * "Talk to your Orchestrator" — one conversation, with the growth plan it's talking about right
 * next to it. The chat drafts / changes the plan; the panel shows it and approves it.
 */
export function OrchestratorWorkspace({
  reportId,
  wantsToDiscuss,
  discussReason,
  initialMessages,
  active,
  draft,
  currency,
  canHire,
}: {
  reportId: string;
  wantsToDiscuss: boolean;
  discussReason?: string;
  initialMessages: ChatMessage[];
  active: PlanView | null;
  draft: PlanView | null;
  currency: string;
  canHire: boolean;
}) {
  const router = useRouter();
  const refreshPlan = useCallback(() => router.refresh(), [router]);
  const [reviewing, setReviewing] = useState(false);
  // A different draft appearing (e.g. drafted from the chat) closes any open review of the old one.
  const [reviewDraftId, setReviewDraftId] = useState(draft?.id ?? null);
  if ((draft?.id ?? null) !== reviewDraftId) {
    setReviewDraftId(draft?.id ?? null);
    setReviewing(false);
  }

  return (
    <div className="grid h-full min-h-0 gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(360px,460px)] lg:grid-rows-[minmax(0,1fr)]">
      <div className="h-[70dvh] min-h-0 lg:h-full">
        <OrchestratorChat
          reportId={reportId}
          wantsToDiscuss={wantsToDiscuss}
          discussReason={discussReason}
          initialMessages={initialMessages}
          onPlanChanged={refreshPlan}
          onReviewPlan={() => setReviewing(true)}
        />
      </div>
      <div className="scrollbar-thin min-h-0 overflow-y-auto pb-4 lg:h-full lg:pr-1">
        <PlanPanel active={active} draft={draft} currency={currency} canHire={canHire} reviewing={reviewing} onReviewingChange={setReviewing} />
      </div>
    </div>
  );
}
