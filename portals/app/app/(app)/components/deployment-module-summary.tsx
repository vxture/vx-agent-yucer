"use client";

import type { PlanContent, PlanRevision } from "../../domains/planning/plan-model";
import type { FocusWorkspace } from "../../domains/planning/focus-model";
import type { summarizeWinLoss, WinLossFilter } from "../../domains/pipeline/lib/winloss-workspace";
import { useLocale, useMessages } from "../lib/i18n/provider";
import { salesPlanningModuleSummary, focusModuleSummary } from "../lib/deployment-module-summary";
import { winLossHref } from "../lib/winloss-workspace";
import { BusinessSummary, type BusinessSummaryItem } from "./business-summary";
import { formatMoney } from "../lib/view-model";

export function SalesPlanningModuleSummary({ content, revision, regionalPublished, draft, editing, dirty, historical, scheduled, onOpenDraft }: {
  readonly content: PlanContent;
  readonly revision: Pick<PlanRevision, "state"> | null;
  readonly regionalPublished: boolean;
  readonly draft: boolean;
  readonly editing: boolean;
  readonly dirty: boolean;
  readonly historical: boolean;
  readonly scheduled: boolean;
  readonly onOpenDraft?: () => void;
}) {
  const { DEPLOYMENT_SUMMARY_TEXT: T } = useMessages(), locale = useLocale();
  if (!revision) return <BusinessSummary kind="planning" items={[{ label: T.noPublication, hint: T.planningHint }, ...(draft ? [{ label: T.pendingDraft, value: 1, suffix: T.draftUnit, hint: T.draftHint, attention: true, onSelect: onOpenDraft }] : [])]}/>;
  const summary = salesPlanningModuleSummary(content);
  const isDraft = revision.state === "draft";
  const items: BusinessSummaryItem[] = [
    { label: T.annualRevenue, value: summary.revenue !== null && summary.currency ? formatMoney(Number(summary.revenue), summary.currency, locale) : summary.ambiguous ? T.sourceUnknown : T.targetMissing, hint: T.planningHint, attention: summary.revenue === null },
    regionalPublished || (isDraft && content.releaseScope === "regions")
      ? { label: T.includedRegions, value: summary.regions.toLocaleString(locale), suffix: T.regionUnit, hint: T.regionHint }
      : { label: T.regionsUnpublished, hint: T.regionHint },
  ];
  if (isDraft) items.push({ label: editing && dirty ? T.unsavedDraft : T.unpublishedDraft, hint: T.draftHint });
  else if (scheduled) items.push({ label: T.scheduledVersion, hint: T.regionHint });
  else if (historical) items.push({ label: T.historicalVersion, hint: T.historyHint });
  else if (draft) items.push({ label: T.pendingDraft, value: 1, suffix: T.draftUnit, hint: T.draftHint, attention: true, onSelect: onOpenDraft });
  else if (summary.regions && regionalPublished) items.push(summary.withoutOwner
    ? { label: T.regionsWithoutOwner, value: summary.withoutOwner.toLocaleString(locale), suffix: T.regionUnit, hint: T.ownerHint, attention: true }
    : { label: T.regionOwnersComplete, hint: T.ownerHint });
  return <BusinessSummary kind="planning" items={items}/>;
}

export function FocusModuleSummary({ workspace }: { readonly workspace: FocusWorkspace }) {
  const { DEPLOYMENT_SUMMARY_TEXT: T } = useMessages(), locale = useLocale();
  if (!workspace.revision) return <BusinessSummary kind="named" items={[{ label: T.noPublication, hint: T.focusHint }]}/>;
  const s = focusModuleSummary(workspace.rows);
  const items: BusinessSummaryItem[] = [{ label: workspace.revision.draft ? T.draftCustomers : T.deployedCustomers, value: s.total.toLocaleString(locale), suffix: T.customerUnit, hint: T.focusHint }];
  if (s.total) {
    items.push(s.missingRevenue
      ? { label: T.missingRevenue, value: s.missingRevenue.toLocaleString(locale), suffix: T.customerUnit, hint: T.revenueHint, attention: true }
      : { label: T.revenueComplete, hint: T.revenueHint });
    items.push({ label: T.needsAttention, value: s.attention.toLocaleString(locale), suffix: T.customerUnit, hint: T.attentionHint, attention: s.attention > 0 });
    if (s.unknown) items.push({ label: T.coverageUnknown, value: s.unknown.toLocaleString(locale), suffix: T.customerUnit, hint: T.unknownHint, attention: true });
  }
  return <BusinessSummary kind="named" items={items}/>;
}

export function WinLossModuleSummary({ summary, filter }: { readonly summary: ReturnType<typeof summarizeWinLoss>; readonly filter: WinLossFilter }) {
  const { DEPLOYMENT_SUMMARY_TEXT: T } = useMessages(), locale = useLocale();
  const items: BusinessSummaryItem[] = [{ label: filter.dates === "undated" ? T.undatedSamples : T.closedSamples, value: summary.total.toLocaleString(locale), suffix: T.sampleUnit, hint: T.reviewHint }];
  if (summary.total) {
    items.push({ label: T.registeredReviews, value: `${summary.reviewed.toLocaleString(locale)}/${summary.total.toLocaleString(locale)}`, hint: T.reviewHint });
    items.push(summary.pending
      ? { label: T.pendingReviews, value: summary.pending.toLocaleString(locale), suffix: T.sampleUnit, hint: T.pendingReviewHint, attention: true,
          href: winLossHref(filter, { view: "list", status: "pending", outcome: "all", reason: "", query: "" }) }
      : { label: T.allReviewsRegistered, hint: T.pendingReviewHint });
  }
  return <BusinessSummary kind="winloss" items={items}/>;
}
