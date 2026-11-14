"use client";

import type { PlanAdvice } from "../../domains/strategy/lib/plan-advice";
import { AssistantSection, type AssistantItem } from "./assistant";
import { useMessages } from "../lib/i18n/provider";

// 计划检查 - the strategy page's half of the dock, on the one assistant
// surface (assistant.tsx owns the shape).
//
// Publication is irreversible; findings link to the read view and its explicit
// publish confirmation instead of executing it inside an assistant item.
export function PlanAdvicePanel({ advice }: { readonly advice: readonly PlanAdvice[] }) {
  const { STRATEGY_TEXT } = useMessages();

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
    link: {
      label: STRATEGY_TEXT.planAdviceOpen,
      href: `/strategy/${encodeURIComponent(a.planId)}`,
    },
    more: [
      { id: "campaign", label: STRATEGY_TEXT.planAdviceOpenCampaigns, href: "/campaign" },
      { id: "segment", label: STRATEGY_TEXT.planAdviceOpenSegments, href: "/strategy?view=markets" },
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
