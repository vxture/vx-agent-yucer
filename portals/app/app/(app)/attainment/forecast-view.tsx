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

export async function AttainmentForecastView({
  period,
  scopeKey,
  view,
  canApply,
  snapshot,
  selectionScope,
  canPlan,
  canViewTarget,
}: {
  readonly period: string;
  readonly scopeKey: string;
  readonly view: "review" | "history";
  readonly canApply: boolean;
  readonly snapshot?: string | null;
  readonly selectionScope: string;
  readonly canPlan: boolean;
  readonly canViewTarget: boolean;
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
  } = await getMessages();
  const locale = await resolveLocale();
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
        <p className="text-body-small text-muted-foreground">{T.reviewHint}</p>
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
      <p className="text-body-small text-muted-foreground">{T.historyHint}</p>
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
      <Section icon="archive" title={T.historyTitle}>
        {!board.history.ok ? null : board.points.length === 0 ? (
          <EmptyState title={T.noHistory} description={T.noHistoryHint} />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                {[
                  T.snapshotAt,
                  T.commit,
                  T.bestCase,
                  T.pipeline,
                  T.publishedClosed,
                  T.managerCall,
                  T.callNote,
                  VT.historyTarget,
                ].map((label) => (
                  <TableHead key={label}>{label}</TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {[...board.points].reverse().map((p) => (
                <TableRow
                  key={snapshotKey(p)}
                  className={
                    selected && snapshotKey(selected) === snapshotKey(p)
                      ? "bg-accent"
                      : undefined
                  }
                >
                  <TableCell className="whitespace-nowrap tabular-nums">
                    <Link
                      className="no-underline transition-colors hover:text-primary-text"
                      href={attainmentHref({
                        period,
                        scope: selectionScope,
                        view: "history",
                        snapshot: snapshotKey(p),
                      })}
                    >
                      {p.snapshotAt.toLocaleString(locale, { timeZone: "UTC" })}{" "}
                      UTC
                    </Link>
                  </TableCell>
                  {[
                    p.commitAmount,
                    p.bestCaseAmount,
                    p.pipelineAmount,
                    p.closedAmount,
                  ].map((amount, index) => (
                    <TableCell
                      key={index}
                      className="whitespace-nowrap tabular-nums"
                    >
                      {formatMoney(amount.amount, amount.currency, locale)}
                    </TableCell>
                  ))}
                  <TableCell className="whitespace-nowrap tabular-nums">
                    {p.callAmount
                      ? formatMoney(
                          p.callAmount.amount,
                          p.callAmount.currency,
                          locale,
                        )
                      : "-"}
                  </TableCell>
                  <TableCell>{p.callNote ?? "-"}</TableCell>
                  <TableCell className="text-body-small">
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
                            ·{" "}
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
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Section>
    </>
  );
}
