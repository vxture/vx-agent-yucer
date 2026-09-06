"use client";

import type { DeliveryAdvice } from "../../domains/delivery/lib/delivery-advice";
import { AssistantSection, type AssistantItem } from "./assistant";
import { useMessages } from "../lib/i18n/provider";

// 交付检查 - the delivery page's half of the dock, on the one assistant
// surface (assistant.tsx owns the shape).
//
// THE DOWNGRADE PROPORTION LIVES HERE, not on the page (owner, 2026-09-06).
// It is not a count of what exists - the page's own cuts are that - it is what
// this check CONCLUDED after holding every report against its facts, and a
// conclusion belongs with the findings that produced it. The section's scope
// line is where the price panel already states what it looked at, so the same
// slot says how much of the book the conclusion covers.
//
// ONE FINDING GETS AN ACT, and it is the one that asserts nothing new.
// Reconciling recomputes the DERIVED reading from facts that already exist -
// unpaid instalments, missed milestones - so the act only makes the page agree
// with what is already recorded. What the delivery team REPORTED is theirs to
// change, and no dock offers to change it for them.

export function DeliveryAdvicePanel({
  advice,
  canWrite,
  downgraded,
  liveCount,
  onReconcile,
}: {
  readonly advice: readonly DeliveryAdvice[];
  readonly canWrite: boolean;
  /** How many live projects report better health than the facts support. */
  readonly downgraded: number;
  readonly liveCount: number;
  readonly onReconcile: (id: string) => Promise<{ ok: boolean; error?: string }>;
}) {
  const { DELIVERY_TEXT, PROJECT_ERROR } = useMessages();

  const text = (a: DeliveryAdvice) => {
    switch (a.kind) {
      case "health_downgraded":
        return DELIVERY_TEXT.adviceDowngraded(a.projectName);
      case "milestone_late":
        return DELIVERY_TEXT.adviceMilestoneLate(a.projectName, a.count ?? 0);
      case "no_manager":
        return DELIVERY_TEXT.adviceNoManager(a.projectName);
      case "no_milestones":
        return DELIVERY_TEXT.adviceNoMilestones(a.projectName);
      case "no_contract_amount":
        return DELIVERY_TEXT.adviceNoContract(a.projectName);
    }
  };

  const tone = (a: DeliveryAdvice): AssistantItem["tone"] =>
    a.kind === "health_downgraded" ? "danger" : a.kind === "milestone_late" ? "warn" : "info";

  const items: AssistantItem[] = advice.map((a) => ({
    id: a.id,
    text: text(a),
    tone: tone(a),
    ...(canWrite && a.kind === "health_downgraded"
      ? {
          act: {
            label: DELIVERY_TEXT.reconcile,
            done: DELIVERY_TEXT.reconciledChanged,
            errors: PROJECT_ERROR,
            run: () => onReconcile(a.projectId),
          },
        }
      : {}),
    link: { label: DELIVERY_TEXT.adviceOpenCollection, href: "/collection" },
  }));

  return (
    <AssistantSection
      section={{
        id: "delivery-advice",
        title: DELIVERY_TEXT.adviceTitle,
        scope: DELIVERY_TEXT.downgradeScope(downgraded, liveCount),
        items,
        empty: DELIVERY_TEXT.adviceClear,
      }}
    />
  );
}
