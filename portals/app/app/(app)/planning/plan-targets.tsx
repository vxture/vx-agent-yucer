"use client";
import { useEffect, useState, type ReactNode } from "react";
import {
  Button,
  Checkbox,
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
  Drawer,
  EmptyState,
  Field,
  FieldLabel,
  Icon,
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
  Textarea,
  PanelCard,
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@vxture/design-ui";
import { RowActions } from "../components/table-fittings";
import { TitleHelp } from "../components/title-help";
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
import {
  addPlanningMetric,
  autofillPlanningQuarters,
  updatePlanningAmount,
  updatePlanningMarginRate,
} from "../lib/planning-autofill";
import { planningTierPercent } from "../lib/planning-preview";
import {
  planningMetricOrder,
  planningMetricPresets,
  type PlanningMetricPreset,
} from "../lib/planning-metrics";

import { planningMarginRate } from "../../domains/planning/plan-margin";

type Props = {
  content: PlanContent;
  scope: string;
  edit: ((c: PlanContent) => void) | null;
  disabled: boolean;
  lockedPeriods?: readonly string[];
  headerInfo?: ReactNode;
  open?: boolean;
  initiallyOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
};
const tiers = ["floor", "target", "stretch"] as const;
type Tier = (typeof tiers)[number];
type PeriodMode = "simple" | "complete";
const modeKey = "yucer:planning:period-mode";

function TargetValue({
  content,
  line,
  tier,
  ratio,
  edit,
  disabled,
  lockedPeriods,
  readOnly = false,
}: {
  content: PlanContent;
  line: PlanTarget;
  tier: Tier;
  ratio: string | null;
  edit: Props["edit"];
  disabled: boolean;
  lockedPeriods: readonly string[];
  readOnly?: boolean;
}) {
  const locale = useLocale();
  const [focused, setFocused] = useState(false);
  const annual = line.period === `Y${content.year}`;
  const quarterlyMargin = line.metric === "margin" && !annual;
  const {
    PLAN_VERSION_TEXT: T,
    PLANNING_TEXT: P,
    COMPANY_PLANNING_TEXT: C,
  } = useMessages();
  const labels = {
    revenue: P.metricRevenue,
    new_logo: P.metricNewLogo,
    pipeline: P.metricPipeline,
    margin: annual ? C.marginRate : P.metricMargin,
  };
  if (line.metric === "margin" && annual) {
    const rate = planningMarginRate(content, line, tier);
    const estimated =
      line[tier] == null
        ? "\u2014"
        : `${Number(line[tier]).toLocaleString(locale, { maximumFractionDigits: 2 })} ${line.currency ?? ""}`;
    const estimatedValue =
      line[tier] == null
        ? "\u2014"
        : Number(line[tier]).toLocaleString(locale, {
            maximumFractionDigits: 2,
          });
    const result = (
      <span
        id={`margin-result-${line.key}-${tier}`}
        title={`${C.estimatedMargin} ${estimated}`}
        className="inline-flex min-w-0 items-baseline justify-end gap-2xs tabular-nums"
      >
        <span data-number-role="result">{estimatedValue}</span>
        <span data-number-role="unit">
          {line.currency}
        </span>
      </span>
    );
    if (!edit)
      return (
        <span className="flex items-baseline justify-between gap-xs tabular-nums">
          <span data-number-role="value">
            {rate == null
              ? "\u2014"
              : `${Number(rate).toLocaleString(locale, { maximumFractionDigits: 2 })}%`}
          </span>
          {result}
        </span>
      );
    return (
      <InputGroup className="min-w-0">
        <InputGroupInput
          aria-label={`${line.period} ${C.marginRate} ${T[tier]}`}
          aria-describedby={`margin-result-${line.key}-${tier}`}
          inputMode="decimal"
          value={rate ?? ""}
          placeholder="\u2014"
          className="w-14 flex-none pr-0 tabular-nums"
          disabled={
            disabled || planningEntryLocked(content, lockedPeriods, line)
          }
          onChange={(e) =>
            edit(
              updatePlanningMarginRate(
                content,
                line.key,
                tier,
                e.target.value,
                lockedPeriods,
              ),
            )
          }
        />
        <InputGroupAddon
          align="end"
          className="min-w-0 flex-1 justify-between gap-2xs"
        >
          <span data-number-role="unit">%</span>
          {result}
        </InputGroupAddon>
      </InputGroup>
    );
  }
  const effectiveRatio = quarterlyMargin
    ? (() => {
        const rate = planningMarginRate(content, line, tier);
        return rate == null ? null : `${Number(rate).toLocaleString(locale, { maximumFractionDigits: 2 })}%`;
      })()
    : ratio;
  const rawAmount = line[tier] ?? "";
  const displayedAmount = !focused && /^\d+\.\d{1,2}$/.test(rawAmount)
    ? rawAmount.replace(/(\.\d*?)0+$/, "$1").replace(/\.$/, "")
    : rawAmount;
  if (!edit)
    return (
      <span className="flex items-baseline justify-between gap-sm tabular-nums">
        <span data-number-role="value">
          {line[tier] == null
            ? "\u2014"
            : Number(line[tier]).toLocaleString(locale, {
                maximumFractionDigits: 2,
              })}
        </span>
        <span data-number-role="unit" className="w-8 shrink-0 text-right">
          {effectiveRatio ?? "\u2014"}
        </span>
      </span>
    );
  return (
    <InputGroup className="min-w-0">
      <InputGroupInput
        aria-label={`${line.period} ${labels[line.metric]} ${T[tier]}`}
        inputMode={line.metric === "new_logo" ? "numeric" : "decimal"}
        value={displayedAmount ?? ""}
        title={line[tier] ?? undefined}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        placeholder="\u2014"
        readOnly={readOnly || quarterlyMargin}
        disabled={disabled || planningEntryLocked(content, lockedPeriods, line)}
        className="min-w-0 px-xs tabular-nums"
        onChange={(e) =>
          edit(
            updatePlanningAmount(
              content,
              line.key,
              tier,
              e.target.value,
              lockedPeriods,
            ),
          )
        }
      />
      <InputGroupAddon align="end" className="text-body-small tabular-nums">
        <span className="w-8 text-right">{effectiveRatio ?? "\u2014"}</span>
      </InputGroupAddon>
    </InputGroup>
  );
}

export function PlanTargetLedger({
  content,
  scope,
  edit,
  disabled,
  lockedPeriods = [],
  open: controlledOpen,
  initiallyOpen = false,
  onOpenChange,
}: Props) {
  const locale = useLocale();
  const {
    PLAN_VERSION_TEXT: T,
    COMPANY_PLANNING_TEXT: C,
    PLANNING_TEXT: P,
    DS_LABELS,
  } = useMessages();
  const labels = {
    revenue: P.metricRevenue,
    new_logo: P.metricNewLogo,
    pipeline: P.metricPipeline,
    margin: C.marginRate,
  };
  const [localOpen, setLocalOpen] = useState(initiallyOpen);
  const [mode, setMode] = useState<PeriodMode>("simple");
  const [note, setNote] = useState<{ key: string; value: string } | null>(null);
  useEffect(() => {
    try {
      if (localStorage.getItem(modeKey) === "complete") setMode("complete");
    } catch {
      /* Optional display preference. */
    }
  }, []);
  const changeMode = (value: PeriodMode) => {
    setMode(value);
    try {
      localStorage.setItem(modeKey, value);
    } catch {
      /* Editing remains available. */
    }
  };
  const open = controlledOpen ?? localOpen;
  const setOpen = onOpenChange ?? setLocalOpen;
  const annual = content.targets
    .filter((t) => t.scope === scope && t.period === `Y${content.year}`)
    .sort(
      (a, b) =>
        planningMetricOrder.indexOf(a.metric) -
        planningMetricOrder.indexOf(b.metric),
    );
  const quarterly =
    mode === "complete" ? annual : annual.filter((t) => t.metric === "revenue");
  const hasQuarters = content.targets.some(
    (line) => line.scope === scope && /^\d{4}Q[1-4]$/.test(line.period),
  );
  const coverage = (line: PlanTarget, tier: Tier) => {
    const revenue = content.targets.find(
      (t) =>
        t.scope === scope &&
        t.period === line.period &&
        t.metric === "revenue" &&
        t.currency === line.currency,
    );
    const value =
      line[tier] == null ||
      revenue?.target == null ||
      !Number.isFinite(Number(line[tier])) ||
      !(Number(revenue.target) > 0)
        ? null
        : Number(line[tier]) / Number(revenue.target);
    return value === null
      ? null
      : `${value.toLocaleString(locale, { maximumFractionDigits: 2 })}\u00d7`;
  };
  const ratio = (line: PlanTarget, tier: Tier) =>
    line.metric === "pipeline"
      ? coverage(line, tier)
      : planningTierPercent(
          line[tier],
          line.metric === "margin"
            ? annual.find(
                (t) => t.metric === "revenue" && t.currency === line.currency,
              )?.[tier]
            : line.target,
          locale,
        );
  const missingQuarters = missingPlanningQuarters(
    content,
    scope,
    lockedPeriods,
  );
  const addQuarters = () => {
    let next = content;
    for (const line of annual)
      next = autofillPlanningQuarters(next, line, lockedPeriods);
    edit?.(next);
  };
  return (
    <div className="flex w-full min-w-0 flex-col gap-md">
      <Table
        className="min-w-page-md table-fixed [&_tr>:first-child]:pl-md [&_tr>:last-child]:pr-md"
        aria-label={T.annualTargets}
      >
        <colgroup>
          <col className="w-1/5" />
          {tiers.map((t) => (
            <col key={t} />
          ))}
          <col className="w-table-col-fixed" />
        </colgroup>
        <TableHeader>
          <TableRow>
            <TableHead>{T.metric}</TableHead>
            {tiers.map((t) => (
              <TableHead key={t}>{T[t]}</TableHead>
            ))}
            <TableHead className="text-right">{T.operations}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {annual.map((line) => (
            <TableRow
              key={line.key}
              data-plan-period={line.period}
              data-plan-metric={line.metric}
              className={
                line.metric === "revenue"
                  ? "bg-muted/30 hover:bg-muted/30"
                  : "hover:bg-transparent"
              }
            >
              <TableCell>
                <span className="flex flex-wrap items-center gap-xs text-body font-medium">
                  {line.metric === "revenue" ? (
                    <Icon name="flag" size="sm" />
                  ) : null}
                  {labels[line.metric]}
                  <span className="text-body-small font-normal text-muted-foreground">
                    {line.metric === "margin"
                      ? "%"
                      : (line.currency ?? C.customerUnit)}
                  </span>
                </span>
                <span className="text-body-small text-muted-foreground">
                  {line.metric === "margin"
                    ? C.marginBasis
                    : line.metric === "pipeline"
                      ? C.pipelineBasis
                      : line.metric === "new_logo"
                        ? C.newCustomerBasis
                        : C.primaryMetric}
                </span>
              </TableCell>
              {tiers.map((tier) => (
                <TableCell key={tier} data-plan-tier={tier} className="px-sm">
                  <TargetValue
                    content={content}
                    line={line}
                    tier={tier}
                    ratio={ratio(line, tier)}
                    edit={edit}
                    disabled={disabled}
                    lockedPeriods={lockedPeriods}
                  />
                </TableCell>
              ))}
              <TableCell className="text-right">
                <RowActions
                  label={`${DS_LABELS.actionMenu} ${labels[line.metric]}`}
                  disabled={disabled}
                  items={
                    edit
                      ? [
                          {
                            id: "note",
                            label: T.note,
                            icon: "edit",
                            disabled: planningEntryLocked(
                              content,
                              lockedPeriods,
                              line,
                            ),
                            onSelect: () =>
                              setNote({ key: line.key, value: line.note }),
                          },
                          ...(line.metric !== "revenue"
                            ? [
                                {
                                  id: "remove",
                                  label: T.remove,
                                  icon: "trash" as const,
                                  danger: true as const,
                                  disabled: content.targets.some(
                                    (t) =>
                                      t.scope === scope &&
                                      t.metric === line.metric &&
                                      t.currency === line.currency &&
                                      planningEntryLocked(
                                        content,
                                        lockedPeriods,
                                        t,
                                      ),
                                  ),
                                  confirm: {
                                    verb: T.remove,
                                    target: labels[line.metric],
                                    consequence: T.removeTargetHint,
                                    titleTemplate:
                                      DS_LABELS.confirmTitleTemplate,
                                    cancelLabel: T.cancel,
                                    pendingLabel: DS_LABELS.confirmPending,
                                    onConfirm: () =>
                                      edit(removePlanningTarget(content, line)),
                                  },
                                },
                              ]
                            : []),
                        ]
                      : line.note.trim()
                        ? [
                            {
                              id: "note",
                              label: T.note,
                              icon: "file-text",
                              onSelect: () =>
                                setNote({ key: line.key, value: line.note }),
                            },
                          ]
                        : []
                  }
                />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      <Collapsible open={open} onOpenChange={setOpen}>
        <div className="flex flex-wrap items-center justify-between gap-sm border-t border-border py-sm">
          <CollapsibleTrigger asChild>
            <Button variant="ghost" size="md">
              <Icon name={open ? "chevron-up" : "chevron-down"} size="sm" />
              {T.periodTargets}
            </Button>
          </CollapsibleTrigger>
          {open && hasQuarters ? (
            <Select
              value={mode}
              onValueChange={(value) => changeMode(value as PeriodMode)}
            >
              <SelectTrigger aria-label={C.periodMode} className="w-36">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="simple">{C.simpleMode}</SelectItem>
                <SelectItem value="complete">{C.completeMode}</SelectItem>
              </SelectContent>
            </Select>
          ) : null}
        </div>
        <CollapsibleContent>
          {quarterly.length ? (
            <Table
              className="min-w-page-md table-fixed [&_tr>:first-child]:pl-md [&_tr>:last-child]:pr-md"
              aria-label={T.periodTargets}
            >
              <colgroup>
                <col className="w-1/5" />
                {[1, 2, 3, 4].map((q) => (
                  <col key={q} />
                ))}
                <col className="w-table-col-fixed" />
              </colgroup>
              <TableHeader>
                <TableRow>
                  <TableHead>{T.metric}</TableHead>
                  {[1, 2, 3, 4].map((q) => (
                    <TableHead key={q}>Q{q}</TableHead>
                  ))}
                  <TableHead className="text-right">{T.operations}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {quarterly.map((base) => (
                  <TableRow
                    key={base.key}
                    data-period-metric={base.metric}
                    className="hover:bg-transparent"
                  >
                    <TableCell>
                      <span className="text-body font-medium">
                        {base.metric === "margin" ? P.metricMargin : labels[base.metric]}
                      </span>
                      <span className="ml-xs text-body-small text-muted-foreground">
                        {base.currency ?? C.customerUnit}
                      </span>
                    </TableCell>
                    {[1, 2, 3, 4].map((q) => {
                      const line = content.targets.find(
                        (t) =>
                          t.scope === scope &&
                          t.metric === base.metric &&
                          t.currency === base.currency &&
                          t.period === `${content.year}Q${q}`,
                      );
                      return (
                        <TableCell key={q} className="px-sm">
                          {line ? (
                            <TargetValue
                              content={content}
                              line={line}
                              tier="target"
                              ratio={
                                line.metric === "pipeline"
                                  ? coverage(line, "target")
                                  : planningTierPercent(
                                      line.target,
                                      base.target,
                                      locale,
                                    )
                              }
                              edit={edit}
                              disabled={disabled}
                              lockedPeriods={lockedPeriods}
                              readOnly={q === 4}
                            />
                          ) : (
                            "\u2014"
                          )}
                        </TableCell>
                      );
                    })}
                    <TableCell className="text-right">
                      <RowActions
                        label={`${DS_LABELS.actionMenu} ${base.metric === "margin" ? P.metricMargin : labels[base.metric]} ${T.periodTargets}`}
                        disabled={disabled}
                        items={[1, 2, 3, 4].flatMap((q) => {
                          const line = content.targets.find(
                            (t) => t.scope === scope && t.metric === base.metric &&
                              t.currency === base.currency && t.period === `${content.year}Q${q}`,
                          );
                          return line && (edit || line.note.trim()) ? [{
                            id: line.key,
                            label: `Q${q} ${T.note}`,
                            icon: edit ? "edit" as const : "file-text" as const,
                            disabled: Boolean(edit) && planningEntryLocked(content, lockedPeriods, line),
                            onSelect: () => setNote({ key: line.key, value: line.note }),
                          }] : [];
                        })}
                      />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <EmptyState title={T.noQuarters} />
          )}
          {edit && missingQuarters.length ? (
            <div className="py-sm">
              <Button
                size="md"
                variant="secondary"
                disabled={disabled}
                onClick={addQuarters}
              >
                {T.addQuarter}
              </Button>
            </div>
          ) : null}
        </CollapsibleContent>
      </Collapsible>
      <Drawer
        open={note !== null}
        onClose={() => setNote(null)}
        width="md"
        title={T.note}
        closeLabel={T.cancel}
      >
        {note ? (
          <div className="flex flex-col gap-lg">
            <Field>
              <FieldLabel htmlFor="plan-target-note">{T.note}</FieldLabel>
              <Textarea
                id="plan-target-note"
                rows={4}
                maxLength={8000}
                value={note.value}
                disabled={disabled || !edit}
                onChange={(e) => setNote({ ...note, value: e.target.value })}
              />
            </Field>
            <div className="flex justify-end gap-sm pb-xl">
              <Button
                size="md"
                variant="secondary"
                onClick={() => setNote(null)}
              >
                {T.cancel}
              </Button>
              <Button
                size="md"
                disabled={disabled || !edit}
                onClick={() => {
                  edit?.({
                    ...content,
                    targets: content.targets.map((t) =>
                      t.key === note.key ? { ...t, note: note.value } : t,
                    ),
                  });
                  setNote(null);
                }}
              >
                {T.apply}
              </Button>
            </div>
          </div>
        ) : null}
      </Drawer>
    </div>
  );
}

function MetricSelection({
  content,
  scope,
  edit,
  disabled,
  lockedPeriods = [],
}: Props) {
  const {
    COMPANY_PLANNING_TEXT: C,
    PLAN_VERSION_TEXT: T,
    PLANNING_TEXT: P,
  } = useMessages();
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<PlanTarget["metric"][]>([]);
  const labels = {
    revenue: P.metricRevenue,
    new_logo: P.metricNewLogo,
    pipeline: P.metricPipeline,
    margin: C.marginRate,
  };
  const annual = content.targets.filter(
    (t) => t.scope === scope && t.period === `Y${content.year}`,
  );
  const available = planningMetricOrder.filter(
    (m) => !annual.some((t) => t.metric === m),
  );
  const choosePreset = (preset: PlanningMetricPreset) =>
    setSelected(
      planningMetricPresets[preset].filter((m) => available.includes(m)),
    );
  return (
    <>
      <Button
        size="md"
        variant="secondary"
        disabled={disabled}
        onClick={() => {
          setSelected([]);
          setOpen(true);
        }}
      >
        <Icon name="plus" size="sm" />
        {T.addMetric}
      </Button>
      <Drawer
        open={open}
        onClose={() => setOpen(false)}
        width="md"
        title={T.addMetric}
        closeLabel={T.cancel}
      >
        <div className="flex flex-col gap-lg">
          <div className="flex flex-col gap-sm">
            <span className="text-body font-medium">{C.industryPresets}</span>
            <div className="grid grid-cols-2 gap-sm">
              {(
                Object.keys(planningMetricPresets) as PlanningMetricPreset[]
              ).map((preset) => (
                <Button
                  key={preset}
                  size="md"
                  variant="secondary"
                  disabled={disabled}
                  onClick={() => choosePreset(preset)}
                >
                  {C.presets[preset]}
                </Button>
              ))}
            </div>
          </div>
          {!available.length ? (
            <p className="text-body text-muted-foreground">
              {C.allMetricsAdded}
            </p>
          ) : null}
          <div className="flex flex-col divide-y divide-border">
            {planningMetricOrder.map((metric) => (
              <label key={metric} className="flex items-start gap-sm py-md">
                <Checkbox
                  checked={
                    !available.includes(metric) || selected.includes(metric)
                  }
                  disabled={disabled || !available.includes(metric)}
                  onCheckedChange={(value) =>
                    setSelected((previous) =>
                      value === true
                        ? [...previous.filter((m) => m !== metric), metric]
                        : previous.filter((m) => m !== metric),
                    )
                  }
                />
                <span className="flex flex-col gap-xs">
                  <span className="text-body font-medium">
                    {labels[metric]}
                  </span>
                  <span className="text-body-small text-muted-foreground">
                    {C.metricDescriptions[metric]}
                  </span>
                </span>
              </label>
            ))}
          </div>
          <div className="flex justify-end gap-sm pb-xl">
            <Button
              size="md"
              variant="secondary"
              onClick={() => setOpen(false)}
            >
              {T.cancel}
            </Button>
            <Button
              size="md"
              disabled={disabled || !selected.length}
              onClick={() => {
                let next = content;
                for (const metric of selected)
                  next = addPlanningMetric(next, scope, metric, lockedPeriods);
                edit?.(next);
                setOpen(false);
              }}
            >
              {T.addMetric}
            </Button>
          </div>
        </div>
      </Drawer>
    </>
  );
}

export function PlanTargets(props: Props) {
  const { PLAN_VERSION_TEXT: T, COMPANY_PLANNING_TEXT: C } = useMessages();
  return (
    <PanelCard
      title={
        <span className="flex flex-wrap items-center gap-x-3xl gap-y-sm" data-plan-annual-heading>
          <span className="inline-flex shrink-0 items-center gap-sm">
            {T.annualTargets}
            <TitleHelp topic={T.annualTargets}>{C.help}</TitleHelp>
          </span>
          {props.headerInfo ? <span className="min-w-0 font-normal">{props.headerInfo}</span> : null}
        </span>
      }
      action={props.edit ? <MetricSelection {...props} /> : undefined}
    >
      <PlanTargetLedger {...props} />
    </PanelCard>
  );
}
