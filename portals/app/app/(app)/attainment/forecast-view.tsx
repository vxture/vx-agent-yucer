import type { ReactNode } from "react";
import Link from "next/link";
import {
  Button,
  Card,
  EmptyState,
  Icon,
  Section,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@vxture/design-system";
import { getMessages } from "../lib/i18n/server";
import { resolveLocale } from "../lib/i18n/locale";
import { loadFailureText } from "../lib/load-failure";
import type { ForecastRow } from "../components/forecast-roster";
import { loadForecastWorkspace } from "./board";
import { forecastSnapshotPoint } from "../../domains/pipeline/lib/forecast";
import { snapshotAttainment, snapshotKey } from "../lib/attainment-progress";
import { attainmentPageHref } from "../lib/attainment-pages";
import { planningHref } from "../lib/attainment-workspace";
import { Discuss, MetricCard, Numeric } from "./widgets";
import { ForecastWorkbench } from "./forecast-workbench";
import { moneyScale } from "./format";
import { attainmentCopy } from "./copy";
import { selectedDeals } from "../../domains/pipeline/lib/attainment-analysis";
import type { AttainmentAnalysis } from "./analysis-board";
import styles from "./workspace.module.css";
import businessLinks from "../components/business-reference.module.css";

export async function AttainmentForecastView({
  period,
  scopeKey,
  view,
  canApply,
  snapshot,
  selectionScope,
  canPlan,
  canViewTarget,
  analysis,
  submit,
}: {
  period: string;
  scopeKey: string;
  view: "review" | "history";
  canApply: boolean;
  snapshot?: string | null;
  selectionScope: string;
  canPlan: boolean;
  canViewTarget: boolean;
  planRevision?: string | null;
  analysis: AttainmentAnalysis;
  submit?: ReactNode;
}) {
  const board = await loadForecastWorkspace(period, scopeKey);
  if (!board) return null;
  const { SHELL_TEXT, LOAD_ERROR } = await getMessages(),
    locale = await resolveLocale(),
    T = attainmentCopy(locale);
  if (!board.ok)
    return (
      <EmptyState
        title={SHELL_TEXT.loadFailed}
        description={loadFailureText(board.violations, LOAD_ERROR)}
      />
    );
  const currency = board.score.ok
      ? board.score.value.current.closedAmount.currency
      : (analysis.currency ?? "CNY"),
    units = moneyScale(locale, currency),
    format = (n: number | null) =>
      n === null
        ? "\u2014"
        : (n / units.divisor).toLocaleString(locale, {
            maximumFractionDigits: 2,
          });
  const current = board.score.ok ? board.score.value.current : null;
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
    const fields = [
      {
        label: T.revenue,
        key: "closedAmount" as const,
        icon: "coins" as const,
        category: "closed",
      },
      {
        label: T.commit,
        key: "commitAmount" as const,
        icon: "flag" as const,
        category: "commit",
      },
      {
        label: T.bestCase,
        key: "bestCaseAmount" as const,
        icon: "chart-line-up" as const,
        category: "best_case",
      },
      {
        label: T.early,
        key: "pipelineAmount" as const,
        icon: "stack" as const,
        category: "pipeline",
      },
    ];
    return (
      <>
        {!board.score.ok ? (
          <EmptyState
            title={SHELL_TEXT.loadFailed}
            description={loadFailureText(board.score.violations, LOAD_ERROR)}
          />
        ) : null}
        <div className={styles.metrics}>
          {fields.map((f) => {
            const slice = rows.filter((r) => r.filed === f.category),
              count = f.category === "closed"
                ? analysis.deals ? selectedDeals(analysis.deals, selectionScope === "personal" ? `owner:${analysis.self}` : selectionScope, period).filter((d) => d.status === "won").length : null
                : slice.length,
              missing = slice.some((r) => r.amount === null),
              amount = missing ? null : (current?.[f.key].amount ?? null);
            return (
              <MetricCard
                key={f.key}
                label={f.label}
                icon={f.icon}
                value={format(amount)}
                unit={units.label}
                note={`${count ?? "\u2014"} ${T.projectCount}${missing ? ` \u00b7 ${T.unpriced}` : ""}`}
              />
            );
          })}
        </div>
        <ForecastWorkbench rows={rows} data={analysis} canApply={canApply} />
        <Section level={3} title={T.reportReview} icon="file-text">
          <Card className={styles.sectionCard}>
            <dl className={styles.reportFacts}>
              <div>
                <dt>{T.scope}</dt>
                <dd>
                  {selectionScope === "workspace"
                    ? T.companyScope
                    : (analysis.regions.find(
                        (r) => selectionScope === `territory:${r.id}`,
                      )?.name ?? T.selfScope)}
                </dd>
              </div>
              <div>
                <dt>{T.period}</dt>
                <dd>{period}</dd>
              </div>
              <div>
                <dt>{T.targetSource}</dt>
                <dd>
                  {analysis.revision
                    ? `V${analysis.revision.version}`
                    : T.noTarget}
                </dd>
              </div>
              <div>
                <dt>{T.managerCall}</dt>
                <dd>{T.notRecorded}</dd>
              </div>
            </dl>
            <div className={styles.customerFooter}>
              <Link
                className={businessLinks.textLink}
                href={attainmentPageHref("history", period, selectionScope)}
              >
                {T.history}
              </Link>
              {submit}
            </div>
          </Card>
        </Section>
      </>
    );
  }
  if (!board.history.ok)
    return (
      <EmptyState
        title={SHELL_TEXT.loadFailed}
        description={loadFailureText(board.history.violations, LOAD_ERROR)}
      />
    );
  const selected = snapshot
    ? board.points.find((p) => snapshotKey(p) === snapshot)
    : board.points.at(-1);
  if (!selected)
    return <EmptyState title={snapshot ? T.failed : T.noForecast} />;
  const frozen = snapshotAttainment(
      forecastSnapshotPoint(selected, canViewTarget),
    ),
    target = frozen.target,
    basis = frozen.basis;
  const reportUnit = moneyScale(locale, selected.currency),
    reportFormat = (n: number | null) =>
      n === null
        ? "\u2014"
        : (n / reportUnit.divisor).toLocaleString(locale, {
            maximumFractionDigits: 2,
          }),
    same = currency === selected.currency;
  const currentTarget = canViewTarget
    ? (analysis.targets?.find(
        (t) =>
          t.scope ===
            (selectionScope === "personal"
              ? `owner:${analysis.self}`
              : selectionScope) &&
          t.period === period &&
          t.metric === "revenue" &&
          t.currency === selected.currency,
      )?.target ?? null)
    : null;
  const comparisons = [
    {
      label: T.revenue,
      before: selected.closedAmount.amount,
      now: same ? (current?.closedAmount.amount ?? null) : null,
    },
    {
      label: T.commit,
      before: selected.commitAmount.amount,
      now: same ? (current?.commitAmount.amount ?? null) : null,
    },
    {
      label: T.bestCase,
      before: selected.bestCaseAmount.amount,
      now: same ? (current?.bestCaseAmount.amount ?? null) : null,
    },
    { label: T.target, before: target, now: currentTarget },
  ];
  return (
    <>
      <Section level={3} title={T.reportedOverview} icon="file-text">
        <div className={styles.metrics}>
          {[
            {
              label: T.frozenTarget,
              value: target,
              icon: "target" as const,
              note: !canViewTarget
                ? T.denied
                : basis?.sourceKind === "sales_plan"
                  ? `V${basis.version}`
                  : T.notRecorded,
            },
            {
              label: T.reportedClosed,
              value: selected.closedAmount.amount,
              icon: "coins" as const,
              note:
                frozen.ratio === null
                  ? T.noTarget
                  : `${T.rate} ${(frozen.ratio * 100).toFixed(1)}%`,
            },
            {
              label: T.reportedCommit,
              value: selected.commitAmount.amount,
              icon: "flag" as const,
              note: T.open,
            },
            {
              label: T.managerCall,
              value: selected.callAmount?.amount ?? null,
              icon: "user" as const,
              note: selected.callAmount ? T.published : T.notRecorded,
            },
          ].map((f) => (
            <MetricCard
              key={f.label}
              label={f.label}
              icon={f.icon}
              value={reportFormat(f.value)}
              unit={reportUnit.label}
              note={f.note}
            />
          ))}
        </div>
      </Section>
      <Section
        level={3}
        title={T.reportedBasis}
        icon="file-text"
        action={
          <time
            className="text-body-small text-muted-foreground"
            dateTime={selected.snapshotAt.toISOString()}
          >
            {selected.snapshotAt.toLocaleString(locale, { timeZone: "UTC" })}{" "}
            UTC
          </time>
        }
      >
        <Card className={styles.sectionCard}>
          <p className="text-body-small">
            {selected.callNote ?? T.noJudgement}
          </p>
          {canPlan && basis?.sourceKind === "sales_plan" && basis.revisionId ? (
            <div className="mt-md">
              <Link
                className={businessLinks.textLink}
                href={planningHref(
                  analysis.year,
                  selected.territoryId,
                  basis.revisionId,
                  period,
                )}
              >
                {T.targetSource}
              </Link>
            </div>
          ) : null}
        </Card>
      </Section>
      <Section level={3} title={T.reportChanges} icon="arrow-left-right">
        <Card className={styles.sectionCard}>
          <Table className={styles.table}>
            <TableHeader>
              <TableRow>
                {[T.number, T.comparison, `${T.reportedValue} / ${reportUnit.label}`, `${T.current} / ${reportUnit.label}`, `${T.difference} / ${reportUnit.label}`, T.action].map(
                  (h, i) => (
                    <TableHead key={i}>{h}</TableHead>
                  ),
                )}
              </TableRow>
            </TableHeader>
            <TableBody>
              {comparisons.map((r, i) => (
                <TableRow key={r.label}>
                  <TableCell>{i + 1}</TableCell>
                  <TableCell>{r.label}</TableCell>
                  <TableCell>
                    <Numeric value={r.before} currency={selected.currency} />
                  </TableCell>
                  <TableCell>
                    <Numeric value={r.now} currency={selected.currency} />
                  </TableCell>
                  <TableCell>
                    <Numeric
                      value={
                        r.before === null || r.now === null
                          ? null
                          : r.now - r.before
                      }
                      currency={selected.currency}
                      sign
                    />
                  </TableCell>
                  <TableCell><Discuss context={`${T.reportChanges}; ${period}; ${r.label}; ${T.reportedValue} ${r.before ?? T.unknown}; ${T.current} ${r.now ?? T.unknown}; ${selected.currency}; ${T.reportAt} ${selected.snapshotAt.toISOString()}; ${T.reportFrozenHelp}`} /></TableCell>
                </TableRow>
              ))}
              <TableRow><TableCell>{comparisons.length + 1}</TableCell><TableCell>{T.verifyCommitted}</TableCell><TableCell><Numeric value={selected.commitAmount.amount} currency={selected.currency} /></TableCell><TableCell className="text-center text-body-small text-muted-foreground">{T.verifyIndividually}</TableCell><TableCell className="text-center text-body-small text-muted-foreground">{T.reportFrozenHelp}</TableCell><TableCell><Button asChild size="xl" variant="ghost" className="text-body-small"><Link href={attainmentPageHref("forecast", period, selectionScope)}>{T.checkEvidence}</Link></Button></TableCell></TableRow>
            </TableBody>
          </Table>
          <p className="mt-md text-body-small text-muted-foreground">
            {T.reportFrozenHelp}
            {board.score.ok && !board.score.value.settled
              ? ` \u00b7 ${T.currentPeriod}`
              : ""}
          </p>
        </Card>
      </Section>
    </>
  );
}
