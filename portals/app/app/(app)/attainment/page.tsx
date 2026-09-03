import {
  Card,
  EmptyState,
  Progress,
  StatusBadge,
  ViewHeader,
  ViewLayout,
} from "@vxture/design-ui";
import { resolveAppSession } from "../lib/session";
import { getMessages } from "../lib/i18n/server";
import {
  getCatalogStore,
  getPipelineStore,
  getPlanningStore,
} from "../../domains/shared/registry";
import { listPipeline } from "../../domains/pipeline/service";
import { attainment, listTargets } from "../../domains/planning/service";
import {
  listOpportunityLines,
  listProducts,
} from "../../domains/catalog/service";
import { summaryTarget } from "../../domains/planning/lib/target";
import { inPeriod, rollUp } from "../../domains/pipeline/lib/forecast";
import {
  coverage,
  resolveCoverageFloor,
} from "../../domains/planning/lib/coverage";
import { byProduct } from "../../domains/catalog/lib/pricing";
import { loadFailureText } from "../lib/load-failure";

// 承诺达成 - the assault objective (owner ruling, 2026-08-31).
//
// THE KEY IS `attainment`, NOT `commitment`, and the mismatch with the label is
// deliberate. `commitment` is taken: account/lib/commitment.ts, listCommitments
// and runCommitmentSweep all mean a PROMISE somebody made - 我方承诺 /
// 对方承诺 / 逾期承诺. A module key repeating that word next to them would give
// the codebase two meanings for one term, which CLAUDE.md's vocabulary rule
// exists to prevent ("check the word is not already taken before writing it
// down"). The Chinese label survives because 承诺 is also the forecast category
// `commit`, and 承诺达成 reads against that sense - the same one /pipeline
// already uses in 本季承诺.
//
// THREE READINGS THAT WERE HOMELESS. The quarter's attainment, the coverage
// behind the gap, and what the commitment is made of each sat on the navigation
// board as a card belonging to no module - so when the nav became "the queue,
// then this domain's modules", they had nowhere to be. The ruling is that they
// were never three things: they are one question asked three ways, and it
// deserves a module rather than three floating cards.
//
// FIRST IN 阵地经营域, before accounts and deals. The objective comes before
// the ground: what the period promised and how much has landed is what a person
// is measured on; accounts and deals are how it gets done.
//
// EVERY FIGURE IS THIS PERIOD'S. The pool is filtered to the target's own
// period before being divided by that period's gap - a deal expected in
// December does not cover a September shortfall, and counting it made the
// coverage ratio report a pool that could not do the job it was measured
// against (TD-014, reached by a different route).
//
// NO TARGET IS NOT ZERO ATTAINMENT. Without a committed workspace target there
// is no denominator, so the page says so instead of rendering 0% - which would
// report an unset quota as a missed one.

export const dynamic = "force-dynamic";

export default async function AttainmentPage() {
  const {
    SHELL_TEXT,
    LOAD_ERROR,
    BOARD_TEXT,
    ATTAINMENT_TEXT,
    FORECAST_LABEL,
  } = await getMessages();
  const session = await resolveAppSession();
  if (!session) {
    return (
      <EmptyState
        title={SHELL_TEXT.signedOutTitle}
        description={SHELL_TEXT.signedOutDescription}
      />
    );
  }

  const base = {
    workspaceId: session.workspaceId,
    sub: session.user.sub,
    holder: session.authz,
    entitlement: session.entitlement,
  };

  const [deals, targets, lineResult, productResult] = await Promise.all([
    listPipeline({ ...base, store: session.stores.pipeline() }),
    listTargets({ ...base, store: getPlanningStore() }),
    listOpportunityLines({ ...base, store: getCatalogStore() }),
    listProducts({ ...base, store: getCatalogStore() }),
  ]);

  if (!deals.ok) {
    return (
      <EmptyState
        title={SHELL_TEXT.loadFailed}
        description={loadFailureText(deals.violations, LOAD_ERROR)}
      />
    );
  }

  const open = deals.value.filter((d) => d.closedAt === null);

  // The MONEY target, via the shared rule - the same selection the board and
  // the planning page make. A committed new-logo target picked up here would
  // render "10 customers" as 10 wan and divide a pipeline by it (TD-013).
  const wsTarget = targets.ok
    ? (summaryTarget(targets.value) ?? undefined)
    : undefined;
  const rows = wsTarget
    ? await attainment({ ...base, store: getPlanningStore() }, wsTarget.period)
    : null;
  const wsRow = rows?.ok
    ? rows.value.find((r) => r.target.id === wsTarget?.id)
    : undefined;

  const measured =
    wsRow?.measurement.kind === "measured" && wsRow.measurement.ratio !== null
      ? wsRow.measurement
      : null;

  // NO FALLBACK TO THE UNFILTERED LIST. A target whose period this product
  // cannot parse gets no gauge rather than a pool measured over the whole book.
  const window = wsTarget ? inPeriod(open, wsTarget.period) : null;
  const quarterOpen = window ? window.kept : [];
  // rollUp returns a RuleResult - a refusal degrades to no pool card rather
  // than a card of zeros.
  const rolled = window ? rollUp(quarterOpen) : null;
  const totals = rolled?.ok ? rolled.value : null;
  const quarterWorth = quarterOpen.reduce(
    (sum, d) => sum + (d.amount?.amount ?? 0),
    0,
  );

  const cover =
    wsTarget && wsRow
      ? coverage(
          quarterWorth,
          wsTarget.targetValue.amount,
          wsRow.measurement.kind === "measured"
            ? wsRow.measurement.achieved.amount
            : 0,
          resolveCoverageFloor(process.env.YUCER_COVERAGE_FLOOR),
        )
      : null;

  // The composition claims no period and must not acquire one: it answers
  // "what is this money made of", over the open book.
  const openIds = new Set(open.map((o) => o.id));
  const lines = lineResult.ok
    ? lineResult.value.filter((l) => openIds.has(l.opportunityId))
    : [];
  const products = productResult.ok ? productResult.value : [];
  const split = [...byProduct(lines)]
    .sort((a, b) => b[1].amount - a[1].amount)
    .map(([id, agg]) => ({
      name: products.find((p) => p.id === id)?.name ?? id,
      amount: agg.amount,
    }));
  const splitTotal = split.reduce((sum, s) => sum + s.amount, 0);

  const pct =
    measured !== null
      ? Math.max(0, Math.min(100, Math.round((measured.ratio ?? 0) * 100)))
      : null;

  return (
    <ViewLayout>
      <ViewHeader
        title={ATTAINMENT_TEXT.title}
        description={ATTAINMENT_TEXT.why}
      />
      <Card className="p-lg">
        <div className="flex flex-col gap-md">
          {wsTarget && measured && pct !== null ? (
            <div className="flex flex-col gap-sm">
              <div className="flex flex-wrap items-baseline gap-x-xl gap-y-xs">
                <Figure
                  value={`${pct}%`}
                  label={ATTAINMENT_TEXT.attained}
                  emphasis
                />
                <Figure
                  value={BOARD_TEXT.wan(measured.achieved.amount)}
                  label={ATTAINMENT_TEXT.won}
                />
                <Figure
                  value={BOARD_TEXT.wan(wsTarget.targetValue.amount)}
                  label={ATTAINMENT_TEXT.target}
                />
              </div>
              {/* Bare track. The percentage it represents is the figure above
                  it, so a caption here would print the same number twice. */}
              <Progress value={pct} />
            </div>
          ) : (
            <EmptyState
              title={ATTAINMENT_TEXT.noTarget}
              description={ATTAINMENT_TEXT.noTargetWhy}
            />
          )}
        </div>
      </Card>

      {/* THE POOL, and it only appears with a ratio behind it. `cover.ratio`
          is null when the target is already met - there is no coverage question
          left, and Infinity would render. */}
      {wsTarget && cover && cover.ratio !== null && totals ? (
        <Card className="p-lg">
          <div className="flex flex-col gap-md">
            <div>
              <h2 className="text-heading-4 text-foreground">
                {ATTAINMENT_TEXT.pool(wsTarget.period)}
              </h2>
              <p className="text-muted-foreground mt-2xs text-body-sm">
                {ATTAINMENT_TEXT.poolWhy}
              </p>
            </div>

            <div className="flex flex-wrap items-baseline gap-x-xl gap-y-xs">
              <Figure
                value={BOARD_TEXT.wan(quarterWorth)}
                label={wsTarget.period}
                emphasis
              />
              <span className="flex items-baseline gap-2xs">
                <span className="text-label-md text-foreground font-semibold tabular-nums">
                  {BOARD_TEXT.coverageOf(
                    Math.round(
                      (quarterWorth / (cover.gap * cover.floor)) * 100,
                    ),
                  )}
                </span>
                {cover.thin ? (
                  <StatusBadge tone="warning">
                    {ATTAINMENT_TEXT.thin}
                  </StatusBadge>
                ) : null}
              </span>
            </div>

            {/* Descending confidence: what is committed, what is being worked,
                what is merely held. The ORDER is the meaning, so it is fixed
                rather than sorted by size. */}
            <div className="flex flex-col gap-2xs">
              {[
                {
                  label: FORECAST_LABEL.commit,
                  amount: totals.commitAmount.amount,
                },
                {
                  label: FORECAST_LABEL.best_case,
                  amount: totals.bestCaseAmount.amount,
                },
                {
                  label: FORECAST_LABEL.pipeline,
                  amount: totals.pipelineAmount.amount,
                },
              ].map((row) => (
                <Bar
                  key={row.label}
                  label={row.label}
                  value={BOARD_TEXT.wan(row.amount)}
                  pct={quarterWorth > 0 ? (row.amount / quarterWorth) * 100 : 0}
                />
              ))}
            </div>
          </div>
        </Card>
      ) : null}

      <Card className="p-lg">
        <div className="flex flex-col gap-md">
          <div>
            <h2 className="text-heading-4 text-foreground">
              {ATTAINMENT_TEXT.composition}
            </h2>
            <p className="text-muted-foreground mt-2xs text-body-sm">
              {ATTAINMENT_TEXT.compositionWhy}
            </p>
          </div>
          {split.length === 0 ? (
            <p className="text-muted-foreground text-body-sm">
              {ATTAINMENT_TEXT.noComposition}
            </p>
          ) : (
            <div className="flex flex-col gap-2xs">
              {split.map((s) => (
                <Bar
                  key={s.name}
                  label={s.name}
                  value={BOARD_TEXT.wan(s.amount)}
                  pct={splitTotal > 0 ? (s.amount / splitTotal) * 100 : 0}
                />
              ))}
            </div>
          )}
        </div>
      </Card>
    </ViewLayout>
  );
}

function Figure({
  value,
  label,
  emphasis,
}: {
  value: string;
  label: string;
  emphasis?: boolean;
}) {
  return (
    <span className="flex items-baseline gap-2xs">
      <span
        className={[
          "text-foreground tabular-nums",
          emphasis ? "text-heading-2" : "text-heading-4",
        ].join(" ")}
      >
        {value}
      </span>
      <span className="text-muted-foreground text-body-sm">{label}</span>
    </span>
  );
}

/**
 * One magnitude on a shared scale.
 *
 * The bar is drawn from the SHARE of the total rather than from an absolute
 * width, so the three confidence rows and the product lines are each read
 * against their own whole - which is the only comparison either set supports.
 */
function Bar({
  label,
  value,
  pct,
}: {
  label: string;
  value: string;
  pct: number;
}) {
  return (
    <div className="flex items-center gap-sm">
      <span className="text-muted-foreground w-24 shrink-0 truncate text-body-sm">
        {label}
      </span>
      <span className="bg-muted h-2xs min-w-0 flex-1 overflow-hidden rounded-full">
        <span
          className="bg-primary block h-full rounded-full"
          style={{ width: `${Math.max(0, Math.min(100, pct))}%` }}
        />
      </span>
      <span className="text-foreground w-20 shrink-0 text-right text-body-sm tabular-nums">
        {value}
      </span>
    </div>
  );
}
