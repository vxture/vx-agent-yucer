"use client";

import type { RenewalAdvice } from "../../domains/delivery/lib/renewal-advice";
import { AssistantSection, type AssistantItem } from "./assistant";
import { useMessages } from "../lib/i18n/provider";

// 续约检查 - the renewal page's half of the dock, on the one assistant surface
// (assistant.tsx owns the shape).
//
// THE ACT IS THE SAME ONE THE ROW OFFERS, and that is the whole argument for
// it being here. Opening a renewal is already a per-row operation gated on
// pipeline.opportunity.create; the dock does not add a power, it puts the
// finding and the authorised outlet in one place. It stays ONE CUSTOMER AT A
// TIME for the reason the roster has no bulk control: a "renew everything"
// button would approach a dozen customers on one click.
//
// TWO FINDINGS GET NO ACT, and neither is an oversight. A subscription with no
// end date needs the date fixed, not an opportunity opened against a term
// nobody can date; and a renewal with no amount would open with a blank number
// in front of a customer. Both send the reader to the delivery record instead.

export function RenewalAdvicePanel({
  advice,
  canOpen,
  onOpen,
}: {
  readonly advice: readonly RenewalAdvice[];
  readonly canOpen: boolean;
  readonly onOpen: (input: {
    projectId: string;
  }) => Promise<{ ok: boolean; error?: string }>;
}) {
  const { RENEWAL_TEXT, RENEWAL_ERROR } = useMessages();

  const text = (a: RenewalAdvice) => {
    switch (a.kind) {
      case "lapsed":
        return RENEWAL_TEXT.renewalAdviceLapsed(a.projectName, Math.abs(a.daysToEnd ?? 0));
      case "watch_risk":
        return RENEWAL_TEXT.renewalAdviceWatch(a.projectName);
      case "no_end_date":
        return RENEWAL_TEXT.renewalAdviceNoEndDate(a.projectName);
      case "no_amount":
        return RENEWAL_TEXT.renewalAdviceNoAmount(a.projectName);
      case "due_soon":
        return RENEWAL_TEXT.renewalAdviceDueSoon(a.projectName, a.daysToEnd ?? 0);
    }
  };

  const tone = (a: RenewalAdvice): AssistantItem["tone"] =>
    a.kind === "lapsed" ? "danger" : a.kind === "due_soon" ? "info" : "warn";

  const actionable = (a: RenewalAdvice) =>
    a.kind === "lapsed" || a.kind === "watch_risk" || a.kind === "due_soon";

  const items: AssistantItem[] = advice.map((a) => ({
    id: a.id,
    text: text(a),
    evidence: a.projectNo,
    tone: tone(a),
    ...(canOpen && actionable(a)
      ? {
          act: {
            label: RENEWAL_TEXT.renewalAdviceAct,
            done: RENEWAL_TEXT.renewalAdviceActed,
            errors: RENEWAL_ERROR,
            run: () => onOpen({ projectId: a.projectId }),
          },
        }
      : {}),
    link: { label: RENEWAL_TEXT.renewalAdviceOpenProject, href: "/delivery" },
    more: [{ id: "accounts", label: RENEWAL_TEXT.renewalAdviceOpenAccounts, href: "/account" }],
  }));

  return (
    <AssistantSection
      section={{
        id: "renewal-advice",
        title: RENEWAL_TEXT.renewalAdviceTitle,
        items,
        empty: RENEWAL_TEXT.renewalAdviceClear,
      }}
    />
  );
}
