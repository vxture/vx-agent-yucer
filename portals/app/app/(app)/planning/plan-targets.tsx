"use client";
import { useState, type ReactNode } from "react";
import {
  Button,
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
  EmptyState,
  Icon,
  Input,
  MetricListCard,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  TableTitleCell,
} from "@vxture/design-ui";
import { RowActions } from "../components/table-fittings";
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

// Annual and period rows share ONE physical table/colgroup. Separate tables
// cannot guarantee tier alignment when labels, values or edit permissions vary.
export function PlanTargetLedger({ content, scope, edit, disabled }: Props) {
  const locale = useLocale();
  const { PLAN_VERSION_TEXT: T, PLANNING_TEXT: P, DS_LABELS } = useMessages();
  const [open, setOpen] = useState(false);
  const labels = {
    revenue: P.metricRevenue,
    new_logo: P.metricNewLogo,
    pipeline: P.metricPipeline,
    margin: P.metricMargin,
  };
  const annual = content.targets.filter(
    (t) => t.scope === scope && t.period === `Y${content.year}`,
  );
  const periods = content.targets
    .filter((t) => t.scope === scope && t.period !== `Y${content.year}`)
    .sort(
      (a, b) =>
        a.period.localeCompare(b.period) ||
        a.metric.localeCompare(b.metric) ||
        (a.currency ?? "").localeCompare(b.currency ?? ""),
    );
  const periodCount = new Set(periods.map((t) => t.period)).size;
  const update = (
    target: PlanTarget,
    tier: (typeof tiers)[number],
    value: string,
  ) =>
    edit?.({
      ...content,
      targets: content.targets.map((t) =>
        t.key === target.key ? { ...t, [tier]: value.trim() || null } : t,
      ),
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
  const row = (t: PlanTarget, index: number) => (
    <TableRow key={t.key} data-plan-period={t.period}>
      <TableCell className="text-center text-muted-foreground first:pl-md">
        {index + 1}
      </TableCell>
      <TableCell>
        <TableTitleCell
          title={
            t.period === `Y${content.year}`
              ? t.period
              : t.period.replace(String(content.year), "")
          }
          description={`${labels[t.metric]} · ${t.currency ?? T.count}`}
          tooltip={`${t.period} · ${labels[t.metric]} · ${t.currency ?? T.count}`}
        />
      </TableCell>
      {tiers.map((tier) => (
        <TableCell
          key={tier}
          data-plan-tier={tier}
          className="text-right tabular-nums"
        >
          {edit ? (
            <Input
              aria-label={`${t.period} ${labels[t.metric]} ${T[tier]}`}
              inputMode="decimal"
              value={t[tier] ?? ""}
              placeholder="—"
              disabled={disabled}
              onChange={(e) => update(t, tier, e.target.value)}
            />
          ) : t[tier] === null ? (
            "—"
          ) : (
            <span
              className={
                t.period === `Y${content.year}` ? "font-semibold" : undefined
              }
            >
              {Number(t[tier]).toLocaleString(locale, {
                maximumFractionDigits: 2,
              })}
            </span>
          )}
        </TableCell>
      ))}
      <TableCell className="text-center last:pr-md">
        <RowActions
          label={`${DS_LABELS.actionMenu} · ${t.period} · ${labels[t.metric]}`}
          disabled={disabled}
          items={
            edit && !(t.period === `Y${content.year}` && t.metric === "revenue")
              ? [
                  {
                    id: "remove",
                    label: T.remove,
                    icon: "trash",
                    onSelect: () =>
                      edit({
                        ...content,
                        targets: content.targets.filter((x) => x.key !== t.key),
                        contributions: content.contributions.filter(
                          (x) => x.targetKey !== t.key,
                        ),
                      }),
                  },
                ]
              : []
          }
        />
      </TableCell>
    </TableRow>
  );
  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <Table className="table-fixed min-w-panel-md" aria-label={T.targetLedger}>
        <colgroup>
          <col className="w-table-col-fixed" />
          <col />
          <col className="w-1/5" />
          <col className="w-1/5" />
          <col className="w-1/5" />
          <col className="w-table-col-fixed" />
        </colgroup>
        <TableHeader>
          <TableRow>
            <TableHead className="text-center first:pl-md">#</TableHead>
            <TableHead>
              {T.period} / {T.metric}
            </TableHead>
            {tiers.map((tier) => (
              <TableHead key={tier} className="text-right">
                {T[tier]}
              </TableHead>
            ))}
            <TableHead className="text-center last:pr-md">
              {T.operations}
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>{annual.map(row)}</TableBody>
        <TableBody className="border-t border-dashed border-border">
          <TableRow>
            <TableCell colSpan={6} className="py-sm first:pl-0 last:pr-0">
              <CollapsibleTrigger asChild>
                <Button size="xl" variant="ghost" className="w-full">
                  <span className="flex w-full items-center justify-between gap-md">
                    <span>{T.periodTargets}</span>
                    <span className="flex items-center gap-sm">
                      {!open ? (
                        <span className="text-body-small font-normal text-muted-foreground">
                          {T.splitPeriods(periodCount)}
                        </span>
                      ) : null}
                      <Icon
                        name={open ? "chevron-up" : "chevron-down"}
                        size={16}
                      />
                    </span>
                  </span>
                </Button>
              </CollapsibleTrigger>
            </TableCell>
          </TableRow>
        </TableBody>
        <CollapsibleContent asChild>
          <TableBody>
            {periods.length ? (
              periods.map((t, i) => row(t, annual.length + i))
            ) : (
              <TableRow>
                <TableCell colSpan={6}>
                  <EmptyState title={T.noQuarters} />
                </TableCell>
              </TableRow>
            )}
            {edit ? (
              <TableRow>
                <TableCell colSpan={6} className="first:pl-md last:pr-md">
                  <Button
                    size="md"
                    variant="secondary"
                    disabled={disabled || !annual.length}
                    onClick={addQuarters}
                  >
                    {T.addQuarter}
                  </Button>
                </TableCell>
              </TableRow>
            ) : null}
          </TableBody>
        </CollapsibleContent>
      </Table>
    </Collapsible>
  );
}

export function PlanTargets(props: Props) {
  const { content, scope, edit, disabled } = props;
  const { PLAN_VERSION_TEXT: T, PLANNING_TEXT: P } = useMessages();
  const labels = {
    revenue: P.metricRevenue,
    new_logo: P.metricNewLogo,
    pipeline: P.metricPipeline,
    margin: P.metricMargin,
  };
  const annual = content.targets.filter(
    (t) => t.scope === scope && t.period === `Y${content.year}`,
  );
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
  return (
    <MetricListCard
      title={`${T.annualTargets} · Y${content.year}`}
      note={props.summary}
      footer={
        <div className="flex w-full min-w-0 flex-col gap-md">
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
          <PlanTargetLedger {...props} />
        </div>
      }
    />
  );
}
