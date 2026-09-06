"use client";

import type { SegmentAdvice } from "../../domains/strategy/lib/segment-advice";
import { AssistantSection, type AssistantItem } from "./assistant";
import { useMessages } from "../lib/i18n/provider";

// 细分检查 - the segment page's half of the dock, mapped into the one
// assistant surface (assistant.tsx owns the shape).
//
// EVERY ITEM ENDS IN A LINK, never an act. When a code and a definition
// disagree, which one is wrong is a commercial judgement: the cut may be
// stale, or the account may have been placed by hand for a reason nobody
// wrote down. A machine that "fixed" it either way would be making that call.

export function SegmentAdvicePanel({ advice }: { readonly advice: readonly SegmentAdvice[] }) {
  const { STRATEGY_TEXT } = useMessages();

  const text = (a: SegmentAdvice) => {
    switch (a.kind) {
      case "assigned_not_matching":
        return STRATEGY_TEXT.segmentAdviceAssigned(a.segmentName, a.count ?? 0);
      case "matching_not_assigned":
        return STRATEGY_TEXT.segmentAdviceMatching(a.segmentName, a.count ?? 0);
      case "stale_assignment":
        return STRATEGY_TEXT.segmentAdviceStale(a.segmentName, a.count ?? 0);
      case "no_criteria":
        return STRATEGY_TEXT.segmentAdviceNoCriteria(a.segmentName);
      case "no_plan":
        return STRATEGY_TEXT.segmentAdviceNoPlan(a.segmentName);
    }
  };

  const items: AssistantItem[] = advice.map((a) => ({
    id: a.id,
    text: text(a),
    tone:
      a.kind === "assigned_not_matching" || a.kind === "stale_assignment"
        ? "warn"
        : "info",
    link: {
      label: STRATEGY_TEXT.segmentAdviceOpen,
      href: `/segment/new?code=${encodeURIComponent(a.segmentCode)}`,
    },
    more: [
      { id: "accounts", label: STRATEGY_TEXT.segmentAdviceOpenAccounts, href: "/account" },
      { id: "strategy", label: STRATEGY_TEXT.segmentsTitle, href: "/strategy" },
    ],
  }));

  return (
    <AssistantSection
      section={{
        id: "segment-advice",
        title: STRATEGY_TEXT.segmentAdviceTitle,
        items,
        empty: STRATEGY_TEXT.segmentAdviceClear,
      }}
    />
  );
}
