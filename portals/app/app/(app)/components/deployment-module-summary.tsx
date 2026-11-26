"use client";

import type { PlanContent, PlanRevision } from "../../domains/planning/plan-model";
import type { FocusWorkspace } from "../../domains/planning/focus-model";
import type { summarizeWinLoss, WinLossFilter } from "../../domains/pipeline/lib/winloss-workspace";
import { useLocale, useMessages } from "../lib/i18n/provider";
import { salesPlanningModuleSummary, focusModuleSummary } from "../lib/deployment-module-summary";
import { winLossHref } from "../lib/winloss-workspace";
import { BusinessSummary, type BusinessSummaryItem } from "./business-summary";
import { formatMoney } from "../lib/view-model";

type SummaryText = ReturnType<typeof useMessages>["DEPLOYMENT_SUMMARY_TEXT"];
type SalesPlanningSummaryProps = {
  readonly content: PlanContent;
  readonly revision: Pick<PlanRevision, "state"> | null;
  readonly regionalPublished: boolean;
  readonly draft: boolean;
  readonly editing: boolean;
  readonly dirty: boolean;
  readonly historical: boolean;
  readonly scheduled: boolean;
  readonly onOpenDraft?: () => void;
};

export function SalesPlanningModuleSummary(props: SalesPlanningSummaryProps) {
  const { content, revision, regionalPublished, draft, onOpenDraft } = props;
  const { DEPLOYMENT_SUMMARY_TEXT: T } = useMessages(), locale = useLocale();
  if (!revision) return <BusinessSummary kind="planning" items={[{ label: T.noPublication, hint: T.planningHint }, ...(draft ? [{ label: T.pendingDraft, value: 1, suffix: T.draftUnit, hint: T.draftHint, attention: true, onSelect: onOpenDraft }] : [])]}/>;
  const summary = salesPlanningModuleSummary(content);
  const items: BusinessSummaryItem[] = [planningRevenueItem(summary, locale, T)];
  if (regionalPublished || (revision.state === "draft" && content.releaseScope === "regions"))
    items.push({ label: T.includedRegions, value: summary.regions.toLocaleString(locale), suffix: T.regionUnit, hint: T.regionHint });
  else items.push({ label: T.regionsUnpublished, hint: T.regionHint });
  const stateItem = planningStateItem(props, summary, locale, T);
  if (stateItem) items.push(stateItem);
  return <BusinessSummary kind="planning" items={items}/>;
}

function planningRevenueItem(summary: ReturnType<typeof salesPlanningModuleSummary>, locale: string, text: SummaryText): BusinessSummaryItem {
  let value = text.targetMissing;
  if (summary.revenue !== null && summary.currency) value = formatMoney(Number(summary.revenue), summary.currency, locale);
  else if (summary.ambiguous) value = text.sourceUnknown;
  return { label: text.annualRevenue, value, hint: text.planningHint, attention: summary.revenue === null };
}

function planningStateItem(props: SalesPlanningSummaryProps, summary: ReturnType<typeof salesPlanningModuleSummary>, locale: string, text: SummaryText): BusinessSummaryItem | null {
  if (props.revision?.state === "draft") return { label: props.editing && props.dirty ? text.unsavedDraft : text.unpublishedDraft, hint: text.draftHint };
  if (props.scheduled) return { label: text.scheduledVersion, hint: text.regionHint };
  if (props.historical) return { label: text.historicalVersion, hint: text.historyHint };
  if (props.draft) return { label: text.pendingDraft, value: 1, suffix: text.draftUnit, hint: text.draftHint, attention: true, onSelect: props.onOpenDraft };
  if (!summary.regions || !props.regionalPublished) return null;
  if (summary.withoutOwner) return { label: text.regionsWithoutOwner, value: summary.withoutOwner.toLocaleString(locale), suffix: text.regionUnit, hint: text.ownerHint, attention: true };
  return { label: text.regionOwnersComplete, hint: text.ownerHint };
}

export function FocusModuleSummary({ workspace }: { readonly workspace: FocusWorkspace }) {
  const { DEPLOYMENT_SUMMARY_TEXT: T } = useMessages(), locale = useLocale();
  if (!workspace.revision) return <BusinessSummary kind="named" items={[{ label: T.noPublication, hint: T.focusHint }]}/>;
  const s = focusModuleSummary(workspace.rows);
  const items: BusinessSummaryItem[] = [{ label: workspace.revision.draft ? T.draftCustomers : T.deployedCustomers, value: s.total.toLocaleString(locale), suffix: T.customerUnit, hint: T.focusHint }];
  if (s.total) {
    items.push(s.missingRevenue
      ? { label: T.missingRevenue, value: s.missingRevenue.toLocaleString(locale), suffix: T.customerUnit, hint: T.revenueHint, attention: true }
      : { label: T.revenueComplete, hint: T.revenueHint },
    { label: T.needsAttention, value: s.attention.toLocaleString(locale), suffix: T.customerUnit, hint: T.attentionHint, attention: s.attention > 0 });
    if (s.unknown) items.push({ label: T.coverageUnknown, value: s.unknown.toLocaleString(locale), suffix: T.customerUnit, hint: T.unknownHint, attention: true });
  }
  return <BusinessSummary kind="named" items={items}/>;
}

export function WinLossModuleSummary({ summary, filter }: { readonly summary: ReturnType<typeof summarizeWinLoss>; readonly filter: WinLossFilter }) {
  const { DEPLOYMENT_SUMMARY_TEXT: T } = useMessages(), locale = useLocale();
  const items: BusinessSummaryItem[] = [{ label: filter.dates === "undated" ? T.undatedSamples : T.closedSamples, value: summary.total.toLocaleString(locale), suffix: T.sampleUnit, hint: T.reviewHint }];
  if (summary.total) {
    items.push({ label: T.registeredReviews, value: `${summary.reviewed.toLocaleString(locale)}/${summary.total.toLocaleString(locale)}`, hint: T.reviewHint },
    summary.pending
      ? { label: T.pendingReviews, value: summary.pending.toLocaleString(locale), suffix: T.sampleUnit, hint: T.pendingReviewHint, attention: true,
          href: winLossHref(filter, { view: "list", status: "pending", outcome: "all", reason: "", query: "" }) }
      : { label: T.allReviewsRegistered, hint: T.pendingReviewHint });
  }
  return <BusinessSummary kind="winloss" items={items}/>;
}
