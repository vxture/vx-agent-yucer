"use client";
import { useState } from "react";
import {
  Card,
  EmptyState,
  Icon,
  Section,
  UserAvatar,
} from "@vxture/design-system";
import type { AttainmentAnalysis } from "./analysis-board";
import { makeAnalysisRow } from "./analysis-row";
import { useLocale } from "../lib/i18n/provider";
import { attainmentCopy } from "./copy";
import {
  verifiedNewLogos,
  selectedDeals,
  type AnalysisRow,
  type AnalysisDeal,
} from "../../domains/pipeline/lib/attainment-analysis";
import { dealDiagnosis } from "./deal-diagnosis";
import { periodRange } from "../../domains/shared/period";
import { moneyScale } from "./format";
import styles from "./workspace.module.css";
import { AttainmentChart } from "./business-charts";

type Metric = "revenue" | "pipeline" | "new_logo" | "margin";
function historical(data: AttainmentAnalysis, period: string) {
  const range = periodRange(period);
  return !!range && range.end.toISOString() <= data.observedAt;
}
function metricValues(
  data: AttainmentAnalysis,
  row: AnalysisRow,
  metric: Metric,
) {
  if (metric === "revenue")
    return { actual: row.closed.value, target: row.target?.target ?? null };
  const target =
    data.targets?.find(
      (t) =>
        t.scope === row.scope &&
        t.period === row.period &&
        t.metric === metric &&
        (metric === "new_logo" || t.currency === row.currency),
    )?.target ?? null;
  return {
    target,
    actual:
      metric === "pipeline"
        ? historical(data, row.period)
          ? null
          : row.open.value
        : metric === "new_logo"
          ? verifiedNewLogos(
              data.history,
              data.accounts ?? [],
              row.scope,
              row.period,
              data.completeRoster,
            ).value
          : null,
  };
}
const Plot = AttainmentChart;
export function RegionalCharts({
  data,
  metric,
}: {
  data: AttainmentAnalysis;
  metric: Metric;
}) {
  const locale = useLocale(),
    T = attainmentCopy(locale),
    [hoverKey, setHoverKey] = useState<string | null>(null),
    units = moneyScale(locale, data.currency ?? "CNY"),
    divisor = metric === "new_logo" ? 1 : units.divisor;
  const rows = data.regions.map((r) =>
      makeAnalysisRow(data, `territory:${r.id}`, r.name),
    ),
    points = rows.map((r) => ({ key: r.scope, label: r.name, value: 0 })),
    metrics = rows.map((r) => metricValues(data, r, metric));
  const map = (get: (m: ReturnType<typeof metricValues>) => number | null) =>
    Object.fromEntries(rows.map((r, i) => [r.scope, get(metrics[i]!)]));
  const quarters = [1, 2, 3, 4].map((q) => `${data.year}Q${q}`),
    quarterSeries = data.regions.map((region) => {
      const entries = quarters.map((period) => {
        const r = makeAnalysisRow(
          data,
          `territory:${region.id}`,
          region.name,
          period,
        );
        return { period, ...metricValues(data, r, metric) };
      });
      return {
        key: `territory:${region.id}`,
        label: region.name,
        values: Object.fromEntries(entries.map((e) => [e.period, e.actual])),
        referenceLabel: T.target,
        references: Object.fromEntries(
          entries.map((e) => [e.period, e.target]),
        ),
      };
    });
  const format = (v: number) =>
      new Intl.NumberFormat(locale, { maximumFractionDigits: 2 }).format(
        v / divisor,
      ),
    ratio = map((m) =>
      m.target !== null && m.target > 0 && m.actual !== null
        ? (m.actual / m.target) * 100
        : null,
    ),
    gaps = map((m) =>
      m.target !== null && m.actual !== null
        ? Math.max(0, m.target - m.actual)
        : null,
    );
  const complete = metrics.every((m) => m.actual !== null && m.target !== null),
    company = makeAnalysisRow(data, "workspace", T.company),
    unassigned =
      company.closed.value !== null &&
      rows.every((r) => r.closed.value !== null)
        ? company.closed.value - rows.reduce((n, r) => n + r.closed.value!, 0)
        : null;
  const linked = { hoverKey, onHoverKey: setHoverKey };
  return (
    <div className={styles.dashboard}>
      <div className={styles.chartGrid} data-regional="true">
        <Plot
          {...linked}
          categoryColors
          title={`${T[metric]} \u00b7 ${T.targetActual}`}
          note={metric === "new_logo" ? undefined : units.label}
          data={points}
          series={[
            {
              key: "actual",
              label: T.actual,
              values: map((m) => m.actual),
              references: map((m) => m.target),
              referenceLabel: T.target,
            },
          ]}
          format={format}
        />
        <Plot
          {...linked}
          title={T.rate}
          variant="rate"
          categoryColors
          note="100%"
          data={points}
          series={[{ key: "rate", label: T.rate, values: ratio }]}
          referenceValue={100}
          format={(v) => `${v.toFixed(1)}%`}
        />
        <Plot
          {...linked}
          title={T.quarterTrend}
          note={T.fullYear}
          data={quarters.map((p) => ({ key: p, label: p.slice(-2), value: 0 }))}
          series={quarterSeries}
          variant="line"
          tooltipMatrix={{ rowLabel: T.regionName, unit: metric === "new_logo" ? T.accountsUnit : units.label }}
          format={format}
        />
        {complete ? (
          <Plot
            {...linked}
            title={T.gapShare}
            note={metric === "new_logo" ? undefined : units.label}
            data={points}
            series={[{ key: "gap", label: T.remaining, values: gaps }]}
            variant="donut"
            format={format}
          />
        ) : (
          <Card className={styles.plotCard}>
            <Section level={3} title={T.gapShare}>
              <div className={styles.plotEmpty}>
                <EmptyState title={T.partialDistribution} />
              </div>
            </Section>
          </Card>
        )}
      </div>
      {metric === "revenue" && unassigned !== null && unassigned > 0 ? (
        <p className={styles.chartFoot}>
          <Icon name="info" size="sm" />
          {T.missingAllocation} {format(unassigned)} {units.label}
        </p>
      ) : null}
    </div>
  );
}
function knownAmount(deals: AnalysisDeal[] | null, currency: string) {
  return !deals ||
    deals.some((d) => !d.amount || d.amount.currency !== currency)
    ? null
    : deals.reduce((n, d) => n + d.amount!.amount, 0);
}
export function TeamCharts({
  data,
  view = "amount",
}: {
  data: AttainmentAnalysis;
  view?: string;
}) {
  const locale = useLocale(),
    T = attainmentCopy(locale),
    [member, setMember] = useState<string | null>(null),
    [hoverKey, setHoverKey] = useState<string | null>(null),
    units = moneyScale(locale, data.currency ?? "CNY");
  const activeMembers = data.members.filter(
    (m) =>
      m.sub === data.self ||
      data.targets?.some((t) => t.scope === `owner:${m.sub}`) ||
      data.deals?.some((d) => d.ownerSub === m.sub),
  );
  const allRows = activeMembers.map((m) =>
      makeAnalysisRow(data, `owner:${m.sub}`, m.name || T.noName),
    ),
    rows = (hoverKey ?? member) ? allRows.filter((r) => r.scope === (hoverKey ?? member)) : allRows,
    points = allRows.map((r) => ({ key: r.scope, label: r.name, value: 0 }));
  const values = (get: (r: AnalysisRow) => number | null) =>
    Object.fromEntries(allRows.map((r) => [r.scope, get(r)]));
  const source = (r: AnalysisRow) =>
    !data.deals || historical(data, r.period)
      ? null
      : selectedDeals(data.deals, r.scope, r.period).filter(
          (d) => d.status === "open",
        );
  const amount = (r: AnalysisRow, predicate: (d: AnalysisDeal) => boolean) =>
    knownAmount(source(r)?.filter(predicate) ?? null, r.currency);
  const format = (v: number) =>
      new Intl.NumberFormat(locale, { maximumFractionDigits: 2 }).format(
        v / units.divisor,
      ),
    formatRate = (v: number) => `${v.toFixed(1)}%`;
  const quarters = [1, 2, 3, 4].map((q) => `${data.year}Q${q}`);
  const quarterValues = quarters.map((period) => {
    const parts = rows.map((r) =>
        makeAnalysisRow(data, r.scope, r.name, period),
      ),
      sum = (fn: (r: AnalysisRow) => number | null) => {
        const nums = parts.map(fn);
        return nums.some((n) => n === null)
          ? null
          : nums.reduce<number>((n, v) => n + v!, 0);
      };
    const target = sum((r) => r.target?.target ?? null),
      actual = sum((r) => r.closed.value);
    return {
      period,
      target:
        view === "rate" ? (target !== null && target > 0 ? 100 : null) : target,
      actual:
        view === "rate"
          ? target !== null && target > 0 && actual !== null
            ? (actual / target) * 100
            : null
          : actual,
    };
  });
  const label = (d: { key: string; label: string }) => (
    <span className="flex min-w-0 items-center gap-xs">
      <UserAvatar alt={d.label} className="size-control-md shrink-0" />
      <span className="truncate">{d.label}</span>
    </span>
  );
  const selectable = {
    selectedKey: member,
    onSelectKey: setMember,
    renderLabel: label,
    hoverKey,
    onHoverKey: setHoverKey,
  };
  return (
    <div
      className={styles.dashboard}
      onKeyDown={(e) => {
        if (e.key === "Escape") setMember(null);
      }}
      onClick={(e) => {
        if (!(e.target as HTMLElement).closest('button,a,[role="button"]'))
          setMember(null);
      }}
    >
      <div className={styles.chartGrid}>
        <Plot
          title={T.memberTargets}
          note={view === "rate" ? "100%" : units.label}
          data={points}
          {...selectable}
          series={[
            {
              key: "actual",
              label: T.actual,
              values: values((r) =>
                view === "rate"
                  ? r.rate === null
                    ? null
                    : r.rate * 100
                  : r.closed.value,
              ),
              references: values((r) =>
                view === "rate"
                  ? r.target && r.target.target > 0
                    ? 100
                    : null
                  : (r.target?.target ?? null),
              ),
              referenceLabel: T.target,
            },
          ]}
          format={view === "rate" ? formatRate : format}
        />
        <Plot
          title={T.memberGap}
          note={units.label}
          data={points}
          {...selectable}
          variant="stacked"
          series={[
            {
              key: "commit",
              label: T.commit,
              values: values((r) =>
                amount(r, (d) => d.forecastCategory === "commit"),
              ),
              references: values((r) => r.gap),
              referenceLabel: T.remaining,
            },
            {
              key: "best",
              label: T.bestCase,
              values: values((r) =>
                amount(r, (d) => d.forecastCategory === "best_case"),
              ),
            },
            {
              key: "early",
              label: T.early,
              values: values((r) =>
                amount(r, (d) => d.forecastCategory === "pipeline"),
              ),
            },
          ]}
          format={format}
        />
        <Plot
          title={T.memberTrend}
          note={rows.length === 1 ? rows[0]!.name : T.team}
          data={quarters.map((p) => ({ key: p, label: p.slice(-2), value: 0 }))}
          variant="line"
          series={[
            {
              key: "actual",
              label: T.actual,
              values: Object.fromEntries(
                quarterValues.map((q) => [q.period, q.actual]),
              ),
              references: Object.fromEntries(
                quarterValues.map((q) => [q.period, q.target]),
              ),
              referenceLabel: T.target,
            },
          ]}
          format={view === "rate" ? formatRate : format}
        />
        <Plot
          title={T.exposureAmount}
          note={units.label}
          data={points}
          {...selectable}
          variant="matrix"
          series={[
            {
              key: "commit",
              label: T.conditions,
              values: values((r) =>
                data.review === null
                  ? null
                  : amount(r, (d) =>
                      dealDiagnosis(
                        d,
                        data.observedAt,
                        data.review?.[d.id],
                      ).issues.includes("conditions"),
                    ),
              ),
            },
            {
              key: "delay",
              label: T.delayed,
              values: values((r) =>
                amount(
                  r,
                  (d) =>
                    !!d.expectedCloseAt && d.expectedCloseAt < data.observedAt,
                ),
              ),
            },
            {
              key: "basis",
              label: T.missingBasis,
              values: values((r) =>
                data.review === null
                  ? null
                  : amount(r, (d) =>
                      dealDiagnosis(
                        d,
                        data.observedAt,
                        data.review?.[d.id],
                      ).issues.some((k) =>
                        ["missingBasis", "unpriced", "undated"].includes(k),
                      ),
                    ),
              ),
            },
          ]}
          format={format}
        />
      </div>
      <p className={styles.chartFoot}>
        <Icon name="info" size="sm" />
        {T.teamReset}
      </p>
    </div>
  );
}
