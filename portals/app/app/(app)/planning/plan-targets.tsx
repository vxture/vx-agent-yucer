"use client";
import { useState, type ReactNode } from "react";
import {
  Button,
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
  EmptyState,
  Drawer,
  Field,
  FieldLabel,
  Textarea,
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

import {
  missingPlanningQuarters,
  planningEntryLocked,
  removePlanningTarget,
} from "../lib/planning-operations";
import { minor, PlanError } from "../../domains/planning/plan-values";

type Props = {
  content: PlanContent;
  scope: string;
  edit: ((c: PlanContent) => void) | null;
  disabled: boolean;
  lockedPeriods?: readonly string[];
  summary?: ReactNode;
  headerInfo?: ReactNode;
  summaryTargetKey?: string;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
};
const tiers = ["floor", "target", "stretch"] as const;

// Annual and period rows share ONE physical table/colgroup. Separate tables
// cannot guarantee tier alignment when labels, values or edit permissions vary.
export function PlanTargetLedger({
  content,
  scope,
  edit,
  disabled,
  lockedPeriods = [],
  summaryTargetKey,
  open: controlledOpen,
  onOpenChange,
}: Props) {
  const locale = useLocale();
  const {
    PLAN_VERSION_TEXT: T,
    PLAN_VERSION_ERROR: E,
    PLANNING_TEXT: P,
    DS_LABELS,
  } = useMessages();
  const [selected, setSelected] = useState<PlanTarget | null>(null);
  const [error, setError] = useState("");
  const [localOpen, setLocalOpen] = useState(false);
  const open = controlledOpen ?? localOpen;
  const setOpen = onOpenChange ?? setLocalOpen;
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
  const missingQuarters = missingPlanningQuarters(
    content,
    scope,
    lockedPeriods,
  );
  const addQuarters = () =>
    edit?.({
      ...content,
      targets: [
        ...content.targets,
        ...missingQuarters.map((line) => ({
          ...line,
          key: crypto.randomUUID(),
        })),
      ],
    });
  const applyTarget = () => {
    if (
      !selected ||
      !edit ||
      disabled ||
      planningEntryLocked(content, lockedPeriods, selected)
    )
      return;
    try {
      const values = tiers
        .map((tier) => selected[tier])
        .filter((value): value is string => value !== null);
      const amounts = values.map((value) => minor(value));
      if (
        selected.metric === "new_logo" &&
        amounts.some((value) => value % 100n !== 0n)
      )
        throw new PlanError("count_integer");
      if (amounts.some((value, i) => i > 0 && amounts[i - 1]! > value))
        throw new PlanError("target_ladder");
      edit({
        ...content,
        targets: content.targets.map((line) =>
          line.key === selected.key ? selected : line,
        ),
      });
      setSelected(null);
    } catch (cause) {
      setError(
        cause instanceof PlanError
          ? (E[cause.code] ?? E.invalid_target!)
          : E.invalid_target!,
      );
    }
  };
  const ledgerAnnual = annual.filter((t) => t.key !== summaryTargetKey);
  const row = (t: PlanTarget, index: number) => (
    <TableRow
      key={t.key}
      data-plan-period={t.period}
      className="hover:bg-transparent"
    >
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
              disabled={
                disabled || planningEntryLocked(content, lockedPeriods, t)
              }
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
            edit
              ? [
                  {
                    id: "edit",
                    label: T.editItem,
                    icon: "edit",
                    disabled: planningEntryLocked(content, lockedPeriods, t),
                    hint: planningEntryLocked(content, lockedPeriods, t)
                      ? T.lockedHint
                      : undefined,
                    onSelect: () => {
                      setError("");
                      setSelected(structuredClone(t));
                    },
                  },
                  ...(t.period === `Y${content.year}` && t.metric === "revenue"
                    ? []
                    : [
                        {
                          id: "remove",
                          label: T.remove,
                          icon: "trash" as const,
                          danger: true as const,
                          disabled:
                            planningEntryLocked(content, lockedPeriods, t) ||
                            (t.period === `Y${content.year}` &&
                              content.targets.some(
                                (line) =>
                                  line.scope === t.scope &&
                                  line.metric === t.metric &&
                                  line.currency === t.currency &&
                                  planningEntryLocked(
                                    content,
                                    lockedPeriods,
                                    line,
                                  ),
                              )),
                          hint: T.removeTargetHint,
                          confirm: {
                            verb: T.remove,
                            target: `${t.period} · ${labels[t.metric]}`,
                            consequence: T.removeTargetHint,
                            titleTemplate: DS_LABELS.confirmTitleTemplate,
                            cancelLabel: T.cancel,
                            pendingLabel: DS_LABELS.confirmPending,
                            onConfirm: () =>
                              edit(removePlanningTarget(content, t)),
                          },
                        },
                      ]),
                ]
              : []
          }
        />
      </TableCell>
    </TableRow>
  );
  return (
    <>
      <Collapsible open={open} onOpenChange={setOpen}>
        <Table
          className="table-fixed min-w-panel-md"
          aria-label={T.targetLedger}
        >
          <colgroup>
            <col className="w-table-col-fixed" />
            <col />
            <col className="w-1/5" />
            <col className="w-1/5" />
            <col className="w-1/5" />
            <col className="w-table-col-fixed" />
          </colgroup>
          {ledgerAnnual.length ? (
            <TableHeader>
              <TableRow>
                <TableHead className="text-center first:pl-md"></TableHead>
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
          ) : null}
          <TableBody>{ledgerAnnual.map((target, index) => row(target, index))}</TableBody>
          <TableBody className="border-t border-dashed border-border">
            <TableRow
              className="cursor-pointer hover:bg-transparent"
              onClick={(event) => {
                if (!(event.target as HTMLElement).closest("button"))
                  setOpen(!open);
              }}
            >
              <TableCell colSpan={6} className="py-sm first:pl-0 last:pr-0">
                <CollapsibleTrigger asChild>
                  <Button
                    size="xl"
                    variant="ghost"
                    className={open ? "w-full bg-accent" : "w-full"}
                  >
                    <span className="flex w-full items-center justify-between gap-md">
                      <span
                        className={
                          open
                            ? undefined
                            : "text-body-small font-normal text-muted-foreground"
                        }
                      >
                        {T.periodTargets}
                      </span>
                      <span className="flex items-center gap-sm">
                        {!open ? (
                          <span className="text-body-small font-normal text-muted-foreground">
                            {T.splitPeriods(periodCount)}
                          </span>
                        ) : null}
                        <Icon
                          name={open ? "chevron-up" : "chevron-down"}
                          size="sm"
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
              {!ledgerAnnual.length ? (
                <TableRow className="hover:bg-transparent">
                  <TableHead
                    scope="col"
                    className="text-center first:pl-md"
                  ></TableHead>
                  <TableHead scope="col">
                    {T.period} / {T.metric}
                  </TableHead>
                  {tiers.map((tier) => (
                    <TableHead scope="col" key={tier} className="text-right">
                      {T[tier]}
                    </TableHead>
                  ))}
                  <TableHead scope="col" className="text-center last:pr-md">
                    {T.operations}
                  </TableHead>
                </TableRow>
              ) : null}
              {periods.length ? (
                periods.map((t, i) => row(t, ledgerAnnual.length + i))
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
                      disabled={disabled || !missingQuarters.length}
                      onClick={addQuarters}
                    >
                      {missingQuarters.length
                        ? T.addQuarter
                        : T.allQuartersAdded}
                    </Button>
                  </TableCell>
                </TableRow>
              ) : null}
            </TableBody>
          </CollapsibleContent>
        </Table>
      </Collapsible>
      <Drawer
        open={!!selected}
        onClose={() => setSelected(null)}
        width="md"
        title={T.editItem}
        description={
          selected
            ? `${selected.period} · ${labels[selected.metric]} · ${selected.currency ?? T.count}`
            : undefined
        }
        closeLabel={T.cancel}
      >
        {selected ? (
          <div className="flex flex-col gap-lg">
            {tiers.map((tier) => (
              <Field key={tier}>
                <FieldLabel htmlFor={`plan-edit-${tier}`}>{T[tier]}</FieldLabel>
                <Input
                  id={`plan-edit-${tier}`}
                  inputMode="decimal"
                  disabled={disabled || !edit}
                  value={selected[tier] ?? ""}
                  onChange={(event) =>
                    setSelected({
                      ...selected,
                      [tier]: event.target.value.trim() || null,
                    })
                  }
                />
              </Field>
            ))}
            <Field>
              <FieldLabel htmlFor="plan-target-note">{T.note}</FieldLabel>
              <Textarea
                id="plan-target-note"
                rows={3}
                maxLength={8000}
                value={selected.note}
                disabled={disabled || !edit}
                onChange={(event) =>
                  setSelected({ ...selected, note: event.target.value })
                }
              />
            </Field>
            {error ? (
              <p className="text-body-small text-destructive" role="alert">
                {error}
              </p>
            ) : null}
            <div className="flex justify-end gap-sm">
              <Button
                size="md"
                variant="secondary"
                onClick={() => setSelected(null)}
              >
                {T.cancel}
              </Button>
              <Button
                size="md"
                disabled={disabled || !edit}
                onClick={applyTarget}
              >
                {T.apply}
              </Button>
            </div>
          </div>
        ) : null}
      </Drawer>
    </>
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
      actions={
        props.headerInfo || edit ? (
          <div className="flex items-center gap-md">
            {props.headerInfo}
            {edit ? (
              <RowActions
                label={`${T.addMetric} · ${T.annualTargets}`}
                disabled={disabled}
                items={(["revenue", "new_logo", "pipeline", "margin"] as const)
                  .filter((metric) => !annual.some((t) => t.metric === metric))
                  .map((metric) => ({
                    id: metric,
                    label: `${T.addMetric} · ${labels[metric]}`,
                    icon: "plus" as const,
                    onSelect: () => addMetric(metric),
                  }))}
              />
            ) : null}
          </div>
        ) : undefined
      }
      note={props.summary}
      footer={
        <div className="flex w-full min-w-0 flex-col gap-md">
          <PlanTargetLedger {...props} />
        </div>
      }
    />
  );
}
