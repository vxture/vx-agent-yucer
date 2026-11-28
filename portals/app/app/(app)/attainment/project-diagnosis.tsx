"use client";
import { useId, useState } from "react";
import { Button, Card, EmptyState, Icon, Section } from "@vxture/design-system";
import type { AnalysisDeal } from "../../domains/pipeline/lib/attainment-analysis";
import type { AttainmentAnalysis } from "./analysis-board";
import { attainmentCopy, customerGoalLabel } from "./copy";
import { useLocale } from "../lib/i18n/provider";
import { BusinessLink, Discuss, Hint, Owner, Tiers } from "./widgets";
import { CooperationEditor } from "./cooperation-editor";
import { dealDiagnosis } from "./deal-diagnosis";
import { moneyScale } from "./format";
import { personalCustomerGroups, matchesProjectFilter } from "./personal-model";
import { attainmentPageHref } from "../lib/attainment-pages";
import { periodPhase } from "./progress-model";
import styles from "./workspace.module.css";

export function projectIssue(
  d: AnalysisDeal,
  at: string,
  review?: import("./deal-diagnosis").ReviewFact | null,
) {
  return dealDiagnosis(d, at, review).kind;
}
function ProjectRow({
  deal: d,
  data,
  personal,
  initiallyExpanded,
}: {
  deal: AnalysisDeal;
  data: AttainmentAnalysis;
  personal: boolean;
  initiallyExpanded: boolean;
}) {
  const locale = useLocale(),
    T = attainmentCopy(locale),
    [expanded, setExpanded] = useState(initiallyExpanded),
    id = useId(),
    diagnosis = dealDiagnosis(d, data.observedAt, data.review?.[d.id]),
    review = data.review?.[d.id],
    own = d.ownerSub === data.self,
    unit = moneyScale(locale, d.amount?.currency ?? data.currency ?? "CNY"),
    amount = d.amount
      ? `${(d.amount.amount / unit.divisor).toLocaleString(locale)} ${unit.label}`
      : T.unpriced,
    next = !d.amount
      ? T.verifyAmount
      : !d.expectedCloseAt || diagnosis.issues.includes("delayed")
        ? T.alignDate
        : d.forecastCategory === "commit"
          ? T.verifyConditions
          : T.keepMoving;
  const category =
    d.status === "won"
      ? T.won
      : d.forecastCategory === "commit"
        ? T.commit
        : d.forecastCategory === "best_case"
          ? T.bestCase
          : T.early;
  return (
    <article className={styles.projectRow}>
      <div className={styles.projectRowMain}>
        <div className={styles.projectRowIdentity}>
          <div className={styles.projectTitle}>
            <BusinessLink href={`/pipeline/${d.id}`} icon="folder">
              {d.name}
            </BusinessLink>
            <span className={styles.categoryBadge}>{category}</span>
          </div>
          <p
            className={`${styles.projectIndent} ${diagnosis.issues.length ? "text-warning-text" : "text-muted-foreground"}`}
          >
            {T[diagnosis.kind]}
          </p>
        </div>
        <div className={styles.projectField}>
          <span>{T.amount}</span>
          <strong className="text-primary-text font-medium tabular-nums">
            {amount}
          </strong>
        </div>
        <div className={styles.projectField}>
          <span>{T.owner}</span>
          <div className="flex flex-wrap items-center gap-xs">
            <Owner sub={d.ownerSub} members={data.members} />
            {personal && (
              <span
                className={
                  own
                    ? "text-primary-text text-body-small"
                    : "text-muted-foreground text-body-small"
                }
              >
                {own ? T.owned : T.others}
              </span>
            )}
          </div>
        </div>
        <div className={styles.projectField}>
          <span>{d.status === "won" ? T.wonDate : T.closeDate}</span>
          <time
            className={
              diagnosis.issues.includes("delayed")
                ? "text-warning-text tabular-nums"
                : "tabular-nums"
            }
          >
            {(d.status === "won" ? d.closedAt : d.expectedCloseAt)?.slice(
              0,
              10,
            ) ?? T.dateUnknown}
          </time>
        </div>
        <Button
          size="xl"
          variant="ghost"
          className="text-body-small"
          aria-expanded={expanded}
          aria-controls={id}
          onClick={() => setExpanded((v) => !v)}
        >
          <Icon name={expanded ? "chevron-up" : "chevron-down"} size="sm" />
          {expanded ? T.collapse : T.expand}
        </Button>
      </div>
      {expanded && (
        <div className={styles.projectDetail} id={id}>
          <div className={styles.projectNextLine}>
            <span className="text-muted-foreground">{T.nextStep}</span>
            <div>
              <strong className="font-medium">
                {d.status === "won" ? T.source : next}
              </strong>
              {review?.exit &&
              (review.exit.unmet.length || review.exit.unknown.length) ? (
                <p className="mt-xs text-body-small text-muted-foreground">
                  {[...review.exit.unmet, ...review.exit.unknown]
                    .slice(0, 2)
                    .join(" \u00b7 ")}
                </p>
              ) : null}
              {personal && !own && (
                <p className="mt-xs text-body-small text-muted-foreground">
                  {T.collaborationHelp}
                </p>
              )}
            </div>
          </div>
          <footer className={styles.projectDetailFooter}>
            <span className="text-body-small text-muted-foreground">
              {d.opportunityNo}
            </span>
            <div className="flex items-center gap-sm">
              <Button
                asChild
                size="xl"
                variant="ghost"
                className="text-body-small"
              >
                <BusinessLink href={`/pipeline/${d.id}`} icon="file-text">
                  {T.checkEvidence}
                </BusinessLink>
              </Button>
              <Discuss
                objects={[
                  { kind: "account", id: d.accountId },
                  { kind: "opportunity", id: d.id },
                ]}
                context={`${d.name}; ${data.period}; ${T.status} ${T[diagnosis.kind]}; ${T.amount} ${amount}; ${T.date} ${d.expectedCloseAt ?? T.dateUnknown}; ${T.nextStep} ${next}; ${personal && !own ? T.collaborationHelp : T.owned}`}
              />
            </div>
          </footer>
        </div>
      )}
    </article>
  );
}
type Group = ReturnType<typeof personalCustomerGroups>[number];
function CustomerProjects({
  group,
  data,
  personal,
}: {
  group: Group;
  data: AttainmentAnalysis;
  personal: boolean;
}) {
  const locale = useLocale(),
    T = attainmentCopy(locale),
    unit = moneyScale(locale, data.currency ?? "CNY"),
    projects = [...group.projects].sort(
      (a, b) =>
        Number(
          dealDiagnosis(b, data.observedAt, data.review?.[b.id]).issues.length >
            0,
        ) -
        Number(
          dealDiagnosis(a, data.observedAt, data.review?.[a.id]).issues.length >
            0,
        ),
    ),
    owned = projects.filter(
      (d) => d.status === "open" && (!personal || d.ownerSub === data.self),
    ),
    other = projects.filter(
      (d) => d.status === "open" && personal && d.ownerSub !== data.self,
    ),
    total = (rows: AnalysisDeal[]) =>
      rows.every((d) => d.amount?.currency === (data.currency ?? "CNY"))
        ? `${(rows.reduce((n, d) => n + d.amount!.amount, 0) / unit.divisor).toLocaleString(locale)} ${unit.label}`
        : T.unknown,
    revenue = group.goals.find(
      (g) => g.metric === "revenue" && g.period === data.period,
    ),
    otherGoals = group.goals.filter((g) => g !== revenue);
  return (
    <Card className={styles.customerCard}>
      <header className={styles.customerHeading}>
        <div className={styles.customerTitle}>
          <BusinessLink
            href={`/account/${group.account.id}`}
            icon="building-office"
          >
            {group.account.name}
          </BusinessLink>
          <span className="text-body-small font-normal text-muted-foreground">
            {group.projects.length} {T.projectCount}
          </span>
        </div>
        <div className="flex items-center gap-md text-body-small">
          <span className="text-primary-text">
            {T.owned} {owned.length}
          </span>
          {personal && other.length > 0 && (
            <span className="text-muted-foreground">
              {T.others} {other.length}
            </span>
          )}
        </div>
      </header>
      {group.goals.length > 0 && (
        <section className={styles.customerGoalStrip}>
          <div className="flex flex-wrap items-center gap-md text-body-small">
            <span className="inline-flex items-center gap-xs text-muted-foreground">
              <Icon name="target" size="sm" />
              {T.customerOverallGoal}
              <Hint inline text={T.customerOverallHelp}>
                <Icon name="info" size="xs" />
              </Hint>
            </span>
            {revenue && (
              <>
                <span>
                  {T.target}{" "}
                  <strong className="font-medium">
                    {revenue.target === null
                      ? T.unknown
                      : `${(revenue.target / unit.divisor).toLocaleString(locale)} ${unit.label}`}
                  </strong>
                </span>
                <span>
                  {T.revenueContribution}{" "}
                  <strong className="text-primary-text font-medium">
                    {revenue.actual === null
                      ? T.unknown
                      : `${(revenue.actual / unit.divisor).toLocaleString(locale)} ${unit.label}`}
                  </strong>
                </span>
                <span className={styles.customerGoalTrack}>
                  <Tiers
                    value={revenue.actual}
                    target={
                      revenue.target === null
                        ? null
                        : { floor: null, target: revenue.target, stretch: null }
                    }
                    label={T.customerOverallGoal}
                  />
                </span>
              </>
            )}
            <BusinessLink
              href={attainmentPageHref("customers", data.period, "workspace")}
            >
              {T.goalEvidence}
            </BusinessLink>
          </div>
          {otherGoals.length > 0 && (
            <div className={styles.customerOutcomeList}>
              {otherGoals.slice(0, 3).map((g) => (
                <span key={g.key}>
                  <Icon name="flag" size="xs" />
                  <span>
                    {customerGoalLabel(g.metric, locale)}
                  </span>
                  <small>{T[g.state]}</small>
                </span>
              ))}
              {otherGoals.length > 3 && <span>+{otherGoals.length - 3}</span>}
            </div>
          )}
        </section>
      )}
      {projects.length ? (
        projects.map((d, index) => (
          <ProjectRow
            key={d.id}
            deal={d}
            data={data}
            personal={personal}
            initiallyExpanded={index === 0}
          />
        ))
      ) : (
        <div className={styles.customerBody}>
          <p className="text-body-small text-muted-foreground">
            {T.goalWithoutProjects}
          </p>
        </div>
      )}
      <footer className={styles.customerFooter}>
        <span>
          {T.owned} {total(owned)}
          {other.length > 0 ? ` \u00b7 ${T.others} ${total(other)}` : ""}
        </span>
        <div className="flex flex-wrap items-center gap-sm">
          {data.canEditAccount && (
            <CooperationEditor
              account={group.account}
              history={
                data.history?.find((h) => h.accountId === group.account.id) ??
                null
              }
              year={data.year}
            />
          )}
          <Discuss
            objects={[
              { kind: "account", id: group.account.id },
              ...group.projects
                .slice(0, 10)
                .map((d) => ({ kind: "opportunity" as const, id: d.id })),
            ]}
            context={`${group.account.name}; ${data.period}; ${T.observed} ${data.observedAt}; ${T.owned} ${total(owned)}; ${T.others} ${total(other)}\n${group.projects.map((d) => `${d.name}; ${T.status} ${T[projectIssue(d, data.observedAt, data.review?.[d.id])]}`).join("\n")}`}
          />
        </div>
      </footer>
    </Card>
  );
}
export function ProjectDiagnosis({
  data,
  scope,
  personal = false,
  filter = "all",
}: {
  data: AttainmentAnalysis;
  scope: string;
  personal?: boolean;
  filter?: string;
}) {
  const T = attainmentCopy(useLocale());
  const groups = personalCustomerGroups(data, scope, personal)
    .map((g) => ({
      ...g,
      projects: g.projects.filter((d) => matchesProjectFilter(d, data, filter)),
    }))
    .filter((g) => g.projects.length || (filter === "all" && g.goals.length));
  return (
    <div data-personal-diagnosis>
      <Section
        level={3}
        title={personal ? T.myCustomersProjects : T.diagnosis}
        icon="search"
      >
        {periodPhase(data.period, data.observedAt) === "ended" ? (
          <Card className={styles.sectionCard}>
            <EmptyState title={T.historicalDiagnosis} />
          </Card>
        ) : !data.accounts || !data.deals ? (
          <EmptyState
            title={T[!data.accounts ? data.accountState : data.dealState]}
          />
        ) : groups.length ? (
          groups.map((g) => (
            <CustomerProjects
              key={g.account.id}
              group={g}
              data={data}
              personal={personal}
            />
          ))
        ) : (
          <EmptyState title={T.noData} />
        )}
      </Section>
    </div>
  );
}
