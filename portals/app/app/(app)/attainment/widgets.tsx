"use client";
import Link from "next/link";
import { useState, type ReactNode } from "react";
import {
  Button,
  Card,
  Icon,
  Progress,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  UserAvatar,
} from "@vxture/design-system";
import type { AttainmentMetricTarget } from "../../domains/planning/attainment-plan";
import {
  tierProgress,
  customerComposition,
  verifiedNewLogos,
  type AnalysisRow,
  type MetricFact,
  selectedDeals,
} from "../../domains/pipeline/lib/attainment-analysis";
import type { AttainmentAnalysis } from "./analysis-board";
import { attainmentCopy } from "./copy";
import { useLocale } from "../lib/i18n/provider";
import { useOptionalXiaoyu, useOptionalXiaoyuClient } from "../components/xiaoyu-provider";
import { useAssistantVisibility } from "../components/assistant-visibility";
import links from "../components/business-reference.module.css";
import styles from "./workspace.module.css";
import { moneyScale } from "./format";

export function Hint({
  text,
  children,
}: {
  text: ReactNode;
  children: ReactNode;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          tabIndex={0}
          className="inline-flex min-w-0 cursor-help items-center w-full"
        >
          {children}
        </span>
      </TooltipTrigger>
      <TooltipContent variant="surface">{text}</TooltipContent>
    </Tooltip>
  );
}
export function Numeric({
  value,
  currency,
  sign = false,
}: {
  value: number | null;
  currency?: string;
  sign?: boolean;
}) {
  const locale = useLocale();
  const displayed =
    value === null
      ? null
      : value / moneyScale(locale, currency ?? "CNY").divisor;
  return (
    <span
      className={styles.amount}
      title={
        value === null
          ? undefined
          : new Intl.NumberFormat(locale, {
              style: currency ? "currency" : "decimal",
              currency,
              maximumFractionDigits: 2,
              minimumFractionDigits: 2,
            }).format(value)
      }
    >
      {value === null
        ? "\u2014"
        : new Intl.NumberFormat(locale, {
            maximumFractionDigits: 2,
            minimumFractionDigits: 2,
            signDisplay: sign ? "always" : "auto",
            useGrouping: false,
          }).format(displayed!)}
    </span>
  );
}
export function Tiers({
  value,
  target,
  label,
}: {
  value: number | null;
  target: Pick<AttainmentMetricTarget, "floor" | "target" | "stretch"> | null;
  label: string;
}) {
  const locale = useLocale(),
    T = attainmentCopy(locale);
  const scale = tierProgress(value, target);
  const stage = scale
    ? {
        below: T.below,
        floor: T.floorReached,
        target: T.targetReached,
        stretch: T.stretchReached,
      }[scale.stage]
    : target
      ? T.unknown
      : T.noTarget;
  return (
    <Hint
      text={
        <div className="space-y-xs">
          <div>{stage}</div>
          {scale?.marks.map((m) => (
            <div key={m.key} className="flex justify-between gap-lg">
              <span>{T[m.key]}</span>
              <span className="tabular-nums">
                {m.value.toLocaleString(locale)}
              </span>
            </div>
          ))}
        </div>
      }
    >
      <span
        className="relative block w-full"
        data-attainment-tier={scale?.stage ?? "unknown"}
      >
        <Progress
          aria-label={label}
          aria-valuetext={stage}
          value={scale ? Math.max(0, value!) : 0}
          max={scale?.maximum ?? 1}
          className={`h-sm ${scale?.stage === "stretch" ? "[&>div]:bg-success" : scale?.stage === "floor" ? "[&>div]:bg-info" : "[&>div]:bg-primary"}`}
        />
        {scale?.marks.map((m) => (
          <span
            key={m.key}
            aria-hidden
            className="pointer-events-none absolute inset-y-0 border-l border-dashed border-muted-foreground/30"
            style={{ left: `${m.position}%` }}
          />
        ))}
      </span>
    </Hint>
  );
}
export function Discuss({
  context,
  objects = [],
}: {
  context: string;
  objects?: { kind: "account" | "opportunity"; id: string }[];
}) {
  const client = useOptionalXiaoyuClient(),
    conversation = useOptionalXiaoyu(),
    visibility = useAssistantVisibility(),
    T = attainmentCopy(useLocale());
  const [notice, setNotice] = useState(false);
  if (!client) return null;
  return (
    <span className="inline-flex items-center gap-xs">
      <Button
        variant="secondary"
        size="sm"
        disabled={conversation?.loading}
        onClick={() => {
          const state = client.getSnapshot();
          if (state.input.trim()) {
            setNotice(true);
            visibility.open();
            return;
          }
          client.setPageListing("/attainment", {
            filters: Object.fromEntries(
              [...new URLSearchParams(location.search)].filter(([key]) =>
                [
                  "screen",
                  "scope",
                  "period",
                  "planRevision",
                  "metric",
                  "filter",
                ].includes(key),
              ),
            ),
            selection: objects,
          });
          client.setInput(`${T.discussPrefix}\n${context}`);
          visibility.open();
          setNotice(false);
        }}
      >
        <Icon name="sparkles" size="sm" />
        {T.discuss}
      </Button>
      {notice ? (
        <Hint text={T.draftExists}>
          <Icon name="info" size="sm" />
        </Hint>
      ) : null}
    </span>
  );
}
export function Owner({
  sub,
  members,
}: {
  sub: string | null;
  members: AttainmentAnalysis["members"];
}) {
  const T = attainmentCopy(useLocale());
  const name =
    members.find((m) => m.sub === sub)?.name || (sub ? T.noName : T.noOwner);
  return (
    <span className="inline-flex items-center gap-xs text-body-small">
      <UserAvatar className="size-control-md" alt={name} />
      <span>{name}</span>
    </span>
  );
}
export function SummaryMetrics({
  data,
  row,
  personal = false,
}: {
  data: AttainmentAnalysis;
  row: AnalysisRow;
  personal?: boolean;
}) {
  const locale = useLocale(),
    T = attainmentCopy(locale);
  const format = (v: number | null) =>
    v === null
      ? "\u2014"
      : new Intl.NumberFormat(locale, { maximumFractionDigits: 2 }).format(v);
  const units = moneyScale(locale, row.currency);
  const money = (v: number | null) =>
    format(v === null ? null : v / units.divisor);
  const targets = data.targets ?? [];
  const margin =
    targets.find(
      (t) =>
        t.scope === row.scope &&
        t.period === row.period &&
        t.metric === "margin" &&
        t.currency === row.currency,
    ) ?? null;
  const logo =
    targets.find(
      (t) =>
        t.scope === row.scope &&
        t.period === row.period &&
        t.metric === "new_logo",
    ) ?? null;
  const currentAccounts =
    data.accounts?.filter((a) =>
      row.scope.startsWith("owner:")
        ? a.ownerSub === row.scope.slice(6) ||
          !!data.deals?.some(
            (d) => d.accountId === a.id && d.ownerSub === row.scope.slice(6),
          )
        : row.scope.startsWith("territory:")
          ? data.deals?.some(
              (d) =>
                d.accountId === a.id && d.territoryId === row.scope.slice(10),
            )
          : true,
    ) ?? [];
  const composition = customerComposition({
    accounts: currentAccounts,
    history: data.history,
    year: data.year,
    period: row.period,
    observedAt: data.observedAt,
  });
  const newLogos = verifiedNewLogos(
    data.history,
    data.accounts ?? [],
    row.scope,
    row.period,
    data.completeRoster,
  );
  const stage = (fact: MetricFact, target: AttainmentMetricTarget | null) => {
    const scale = tierProgress(fact.value, target);
    return scale
      ? {
          below: T.below,
          floor: T.floorReached,
          target: T.targetReached,
          stretch: T.stretchReached,
        }[scale.stage]
      : fact.state !== "ready"
        ? T[fact.state]
        : T.noTarget;
  };
  const reviewTotal = data.deals
    ? selectedDeals(data.deals, row.scope, row.period).filter(
        (d) => d.status === "open",
      ).length +
      data.deals.filter(
        (d) =>
          d.status === "open" &&
          !d.expectedCloseAt &&
          (row.scope === "workspace" ||
            (row.scope.startsWith("owner:") &&
              row.scope.slice(6) === d.ownerSub) ||
            row.scope === `territory:${d.territoryId}`),
      ).length
    : 0;
  const coverageLabel =
    row.gap === 0
      ? T.covered
      : row.coverage === null
        ? T.unknown
        : row.coverage < 2
          ? T.lowCoverage
          : row.coverage < 3
            ? T.developCoverage
            : row.coverage < 4
              ? T.goodCoverage
              : T.highCoverage;
  return (
    <div className={styles.metrics}>
      <Card className={styles.metric}>
        <span className="text-body-small text-muted-foreground">
          {T.revenue} <span className="tabular-nums">{units.label}</span>
        </span>
        <strong className={styles.metricValue}>
          {money(row.closed.value)}
        </strong>
        <div className="flex justify-between text-body-small">
          <span>{stage(row.closed, row.target)}</span>
          <span>
            {row.rate === null ? "\u2014" : `${format(row.rate * 100)}%`}
          </span>
        </div>
        <Tiers value={row.closed.value} target={row.target} label={T.revenue} />
        <span className={styles.metricAux}>
          {T.target} {row.target ? money(row.target.target) : T.noTarget}
        </span>
      </Card>
      {personal ? (
        <Card className={styles.metric}>
          <Hint text={T.historyHelp}>
            <span className="text-body-small text-muted-foreground">
              {T.customerCount}
              <Icon name="info" size="xs" className="ml-xs" />
            </span>
          </Hint>
          <strong className={styles.metricValue}>
            {data.accounts ? currentAccounts.length : "\u2014"}
          </strong>
          <div className="flex justify-between text-body-small">
            <span>
              {T.new} {composition?.new ?? "\u2014"}
            </span>
            <span>
              {T.added} {composition?.added ?? "\u2014"}
            </span>
          </div>
          <div
            role="img"
            aria-label={
              composition
                ? `${T.old} ${composition.old}, ${T.new} ${composition.new}, ${T.unknownHistory} ${composition.unknown}`
                : T.historyUnavailable
            }
            className="flex h-sm overflow-hidden rounded-full bg-accent"
          >
            {composition && composition.total > 0 ? (
              <>
                <span
                  className="bg-primary-muted-strong"
                  style={{
                    width: `${(composition.old / composition.total) * 100}%`,
                  }}
                />
                <span
                  className="bg-primary"
                  style={{
                    width: `${(composition.new / composition.total) * 100}%`,
                  }}
                />
              </>
            ) : null}
          </div>
          <span className={styles.metricAux}>
            {composition
              ? `${T.old} ${composition.old} \u00b7 ${T.historyStatus} ${composition.unknown} \u00b7 ${T.prospect} ${composition.prospect}`
              : T.historyUnavailable}
          </span>
        </Card>
      ) : (
        <Card className={styles.metric}>
          <Hint text={T.financialHelp}>
            <span className="text-body-small text-muted-foreground">
              {T.margin}
              <Icon name="info" size="xs" className="ml-xs" />
            </span>
          </Hint>
          <strong className={styles.metricValue}>
            {"\u2014"}
            <span className="text-body-small font-normal text-muted-foreground">
              {T.grossRate} {"\u2014"}
            </span>
          </strong>
          <div className="text-body-small">{T.noSource}</div>
          <Tiers value={null} target={margin} label={T.margin} />
          <span className={styles.metricAux}>
            {T.target} {margin ? money(margin.target) : T.noTarget}
            {margin?.marginRates?.target
              ? ` \u00b7 ${T.grossRate} ${margin.marginRates.target}%`
              : ""}
          </span>
        </Card>
      )}
      <Card className={styles.metric}>
        <Hint text={T.coverageHelp}>
          <span className="text-body-small text-muted-foreground">
            {T.pipeline}
            <Icon name="info" size="xs" className="ml-xs" />
          </span>
        </Hint>
        <strong className={styles.metricValue}>{money(row.open.value)}</strong>
        <div className="flex justify-between text-body-small">
          <span>{coverageLabel}</span>
          <span>
            {row.coverage === null ? "\u2014" : `${format(row.coverage)}\u00d7`}
          </span>
        </div>
        <Tiers
          value={row.coverage}
          target={{ floor: 2, target: 3, stretch: 4 }}
          label={T.coverage}
        />
        <span className={styles.metricAux}>
          {T.remaining} {money(row.gap)} {"\u00b7"} {units.label}
        </span>
      </Card>
      {personal ? (
        <Card className={styles.metric}>
          <span className="text-body-small text-muted-foreground">
            {T.pending}
          </span>
          <strong className={styles.metricValue}>
            {data.deals ? row.pending : "\u2014"}
          </strong>
          <span className="text-body-small">
            {row.pending ? T.attention : T.normal}
          </span>
          <Hint
            text={`${T.reviewed} ${Math.max(0, reviewTotal - row.pending)} / ${reviewTotal}`}
          >
            <Progress
              value={data.deals ? Math.max(0, reviewTotal - row.pending) : null}
              max={Math.max(1, reviewTotal)}
              className="h-sm"
              aria-label={T.reviewed}
            />
          </Hint>
          <span className={styles.metricAux}>
            {T.undated} {row.undated}
          </span>
        </Card>
      ) : (
        <Card className={styles.metric}>
          <span className="text-body-small text-muted-foreground">
            {T.new_logo}
          </span>
          <strong className={styles.metricValue}>
            {format(newLogos.value)}
          </strong>
          <div className="text-body-small">{stage(newLogos, logo)}</div>
          <Tiers value={newLogos.value} target={logo} label={T.new_logo} />
          <span className={styles.metricAux}>
            {newLogos.state !== "ready"
              ? `${T.historyStatus} ${newLogos.missing}`
              : `${T.target} ${logo ? format(logo.target) : T.noTarget}`}
          </span>
        </Card>
      )}
    </div>
  );
}
export function BusinessLink({
  href,
  children,
}: {
  href: string;
  children: ReactNode;
}) {
  return (
    <Link
      href={href}
      className={`inline-flex items-center gap-xs ${links.link}`}
    >
      <Icon name="external-link" size="xs" />
      {children}
    </Link>
  );
}
