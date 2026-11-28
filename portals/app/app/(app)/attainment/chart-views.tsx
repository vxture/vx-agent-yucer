"use client";
import { useState } from "react";
import {
  BarChart,
  Card,
  EmptyState,
  Section,
  type CategorySeries,
} from "@vxture/design-system";
import type { AttainmentAnalysis } from "./analysis-board";
import { makeAnalysisRow } from "./reading-views";
import { useLocale } from "../lib/i18n/provider";
import { attainmentCopy } from "./copy";
import {
  verifiedNewLogos,
  type AnalysisRow,
} from "../../domains/pipeline/lib/attainment-analysis";

import styles from "./workspace.module.css";

type Metric = "revenue" | "pipeline" | "new_logo" | "margin";
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
        ? row.open.value
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
function Plot({
  title,
  data,
  series,
  format,
  variant = "bar",
  referenceValue,
  onSelectKey,
  selectedKey,
}: {
  title: string;
  data: { key: string; label: string; value: number }[];
  series: CategorySeries[];
  format: (value: number) => string;
  variant?: "bar" | "line";
  referenceValue?: number;
  onSelectKey?: (key: string | null) => void;
  selectedKey?: string | null;
}) {
  const T = attainmentCopy(useLocale());
  const values = series.flatMap((s) => Object.values(s.values));
  return (
    <Card className="gap-sm p-lg">
      <Section title={title}>
        {data.length && values.some((v) => v !== null) ? (
          <BarChart
            data={data}
            series={series}
            variant={variant}
            formatValue={format}
            plotHeight="large"
            referenceValue={referenceValue}
            onSelectKey={onSelectKey}
            selectedKey={selectedKey}
          />
        ) : (
          <EmptyState title={data.length ? T.unknown : T.noData} />
        )}
      </Section>
    </Card>
  );
}
export function RegionalCharts({
  data,
  metric,
}: {
  data: AttainmentAnalysis;
  metric: Metric;
}) {
  const locale = useLocale(),
    T = attainmentCopy(locale);
  const rows = data.regions.map((r) =>
    makeAnalysisRow(data, `territory:${r.id}`, r.name),
  );
  const points = rows.map((r) => ({ key: r.scope, label: r.name, value: 0 }));
  const metrics = rows.map((r) => metricValues(data, r, metric));
  const actual = Object.fromEntries(
      rows.map((r, i) => [r.scope, metrics[i]!.actual]),
    ),
    target = Object.fromEntries(
      rows.map((r, i) => [r.scope, metrics[i]!.target]),
    );
  const quarters = [1, 2, 3, 4].map((q) => `${data.year}Q${q}`),
    quarterPoints = quarters.map((p) => ({
      key: p,
      label: p.slice(-2),
      value: 0,
    }));
  const quarterSeries = data.regions.map((region) => ({
    key: region.id,
    label: region.name,
    values: Object.fromEntries(
      quarters.map((period) => {
        const row = makeAnalysisRow(
          data,
          `territory:${region.id}`,
          region.name,
          period,
        );
        return [period, metricValues(data, row, metric).actual];
      }),
    ),
    referenceLabel: T.target,
    references: Object.fromEntries(
      quarters.map((period) => {
        const row = makeAnalysisRow(
          data,
          `territory:${region.id}`,
          region.name,
          period,
        );
        return [period, metricValues(data, row, metric).target];
      }),
    ),
  }));
  const format = (v: number) =>
    new Intl.NumberFormat(locale, { maximumFractionDigits: 2 }).format(v);
  const ratio = Object.fromEntries(
    rows.map((r, i) => {
      const m = metrics[i]!;
      return [
        r.scope,
        m.target !== null && m.target > 0 && m.actual !== null
          ? (m.actual / m.target) * 100
          : null,
      ];
    }),
  );
  const gaps = Object.fromEntries(
    rows.map((r, i) => {
      const m = metrics[i]!;
      return [
        r.scope,
        m.target !== null && m.actual !== null
          ? Math.max(0, m.target - m.actual)
          : null,
      ];
    }),
  );
  return (
    <div className={styles.chartGrid}>
      <Plot
        title={`${T.targetActual} \u00b7 ${T[metric]}`}
        data={points}
        series={[
          {
            key: "actual",
            label: T.actual,
            values: actual,
            referenceLabel: T.target,
            references: target,
          },
          { key: "target", label: T.target, values: target },
        ]}
        format={format}
      />
      <Plot
        title={T.attainment}
        data={points}
        series={[{ key: "rate", label: T.rate, values: ratio }]}
        referenceValue={100}
        format={(v) => `${v.toFixed(1)}%`}
      />
      <Plot
        title={T.quarterTrend}
        data={quarterPoints}
        series={quarterSeries}
        variant="line"
        format={format}
      />
      <Plot
        title={T.gapShare}
        data={points}
        series={[{ key: "gap", label: T.remaining, values: gaps }]}
        format={format}
      />
    </div>
  );
}
export function TeamCharts({ data }: { data: AttainmentAnalysis }) {
  const locale = useLocale(),
    T = attainmentCopy(locale);
  const [member, setMember] = useState<string | null>(null);
  const activeMembers = data.members.filter(
    (m) =>
      m.sub === data.self ||
      data.targets?.some((t) => t.scope === `owner:${m.sub}`) ||
      data.deals?.some((d) => d.ownerSub === m.sub),
  );
  const allRows = activeMembers.map((m) =>
    makeAnalysisRow(data, `owner:${m.sub}`, m.name || T.noName),
  );
  const rows = member ? allRows.filter((r) => r.scope === member) : allRows;
  const points = allRows.map((r) => ({
    key: r.scope,
    label: r.name,
    value: 0,
  }));
  const series = (
    key: string,
    label: string,
    value: (r: AnalysisRow) => number | null,
  ): CategorySeries => ({
    key,
    label,
    values: Object.fromEntries(allRows.map((r) => [r.scope, value(r)])),
  });
  const format = (v: number) =>
    new Intl.NumberFormat(locale, { maximumFractionDigits: 2 }).format(v);
  const quarters = [1, 2, 3, 4].map((q) => `${data.year}Q${q}`);
  const add = (period: string, field: "closed" | "open") => {
    const parts = rows.map(
      (r) => makeAnalysisRow(data, r.scope, r.name, period)[field].value,
    );
    return parts.includes(null)
      ? null
      : parts.reduce<number>((n, v) => n + v!, 0);
  };
  return (
    <div
      className={styles.chartGrid}
      onKeyDown={(event) => {
        if (event.key === "Escape") setMember(null);
      }}
      onClick={(event) => {
        if (
          !(event.target as HTMLElement).closest(
            'button,a,[role="group"],[role="button"]',
          )
        )
          setMember(null);
      }}
    >
      <Plot
        title={T.memberTargets}
        data={points}
        selectedKey={member}
        onSelectKey={setMember}
        series={[
          series("closed", T.actual, (r) => r.closed.value),
          series("target", T.target, (r) => r.target?.target ?? null),
        ]}
        format={format}
      />
      <Plot
        title={T.memberCoverage}
        data={points}
        selectedKey={member}
        onSelectKey={setMember}
        series={[series("coverage", T.coverage, (r) => r.coverage)]}
        referenceValue={3}
        format={(v) => `${v.toFixed(1)}\u00d7`}
      />
      <Plot
        title={`${T.memberTrend}${member ? ` \u00b7 ${rows[0]?.name ?? ""}` : ""}`}
        data={quarters.map((p) => ({ key: p, label: p.slice(-2), value: 0 }))}
        series={[
          {
            key: "closed",
            label: T.actual,
            values: Object.fromEntries(
              quarters.map((p) => [p, add(p, "closed")]),
            ),
          },
          {
            key: "open",
            label: T.pipeline,
            values: Object.fromEntries(
              quarters.map((p) => [p, add(p, "open")]),
            ),
          },
        ]}
        variant="line"
        format={format}
      />
      <Plot
        title={T.memberAttention}
        data={points}
        selectedKey={member}
        onSelectKey={setMember}
        series={[
          series("pending", T.pending, (r) => (data.deals ? r.pending : null)),
        ]}
        format={format}
      />
    </div>
  );
}
