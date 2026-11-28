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
  analysisRow,
  customerProjects,
  rollingDifferences,
  verifiedNewLogos,
  type AnalysisRow,
  type AnalysisDeal,
} from "../../domains/pipeline/lib/attainment-analysis";
import { attainmentPageHref } from "../lib/attainment-pages";
import { useLocale } from "../lib/i18n/provider";
import { attainmentCopy } from "./copy";
import {
  BusinessLink,
  Discuss,
  Hint,
  Numeric,
  Owner,
  SummaryMetrics,
  Tiers,
} from "./widgets";
import { ActionResultEditor } from "./action-result-editor";
import { CooperationEditor } from "./cooperation-editor";
import styles from "./workspace.module.css";
import { moneyScale } from "./format";

export function makeAnalysisRow(
  data: AttainmentAnalysis,
  scope: string,
  name: string,
  period = data.period,
) {
  return analysisRow({
    scope,
    name,
    period,
    currency: data.currency ?? "CNY",
    targets: data.targets ?? [],
    deals: data.deals,
    observedAt: data.observedAt,
    unavailable: data.dealState,
  });
}
export function PeriodAttainment({
  data,
  row,
}: {
  data: AttainmentAnalysis;
  row: AnalysisRow;
}) {
  const locale = useLocale(),
    T = attainmentCopy(locale),
    units = moneyScale(locale, row.currency);
  const [carry, setCarry] = useState(false);
  const periods = useMemo(
    () => [1, 2, 3, 4].map((q) => `${data.year}Q${q}`),
    [data.year],
  );
  const rows = periods.map((period) =>
    makeAnalysisRow(data, row.scope, row.name, period),
  );
  const balances = rollingDifferences(rows, carry, data.observedAt);
  return (
    <Section
      title={T.quarterTotal}
      action={
        <Hint text={T.carryHelp}>
          <label className="flex items-center gap-xs text-body-small">
            <Checkbox
              checked={carry}
              onCheckedChange={(value) => setCarry(value === true)}
            />
            {T.carry}
          </label>
        </Hint>
      }
    >
      {rows.length ? (
        <Table className={styles.table} data-action-mode="menu">
          <TableHeader>
            <TableRow>
              {[
                T.number,
                T.period,
                `${T.actual} (${units.label})`,
                `${T.target} (${units.label})`,
                `${T.difference} (${units.label})`,
                T.rate,
                T.action,
              ].map((h, i) => (
                <TableHead key={i}>{h}</TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r, i) => {
              const balance = balances[i]!;
              const settled = balance.settled;
              return (
                <TableRow key={r.key}>
                  <TableCell>{i + 1}</TableCell>
                  <TableCell>
                    <strong className="font-medium">{r.period}</strong>
                    <div className="mt-sm">
                      <Tiers
                        value={r.closed.value}
                        target={r.target}
                        label={r.period}
                      />
                    </div>
                  </TableCell>
                  <TableCell>
                    <Numeric currency={r.currency} value={r.closed.value} />
                  </TableCell>
                  <TableCell>
                    <Numeric
                      currency={r.currency}
                      value={r.target?.target ?? null}
                    />
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-col gap-xs">
                      <Hint
                        text={
                          balance.transferred
                            ? T.transferred
                            : balance.awaitingNext
                              ? T.next
                              : T.original
                        }
                      >
                        <span
                          className={
                            balance.transferred
                              ? "rounded-sm bg-accent text-muted-foreground line-through"
                              : r.difference === null
                                ? "text-muted-foreground"
                                : r.difference < 0
                                  ? "text-warning-text"
                                  : "text-success-text"
                          }
                        >
                          <Numeric
                            currency={r.currency}
                            value={r.difference}
                            sign
                          />
                        </span>
                      </Hint>
                      {carry && balance.incoming !== 0 ? (
                        <Hint
                          text={`${T.incoming}: ${balance.incoming ?? T.unknown}`}
                        >
                          <span className="w-full text-info-text">
                            <Numeric
                              currency={r.currency}
                              value={balance.effective}
                              sign
                            />
                          </span>
                        </Hint>
                      ) : null}
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex justify-center items-center gap-xs">
                      {r.rate === null
                        ? "\u2014"
                        : `${(r.rate * 100).toFixed(1)}%`}
                      <Hint
                        text={
                          r.difference === null
                            ? T.unknown
                            : settled
                              ? r.difference < 0
                                ? T.missed
                                : T.exceeded
                              : T.inProgress
                        }
                      >
                        <Icon
                          name={
                            r.difference === null
                              ? "info"
                              : settled
                                ? r.difference < 0
                                  ? "smiley-sad"
                                  : "smiley"
                                : "trend-up"
                          }
                          size="sm"
                          className="text-muted-foreground"
                        />
                      </Hint>
                    </div>
                  </TableCell>
                  <TableCell>
                    <Button asChild size="icon-md" variant="ghost">
                      <Link
                        href={attainmentPageHref(
                          "forecast",
                          r.period,
                          row.scope,
                        )}
                        aria-label={`${T.details} ${r.period}`}
                      >
                        <Icon name="arrow-right" size="sm" />
                      </Link>
                    </Button>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      ) : (
        <EmptyState title={T.noQuarter} />
      )}
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
  return (
    <Table className={styles.table}>
      <TableHeader>
        <TableRow>
          {[
            T.number,
            T.scope,
            `${T.actual} (${units.label})`,
            `${T.target} (${units.label})`,
            `${T.difference} (${units.label})`,
            T.coverage,
            T.action,
          ].map((h, i) => (
            <TableHead key={i}>{h}</TableHead>
          ))}
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((r, i) => (
          <TableRow key={r.key}>
            <TableCell>{i + 1}</TableCell>
            <TableCell>
              <span className="font-medium">{r.name}</span>
              <div className="mt-sm">
                <Tiers
                  value={r.closed.value}
                  target={r.target}
                  label={r.name}
                />
              </div>
            </TableCell>
            <TableCell>
              <Numeric currency={r.currency} value={r.closed.value} />
            </TableCell>
            <TableCell>
              <Numeric currency={r.currency} value={r.target?.target ?? null} />
            </TableCell>
            <TableCell
              className={
                (r.difference ?? 0) < 0
                  ? "text-warning-text"
                  : "text-success-text"
              }
            >
              <Numeric currency={r.currency} value={r.difference} sign />
            </TableCell>
            <TableCell className="text-center tabular-nums">
              {r.gap === 0
                ? T.covered
                : r.coverage === null
                  ? "\u2014"
                  : `${r.coverage.toFixed(1)}\u00d7`}
            </TableCell>
            <TableCell>
              <Button asChild variant="ghost" size="sm">
                <Link
                  href={attainmentPageHref(
                    r.scope.startsWith("territory:") ? "region" : "mine",
                    data.period,
                    r.scope,
                  )}
                >
                  {T.details}
                </Link>
              </Button>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
export function CompanyReading({ data }: { data: AttainmentAnalysis }) {
  const T = attainmentCopy(useLocale());
  const row = makeAnalysisRow(data, "workspace", T.company);
  const regions = data.regions.map((r) =>
    makeAnalysisRow(data, `territory:${r.id}`, r.name),
  );
  return (
    <>
      <SummaryMetrics data={data} row={row} />
      <Section
        title={T.companyTotal}
        action={
          <Discuss
            context={`${T.company} ${data.period}; ${T.target} ${row.target?.target ?? T.noTarget}; ${T.actual} ${row.closed.value ?? T.unknown}; ${T.difference} ${row.difference ?? T.unknown}; ${row.currency}`}
          />
        }
      >
        <Card className="gap-sm p-lg">
          <div className="flex flex-wrap items-baseline justify-between gap-lg">
            <span>{T.remaining}</span>
            <strong className="text-heading-3 tabular-nums text-primary">
              {row.gap === null ? "\u2014" : row.gap.toLocaleString()}{" "}
              <span className="text-body-small">{row.currency}</span>
            </strong>
          </div>
          <div className="mt-md">
            <Tiers
              value={row.closed.value}
              target={row.target}
              label={T.companyTotal}
            />
          </div>
          <div className="mt-md flex flex-wrap items-center gap-lg text-body-small text-muted-foreground">
            <span>
              {T.open} {row.open.value?.toLocaleString() ?? "\u2014"}
            </span>
            {row.undated > 0 ? (
              <BusinessLink
                href={attainmentPageHref("forecast", data.period, "workspace")}
              >
                {T.undated} {row.undated}
              </BusinessLink>
            ) : null}
            <BusinessLink href={attainmentPageHref("customers", data.period)}>
              {T.customerGoals}
            </BusinessLink>
          </div>
        </Card>
      </Section>
      <PeriodAttainment data={data} row={row} />
      <Section title={T.regionTotal}>
        {regions.length ? (
          <ScopeTargetTable data={data} rows={regions} />
        ) : (
          <EmptyState title={T.noData} />
        )}
      </Section>
    </>
  );
}
function ProjectIssue({
  deal,
  observedAt,
}: {
  deal: AnalysisDeal;
  observedAt: string;
}) {
  const T = attainmentCopy(useLocale());
  const issue =
    deal.status === "won"
      ? T.won
      : !deal.amount
        ? T.unpriced
        : !deal.expectedCloseAt
          ? T.undated
          : deal.status === "open" && deal.expectedCloseAt < observedAt
            ? T.overdue
            : T.normal;
  return (
    <span
      className={
        deal.status === "won"
          ? "text-success-text"
          : issue === T.normal
            ? "text-muted-foreground"
            : "text-warning-text"
      }
    >
      {issue}
    </span>
  );
}
function ProjectItems({
  projects,
  data,
  personal,
}: {
  projects: AnalysisDeal[];
  data: AttainmentAnalysis;
  personal: boolean;
}) {
  const T = attainmentCopy(useLocale()),
    [expanded, setExpanded] = useState(false);
  const priority = (d: AnalysisDeal) =>
    d.status !== "open"
      ? 0
      : !d.amount || !d.expectedCloseAt || d.expectedCloseAt < data.observedAt
        ? 2
        : 1;
  const sorted = [...projects].sort(
    (a, b) =>
      priority(b) - priority(a) ||
      (a.expectedCloseAt ?? "").localeCompare(b.expectedCloseAt ?? ""),
  );
  const visible = expanded ? sorted : sorted.slice(0, 3);
  return (
    <>
      {visible.map((d) => (
        <div
          key={d.id}
          className="flex flex-col gap-xs border-b border-dashed border-border pb-md last:border-0"
        >
          <div className="flex flex-wrap items-center justify-between gap-sm">
            <BusinessLink href={`/pipeline/${d.id}`}>{d.name}</BusinessLink>
            <span className="text-body-small">
              <ProjectIssue deal={d} observedAt={data.observedAt} />
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-md text-body-small">
            <Owner sub={d.ownerSub} members={data.members} />
            <span>
              {personal
                ? d.ownerSub !== data.self
                  ? T.others
                  : T.owned
                : T.owner}
            </span>
            <span className="tabular-nums">
              {d.amount
                ? `${d.amount.amount.toLocaleString()} ${d.amount.currency}`
                : T.unpriced}
            </span>
            <span>
              {(d.status === "won" ? d.closedAt : d.expectedCloseAt)?.slice(
                0,
                10,
              ) ?? T.dateUnknown}
            </span>
          </div>
        </div>
      ))}
      {projects.length > 3 ? (
        <div className="flex justify-end">
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setExpanded((v) => !v)}
            aria-expanded={expanded}
          >
            <Icon name={expanded ? "chevron-up" : "chevron-down"} size="sm" />
            {expanded ? T.collapse : T.expand}
            <span className="text-muted-foreground">{projects.length}</span>
          </Button>
        </div>
      ) : null}
    </>
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
  if (!data.accounts || !data.deals)
    return (
      <Section title={T.diagnosis}>
        <EmptyState
          title={T[!data.accounts ? data.accountState : data.dealState]}
        />
      </Section>
    );
  const groups = customerProjects(
    data.accounts ?? [],
    data.deals ?? [],
    data.self,
    personal ? "workspace" : scope,
    data.period,
  )
    .filter(
      (g) => !personal || g.account.ownerSub === data.self || g.owned.length,
    )
    .filter(
      (g) =>
        filter !== "attention" ||
        g.projects.some(
          (d) =>
            d.status === "open" &&
            (!d.amount ||
              !d.expectedCloseAt ||
              d.expectedCloseAt < data.observedAt),
        ),
    );
  return (
    <Section title={T.diagnosis}>
      {groups.length ? (
        groups.map((g) => (
          <Card key={g.account.id} className="gap-sm p-lg">
            <div className={styles.projects}>
              <div className="flex flex-col gap-sm">
                <BusinessLink href={`/account/${g.account.id}`}>
                  {g.account.name}
                </BusinessLink>
                <span className="text-body-small text-muted-foreground">
                  {g.account.accountNo}
                </span>
                <Owner sub={g.account.ownerSub} members={data.members} />
                <span className="text-body-small">
                  {T.projects} {g.projects.length}
                </span>
                {data.canEditAccount ? (
                  <CooperationEditor
                    account={g.account}
                    history={
                      data.history?.find((h) => h.accountId === g.account.id) ??
                      null
                    }
                    year={data.year}
                  />
                ) : null}
              </div>
              <div className="flex flex-col gap-md">
                <ProjectItems
                  projects={g.projects}
                  data={data}
                  personal={personal}
                />
              </div>
            </div>
            <div className="mt-md flex flex-wrap justify-end gap-sm border-t border-dashed border-border pt-md">
              <Discuss
                objects={[
                  { kind: "account", id: g.account.id },
                  ...g.projects
                    .slice(0, 10)
                    .map((d) => ({ kind: "opportunity" as const, id: d.id })),
                ]}
                context={`${T.customer} ${g.account.name}; ${data.period}; ${T.observed} ${data.observedAt}\n${g.projects.map((d) => `${d.name}: ${T.status} ${d.status}; ${T.amount} ${d.amount?.amount ?? T.unknown} ${d.amount?.currency ?? ""}; ${T.date} ${d.expectedCloseAt?.slice(0, 10) ?? T.unknown}`).join("\n")}`}
              />
              <Button asChild size="sm" variant="ghost">
                <Link href={`/account/${g.account.id}`}>{T.accountDetail}</Link>
              </Button>
            </div>
          </Card>
        ))
      ) : (
        <EmptyState title={T.noData} />
      )}
    </Section>
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
  const row = makeAnalysisRow(data, scope, name);
  return (
    <>
      <SummaryMetrics data={data} row={row} />
      <PeriodAttainment data={data} row={row} />
      <ProjectDiagnosis data={data} scope={scope} />
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
  return (
    <>
      <SummaryMetrics data={data} row={row} personal />
      <PeriodAttainment data={data} row={row} />
      <ProjectDiagnosis data={data} scope={scope} personal filter={filter} />
    </>
  );
}
export function CustomerReading({
  data,
  filter,
}: {
  data: AttainmentAnalysis;
  filter: string;
}) {
  const T = attainmentCopy(useLocale());
  const rows = data.focus?.rows ?? [];
  const cards = rows
    .map((account) => {
      const deals =
        data.deals?.filter((d) => d.accountId === account.id) ?? null;
      const budgets = [
        ...new Map(
          [
            ...account.contributions.map((c) => c.budget),
            ...account.unallocated,
          ].map((b) => [b.key, b]),
        ).values(),
      ];
      const assessed = budgets.map((b) => {
        const r = analysisRow({
          scope: "workspace",
          name: account.name,
          period: b.period,
          currency: b.currency ?? data.currency ?? "CNY",
          targets: [],
          deals,
          observedAt: data.observedAt,
        });
        return {
          budget: b,
          actual:
            b.metric === "revenue"
              ? r.closed.value
              : b.metric === "pipeline"
                ? r.open.value
                : b.metric === "new_logo"
                  ? verifiedNewLogos(
                      data.history,
                      data.accounts?.filter((a) => a.id === account.id) ?? [],
                      "workspace",
                      b.period,
                      data.completeRoster,
                    ).value
                  : null,
          target: b.amount === null ? null : Number(b.amount),
        };
      });
      const achieved =
        (assessed.length > 0 || account.actions.length > 0) &&
        assessed.every(
          (x) => x.actual !== null && x.target !== null && x.actual >= x.target,
        ) &&
        account.actions.every((a) =>
          data.actionResults?.some((r) => r.actionKey === a.key && r.met),
        );
      if (
        (filter === "achieved" && !achieved) ||
        (filter === "attention" && achieved)
      )
        return null;
      return (
        <Card key={account.id} className="gap-sm p-lg">
          <div className="flex items-center justify-between gap-md">
            <BusinessLink href={`/account/${account.id}`}>
              {account.name}
            </BusinessLink>
            <Owner sub={account.ownerSub} members={data.members} />
          </div>
          <div className="mt-md flex flex-col gap-lg">
            {assessed.map(({ budget: b, actual, target }) => (
              <div
                key={b.key}
                className="grid grid-cols-3 items-center gap-md text-body-small"
              >
                <span>
                  {T[b.metric]} {"\u00b7"} {b.period}
                </span>
                <span>
                  {actual === null ? T.unknown : actual.toLocaleString()} /{" "}
                  {target === null ? T.unknown : target.toLocaleString()}{" "}
                  {b.currency}
                </span>
                <Tiers
                  value={actual}
                  target={
                    target === null
                      ? null
                      : { floor: null, target, stretch: null }
                  }
                  label={account.name}
                />
              </div>
            ))}
            {account.actions.map((a) => {
              const result = data.actionResults?.find(
                (r) => r.actionKey === a.key,
              );
              return (
                <div
                  key={a.key}
                  className="flex flex-wrap items-center justify-between gap-md border-t border-dashed border-border pt-md"
                >
                  <span className="text-body-small">{a.objective}</span>
                  <div className="flex flex-wrap items-center gap-sm text-body-small text-muted-foreground">
                    <span>
                      {T.deadline} {a.due} {"\u00b7"}{" "}
                      {result
                        ? result.met
                          ? T.achieved
                          : T.unachieved
                        : T.unverified}
                    </span>
                    {result ? (
                      <Hint text={`${result.occurredAt}: ${result.evidence}`}>
                        <Icon name="info" size="sm" />
                      </Hint>
                    ) : null}
                    {data.canVerifyAction &&
                    !data.focus?.closed &&
                    data.focus?.revision?.current &&
                    !data.focus.revision.draft ? (
                      <ActionResultEditor
                        year={data.year}
                        period={data.period}
                        revisionId={data.focus.revision.id}
                        accountId={account.id}
                        action={a}
                        result={result ?? null}
                      />
                    ) : null}
                  </div>
                </div>
              );
            })}
          </div>
          <div className="mt-md flex justify-end gap-sm">
            <Discuss
              objects={[{ kind: "account", id: account.id }]}
              context={`${account.name} ${data.period}; ${T.goal}: ${account.actions.map((a) => `${a.objective} ${a.due}`).join("; ")}; ${T.unverified}`}
            />
            <Button asChild size="sm" variant="ghost">
              <Link
                href={`/named/${account.id}?year=${data.year}&period=${data.period}`}
              >
                {T.customerAction}
              </Link>
            </Button>
          </div>
        </Card>
      );
    })
    .filter(Boolean);
  return (
    <Section title={T.customerGoals}>
      {!data.focus ? (
        <EmptyState title={T.failed} />
      ) : !rows.length ? (
        <EmptyState title={T.noGoals} />
      ) : cards.length ? (
        cards
      ) : (
        <EmptyState title={T.noData} />
      )}
    </Section>
  );
}
