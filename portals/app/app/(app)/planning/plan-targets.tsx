"use client";
import { type ReactNode } from "react";
import {
  Button,
  DataTable,
  EmptyState,
  Input,
  ListCardGrid,
  MetricListCard,
  type DataTableColumn,
} from "@vxture/design-ui";
import { PlanQuarterDisclosure } from "./plan-quarter-disclosure";
import { useLocale, useMessages } from "../lib/i18n/provider";
import type {
  PlanContent,
  PlanTarget,
} from "../../domains/planning/plan-model";

type Props = {
  content: PlanContent;
  scope: string;
  edit: ((c: PlanContent) => void) | null;
  disabled: boolean;
  summary?: ReactNode;
};
const tiers = ["floor", "target", "stretch"] as const;

function useTargetCells({ content, edit, disabled }: Props) {
  const locale = useLocale();
  const { PLAN_VERSION_TEXT: T, PLANNING_TEXT: P } = useMessages();
  const labels = {
    revenue: P.metricRevenue,
    new_logo: P.metricNewLogo,
    pipeline: P.metricPipeline,
    margin: P.metricMargin,
  };
  const value = (t: PlanTarget, tier: (typeof tiers)[number]) =>
    edit ? (
      <Input
        aria-label={`${t.period} ${labels[t.metric]} ${T[tier]}`}
        inputMode="decimal"
        value={t[tier] ?? ""}
        placeholder="—"
        disabled={disabled}
        onChange={(e) =>
          edit({
            ...content,
            targets: content.targets.map((row) =>
              row.key === t.key
                ? { ...row, [tier]: e.target.value.trim() || null }
                : row,
            ),
          })
        }
      />
    ) : t[tier] === null ? (
      "—"
    ) : (
      Number(t[tier]).toLocaleString(locale, { maximumFractionDigits: 2 })
    );
  const remove = (t: PlanTarget) =>
    edit ? (
      <Button
        size="md"
        variant="ghost"
        disabled={
          disabled ||
          (t.period === `Y${content.year}` && t.metric === "revenue")
        }
        aria-label={`${T.remove} ${t.period} ${labels[t.metric]}`}
        onClick={() =>
          edit({
            ...content,
            targets: content.targets.filter((x) => x.key !== t.key),
            contributions: content.contributions.filter(
              (x) => x.targetKey !== t.key,
            ),
          })
        }
      >
        {T.remove}
      </Button>
    ) : null;
  return { T, labels, value, remove };
}

// A compact breakdown shared by company targets, regional cards and list rows.
export function PlanQuarterTable(props: Props) {
  const { DATA_TABLE_LABELS } = useMessages();
  const { T, labels, value, remove } = useTargetCells(props);
  const rows = props.content.targets
    .filter(
      (t) => t.scope === props.scope && t.period !== `Y${props.content.year}`,
    )
    .sort(
      (a, b) =>
        a.period.localeCompare(b.period) ||
        a.metric.localeCompare(b.metric) ||
        (a.currency ?? "").localeCompare(b.currency ?? ""),
    );
  const columns: DataTableColumn<PlanTarget>[] = [
    {
      id: "period",
      header: T.period,
      width: "xs",
      cell: (t) => t.period.replace(String(props.content.year), ""),
    },
    {
      id: "metric",
      header: T.metric,
      cell: (t) => `${labels[t.metric]} · ${t.currency ?? T.count}`,
    },
    ...tiers.map((tier) => ({
      id: tier,
      header: T[tier],
      align: "numeric" as const,
      width: "sm" as const,
      cell: (t: PlanTarget) => value(t, tier),
    })),
    ...(props.edit
      ? [{ id: "remove", header: T.remove, width: "xs" as const, cell: remove }]
      : []),
  ];
  return (
    <DataTable
      labels={DATA_TABLE_LABELS}
      columns={columns}
      rows={rows}
      rowKey={(t) => t.key}
      empty={<EmptyState title={T.noQuarters} />}
    />
  );
}

export function PlanTargets(props: Props) {
  const { content, scope, edit, disabled } = props;
  const { T, labels, value, remove } = useTargetCells(props);
  const rows = content.targets.filter((t) => t.scope === scope);
  const annual = rows.filter((t) => t.period === `Y${content.year}`);
  const addMetric = (metric: PlanTarget["metric"]) =>
    edit?.({
      ...content,
      targets: [
        ...content.targets,
        {
          key: crypto.randomUUID(),
          scope,
          period: `Y${content.year}`,
          metric,
          currency:
            metric === "new_logo"
              ? null
              : (annual.find((t) => t.metric === "revenue")?.currency ?? "CNY"),
          floor: null,
          target: null,
          stretch: null,
          note: "",
        },
      ],
    });
  const addQuarters = () => {
    const next = structuredClone(content);
    for (const base of annual)
      for (let q = 1; q <= 4; q++) {
        const period = `${content.year}Q${q}`;
        if (
          !next.targets.some(
            (t) =>
              t.scope === scope &&
              t.period === period &&
              t.metric === base.metric &&
              t.currency === base.currency,
          )
        )
          next.targets.push({
            ...base,
            key: crypto.randomUUID(),
            period,
            floor: null,
            target: null,
            stretch: null,
          });
      }
    edit?.(next);
  };
  return (
    <div className="flex flex-col gap-lg">
      <ListCardGrid>
        {annual.map((t) => (
          <MetricListCard
            key={t.key}
            title={labels[t.metric]}
            description={`${t.period} · ${t.currency ?? T.count}`}
            actions={edit && t.metric !== "revenue" ? remove(t) : undefined}
            metrics={tiers.map((tier) => ({
              key: tier,
              label: T[tier],
              value: value(t, tier),
            }))}
          />
        ))}
        {props.summary}
      </ListCardGrid>
      {edit ? (
        <div className="flex flex-wrap gap-sm">
          {(["revenue", "new_logo", "pipeline", "margin"] as const)
            .filter((metric) => !annual.some((t) => t.metric === metric))
            .map((metric) => (
              <Button
                key={metric}
                size="md"
                variant="secondary"
                disabled={disabled}
                onClick={() => addMetric(metric)}
              >
                {T.addMetric} · {labels[metric]}
              </Button>
            ))}
        </div>
      ) : null}
      <PlanQuarterDisclosure
        label={`${T.quarters} · ${rows.length - annual.length}`}
      >
        <div className="flex flex-col gap-md">
          <p className="text-body-small text-muted-foreground">
            {T.quartersHint}
          </p>
          {edit ? (
            <div>
              <Button
                size="md"
                variant="secondary"
                disabled={disabled || !annual.length}
                onClick={addQuarters}
              >
                {T.addQuarter}
              </Button>
            </div>
          ) : null}
          <PlanQuarterTable {...props} />
        </div>
      </PlanQuarterDisclosure>
    </div>
  );
}
