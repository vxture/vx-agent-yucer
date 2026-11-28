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
  customerComposition,
  verifiedNewLogos,
  type AnalysisRow,
  type MetricFact,
  selectedDeals,
} from "../../domains/pipeline/lib/attainment-analysis";
import type { AttainmentAnalysis } from "./analysis-board";
import { attainmentCopy } from "./copy";
import { useLocale } from "../lib/i18n/provider";
import {
  useOptionalXiaoyu,
  useOptionalXiaoyuClient,
} from "../components/xiaoyu-provider";
import { useAssistantVisibility } from "../components/assistant-visibility";
import links from "../components/business-reference.module.css";
import styles from "./workspace.module.css";
import { moneyScale } from "./format";
import { targetProgress, periodPhase } from "./progress-model";
import { personalPending } from "./personal-model";

export function Hint({
  text,
  children,
  inline = false,
}: {
  text: ReactNode;
  children: ReactNode;
  inline?: boolean;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          tabIndex={0}
          className={`inline-flex min-w-0 cursor-help items-center ${inline ? "shrink-0" : "w-full"}`}
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
  phase = "active",
}: {
  value: number | null;
  target: Pick<AttainmentMetricTarget, "floor" | "target" | "stretch"> | null;
  label: string;
  phase?: "active" | "ended" | "upcoming";
}) {
  const locale = useLocale(),
    T = attainmentCopy(locale);
  const { scale, state, tone } = targetProgress(value, target, phase);
  const stage = T[state];
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
          data-tone={tone}
          className={styles.tierTrack}
        />
        {scale?.marks.filter((m, i, all) => !all.slice(i + 1).some((next) => next.value === m.value)).map((m) => (
          <span
            key={m.key}
            aria-hidden
            className={styles.tierMarker}
            data-tier={m.key}
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
        variant="ghost"
        size="xl"
        className="text-body-small"
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
    <span className="inline-flex min-w-0 max-w-full items-center gap-xs text-body-small" title={name}>
      <UserAvatar className="size-control-md shrink-0" alt={name} />
      <span className="truncate">{name}</span>
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
          ? a.regionId === row.scope.slice(10) || data.deals?.some(
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
  const phase = periodPhase(row.period, data.observedAt);
  const stage = (fact: MetricFact, target: AttainmentMetricTarget | null) =>
    fact.state !== "ready" ? T[fact.state] : T[targetProgress(fact.value, target, phase).state];
  const pending = personalPending(data);
  const pendingSegments = pending ? [
    { label: T.delayed, count: pending.kinds.delayed, color: "var(--destructive)" },
    { label: T.conditions, count: pending.kinds.conditions, color: "var(--warning)" },
    { label: T.missingBasis, count: pending.kinds.missingBasis, color: "var(--info)" },
    { label: T.customerGoals, count: pending.kinds.goals, color: "var(--chart-4)" },
  ].filter((s) => s.count > 0) : [];
  const historical = phase === "ended";
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
  const revenueCard = (
    <MetricCard
      label={T.revenue}
      icon="coins"
      value={money(row.closed.value)}
      unit={units.label}
      status={stage(row.closed, row.target)}
      ratio={row.rate === null ? "\u2014" : `${format(row.rate * 100)}%`}
      progress={
        <Tiers value={row.closed.value} target={row.target} label={T.revenue} phase={phase} />
      }
      note={row.target ? `${T.target} ${money(row.target.target)} ${units.label}` : T.noTarget}
    />
  );
  const pipelineCard = (
    <MetricCard
      label={T.pipeline}
      icon="stack"
      help={T.coverageHelp}
      value={money(historical ? null : row.open.value)}
      unit={units.label}
      status={historical ? T.noHistoricalReserve : coverageLabel}
      ratio={historical || row.coverage === null ? "\u2014" : `${format(row.coverage)}\u00d7`}
      progress={
        <Tiers
          value={historical ? null : row.coverage}
          target={{ floor: 2, target: 3, stretch: 4 }}
          label={T.coverage}
        />
      }
      note={`${T.remaining} ${money(row.gap)} ${units.label}`}
    />
  );
  return (
    <div className={styles.metrics}>
      {revenueCard}
      {personal ? (
        <MetricCard
          label={T.customerCount}
          icon="users"
          help={T.historyHelp}
          value={data.accounts ? String(currentAccounts.length) : "\u2014"}
          status={`${T.old} ${composition?.old ?? "\u2014"} \u00b7 ${T.new} ${composition?.new ?? "\u2014"}`}
          ratio={`${T.historyStatus} ${composition?.unknown ?? "\u2014"}`}
          progress={
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
          }
          note={
            composition
              ? `${T.added} ${composition.added} \u00b7 ${T.prospect} ${composition.prospect}`
              : T.historyUnavailable
          }
        />
      ) : (
        <MetricCard
          label={T.new_logo}
          icon="user-plus"
          help={T.historyHelp}
          value={format(newLogos.value)}
          companion={<span>{T.totalCustomers} {data.accounts ? format(currentAccounts.length) : "\u2014"}</span>}
          status={stage(newLogos, logo)}
          ratio={
            logo && logo.target > 0 && newLogos.value !== null
              ? `${format((newLogos.value / logo.target) * 100)}%`
              : "\u2014"
          }
          progress={
            <Tiers value={newLogos.value} target={logo} label={T.new_logo} phase={phase} />
          }
          note={
            newLogos.state !== "ready"
              ? `${T.historyStatus} ${newLogos.missing}`
              : `${T.target} ${logo ? format(logo.target) : T.noTarget}`
          }
        />
      )}
      {pipelineCard}
      {personal ? (
        <MetricCard
          label={T.pendingItems}
          icon="list-checks"
          value={pending ? String(pending.total) : "\u2014"}
          status={T.itemMix}
          ratio={pending ? `${pendingSegments.length} ${T.kinds}` : "\u2014"}
          progress={<Hint text={pending ? pendingSegments.map((s) => `${s.label} ${s.count}`).join("; ") || T.normal : T.unknown}>
            <div className={styles.compositionTrack} role="img" aria-label={T.itemMix}>{pending && pending.total > 0 ? pendingSegments.map((s) => <span key={s.label} style={{ width: `${s.count / pending.total * 100}%`, background: s.color }} />) : null}</div>
          </Hint>}
          note={pending ? pendingSegments.map((s) => `${s.label} ${s.count}`).join(" \u00b7 ") || T.normal : historical ? T.noHistoricalReserve : T.unknown}
        />
      ) : (
        <MetricCard
          label={T.margin}
          icon="chart-line-up"
          help={T.financialHelp}
          value={"\u2014"}
          unit={units.label}
          companion={
            <span>
              {T.grossRate} {"\u2014"}
            </span>
          }
          status={T.noSource}
          ratio={"\u2014"}
          progress={<Tiers value={null} target={margin} label={T.margin} />}
          note={margin ? `${T.target} ${money(margin.target)} ${units.label}${margin.marginRates?.target ? ` \u00b7 ${T.grossRate} ${margin.marginRates.target}%` : ""}` : T.noTarget}
        />
      )}
    </div>
  );
}
export function MetricCard({
  label,
  icon,
  value,
  unit,
  companion,
  status,
  ratio,
  progress,
  note,
  help,
}: {
  label: string;
  icon: import("react").ComponentProps<typeof Icon>["name"];
  value: string;
  unit?: string;
  companion?: ReactNode;
  status?: ReactNode;
  ratio?: ReactNode;
  progress?: ReactNode;
  note: ReactNode;
  help?: ReactNode;
}) {
  const title = (
    <span className={styles.metricLabel}>
      <Icon name={icon} size="sm" />
      <span>{label}</span>
      {help ? (
        <Icon name="info" size="xs" className="ml-auto text-muted-foreground" />
      ) : null}
    </span>
  );
  return (
    <Card className={styles.metric} data-metric-known={value !== "\u2014"}>
      {help ? <Hint text={help}>{title}</Hint> : title}
      <div className={styles.metricValue}>
        <strong>{value}</strong>
        {unit && <span className={styles.metricUnit}>{unit}</span>}
        {companion && (
          <span className={styles.metricCompanion}>{companion}</span>
        )}
      </div>
      {progress ? (
        <div className={styles.metricProgress}>
          <div className={styles.metricStatus}>
            <span>{status}</span>
            <span className="tabular-nums">{ratio}</span>
          </div>
          {progress}
        </div>
      ) : null}
      <div className={styles.metricAux}>{note}</div>
    </Card>
  );
}
export function BusinessLink({
  href,
  children,
  icon = "external-link",
}: {
  href: string;
  children: ReactNode;
  icon?: import("react").ComponentProps<typeof Icon>["name"];
}) {
  return (
    <Link
      href={href}
      className={`inline-flex items-center gap-xs ${links.link}`}
    >
      <Icon name={icon} size="sm" />
      {children}
    </Link>
  );
}
