import { EmptyState, StatusBadge, ViewLayout } from "@vxture/design-ui";
import { resolveAppSession } from "../lib/session";
import { getMessages } from "../lib/i18n/server";
import { can } from "../../authz/decide";
import { getCatalogStore, getPlanningStore } from "../../domains/shared/registry";
import { forecastHistory, forecastScorecard, previewCategories } from "../../domains/pipeline/service";
import { inPeriod, inScope } from "../../domains/pipeline/lib/forecast";
import { listTerritories } from "../../domains/planning/service";
import { ForecastTrajectory } from "../components/forecast-trajectory";
import { SubmitForecast } from "../components/submit-forecast";
import { submitForecastSnapshot } from "../pipeline/forecast-action";
import { PeriodTabs } from "../components/period-tabs";
import { ForecastScopePicker } from "../components/forecast-scope-picker";
import { PERIODS, PERIOD_YEAR, resolvePeriod } from "../lib/periods";
import { forecastScopeKey, parseForecastScope } from "../lib/forecast-scope";
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
//
// 预测检视台 (deal batch 9a, YC-069 section 11): EVERYTHING ABOUT THE FORECAST
// ON ONE PAGE. The trajectory, the period and scope, the accuracy and the
// snapshot submit lived on /pipeline, under a board that answers a different
// question; they are here now, and the period and scope govern the whole page
// - the category figures and the list as well as the series. /pipeline keeps
// one line: this quarter's commit and its move since the last snapshot,
// linking here.

export const dynamic = "force-dynamic";

export default async function ForecastPage({
  searchParams,
}: {
  searchParams: Promise<{ period?: string; scope?: string }>;
}) {
  const { FORECAST_LABEL, FORECAST_RULE_TEXT, LOAD_ERROR, SHELL_TEXT, BOARD_TEXT, PIPELINE_TEXT } = await getMessages();
  const params = await searchParams;
  const period = resolvePeriod(params.period);
  const scope = parseForecastScope(params.scope);
  const scopeKey = forecastScopeKey(scope);
  const session = await resolveAppSession();
  if (!session) return null;
  // Unreachable: (app)/layout.tsx already renders the shared SignIn
  // screen and never mounts this page when there is no session. Kept
  // only because TypeScript needs it to narrow `session` below.

  const ctx = {
    workspaceId: session.workspaceId,
    sub: session.user.sub,
    holder: session.authz,
    entitlement: session.entitlement,
    store: session.stores.pipeline(),
  };
  const [preview, history, score, territories] = await Promise.all([
    previewCategories(ctx),
    // The series, not the latest point - the only reader that makes
    // forecast_snapshot's immutability pay for itself.
    forecastHistory(ctx, period, scope),
    forecastScorecard({ ...ctx, catalog: getCatalogStore() }, period, { scope }),
    listTerritories({ ...ctx, store: getPlanningStore() }),
  ]);

  if (!preview.ok) {
    return (
      <EmptyState
        title={SHELL_TEXT.loadFailed}
        description={loadFailureText(preview.violations, LOAD_ERROR)}
      />
    );
  }

  // THE PERIOD AND SCOPE GOVERN THE LIST TOO. The same two rules the snapshot
  // applies (inPeriod: an open deal by its expected close, a closed one by its
  // close; inScope: territory or owner), so the figures here and the point a
  // snapshot would record describe the same deals.
  const all = preview.value.map((p) => p.opportunity);
  const windowed = inPeriod(all, period);
  const kept = new Set(inScope(windowed ? windowed.kept : all, scope).map((o) => o.id));
  const inView = preview.value.filter((p) => kept.has(p.opportunity.id));
  // Owners from the whole book, not the window: an owner with nothing this
  // quarter is still one somebody may want to look at this quarter for.
  const ownerOptions = [...new Set(all.map((o) => o.ownerSub).filter((o): o is string => !!o))].sort((a, b) =>
    a.localeCompare(b),
  );
  const territoryOptions = territories.ok ? territories.value.map((t) => ({ id: t.id, name: t.name })) : [];
  const points = history.ok ? history.value : [];

  const rows: ForecastRow[] = inView.map((p) => ({
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
        action={<PeriodTabs value={period} periods={PERIODS} yearLabel={PERIOD_YEAR} />}
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

      {/* The series for this period and scope, its accuracy, and the snapshot
          submit - moved here from /pipeline (batch 9a). */}
      <ForecastTrajectory
        points={points.map((p) => ({
          at: p.snapshotAt.toISOString().slice(5, 10),
          commit: p.commitAmount.amount,
          bestCase: p.bestCaseAmount.amount,
          pipeline: p.pipelineAmount.amount,
          closed: p.closedAmount.amount,
          call: p.callAmount?.amount ?? null,
        }))}
        wan={BOARD_TEXT.wan}
        scopePicker={<ForecastScopePicker value={scopeKey} territories={territoryOptions} owners={ownerOptions} />}
        /* Absent when the read failed, rather than shown as zero. */
        accuracy={
          score.ok
            ? {
                accuracy: score.value.accuracy,
                attainment: score.value.attainment,
                settled: score.value.settled,
                hasOpening: score.value.opening !== null,
                callAccuracy: score.value.call?.accuracy ?? null,
              }
            : undefined
        }
        submit={
          <SubmitForecast
            period={period}
            scopeKey={scopeKey}
            canSubmit={can(session.authz, session.entitlement, "pipeline.forecast.snapshot", "ui").allowed}
            computed={
              score.ok
                ? [
                    { key: "commit", label: PIPELINE_TEXT.tCommit, amount: score.value.current.commitAmount.amount },
                    { key: "bestCase", label: PIPELINE_TEXT.tBestCase, amount: score.value.current.bestCaseAmount.amount },
                    { key: "pipeline", label: PIPELINE_TEXT.tPipeline, amount: score.value.current.pipelineAmount.amount },
                    { key: "closed", label: PIPELINE_TEXT.tClosed, amount: score.value.current.closedAmount.amount },
                  ]
                : []
            }
            onSubmit={submitForecastSnapshot}
          />
        }
      />

      {/* 统计为主，列表为具体清单 (owner, 2026-09-06) - both computed from the
          SAME rows, so the block and the list cannot disagree. */}
      <ForecastAnalysis stats={stats} />

      <ForecastRoster rows={rows} canApply={canApply} onApply={applySuggestedCategory} />
    </ViewLayout>
  );
}
