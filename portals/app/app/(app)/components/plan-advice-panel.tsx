"use client";

import type { PlanAdvice } from "../../domains/strategy/lib/plan-advice";
import { AssistantSection, type AssistantItem } from "./assistant";
import { useMessages } from "../lib/i18n/provider";

// 计划检查 - the strategy page's half of the dock, on the one assistant
// surface (assistant.tsx owns the shape).
//
// ONE FINDING GETS AN ACT, AND THE TRANSITION MAP IS WHY. A draft whose period
// has already started can be approved from here, because `approved -> draft`
// is a legal move: the reader can undo it in the same menu they see it in.
// Every other remedy is one-way - activating a plan admits only closing after
// it, and closing admits only archiving - so those end in a LINK to the plan,
// where the move is made deliberately. An assistant that offered a one-click
// irreversible lifecycle move would be spending the reader's authority, not
// carrying it.

export function PlanAdvicePanel({
  advice,
  canApprove,
  onApprove,
}: {
  readonly advice: readonly PlanAdvice[];
  readonly canApprove: boolean;
  readonly onApprove: (id: string, to: string) => Promise<{ ok: boolean; error?: string }>;
}) {
  const { STRATEGY_TEXT, PLAN_ERROR } = useMessages();

  const text = (a: PlanAdvice) => {
    switch (a.kind) {
      case "period_over_not_closed":
        return STRATEGY_TEXT.planAdviceOverdue(a.planName);
      case "draft_period_started":
        return STRATEGY_TEXT.planAdviceDraftStarted(a.planName);
      case "approved_not_active":
        return STRATEGY_TEXT.planAdviceNotActive(a.planName);
      case "work_under_inactive_plan":
        return STRATEGY_TEXT.planAdviceEarlyWork(a.planName, a.count ?? 0);
      case "active_no_campaign":
        return STRATEGY_TEXT.planAdviceNoCampaign(a.planName);
      case "active_no_segment":
        return STRATEGY_TEXT.planAdviceNoSegment(a.planName);
      case "no_objective":
        return STRATEGY_TEXT.planAdviceNoObjective(a.planName);
    }
  };

  const tone = (a: PlanAdvice): AssistantItem["tone"] =>
    a.kind === "period_over_not_closed" ||
    a.kind === "draft_period_started" ||
    a.kind === "approved_not_active" ||
    a.kind === "work_under_inactive_plan"
      ? "warn"
      : "info";

  const items: AssistantItem[] = advice.map((a) => ({
    id: a.id,
    text: text(a),
    evidence: a.planNo,
    tone: tone(a),
    ...(a.kind === "draft_period_started" && canApprove
      ? {
          act: {
            label: STRATEGY_TEXT.planAdviceApprove,
            done: STRATEGY_TEXT.planAdviceApproved,
            errors: PLAN_ERROR,
            run: () => onApprove(a.planId, "approved"),
          },
        }
      : {}),
    link: {
      label: STRATEGY_TEXT.planAdviceOpen,
      href: `/strategy/new?no=${encodeURIComponent(a.planNo)}`,
    },
    more: [
      { id: "campaign", label: STRATEGY_TEXT.planAdviceOpenCampaigns, href: "/campaign" },
      { id: "segment", label: STRATEGY_TEXT.planAdviceOpenSegments, href: "/segment" },
    ],
  }));

  return (
    <AssistantSection
      section={{
        id: "plan-advice",
        title: STRATEGY_TEXT.planAdviceTitle,
        items,
        empty: STRATEGY_TEXT.planAdviceClear,
      }}
    />
  );
}
