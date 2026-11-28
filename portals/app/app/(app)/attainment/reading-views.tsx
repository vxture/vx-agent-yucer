"use client";
import { useMemo, useState } from "react";
import Link from "next/link";
import {
  Button,
  Card,
  Checkbox,
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
import type { AttainmentAnalysis } from "./analysis-board";
import {
  rollingDifferences,
  selectedDeals,
  type AnalysisRow,
} from "../../domains/pipeline/lib/attainment-analysis";
import { attainmentPageHref } from "../lib/attainment-pages";
import { useLocale } from "../lib/i18n/provider";
import { attainmentCopy } from "./copy";
import {
  BusinessLink,
  Discuss,
  Hint,
  Numeric,
  SummaryMetrics,
  Tiers,
} from "./widgets";
import { customerGoalSummary } from "./goal-model";
import { RegionalDiagnosis } from "./regional-diagnosis";
import { ProjectDiagnosis } from "./project-diagnosis";
import styles from "./workspace.module.css";
import { periodRange } from "../../domains/shared/period";
import { moneyScale } from "./format";

export { makeAnalysisRow } from "./analysis-row";
import { makeAnalysisRow } from "./analysis-row";
import { dealDiagnosis } from "./deal-diagnosis";
import { targetProgress, periodPhase } from "./progress-model";
import { personalCustomerGroups } from "./personal-model";
export function PeriodAttainment({
  data,
  row,
}: {
  data: AttainmentAnalysis;
  row: AnalysisRow;
}) {
  const locale = useLocale(),
    T = attainmentCopy(locale),
    units = moneyScale(locale, row.currency),
    [carry, setCarry] = useState(false);
  const periods = useMemo(
      () => [1, 2, 3, 4].map((q) => `${data.year}Q${q}`),
      [data.year],
    ),
    rows = periods.map((p) => makeAnalysisRow(data, row.scope, row.name, p)),
    balances = rollingDifferences(rows, carry, data.observedAt);
  return (
    <Section
      level={3}
      title={T.quarterTotal}
      icon="calendar"
      action={
        <Hint text={T.carryHelp}>
          <label className="flex items-center gap-xs text-body-small">
            <Checkbox
              checked={carry}
              onCheckedChange={(v) => setCarry(v === true)}
            />
            {T.carry}
          </label>
        </Hint>
      }
    >
      <Card className={styles.sectionCard}>
        <Table className={styles.table}>
          <TableHeader>
            <TableRow>
              {[
                T.number,
                T.period,
                `${T.targetComposition} / ${units.label}`,
                `${T.actual} / ${units.label}`,
                `${T.difference} / ${units.label}`,
                T.attainment,
                T.action,
              ].map((h, i) => (
                <TableHead key={i}>{h}</TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r, i) => {
              if (data.period.includes("Q") && r.period !== data.period) return null;
              const b = balances[i]!,
                progress = targetProgress(r.closed.value, r.target, periodPhase(r.period, data.observedAt)),
                stage = T[progress.state];
              const range = periodRange(r.period),
                active =
                  !!range &&
                  range.start.toISOString() <= data.observedAt &&
                  data.observedAt < range.end.toISOString();
              return (
                <TableRow
                  key={r.key}
                  className={active ? styles.activePeriod : undefined}
                >
                  <TableCell>{i + 1}</TableCell>
                  <TableCell>
                    <span className="inline-flex items-baseline gap-xs whitespace-nowrap">
                      {r.period}
                      <span
                        className={
                          active
                            ? "text-primary-text text-body-small"
                            : "text-muted-foreground text-body-small"
                        }
                      >
                        {active ? T.activeGoals : b.settled ? T.ended : ""}
                      </span>
                    </span>
                  </TableCell>
                  <TableCell>
                    <div className={styles.targetComposition}>
                      <span className="text-muted-foreground">{T.goal}</span>
                      <Numeric
                        currency={r.currency}
                        value={r.target?.target ?? null}
                      />
                      {carry && b.incoming !== 0 ? (
                        <>
                          <Hint text={T.incoming}>
                            <span className="text-info-text">{T.incoming}</span>
                          </Hint>
                          <span className="text-info-text">
                            <Numeric
                              currency={r.currency}
                              value={b.incoming}
                              sign
                            />
                          </span>
                        </>
                      ) : null}
                    </div>
                  </TableCell>
                  <TableCell className="text-primary-text">
                    <Numeric currency={r.currency} value={r.closed.value} />
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-col gap-xs">
                      <Hint
                        text={
                          b.transferred
                            ? T.transferred
                            : b.awaitingNext
                              ? T.next
                              : T.original
                        }
                      >
                        <span
                          className={`inline-flex w-full items-center gap-xs rounded-sm ${b.transferred ? "bg-accent text-muted-foreground line-through" : r.difference === null ? "text-muted-foreground" : r.difference < 0 ? "text-warning-text" : "text-success-text"}`}
                        >
                          <Icon
                            name={
                              r.difference === null
                                ? "info"
                                : b.settled
                                  ? r.difference < 0
                                    ? "smiley-sad"
                                    : "smiley"
                                  : "rocket"
                            }
                            size="sm"
                            className={active && r.difference !== null ? styles.periodRocket : undefined}
                          />
                          <Numeric
                            currency={r.currency}
                            value={r.difference}
                            sign
                          />
                        </span>
                      </Hint>
                      {carry && b.incoming !== 0 ? (
                        <Hint text={T.effective}>
                          <span className="text-info-text w-full">
                            <Numeric
                              currency={r.currency}
                              value={b.effective}
                              sign
                            />
                          </span>
                        </Hint>
                      ) : null}
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className={styles.goalProgress}>
                      <div className={styles.goalStatus}>
                        <span
                          className={
                            progress.tone === "success"
                              ? "text-success-text"
                              : progress.tone === "negative"
                                ? "text-warning-text"
                                : "text-primary-text"
                          }
                        >
                          {stage}
                        </span>
                        <span className="text-muted-foreground tabular-nums">
                          {r.rate === null
                            ? "\u2014"
                            : `${(r.rate * 100).toFixed(1)}%`}
                        </span>
                      </div>
                      <Tiers
                        value={r.closed.value}
                        target={r.target}
                        label={r.period}
                        phase={periodPhase(r.period, data.observedAt)}
                      />
                    </div>
                  </TableCell>
                  <TableCell>
                    <Button asChild size="sm" variant="ghost">
                      <Link
                        href={attainmentPageHref(
                          "forecast",
                          r.period,
                          row.scope,
                        )}
                      >
                        <Icon name="arrow-right" size="sm" />
                        {T.details}
                      </Link>
                    </Button>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
        <div className={styles.periodSummary}>
          <span>{carry ? T.currentGap : T.independentGap} <strong className="font-medium text-primary-text tabular-nums">{(() => {
            const index = data.period.includes("Q") ? rows.findIndex((r) => r.period === data.period) : rows.findIndex((r) => periodPhase(r.period, data.observedAt) === "active");
            const balance = balances[index]?.effective;
            return balance == null ? T.unknown : `${(Math.max(0, -balance) / units.divisor).toLocaleString(locale)} ${units.label}`;
          })()}</strong></span>
          <span>{T.annualGap} <strong className="font-medium tabular-nums">{(() => {
            const annual = makeAnalysisRow(data, row.scope, row.name, `Y${data.year}`);
            return annual.gap === null ? T.unknown : `${(annual.gap / units.divisor).toLocaleString(locale)} ${units.label}`;
          })()}</strong></span>
          <Hint inline text={T.carryHelp}><Icon name="info" size="sm" /></Hint>
        </div>
      </Card>
    </Section>
  );
}
export function ScopeTargetTable({
  data,
  rows,
}: {
  data: AttainmentAnalysis;
  rows: AnalysisRow[];
}) {
  const locale = useLocale(),
    T = attainmentCopy(locale),
    units = moneyScale(locale, data.currency ?? "CNY");
  const total = makeAnalysisRow(data, "workspace", T.company),
    unassigned =
      total.closed.value !== null && rows.every((r) => r.closed.value !== null)
        ? total.closed.value - rows.reduce((n, r) => n + r.closed.value!, 0)
        : null;
  return (
    <>
      <Table className={styles.table}>
        <TableHeader>
          <TableRow>
            {[
              T.number,
              T.region,
              T.actualTarget,
              T.remaining + " / " + units.label,
              T.priorityIssue,
              T.action,
            ].map((h, i) => (
              <TableHead key={i}>{h}</TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((r, i) => {
            const deals = (
                data.deals && periodPhase(r.period, data.observedAt) !== "ended" ? selectedDeals(data.deals, r.scope, r.period) : []
              ).filter(
                (d) =>
                  dealDiagnosis(d, data.observedAt, data.review?.[d.id]).issues
                    .length,
              ),
              first = deals.sort((a, b) =>
                (a.expectedCloseAt ?? "9999").localeCompare(
                  b.expectedCloseAt ?? "9999",
                ),
              )[0];
            return (
              <TableRow key={r.key}>
                <TableCell>{i + 1}</TableCell>
                <TableCell>
                  <BusinessLink
                    href={attainmentPageHref(
                      "region",
                      data.period,
                      r.scope,
                      data.revision?.id,
                    )}
                  >
                    {r.name}
                  </BusinessLink>
                </TableCell>
                <TableCell>
                  <div className={styles.goalProgress}>
                    <div className={styles.goalStatus}>
                      <span className="tabular-nums">
                        <span className="text-primary-text">
                          {r.closed.value === null
                            ? "\u2014"
                            : (r.closed.value / units.divisor).toLocaleString(
                                locale,
                              )}
                        </span>
                        <span className="text-muted-foreground">
                          {" "}
                          /{" "}
                          {r.target
                            ? (r.target.target / units.divisor).toLocaleString(
                                locale,
                              )
                            : T.noTarget}{" "}
                          {units.label}
                        </span>
                      </span>
                      <span className="text-body-small text-muted-foreground">
                        {r.rate === null
                          ? "\u2014"
                          : `${(r.rate * 100).toFixed(1)}%`}
                      </span>
                    </div>
                    <Tiers
                      value={r.closed.value}
                      target={r.target}
                      label={r.name}
                      phase={periodPhase(r.period, data.observedAt)}
                    />
                  </div>
                </TableCell>
                <TableCell className="text-warning-text">
                  <Numeric currency={r.currency} value={r.gap} />
                </TableCell>
                <TableCell>
                  <span className={styles.scopeIssue}>
                    {first ? (
                      <BusinessLink href={`/pipeline/${first.id}`}>
                        {data.accounts?.find((a) => a.id === first.accountId)
                          ?.name ?? first.name}{" "}
                        {"\u00b7"}{" "}
                        {
                          T[
                            dealDiagnosis(
                              first,
                              data.observedAt,
                              data.review?.[first.id],
                            ).kind
                          ]
                        }
                      </BusinessLink>
                    ) : (
                      <span className="text-body-small text-muted-foreground">
                        {periodPhase(r.period, data.observedAt) === "ended" ? T.historicalDiagnosis : T.noPriorityIssue}
                      </span>
                    )}
                  </span>
                </TableCell>
                <TableCell>
                  <Button asChild size="sm" variant="ghost">
                    <Link
                      href={attainmentPageHref(
                        "region",
                        data.period,
                        r.scope,
                        data.revision?.id,
                      )}
                    >
                      <Icon name="arrow-right" size="sm" />
                      {T.viewRegion}
                    </Link>
                  </Button>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
      {unassigned !== null && unassigned > 0 ? (
        <div className={styles.periodSummary}>
          <span>
            {(unassigned / units.divisor).toLocaleString(locale)} {units.label}{" "}
            {T.missingAllocation}
          </span>
          <BusinessLink
            href={attainmentPageHref("forecast", data.period, "workspace")}
          >
            {T.checkEvidence}
          </BusinessLink>
        </div>
      ) : null}
    </>
  );
}
export function CompanyReading({ data }: { data: AttainmentAnalysis }) {
  const locale = useLocale(),
    T = attainmentCopy(locale),
    row = makeAnalysisRow(data, "workspace", T.company);
  const regions = data.regions.map((r) =>
      makeAnalysisRow(data, `territory:${r.id}`, r.name),
    ),
    goals = customerGoalSummary(data);
  return (
    <>
      <Section level={3} title={T.companyTotal} icon="target">
        <SummaryMetrics data={data} row={row} />

      </Section>
      <PeriodAttainment data={data} row={row} />
      <Section
        level={3}
        title={T.regionTotal}
        icon="map-pin"
        action={
          <BusinessLink href={attainmentPageHref("regions", data.period)}>
            {T.compareRegions}
          </BusinessLink>
        }
      >
        {regions.length ? (
          <Card className={styles.sectionCard}>
            <ScopeTargetTable data={data} rows={regions} />
          </Card>
        ) : (
          <EmptyState title={T.noData} />
        )}
      </Section>
      <Card className={styles.insight}>
        <Icon name="flag" size="sm" />
        <strong className="font-medium">{T.customerGoals}</strong>
        <span className="text-muted-foreground">
          {goals.accounts} {T.accountsUnit} {"\u00b7"} {goals.total}{" "}
          {T.goalsUnit}
          {goals.attention ? ` \u00b7 ${goals.attention} ${T.endedUnmet}` : ""}
          {goals.unverified
            ? ` \u00b7 ${goals.unverified} ${T.unverified}`
            : ""}
        </span>
        <BusinessLink href={attainmentPageHref("customers", data.period)}>
          {T.customerHandoff}
        </BusinessLink>
      </Card>
    </>
  );
}
export function RegionalReading({
  data,
  scope,
  name,
}: {
  data: AttainmentAnalysis;
  scope: string;
  name: string;
}) {
  const T = attainmentCopy(useLocale()),
    row = makeAnalysisRow(data, scope, name);
  return (
    <>
      <Section level={3} title={T.regionTotal} icon="target">
        <SummaryMetrics data={data} row={row} />
      </Section>
      <PeriodAttainment data={data} row={row} />
      <RegionalDiagnosis data={data} scope={scope} />
    </>
  );
}
export function PersonalReading({
  data,
  scope,
  filter,
}: {
  data: AttainmentAnalysis;
  scope: string;
  filter: string;
}) {
  const T = attainmentCopy(useLocale()),
    row = makeAnalysisRow(data, scope, T.mine);
  const first = personalCustomerGroups(data, scope, true).flatMap((g) => g.projects.filter((d) => d.ownerSub === data.self && dealDiagnosis(d, data.observedAt, data.review?.[d.id]).issues.length).map((d) => ({ account: g.account, deal: d })))[0];
  return (
    <>
      <SummaryMetrics data={data} row={row} personal />
      {first && periodPhase(data.period, data.observedAt) !== "ended" && <div className={styles.diagnosisLead}><Icon name="lightbulb" size="sm" className="text-primary-text" /><div><strong className="font-medium">{T.prioritize} {first.account.name}: {T[dealDiagnosis(first.deal, data.observedAt, data.review?.[first.deal.id]).kind]}</strong><p className="mt-xs text-body-small text-muted-foreground">{first.deal.name}</p></div><Button size="xl" variant="ghost" className="ml-auto text-body-small" onClick={() => document.querySelector("[data-personal-diagnosis]")?.scrollIntoView({ block: "start", behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth" })}><Icon name="arrow-down" size="sm" />{T.viewNext}</Button></div>}
      <ProjectDiagnosis data={data} scope={scope} personal filter={filter} />
    </>
  );
}
export { CustomerGoals as CustomerReading } from "./customer-goals";
