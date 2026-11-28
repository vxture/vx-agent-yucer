"use client";
import Link from "next/link";
import { useState } from "react";
import {
  Button,
  Card,
  Drawer,
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
import { customerGoalRows } from "./goal-model";
import { attainmentCopy, customerGoalLabel } from "./copy";
import { useLocale } from "../lib/i18n/provider";
import { BusinessLink, Discuss, Numeric, Owner, Tiers } from "./widgets";
import { Tag } from "../components/tag";
import styles from "./workspace.module.css";
import { moneyScale } from "./format";
import { selectedDeals } from "../../domains/pipeline/lib/attainment-analysis";
import { periodPhase } from "./progress-model";

type Goal = ReturnType<typeof customerGoalRows>[number]["goals"][number];
export function CustomerGoals({
  data,
  filter,
  scope = "workspace",
}: {
  data: AttainmentAnalysis;
  filter: string;
  scope?: string;
}) {
  const locale = useLocale(),
    T = attainmentCopy(locale),
    [evidence, setEvidence] = useState<{
      account: ReturnType<typeof customerGoalRows>[number]["account"];
      goal: Goal;
    } | null>(null);
  const rows = customerGoalRows(data, scope)
    .map((r) => ({
      ...r,
      contributionMetrics: [...new Set(r.goals.map((g) => g.metric))],
      goals: r.goals.filter((g) => filter === "all" || g.state === filter),
    }))
    .filter((r) => r.goals.length);
  const display = (value: number | null, g: Goal) =>
    value === null ? (
      T.unverified
    ) : g.currency ? (
      <span className={styles.goalAmount}>
        <Numeric value={value} currency={g.currency} />
        <span className="text-muted-foreground">
          {moneyScale(locale, g.currency).label}
        </span>
      </span>
    ) : (
      String(value)
    );
  const title = (g: Goal) => customerGoalLabel(g.metric, locale);
  return (
    <>
      {!data.focus ? (
        <EmptyState title={T.failed} />
      ) : !rows.length ? (
        <EmptyState title={data.focus.rows.length ? T.noData : T.noGoals} />
      ) : (
        rows.map(({ account, goals, contributionMetrics }) => (
          <Card key={account.id} className={styles.customerCard}>
            <header className={styles.customerHeading}>
              <div className={styles.customerIdentity}>
                <div className={styles.customerTitle}>
                  <BusinessLink href={`/account/${account.id}`} icon="building-office">
                    {account.name}
                  </BusinessLink>
                  {contributionMetrics.map((metric) => (
                    <Tag key={metric}>{customerGoalLabel(metric, locale)}</Tag>
                  ))}
                </div>
                <span className={styles.customerMeta}>
                  {account.accountNo}
                  {account.regions.length
                    ? ` \u00b7 ${account.regions.map((r) => r.name).join(" / ")}`
                    : ""}
                </span>
              </div>
              <div className="flex items-center gap-sm text-body-small">
                <span className="text-muted-foreground">{T.accountOwner}</span>
                <Owner sub={account.ownerSub} members={data.members} />
              </div>
            </header>
            <div className={styles.customerBody}>
              <Table className={styles.table}>
                <TableHeader>
                  <TableRow>
                    {[
                      T.number,
                      T.goal,
                      T.target,
                      T.result,
                      T.attainment,
                      T.deadline,
                      T.action,
                    ].map((h, i) => (
                      <TableHead key={i}>{h}</TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {goals.map((g, i) => (
                    <TableRow key={g.key}>
                      <TableCell>{i + 1}</TableCell>
                      <TableCell>
                        <div className={styles.projectName}>
                          <span className="font-medium">{title(g)}</span>
                          <span className={styles.customerMeta}>
                            {g.period}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-col items-center gap-xs tabular-nums">
                          {display(g.target, g)}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className={`flex flex-col items-center gap-xs tabular-nums ${g.actual === null ? "text-muted-foreground" : "text-primary-text"}`}>
                          {display(g.actual, g)}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className={styles.goalProgress}>
                          <div className={styles.goalStatus}>
                            <span
                              className={
                                g.state === "achieved"
                                  ? "text-success-text"
                                  : g.state === "attention"
                                    ? "text-warning-text"
                                    : "text-muted-foreground"
                              }
                            >
                              {T[g.state]}
                            </span>
                            {g.actual !== null && g.target !== null && g.target > 0 ? (
                              <span className="text-muted-foreground">
                                {((g.actual / g.target) * 100).toLocaleString(locale, { maximumFractionDigits: 1 })}%
                              </span>
                            ) : null}
                          </div>
                          <Tiers
                            value={g.actual}
                            target={
                              g.target === null
                                ? null
                                : {
                                    floor: null,
                                    target: g.target,
                                    stretch: null,
                                  }
                            }
                            label={title(g)}
                          />
                          {g.actual !== null && g.target !== null && g.target > g.actual && (
                            <span className="text-body-small text-muted-foreground">
                              {T.difference}{" "}
                              {(g.currency ? (g.actual - g.target) / moneyScale(locale, g.currency).divisor : g.actual - g.target).toLocaleString(locale)}
                              {g.currency ? ` ${moneyScale(locale, g.currency).label}` : ""}
                            </span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-center whitespace-nowrap text-body-small tabular-nums">
                        {g.due ?? T.dateUnknown}
                      </TableCell>
                      <TableCell>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setEvidence({ account, goal: g })}
                        >
                          <Icon name="file-text" size="sm" className="text-primary-text opacity-muted" />
                          {T.goalEvidence}
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            <footer className={styles.customerFooter}>
              <span>
                {T.targetSource} {data.period}{" "}
                {data.focus?.revision
                  ? `\u00b7 V${data.focus.revision.version}`
                  : ""}
              </span>
              <Discuss
                objects={[{ kind: "account", id: account.id }]}
                context={`${account.name} ${data.period}\n${goals.map((g) => `${title(g)}; ${T.target} ${g.target}; ${T.result} ${g.actual ?? T.unverified}; ${T.status} ${T[g.state]}; ${g.currency ?? ""}; ${T.deadline} ${g.due}`).join("\n")}`}
              />
            </footer>
          </Card>
        ))
      )}
      <Drawer
        open={!!evidence}
        onClose={() => setEvidence(null)}
        width="lg"
        className="max-w-[100vw]"
        title={
          evidence
            ? `${evidence.account.name} \u00b7 ${title(evidence.goal)}`
            : T.goalEvidence
        }
      >
        {evidence && (
          <div className="flex flex-col gap-xl">
            <dl className="grid grid-cols-2 gap-md text-body-small">
              <dt className="text-muted-foreground">{T.targetSource}</dt>
              <dd>
                {data.period}{" "}
                {data.focus?.revision
                  ? `\u00b7 V${data.focus.revision.version}`
                  : ""}
              </dd>
              <dt className="text-muted-foreground">{T.target}</dt>
              <dd>{display(evidence.goal.target, evidence.goal)}</dd>
              <dt className="text-muted-foreground">{T.result}</dt>
              <dd>{display(evidence.goal.actual, evidence.goal)}</dd>
              <dt className="text-muted-foreground">{T.status}</dt>
              <dd>{T[evidence.goal.state]}</dd>
              <dt className="text-muted-foreground">{T.deadline}</dt>
              <dd>{evidence.goal.due ?? T.dateUnknown}</dd>
            </dl>
            <Section level={3} title={T.evidence} icon="file-text">
                <div className="flex flex-col gap-sm">
                  {(evidence.goal.metric === "revenue" || evidence.goal.metric === "pipeline" ? selectedDeals(data.deals ?? [], scope, evidence.goal.period) : [])
                    .filter((d) => d.accountId === evidence.account.id && (evidence.goal.metric === "revenue" ? d.status === "won" : d.status === "open" && periodPhase(evidence.goal.period, data.observedAt) !== "ended") && (!d.amount || d.amount.currency === evidence.goal.currency))
                    .map((d) => (
                      <div
                        key={d.id}
                        className="flex flex-wrap justify-between gap-sm border-b border-dashed border-border py-sm text-body-small"
                      >
                        <BusinessLink href={`/pipeline/${d.id}`}>
                          {d.name}
                        </BusinessLink>
                        <span>
                          {d.status === "won" ? T.won : T.open}{" "}
                          {d.amount
                            ? `${d.amount.amount.toLocaleString(locale)} ${d.amount.currency}`
                            : T.unpriced}
                        </span>
                      </div>
                    ))}
                  <p className="text-body-small text-muted-foreground">
                    {T.goalBasisHelp}
                  </p>
                </div>
            </Section>
            <Button variant="ghost" size="sm" asChild>
              <Link
                href={`/named/${evidence.account.id}?year=${data.year}&period=${data.period}`}
              >
                {T.customerAction}
              </Link>
            </Button>
          </div>
        )}
      </Drawer>
    </>
  );
}
