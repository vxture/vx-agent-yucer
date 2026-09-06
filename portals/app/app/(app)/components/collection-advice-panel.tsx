"use client";

import type { CollectionAdvice } from "../../domains/delivery/lib/collection-advice";
import { AssistantSection, type AssistantItem } from "./assistant";
import { useMessages } from "../lib/i18n/provider";

// 回款检查 - the collections page's half of the dock, on the one assistant
// surface (assistant.tsx owns the shape).
//
// ONE FINDING GETS AN ACT, and it is the one that asserts nothing new. When a
// due date has passed and the row still reads 已开票, marking it 逾期 only
// writes down what the calendar already says - and the move is reversible
// through the same menu, so the reader can undo it where they saw it.
//
// SETTLING IS NEVER OFFERED HERE. It asserts that cash arrived, which is a
// fact about the world; the amount has to be typed by somebody who knows it,
// and the roster's dialog is where that happens. A dock that could mark money
// received would be reporting money nobody has.

export function CollectionAdvicePanel({
  advice,
  canWrite,
  onFlag,
}: {
  readonly advice: readonly CollectionAdvice[];
  readonly canWrite: boolean;
  readonly onFlag: (input: {
    projectId: string;
    instalmentId: string;
    to: string;
  }) => Promise<{ ok: boolean; error?: string }>;
}) {
  const { DELIVERY_TEXT, REVENUE_ERROR } = useMessages();

  const text = (a: CollectionAdvice) => {
    switch (a.kind) {
      case "overdue":
        return DELIVERY_TEXT.collectAdviceOverdue(a.projectName, a.daysLate ?? 0);
      case "due_not_flagged":
        return DELIVERY_TEXT.collectAdviceDueNotFlagged(a.projectName, a.daysLate ?? 0);
      case "short_paid":
        return DELIVERY_TEXT.collectAdviceShort(
          a.projectName,
          (a.shortfall ?? 0).toLocaleString(),
        );
      case "no_due_date":
        return DELIVERY_TEXT.collectAdviceNoDueDate(a.projectName);
      case "nothing_collected":
        return DELIVERY_TEXT.collectAdviceNothing(a.projectName);
    }
  };

  const tone = (a: CollectionAdvice): AssistantItem["tone"] =>
    a.kind === "overdue" ? "danger" : a.kind === "nothing_collected" ? "info" : "warn";

  const items: AssistantItem[] = advice.map((a) => ({
    id: a.id,
    text: text(a),
    tone: tone(a),
    ...(canWrite && a.kind === "due_not_flagged"
      ? {
          act: {
            label: DELIVERY_TEXT.collectAdviceFlag,
            done: DELIVERY_TEXT.collectAdviceFlagged,
            errors: REVENUE_ERROR,
            run: () =>
              onFlag({
                projectId: a.projectId,
                instalmentId: a.instalmentId,
                to: "overdue",
              }),
          },
        }
      : {}),
    link: { label: DELIVERY_TEXT.collectAdviceOpenDelivery, href: "/delivery" },
  }));

  return (
    <AssistantSection
      section={{
        id: "collection-advice",
        title: DELIVERY_TEXT.collectAdviceTitle,
        items,
        empty: DELIVERY_TEXT.collectAdviceClear,
      }}
    />
  );
}
