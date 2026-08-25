import {
  Card,
  EmptyState,
  SectionHeader,
  StatusBadge,
  ViewLayout,
} from "@vxture/design-ui";
import { resolveAppSession } from "../lib/session";
import { ForecastTrajectory } from "../components/forecast-trajectory";
import { PeriodTabs } from "../components/period-tabs";
import { HeadlineCard } from "../components/headline-card";
import { getCatalogStore } from "../../domains/shared/registry";
import { byProduct } from "../../domains/catalog/lib/pricing";
import { PipelineBoard, type PipelineRow } from "../components/pipeline-board";
import { getPipelineStore } from "../../domains/shared/registry";
import {
  forecastHistory,
  listPendingReviews,
  listPipeline,
} from "../../domains/pipeline/service";
import { can } from "../../authz/decide";
import { PendingReviews } from "../components/pending-reviews";
import { recordReview } from "./winloss-action";

import { getMessages } from "../lib/i18n/server";
import { PERIODS, PERIOD_YEAR, resolvePeriod } from "../lib/periods";
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
  const { BOARD_TEXT, PIPELINE_TEXT, SHELL_TEXT } = await getMessages();
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

  const [result, pendingReviews, history, lines, products] = await Promise.all([
    // includeClosed, or the "closed" tile reports zero on a workspace that has
    // closed 2.7M - the same false zero that hit the quota card, in a third
    // place. The board rolls all four categories from this one list, and a
    // closed deal is precisely what the closed category counts.
    listPipeline(ctx, { includeClosed: true }),
    listPendingReviews(ctx),
    // The series, not the latest point. See forecastHistory: this read is the
    // only thing that makes forecast_snapshot's immutability pay for itself.
    forecastHistory(ctx, period),
    getCatalogStore().allLines(session.workspaceId),
    getCatalogStore().listProducts(session.workspaceId),
  ]);

  if (!result.ok) {
    // The gate's own message, not a generic error: "you need the pro tier" and
    // "something broke" are different things to tell someone.
    return (
      <EmptyState
        title={SHELL_TEXT.loadFailed}
        description={result.violations.map((v) => v.message).join("; ")}
      />
    );
  }

  const rows: PipelineRow[] = result.value.map((o) => ({
    ...o,
    accountName: o.accountName ?? o.accountId,
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
  const openLines = lines.filter((l) => openIds.has(l.opportunityId));
  const split = [...byProduct(openLines)]
    .sort((a, b) => b[1].amount - a[1].amount)
    .map(([id, agg]) => ({
      name: products.find((p) => p.id === id)?.name ?? id,
      amount: agg.amount,
    }));
  const awaiting = openLines.filter((l) => l.needsApproval).length;

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
      <PipelineBoard
        rows={rows}
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
