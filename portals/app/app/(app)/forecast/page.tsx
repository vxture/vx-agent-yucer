import { EmptyState, StatusBadge, ViewLayout } from "@vxture/design-ui";
import { resolveAppSession } from "../lib/session";
import { getMessages } from "../lib/i18n/server";
import { can } from "../../authz/decide";
import { getPipelineStore } from "../../domains/shared/registry";
import { previewCategories } from "../../domains/pipeline/service";
import { ForecastRoster, type ForecastRow } from "../components/forecast-roster";
import { ForecastAnalysis } from "../components/forecast-analysis";
import { ModuleHeadline, type HeadlineStat } from "../components/module-headline";
import { forecastStats } from "../../domains/pipeline/lib/forecast-stats";
import { applySuggestedCategory } from "./actions";
import { loadFailureText } from "../lib/load-failure";

// D6: what the rule would file each deal as, beside what a person filed it as.
//
// The owner's ruling of 2026-08-31 - SUGGEST, applied one deal at a time - and
// it is the only ruling that lets this page exist. forecast.ts recorded the
// decoupling decision in batch 1: deriving the category from the stage would
// delete the judgement the forecast review exists to capture. A SECOND OPINION
// does the opposite - it makes that judgement legible, by giving it something
// to be a judgement against.
//
// ONE DOMAIN, so no composition here. Everything the rule reads - stage,
// probability, close date, and the stage journal rolled up - is D6's own.
//
// TWO GATES, DELIBERATELY DIFFERENT. `pipeline.view` renders the page;
// `pipeline.forecast.categorize` is what the apply button needs, and the
// catalog withholds it from a rep who owns the deal. So a rep sees the rule
// disagreeing with them and cannot quietly make that go away - which is the
// arrangement a forecast review depends on.

export const dynamic = "force-dynamic";

export default async function ForecastPage() {
  const { FORECAST_LABEL, FORECAST_RULE_TEXT, LOAD_ERROR, SHELL_TEXT } = await getMessages();
  const session = await resolveAppSession();
  if (!session) {
    return (
      <EmptyState
        title={SHELL_TEXT.signedOutTitle}
        description={SHELL_TEXT.signedOutDescription}
      />
    );
  }

  const preview = await previewCategories({
    workspaceId: session.workspaceId,
    sub: session.user.sub,
    holder: session.authz,
    entitlement: session.entitlement,
    store: session.stores.pipeline(),
  });

  if (!preview.ok) {
    return (
      <EmptyState
        title={SHELL_TEXT.loadFailed}
        description={loadFailureText(preview.violations, LOAD_ERROR)}
      />
    );
  }

  const rows: ForecastRow[] = preview.value.map((p) => ({
    opportunityId: p.opportunity.id,
    opportunityNo: p.opportunity.opportunityNo,
    dealName: p.opportunity.name,
    filed: p.opportunity.forecastCategory,
    suggested: p.verdict.kind === "suggested" ? p.verdict.category : null,
    // A settled deal has no opinion to disagree with, so it reads as agreeing
    // rather than as a row demanding attention.
    agrees: p.verdict.kind === "suggested" ? p.verdict.agrees : true,
    probability:
      p.verdict.kind === "suggested" ? p.verdict.basis.probability : 0,
    probabilityIsHuman:
      p.verdict.kind === "suggested"
        ? p.verdict.basis.probabilityIsHuman
        : false,
    caps: p.verdict.kind === "suggested" ? p.verdict.basis.caps : [],
    daysAtStage: p.daysAtStage,
    amount: p.opportunity.amount?.amount ?? null,
  }));

  const stats = forecastStats(rows);
  const disputed = stats.optimistic.count + stats.conservative.count;
  // THE BREAKDOWN IS THE FORECAST ITSELF - how much sits at each category -
  // which is the question this page's readers arrive with. Which deal is what
  // the list below answers, row by row.
  const stats$: HeadlineStat[] = stats.byCategory.map((b) => ({
    key: b.key,
    name: FORECAST_LABEL[b.key as keyof typeof FORECAST_LABEL] ?? b.key,
    value: b.amount,
    note: FORECAST_RULE_TEXT.forecastStatCount(b.count),
  }));

  const canApply = can(
    session.authz,
    session.entitlement,
    "pipeline.forecast.categorize",
    "ui",
  ).allowed;

  return (
    <ViewLayout>
      <ModuleHeadline
        moduleKey="forecastRule"
        description={FORECAST_RULE_TEXT.why}
        tags={
          <>
            {disputed > 0 ? (
              <StatusBadge tone="warning">
                {FORECAST_RULE_TEXT.tagForecastDisputed(disputed)}
              </StatusBadge>
            ) : null}
            {stats.optimistic.count > 0 ? (
              <StatusBadge tone="danger">
                {FORECAST_RULE_TEXT.tagForecastOptimistic(stats.optimistic.count)}
              </StatusBadge>
            ) : null}
          </>
        }
        stats={stats$}
        emptyNote={FORECAST_RULE_TEXT.forecastStatEmpty}
      />

      {/* 统计为主，列表为具体清单 (owner, 2026-09-06) - both computed from the
          SAME rows, so the block and the list cannot disagree. */}
      <ForecastAnalysis stats={stats} />

      <ForecastRoster rows={rows} canApply={canApply} onApply={applySuggestedCategory} />
    </ViewLayout>
  );
}
