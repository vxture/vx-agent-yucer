"use client";
import { useState } from "react";
import {
  Card,
  EmptyState,
  Icon,
  Section,
  SegmentedControl,
} from "@vxture/design-system";
import {
  customerProjects,
  selectedDeals,
} from "../../domains/pipeline/lib/attainment-analysis";
import { periodRange } from "../../domains/shared/period";
import type { AttainmentAnalysis } from "./analysis-board";
import { makeAnalysisRow } from "./analysis-row";
import { dealDiagnosis } from "./deal-diagnosis";
import { attainmentCopy } from "./copy";
import { useLocale } from "../lib/i18n/provider";
import { BusinessLink, Discuss, Hint, Owner } from "./widgets";
import { moneyScale } from "./format";
import { attainmentPageHref } from "../lib/attainment-pages";
import styles from "./workspace.module.css";

export function RegionalDiagnosis({
  data,
  scope,
}: {
  data: AttainmentAnalysis;
  scope: string;
}) {
  const locale = useLocale(),
    T = attainmentCopy(locale),
    [filter, setFilter] = useState("all"),
    row = makeAnalysisRow(data, scope, T.region),
    units = moneyScale(locale, row.currency),
    range = periodRange(data.period),
    ended = !!range && range.end.toISOString() <= data.observedAt;
  const format = (v: number) =>
    new Intl.NumberFormat(locale, { maximumFractionDigits: 2 }).format(
      v / units.divisor,
    );
  const groups = customerProjects(
    data.accounts ?? [],
    data.deals ?? [],
    data.self,
    scope,
    data.period,
  )
    .map((g) => ({
      ...g,
      projects: g.projects.filter(
        (d) =>
          dealDiagnosis(d, data.observedAt, data.review?.[d.id]).issues.length,
      ),
    }))
    .filter((g) => g.projects.length);
  const issues = groups.flatMap((g) => g.projects),
    visible = groups
      .map((g) => ({
        ...g,
        projects: g.projects.filter(
          (d) =>
            filter === "all" ||
            dealDiagnosis(
              d,
              data.observedAt,
              data.review?.[d.id],
            ).issues.includes(filter as "delayed"),
        ),
      }))
      .filter((g) => g.projects.length);
  const delayed = issues.filter((d) =>
    dealDiagnosis(d, data.observedAt, data.review?.[d.id]).issues.includes(
      "delayed",
    ),
  ).length;
  const dimensions = [
    { value: "all", label: T.all },
    { value: "conditions", label: T.conditions },
    { value: "delayed", label: T.delayed },
    { value: "missingBasis", label: T.missingBasis },
  ];
  return (
    <Section
      level={3}
      title={T.diagnosis}
      icon="search"
      action={
        <BusinessLink href={attainmentPageHref("forecast", data.period, scope)}>
          {T.forecast}
        </BusinessLink>
      }
    >
      {ended ? (
        <Card className={styles.sectionCard}>
          <EmptyState title={T.historicalDiagnosis} />
        </Card>
      ) : !data.deals || !data.accounts ? (
        <EmptyState title={T.failed} />
      ) : (
        <>
          <div className={styles.diagnosisLead}>
            <Icon name="lightbulb" size="md" className="text-primary-text" />
            <div>
              <strong className="font-medium">
                {delayed
                  ? `${T.prioritizeDelay} ${delayed}`
                  : issues.length
                    ? `${T.attention} ${issues.length}`
                    : T.reviewClear}
              </strong>
              <p className="mt-xs text-body-small text-muted-foreground">
                {row.gap === null
                  ? T.noTarget
                  : row.gap === 0
                    ? T.covered
                    : `${T.remaining} ${format(row.gap)} ${units.label}`}{" "}
                {"\u00b7"} {T.commit}{" "}
                {row.commit.value === null
                  ? T.unknown
                  : `${format(row.commit.value)} ${units.label}`}
              </p>
            </div>
          </div>
          <div className={styles.diagnosisToolbar} data-control-size="preserve">
            <span className="text-body-small text-muted-foreground">
              {issues.length} {T.projectCount} {"\u00b7"} {groups.length}{" "}
              {T.accountsUnit}
            </span>
            <SegmentedControl
              size="md"
              value={filter}
              onChange={setFilter}
              items={dimensions}
              ariaLabel={T.status}
            />
          </div>
          {visible.length ? (
            visible.map((g) => (
              <Card key={g.account.id} className={styles.customerCard}>
                <header className={styles.customerHeading}>
                  <div className={styles.customerTitle}>
                    <BusinessLink href={`/account/${g.account.id}`} icon="building-office">
                      {g.account.name}
                    </BusinessLink>
                    <span className="text-body-small font-normal text-muted-foreground">
                      {g.projects.length} {T.projectCount}
                    </span>
                  </div>
                  {data.focus?.rows.some((a) => a.id === g.account.id) ? (
                    <BusinessLink
                      href={attainmentPageHref("customers", data.period, scope)}
                    >
                      {T.customerGoals}
                    </BusinessLink>
                  ) : null}
                </header>
                {g.projects.map((d) => {
                  const diagnosis = dealDiagnosis(
                      d,
                      data.observedAt,
                      data.review?.[d.id],
                    ),
                    late = diagnosis.issues.includes("delayed"),
                    days = d.expectedCloseAt
                      ? Math.max(
                          0,
                          Math.floor(
                            (Date.parse(data.observedAt) -
                              Date.parse(d.expectedCloseAt)) /
                              86400000,
                          ),
                        )
                      : null,
                    next = !d.amount
                      ? T.verifyAmount
                      : late || !d.expectedCloseAt
                        ? T.alignDate
                        : T.verifyConditions,
                    review = data.review?.[d.id],
                    details = review?.exit
                      ? [...review.exit.unmet, ...review.exit.unknown]
                      : [];
                  return (
                    <article key={d.id} className={styles.regionalIssue}>
                      <div className={styles.regionalIssueHeading}>
                        <div className="flex min-w-0 flex-wrap items-center gap-sm">
                          <Icon
                            name="folder"
                            size="sm"
                            className="text-primary-text"
                          />
                          <BusinessLink href={`/pipeline/${d.id}`}>
                            {d.name}
                          </BusinessLink>
                          <span className={styles.issueBadge}>
                            {T[diagnosis.kind]}
                            {late && days !== null ? ` ${days} ${T.days}` : ""}
                          </span>
                        </div>
                        <strong className="font-medium tabular-nums text-primary-text">
                          {d.amount
                            ? `${(d.amount.amount / moneyScale(locale, d.amount.currency).divisor).toLocaleString(locale)} ${moneyScale(locale, d.amount.currency).label}`
                            : T.unpriced}
                        </strong>
                      </div>
                      <div className={styles.regionalIssueBody}>
                        <div className="flex flex-col gap-sm">
                          <div className="flex flex-wrap items-center gap-md">
                            <Owner sub={d.ownerSub} members={data.members} />
                            <span className="text-body-small text-muted-foreground">
                              {T.date}{" "}
                              {d.expectedCloseAt?.slice(0, 10) ?? T.dateUnknown}
                            </span>
                          </div>
                          {details.length ? (
                            <Hint text={details.join(" / ")}>
                              <span className="inline-flex items-center gap-xs text-body-small text-muted-foreground">
                                <Icon name="info" size="xs" />
                                {details[0]}
                                {details.length > 1
                                  ? ` +${details.length - 1}`
                                  : ""}
                              </span>
                            </Hint>
                          ) : null}
                        </div>
                        <div className="flex flex-col gap-sm">
                          <span className="text-body-small text-muted-foreground">
                            {T.nextStep}
                          </span>
                          <div className="flex flex-wrap items-center justify-between gap-md">
                            <BusinessLink href={`/pipeline/${d.id}`}>
                              {next}
                            </BusinessLink>
                            <Discuss
                              objects={[
                                { kind: "account", id: g.account.id },
                                { kind: "opportunity", id: d.id },
                              ]}
                              context={`${g.account.name}; ${d.name}; ${data.period}; ${T.remaining} ${row.gap ?? T.unknown} ${row.currency}; ${diagnosis.issues.map((k) => T[k]).join(" / ")}; ${details.join(" / ")}; ${T.nextStep} ${next}`}
                            />
                          </div>
                        </div>
                      </div>
                    </article>
                  );
                })}
              </Card>
            ))
          ) : (
            <Card className={styles.sectionCard}>
              <EmptyState title={T.reviewClear} />
            </Card>
          )}
        </>
      )}
    </Section>
  );
}
