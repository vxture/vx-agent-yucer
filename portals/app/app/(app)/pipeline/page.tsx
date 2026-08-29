import {
  Card,
  EmptyState,
  SectionHeader,
  StatusBadge,
  ViewLayout,
} from "@vxture/design-ui";
import { resolveAppSession } from "../lib/session";
import { ForecastTrajectory } from "../components/forecast-trajectory";
import { SubmitForecast } from "../components/submit-forecast";
import { submitForecastSnapshot } from "./forecast-action";
import { createDeal } from "./stage-action";
import { PeriodTabs } from "../components/period-tabs";
import { HeadlineCard } from "../components/headline-card";
import { byProduct } from "../../domains/catalog/lib/pricing";
import { PipelineBoard, type PipelineRow } from "../components/pipeline-board";
import {
  getAccountStore,
  getCatalogStore,
  getPipelineStore,
  getPlanningStore,
} from "../../domains/shared/registry";
import { listAccounts } from "../../domains/account/service";
import { listTerritories } from "../../domains/planning/service";
import { NewOpportunity } from "../components/new-opportunity";
import {
  forecastHistory,
  listPendingReviews,
  listPipeline,
} from "../../domains/pipeline/service";
import { inPeriod } from "../../domains/pipeline/lib/forecast";
import { can } from "../../authz/decide";
import { PendingReviews } from "../components/pending-reviews";
import { recordReview } from "./winloss-action";

import { getMessages } from "../lib/i18n/server";
import { PERIODS, PERIOD_YEAR, resolvePeriod } from "../lib/periods";
import {
  listOpportunityLines,
  listProducts as listCatalogProducts,
} from "../../domains/catalog/service";
import { loadFailureText } from "../lib/load-failure";
// D6 pipeline page.
//
// Dynamic, never cached: the rows are workspace-scoped and gate-filtered, and a
// cached render is a render of somebody else's answer.

export const dynamic = "force-dynamic";

/** Where the filter lands when the URL says nothing. Matches the demo's data. */

export default async function PipelinePage({
  searchParams,
}: {
  searchParams: Promise<{ period?: string }>;
}) {
  const { BOARD_TEXT, PIPELINE_TEXT, SHELL_TEXT, LOAD_ERROR } = await getMessages();
  const period = resolvePeriod((await searchParams).period);
  const session = await resolveAppSession();
  if (!session) {
    return (
      <EmptyState
        title={SHELL_TEXT.signedOutTitle}
        description={SHELL_TEXT.signedOutDescription}
      />
    );
  }

  const ctx = {
    workspaceId: session.workspaceId,
    sub: session.user.sub,
    holder: session.authz,
    entitlement: session.entitlement,
    store: getPipelineStore(),
  };
  // Same session, different port. The context carries the store because the
  // gate is decided from the session and the DATA comes from the port - two
  // domains reading the same request need two contexts, not one with a union.
  const catalogCtx = { ...ctx, store: getCatalogStore() };

  const [result, pendingReviews, history, lines, products, accounts, territories] =
    await Promise.all([
    // includeClosed, or the "closed" tile reports zero on a workspace that has
    // closed 2.7M - the same false zero that hit the quota card, in a third
    // place. The board rolls all four categories from this one list, and a
    // closed deal is precisely what the closed category counts.
    listPipeline(ctx, { includeClosed: true }),
    listPendingReviews(ctx),
    // The series, not the latest point. See forecastHistory: this read is the
    // only thing that makes forecast_snapshot's immutability pay for itself.
    forecastHistory(ctx, period),
    // THROUGH THE SERVICE, not the store handle. Both of these used to call
    // getCatalogStore() straight from the page, which skips BOTH gates - the
    // same defect PR #26 fixed on the account detail page. The catalogue read
    // service exists now, so there is no reason left to reach past it.
    listOpportunityLines(catalogCtx),
    listCatalogProducts(catalogCtx),
    // Two cross-domain reads, for the new-deal form's two pickers. Through the
    // services, so both gates run - a page reaching a store handle directly is
    // the defect PR #26 fixed on the account page.
    listAccounts({ ...ctx, store: getAccountStore() }),
    listTerritories({ ...ctx, store: getPlanningStore() }),
  ]);

  if (!result.ok) {
    // The gate's own message, not a generic error: "you need the pro tier" and
    // "something broke" are different things to tell someone.
    return (
      <EmptyState
        title={SHELL_TEXT.loadFailed}
        description={loadFailureText(result.violations, LOAD_ERROR)}
      />
    );
  }

  // THE PERIOD SELECTOR NOW MOVES THE PAGE, not just the trajectory beneath it
  // (TD-014). It shipped controlling only the snapshot series, so switching to
  // 2026Q4 redrew the chart and left the tiles and the table reporting the whole
  // book - a control that appeared to filter and did not.
  //
  // A won deal belongs to the period it closed in, an open one to the period it
  // is expected to close in; `inPeriod` holds that rule. `resolvePeriod` only
  // ever returns a label from `PERIODS`, so the null branch is unreachable here
  // - it is written as a fallback to the unfiltered list rather than a throw,
  // because a page that cannot filter should still render the deals.
  const window = inPeriod(result.value, period);
  const inWindow = window ? window.kept : result.value;
  const undated = window?.undated ?? 0;

  const rows: PipelineRow[] = inWindow.map((o) => ({
    ...(o as (typeof result.value)[number]),
    accountName:
      (o as (typeof result.value)[number]).accountName ??
      (o as (typeof result.value)[number]).accountId,
  }));

  // What the page opens with. The number alone is a label; what it MEANS this
  // week is the delta against the last time anyone forecast - which is exactly
  // what the trajectory is for and what a single tile cannot say.
  const points = history.ok ? history.value : [];
  const last = points[points.length - 1];
  const prev = points[points.length - 2];
  const commit = last?.commitAmount.amount ?? 0;
  const delta = last && prev ? commit - prev.commitAmount.amount : 0;
  const sinceDays =
    last && prev
      ? Math.max(
          1,
          Math.round(
            (last.snapshotAt.getTime() - prev.snapshotAt.getTime()) /
              86_400_000,
          ),
        )
      : 0;

  // Every closed deal, for the review section's "all" scope. Taken from the
  // list already fetched rather than queried again - two reads of the same
  // rows can disagree, and both would be on screen at once.
  const closed = result.value.filter(
    (o) => o.status === "won" || o.status === "lost",
  );

  const openIds = new Set(
    result.value.filter((o) => o.status === "open").map((o) => o.id),
  );
  // The two catalogue reads are gated now, so they return a RuleResult. A
  // refusal degrades to an empty split rather than failing the page: the
  // product breakdown is a decomposition OF the totals above it, and a reader
  // who may see the totals but not the lines should still get the totals.
  const lineRows = lines.ok ? lines.value : [];
  const productRows = products.ok ? products.value : [];
  const openLines = lineRows.filter((l) => openIds.has(l.opportunityId));
  const split = [...byProduct(openLines)]
    .sort((a, b) => b[1].amount - a[1].amount)
    .map(([id, agg]) => ({
      name: productRows.find((p) => p.id === id)?.name ?? id,
      amount: agg.amount,
    }));
  // Signed-off lines are not awaiting anything. A badge that never clears is a
  // badge people stop reading.
  const awaiting = openLines.filter((l) => l.needsApproval && !l.approved).length;

  return (
    <ViewLayout>
      {/* Opens with a statement, the same way the home screen does. A page that
          opens with a noun and a caption makes the reader work out what matters;
          the data already knows. */}
      <HeadlineCard
        split={split}
        awaiting={awaiting}
        headline={
          <div className="min-w-0">
            <h1 className="text-heading-2 text-foreground tabular-nums">
              {PIPELINE_TEXT.lead(BOARD_TEXT.wan(commit))}
            </h1>
            <p className="text-muted-foreground mt-2xs text-body-sm">
              {points.length < 2
                ? PIPELINE_TEXT.leadNoHistory
                : delta === 0
                  ? PIPELINE_TEXT.leadFlat
                  : PIPELINE_TEXT.leadDelta(
                      `${delta > 0 ? "+" : "-"}${BOARD_TEXT.wan(Math.abs(delta))}`,
                      sinceDays,
                    )}
            </p>
          </div>
        }
        /* The page's top-level filter. It governs every figure below, so it
           stays visible in the collapsed state - the fold hides the
           decomposition, not the controls. */
        filter={
          <PeriodTabs
            value={period}
            periods={PERIODS}
            yearLabel={PERIOD_YEAR}
          />
        }
      />

      {/* The gate, not the raw permission. Reading permissions.has() directly
          skips the ENTITLEMENT half entirely, so a workspace whose subscription
          lapsed would still render the board as writable - and the two gates
          are ordered precisely so the tier answer comes first. */}
      {/* ABOVE the board, for the same reason the target form sits above its
          table: on a fresh workspace the board is empty, and a create form
          tucked under a list nobody can populate is a doorway behind a locked
          door. */}
      <NewOpportunity
        accounts={
          accounts.ok ? accounts.value.map((a) => ({ id: a.id, name: a.name })) : []
        }
        territories={
          territories.ok
            ? territories.value.map((t) => ({ id: t.id, name: t.name }))
            : []
        }
        canCreate={
          can(
            session.authz,
            session.entitlement,
            "pipeline.opportunity.create",
            "ui",
          ).allowed
        }
        onCreate={createDeal}
      />

      <PipelineBoard
        rows={rows}
        undated={undated}
        readOnly={
          !can(
            session.authz,
            session.entitlement,
            "pipeline.opportunity.advance",
            "ui",
          ).allowed
        }
      />
      {/* Only rendered when the workspace bought win/loss. The list is the debt
          the "must review on close" rule creates; without it the rule is a
          sentence in a document. */}
      {/* Its own section, after the board it is derived from. */}
      <ForecastTrajectory
        points={points.map((p) => ({
          at: p.snapshotAt.toISOString().slice(5, 10),
          commit: p.commitAmount.amount,
          bestCase: p.bestCaseAmount.amount,
          pipeline: p.pipelineAmount.amount,
          closed: p.closedAmount.amount,
        }))}
        wan={BOARD_TEXT.wan}
        /* The gate is decided HERE and re-decided inside the action: this only
           chooses which control renders. `pipeline.forecast.snapshot`, not
           `pipeline.view` - reading a forecast and committing to one are
           different acts, which is why the permission was split off
           pipeline.write in the first place. */
        submit={
          <SubmitForecast
            period={period}
            canSubmit={
              can(
                session.authz,
                session.entitlement,
                "pipeline.forecast.snapshot",
                "ui",
              ).allowed
            }
            onSubmit={submitForecastSnapshot}
          />
        }
      />

      {pendingReviews.ok ? (
        <PendingReviews
          opportunities={pendingReviews.value}
          allClosed={closed}
          canRecord={
            can(
              session.authz,
              session.entitlement,
              "pipeline.winloss.record",
              "ui",
            ).allowed
          }
          onRecord={recordReview}
        />
      ) : null}
    </ViewLayout>
  );
}
