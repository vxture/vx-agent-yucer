import {
  EmptyState,
  Section,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@vxture/design-ui";
import { getMessages } from "../lib/i18n/server";
import { resolveLocale } from "../lib/i18n/locale";
import { formatMoney } from "../lib/view-model";
import { loadFailureText } from "../lib/load-failure";
import {
  ForecastRoster,
  type ForecastRow,
} from "../components/forecast-roster";
import { ForecastAnalysis } from "../components/forecast-analysis";
import { ForecastUnverified } from "../components/forecast-unverified";
import { ForecastTrajectory } from "../components/forecast-trajectory";
import { ForecastChange } from "../components/forecast-change";
import { forecastStats } from "../../domains/pipeline/lib/forecast-stats";
import { forecastSnapshotPoint } from "../../domains/pipeline/lib/forecast";
import { applySuggestedCategory } from "../forecast/actions";
import { loadForecastWorkspace } from "./board";
import { ForecastSnapshotBasis } from "../components/forecast-snapshot-basis";
import { snapshotKey } from "../lib/attainment-progress";
import { attainmentHref } from "../lib/attainment-workspace";
import Link from "next/link";
import businessLinks from "../components/business-reference.module.css";
import styles from "./workspace.module.css";
import { moneyScale } from "./format";
import { Numeric } from "./widgets";
import { attainmentCopy } from "./copy";

export async function AttainmentForecastView({
  period,
  scopeKey,
  view,
  canApply,
  snapshot,
  selectionScope,
  canPlan,
  canViewTarget,
  planRevision,
}: {
  readonly period: string;
  readonly scopeKey: string;
  readonly view: "review" | "history";
  readonly canApply: boolean;
  readonly snapshot?: string | null;
  readonly selectionScope: string;
  readonly canPlan: boolean;
  readonly canViewTarget: boolean;
  readonly planRevision?: string | null;
}) {
  const board = await loadForecastWorkspace(period, scopeKey);
  if (!board) return null;
  const {
    ATTAINMENT_TEXT: { workspace: T },
    SHELL_TEXT,
    LOAD_ERROR,
    PIPELINE_TEXT,
    PLAN_VERSION_TEXT: VT,
    ATTAINMENT_PLAN_TEXT: PT,
    ATTAINMENT_DEPLOYMENT_TEXT: D,
  } = await getMessages();
  const locale = await resolveLocale(),
    copy = attainmentCopy(locale);
  if (!board.ok)
    return (
      <EmptyState
        title={SHELL_TEXT.loadFailed}
        description={loadFailureText(board.violations, LOAD_ERROR)}
      />
    );
  const money = (n: number) =>
    board.score.ok
      ? formatMoney(n, board.score.value.current.closedAmount.currency, locale)
      : String(n);
  if (view === "review") {
    const rows: ForecastRow[] = board.inView.map((p) => ({
      opportunityId: p.opportunity.id,
      opportunityNo: p.opportunity.opportunityNo,
      dealName: p.opportunity.name,
      filed: p.opportunity.forecastCategory,
      suggested: p.verdict.kind === "suggested" ? p.verdict.category : null,
      agrees: p.verdict.kind !== "suggested" || p.verdict.agrees,
      probability:
        p.verdict.kind === "suggested" ? p.verdict.basis.probability : 0,
      probabilityIsHuman:
        p.verdict.kind === "suggested" && p.verdict.basis.probabilityIsHuman,
      caps: p.verdict.kind === "suggested" ? p.verdict.basis.caps : [],
      daysAtStage: p.daysAtStage,
      amount: p.opportunity.amount?.amount ?? null,
    }));
    return (
      <>
        {!board.score.ok ? (
          <EmptyState
            title={SHELL_TEXT.loadFailed}
            description={loadFailureText(board.score.violations, LOAD_ERROR)}
          />
        ) : (
          <>
            {board.unverified ? (
              <ForecastUnverified
                blocks={board.unverified}
                labels={{
                  commit: PIPELINE_TEXT.tCommit,
                  best_case: PIPELINE_TEXT.tBestCase,
                }}
                wan={money}
              />
            ) : null}
            <ForecastAnalysis stats={forecastStats(rows)} />
          </>
        )}
        <ForecastRoster
          key={`${period}|${scopeKey}`}
          rows={rows}
          canApply={canApply}
          onApply={applySuggestedCategory}
        />
      </>
    );
  }
  const selected = snapshot
    ? board.points.find((p) => snapshotKey(p) === snapshot)
    : board.points.at(-1);
  if (snapshot && !selected) return <EmptyState title={PT.historyMissing} />;
  return (
    <>
      <ForecastSnapshotBasis
        snapshot={
          selected ? forecastSnapshotPoint(selected, canViewTarget) : null
        }
        period={period}
        canPlan={canPlan}
      />
      {!board.history.ok ? (
        <EmptyState
          title={SHELL_TEXT.loadFailed}
          description={loadFailureText(board.history.violations, LOAD_ERROR)}
        />
      ) : board.score.ok ? (
        <ForecastTrajectory
          points={board.points.map((p) => ({
            snapshotKey: snapshotKey(p),
            at: p.snapshotAt.toISOString().slice(0, 10),
            commit: p.commitAmount.amount,
            bestCase: p.bestCaseAmount.amount,
            pipeline: p.pipelineAmount.amount,
            closed: p.closedAmount.amount,
            call: p.callAmount?.amount ?? null,
          }))}
          wan={money}
          accuracy={
            board.score.ok
              ? {
                  accuracy: board.score.value.accuracy,
                  attainment: board.score.value.attainment,
                  settled: board.score.value.settled,
                  hasOpening: board.score.value.opening !== null,
                  callAccuracy: board.score.value.call?.accuracy ?? null,
                }
              : undefined
          }
        />
      ) : null}
      {!board.score.ok ? (
        <EmptyState
          title={SHELL_TEXT.loadFailed}
          description={loadFailureText(board.score.violations, LOAD_ERROR)}
        />
      ) : null}
      {board.score.ok && board.change?.ok ? (
        <ForecastChange
          change={
            board.change.value
              ? {
                  since: board.change.value.since,
                  blocks: [
                    { key: "commit", change: board.change.value.commit },
                    { key: "bestCase", change: board.change.value.bestCase },
                  ],
                }
              : null
          }
          labels={{
            commit: PIPELINE_TEXT.tCommit,
            bestCase: PIPELINE_TEXT.tBestCase,
          }}
          wan={money}
        />
      ) : null}
      <Section icon="archive" title={D.history}>
        {!board.history.ok ? null : board.points.length === 0 ? (
          <EmptyState title={T.noHistory} description={T.noHistoryHint} />
        ) : (
          <Table className={styles.table}>
            <TableHeader>
              <TableRow>
                <TableHead>{copy.number}</TableHead>
                {[
                  T.snapshotAt,
                  `${T.commit} (${moneyScale(locale, board.score.ok ? board.score.value.current.closedAmount.currency : "CNY").label})`,
                  T.bestCase,
                  T.pipeline,
                  T.publishedClosed,
                  T.managerCall,
                  T.callNote,
                  VT.historyTarget,
                ].map((label) => (
                  <TableHead key={label} className="text-center">
                    {label}
                  </TableHead>
                ))}
                <TableHead>{copy.action}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {[...board.points].reverse().map((p, i) => (
                <TableRow
                  key={snapshotKey(p)}
                  className={
                    selected && snapshotKey(selected) === snapshotKey(p)
                      ? "bg-accent"
                      : undefined
                  }
                >
                  <TableCell>{i + 1}</TableCell>
                  <TableCell className="whitespace-nowrap text-center tabular-nums">
                    <time dateTime={p.snapshotAt.toISOString()}>
                      {p.snapshotAt.toLocaleString(locale)}
                    </time>
                  </TableCell>
                  {[
                    p.commitAmount,
                    p.bestCaseAmount,
                    p.pipelineAmount,
                    p.closedAmount,
                  ].map((amount, index) => (
                    <TableCell
                      key={index}
                      className="whitespace-nowrap text-right tabular-nums"
                    >
                      <Numeric
                        value={amount.amount}
                        currency={amount.currency}
                      />
                    </TableCell>
                  ))}
                  <TableCell className="whitespace-nowrap text-right tabular-nums">
                    <Numeric
                      value={p.callAmount?.amount ?? null}
                      currency={p.callAmount?.currency}
                    />
                  </TableCell>
                  <TableCell>
                    <span
                      className="line-clamp-2"
                      title={p.callNote ?? undefined}
                    >
                      {p.callNote ?? "-"}
                    </span>
                  </TableCell>
                  <TableCell className="text-body">
                    {(() => {
                      const b = p.targetBasis?.find(
                        (b) => b.metric === "revenue",
                      );
                      if (!b)
                        return (
                          <span className="text-muted-foreground">
                            {VT.legacyBasis}
                          </span>
                        );
                      if (b.sourceKind === "none" || b.target === null)
                        return (
                          <span className="text-muted-foreground">
                            {VT.noneBasis}
                          </span>
                        );
                      const target = Number(b.target);
                      return (
                        <>
                          <span>
                            {b.sourceKind === "sales_plan"
                              ? `V${b.version}`
                              : VT.original}{" "}
                            {"\u00b7 "}
                            {formatMoney(
                              target,
                              b.currency ?? p.currency,
                              locale,
                            )}
                          </span>
                          <p className="text-label-small text-muted-foreground">
                            {target > 0 && b.currency === p.currency
                              ? `${((p.closedAmount.amount / target) * 100).toFixed(1)}%`
                              : VT.notApplicable}
                          </p>
                        </>
                      );
                    })()}
                  </TableCell>
                  <TableCell>
                    <Link
                      className={businessLinks.textLink}
                      href={attainmentHref({
                        period,
                        scope: selectionScope,
                        view: "history",
                        snapshot: snapshotKey(p),
                        planRevision,
                      })}
                    >
                      {copy.details}
                    </Link>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Section>
    </>
  );
}
