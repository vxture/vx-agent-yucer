"use client";

import { useEffect, useState, type ReactNode } from "react";
import {
  Banner,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DatePicker,
  InputGroup,
  InputGroupInput,
  InputGroupAddon,
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
  Field,
  FieldError,
  FieldLabel,
  Icon,
  Input,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@vxture/design-ui";
import { FormChoice } from "./form-choice";
import { StrategyDateRange } from "./strategy-date-range";
import { MemberPicker } from "./member-picker";
import { MemberName } from "../lib/member-names";
import { Section, SectionHeader } from "./help-section";
import { useMessages } from "../lib/i18n/provider";
import {
  advancedFilled,
  consistencyWarnings,
  type Novelty,
  type ResultIssue,
  type StrategyGoal,
  type StrategyOption,
  type StrategyResult,
} from "../../domains/strategy/lib/strategy-result";
import type { StrategicMetric } from "../../domains/strategy/lib/expectations";

function dateValue(value: string): Date | undefined {
  if (!value) return undefined;
  const [y, m, d] = value.split("-").map(Number);
  return new Date(y!, m! - 1, d!);
}
function dateKey(date?: Date): string {
  return date
    ? `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`
    : "";
}

export function StrategyPaths({
  value,
  options,
  onChange,
}: {
  readonly value: StrategyResult;
  readonly options: readonly StrategyOption[];
  readonly onChange?: (value: StrategyResult) => void;
}) {
  const { STRATEGY_RESULT_TEXT: T } = useMessages();
  const rows = options.filter(
    (o) => o.kind === "path" && (o.enabled || value.pathIds.includes(o.id)),
  );
  const selected = rows.filter(o => value.pathIds.includes(o.id)).map(o => o.name);
  if (!onChange) return <span className="text-body">{selected.join(" / ") || "-"}</span>;
  return <Field>
    <FieldLabel htmlFor="strategy-paths">{T.paths}</FieldLabel>
    <FormChoice id="strategy-paths" label={T.paths} options={rows.map(o => ({ value: o.id, label: o.name }))}
      values={value.pathIds} multiple placeholder={T.choose} onChange={pathIds => onChange({ ...value, pathIds })} />
  </Field>;
}

export function StrategyGoals({
  value,
  onChange,
  issues = [],
  currency = "CNY",
}: {
  readonly value: StrategyResult;
  readonly onChange?: (value: StrategyResult) => void;
  readonly issues?: readonly ResultIssue[];
  readonly currency?: string;
}) {
  const { STRATEGY_RESULT_TEXT: T } = useMessages();
  const patch = (id: string, p: Partial<StrategyGoal>) =>
    onChange?.({
      ...value,
      goals: value.goals.map((g) => (g.id === id ? { ...g, ...p } : g)),
    });
  const unit = (g: StrategyGoal) =>
    g.metric === "revenue" ? currency : g.unit || T.count;
  const error = (id: string, k: string) => {
    const e = issues.find((e) => e.field === `goal.${id}.${k}`);
    return e ? <FieldError>{T[e.code]}</FieldError> : null;
  };
  const add = (preset: StrategicMetric | "custom") =>
    onChange?.({
      ...value,
      goals: [
        ...value.goals,
        {
          id: crypto.randomUUID(),
          name: preset === "custom" ? "" : T[preset],
          metric: preset === "custom" ? null : preset,
          baseline: "",
          target: "",
          unit: preset === "revenue" ? currency : T.count,
          dueOn: "",
          criterion: "",
        },
      ],
    });
  return (
    <Section
      title={T.goals}
      icon="chart-line-up"
      help={T.fullHelp}
      action={
        onChange ? (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                type="button"
                size="md"
                variant="secondary"
                disabled={value.goals.length >= 30}
                data-strategy-add-goal
              >
                <Icon name="plus" size="sm" />
                {T.addGoal}
                <Icon name="chevron-down" size="sm" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {(
                ["revenue", "channels", "reference_cases", "custom"] as const
              ).map((k) => (
                <DropdownMenuItem
                  key={k}
                  disabled={
                    k !== "custom" && value.goals.some((g) => g.metric === k)
                  }
                  onSelect={() => add(k)}
                >
                  {T[k]}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        ) : undefined
      }
    >
      {issues.some((e) => e.field === "goals") ? (
        <FieldError>{T.required}</FieldError>
      ) : null}
      {onChange ? (
        <div className="flex flex-col gap-md" data-strategy-goal-editor>
          {value.goals.map((g, i) => (
            <Card key={g.id} className="py-lg">
              <CardContent className="@container flex flex-col gap-md">
                <div
                  className="grid grid-cols-1 gap-md @md:grid-cols-2 @2xl:grid-cols-4"
                  data-strategy-goal-fields
                >
                  <Field>
                    <FieldLabel required htmlFor={`goal-${g.id}-name`}>
                      {T.name}
                    </FieldLabel>
                    <Input
                      id={`goal-${g.id}-name`}
                      value={g.name}
                      maxLength={100}
                      placeholder={T.goalExample}
                      onChange={(e) => patch(g.id, { name: e.target.value })}
                    />
                    {error(g.id, "name")}
                  </Field>
                  {(["baseline", "target"] as const).map((k) => (
                    <Field key={k}>
                      <FieldLabel required htmlFor={`goal-${g.id}-${k}`}>
                        {T[k]}
                      </FieldLabel>
                      <InputGroup>
                        <InputGroupInput
                          id={`goal-${g.id}-${k}`}
                          value={g[k]}
                          inputMode="decimal"
                          placeholder="0"
                          maxLength={32}
                          aria-invalid={
                            !!issues.find(
                              (e) => e.field === `goal.${g.id}.${k}`,
                            )
                          }
                          onChange={(e) => patch(g.id, { [k]: e.target.value })}
                        />
                        <InputGroupAddon
                          align="end"
                          className="text-body-small text-muted-foreground"
                        >
                          {unit(g)}
                        </InputGroupAddon>
                      </InputGroup>
                      {error(g.id, k)}
                    </Field>
                  ))}
                  <Field>
                    <FieldLabel required>{T.dueOn}</FieldLabel>
                    <DatePicker
                      value={dateValue(g.dueOn)}
                      placeholder={T.choose}
                      onValueChange={(date) =>
                        patch(g.id, { dueOn: dateKey(date) })
                      }
                      className="w-full"
                    />
                    {error(g.id, "dueOn")}
                  </Field>
                </div>
                <div className="flex items-end gap-md">
                  <Field className="min-w-0 flex-1">
                    <FieldLabel htmlFor={`goal-${g.id}-criterion`}>
                      {T.criterion}
                    </FieldLabel>
                    <Input
                      id={`goal-${g.id}-criterion`}
                      value={g.criterion}
                      maxLength={1000}
                      placeholder={T.criterionExample}
                      onChange={(e) =>
                        patch(g.id, { criterion: e.target.value })
                      }
                    />
                  </Field>
                  <Button
                    type="button"
                    size="icon-md"
                    variant="ghost"
                    aria-label={`${T.remove} ${i + 1}`}
                    onClick={() =>
                      onChange({
                        ...value,
                        goals: value.goals.filter((x) => x.id !== g.id),
                      })
                    }
                  >
                    <Icon name="trash" size="sm" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                {(
                  ["name", "baseline", "target", "dueOn", "criterion"] as const
                ).map((k) => (
                  <TableHead key={k}>{T[k]}</TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {value.goals.map((g) => (
                <TableRow key={g.id}>
                  <TableCell className="text-body">
                    {g.name || T.untitled}
                  </TableCell>
                  <TableCell className="tabular-nums">
                    {g.baseline || "-"}
                  </TableCell>
                  <TableCell className="tabular-nums">
                    {g.target || "-"}{" "}
                    <span className="text-muted-foreground">{unit(g)}</span>
                  </TableCell>
                  <TableCell>{g.dueOn || "-"}</TableCell>
                  <TableCell>{g.criterion || "-"}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </Section>
  );
}

function AdvancedPart({
  title,
  icon,
  filled,
  children,
}: {
  readonly title: string;
  readonly icon: "wallet" | "flag";
  readonly filled: boolean;
  readonly children: ReactNode;
}) {
  return (
    <Collapsible defaultOpen asChild>
      <Card className="w-full min-w-0 gap-0 py-lg" data-strategy-advanced-card>
        <CardHeader>
          <div className="flex min-h-control-md items-center justify-between gap-md">
            <CardTitle className={`flex items-center gap-sm text-body font-medium ${filled ? "text-foreground" : "text-muted-foreground"}`}>
              <Icon name={icon} size="sm" />{title}
            </CardTitle>
            <CollapsibleTrigger asChild>
              <Button type="button" size="icon-md" variant="ghost" className="group shrink-0" aria-label={title}>
                <Icon name="chevron-down" size="sm" className="transition-transform group-data-[state=open]:rotate-180" />
              </Button>
            </CollapsibleTrigger>
          </div>
        </CardHeader>
        <CollapsibleContent>
          <CardContent className="pt-lg">
            <div className="border-t border-dashed border-border pt-lg">{children}</div>
          </CardContent>
        </CollapsibleContent>
      </Card>
    </Collapsible>
  );
}
export function StrategyAdvanced({
  value,
  onChange,
  currency = "CNY",
  ownerOptions,
}: {
  readonly value: StrategyResult;
  readonly onChange?: (value: StrategyResult) => void;
  readonly currency?: string;
  readonly ownerOptions?: readonly { value: string; label: string }[] | null;
}) {
  const { STRATEGY_RESULT_TEXT: T } = useMessages();
  const count = advancedFilled(value);
  const risks = value.risks.filter((r) => r.description || r.response);
  if (!onChange && !count && !risks.length) return null;
  const resource = Object.values(value.resources).some((v) => v.trim());
  const milestones = value.milestones.filter(
    (m) => m.name || m.startOn || m.endOn || m.deliverable || m.ownerSub,
  );
  const resources = (
    <div className="@container grid grid-cols-1 gap-lg @xl:grid-cols-3" data-strategy-resources>
        {(["people", "funds", "technology"] as const).map((k) => (
          <div key={k} className="flex min-w-0 flex-col gap-md">
            <Field>
              <FieldLabel htmlFor={`resource-${k}`}>{T[k]}</FieldLabel>
              {onChange ? (
                <InputGroup>
                  <InputGroupInput
                    id={`resource-${k}`}
                    value={value.resources[k]}
                    inputMode="decimal"
                    placeholder="0"
                    onChange={(e) =>
                      onChange({
                        ...value,
                        resources: { ...value.resources, [k]: e.target.value },
                      })
                    }
                  />
                  {k === "funds" ? (
                    <InputGroupAddon
                      align="end"
                      className="text-body-small text-muted-foreground"
                    >
                      {currency}
                    </InputGroupAddon>
                  ) : null}
                </InputGroup>
              ) : (
                <span className="text-body">
                  {value.resources[k] || "-"}
                  {k === "funds" ? ` ${currency}` : ""}
                </span>
              )}
            </Field>
            <Field>
              <FieldLabel htmlFor={`resource-${k}-note`}>
                {T[`${k}Note`]}
              </FieldLabel>
              {onChange ? (
                <Input
                  id={`resource-${k}-note`}
                  value={value.resources[`${k}Note`]}
                  maxLength={1000}
                  placeholder={T.noteExample}
                  onChange={(e) =>
                    onChange({
                      ...value,
                      resources: {
                        ...value.resources,
                        [`${k}Note`]: e.target.value,
                      },
                    })
                  }
                />
              ) : (
                <p className="text-body-small text-muted-foreground">
                  {value.resources[`${k}Note`] || "-"}
                </p>
              )}
            </Field>
          </div>
        ))}
    </div>
  );
  const timeline = (
    <ol
      className="ml-sm border-l border-border"
      data-strategy-milestone-timeline
    >
      {[...milestones]
        .sort((a, b) =>
          (a.startOn || "9999").localeCompare(b.startOn || "9999"),
        )
        .map((m) => (
          <li
            key={m.id}
            className="relative flex flex-col gap-sm pb-xl pl-xl last:pb-0"
          >
            <span
              className="absolute -left-2 top-xs size-4 rounded-full border border-primary/20 bg-background"
              aria-hidden="true"
            >
              <span className="m-1 block size-2 rounded-full bg-primary" />
            </span>
            <div className="flex flex-wrap items-baseline gap-md">
              <span className="text-body font-medium">{m.name || "-"}</span>
              <span className="text-body-small tabular-nums text-muted-foreground">
                {m.startOn || "-"} ~ {m.endOn || "-"}
              </span>
              {m.ownerSub ? <MemberName sub={m.ownerSub} /> : null}
            </div>
            {m.deliverable ? (
              <p className="text-body-small text-muted-foreground">
                {m.deliverable}
              </p>
            ) : null}
          </li>
        ))}
    </ol>
  );
  const stages = onChange ? (
    <div className="flex flex-col gap-md" data-strategy-milestones>
      {value.milestones.map((m, i) => {
        const patch = (p: Partial<typeof m>) =>
          onChange({
            ...value,
            milestones: value.milestones.map((x) =>
              x.id === m.id ? { ...x, ...p } : x,
            ),
          });
        return (
          <div key={m.id} className="@container flex flex-col gap-md border-t border-dashed border-border pt-lg first:border-0 first:pt-0" data-strategy-stage>
              <div
                className="grid grid-cols-1 gap-lg @xl:grid-cols-3"
                data-strategy-milestone-fields
              >
                <Field>
                  <FieldLabel htmlFor={`milestone-${m.id}-name`}>
                    {T.stage}
                  </FieldLabel>
                  <Input
                    id={`milestone-${m.id}-name`}
                    value={m.name}
                    maxLength={100}
                    placeholder={T.stageExample}
                    onChange={(e) => patch({ name: e.target.value })}
                  />
                </Field>
                <StrategyDateRange
                  id={`milestone-${m.id}-dates`}
                  startOn={m.startOn}
                  endOn={m.endOn}
                  onChange={(startOn, endOn) => patch({ startOn, endOn })}
                />
                <Field>
                  <FieldLabel>{T.owner}</FieldLabel>
                  <MemberPicker
                    label={T.owner}
                    value={m.ownerSub}
                    options={ownerOptions}
                    onValueChange={(ownerSub) =>
                      patch({ ownerSub: ownerSub || null })
                    }
                  />
                </Field>
              </div>
              <div className="flex items-end gap-md">
                <Field className="min-w-0 flex-1">
                  <FieldLabel htmlFor={`milestone-${m.id}-deliverable`}>
                    {T.deliverable}
                  </FieldLabel>
                  <Input
                    id={`milestone-${m.id}-deliverable`}
                    value={m.deliverable}
                    maxLength={1000}
                    placeholder={T.deliverableExample}
                    onChange={(e) => patch({ deliverable: e.target.value })}
                  />
                </Field>
                <Button
                  type="button"
                  size="icon-md"
                  variant="ghost"
                  aria-label={`${T.remove} ${i + 1}`}
                  onClick={() =>
                    onChange({
                      ...value,
                      milestones: value.milestones.filter((x) => x.id !== m.id),
                    })
                  }
                >
                  <Icon name="trash" size="sm" />
                </Button>
              </div>
          </div>
        );
      })}
      <Button
        type="button"
        size="md"
        variant="secondary"
        className="self-start"
        disabled={value.milestones.length >= 30}
        onClick={() =>
          onChange({
            ...value,
            milestones: [
              ...value.milestones,
              {
                id: crypto.randomUUID(),
                name: "",
                startOn: "",
                endOn: "",
                ownerSub: null,
                deliverable: "",
              },
            ],
          })
        }
      >
        <Icon name="plus" size="sm" />
        {T.addStage}
      </Button>
    </div>
  ) : (
    timeline
  );
  const legacy = risks.length ? (
    <Section title={T.risks} icon="shield">
      <div className="flex flex-col gap-md">
        {risks.map((r) => (
          <div key={r.id} className="grid grid-cols-1 gap-md @xl:grid-cols-2">
            <p className="text-body">{r.description}</p>
            <p className="text-body-small text-muted-foreground">
              {r.response}
            </p>
          </div>
        ))}
      </div>
    </Section>
  ) : null;
  if (!onChange)
    return (
      <>
        {count ? (
          <Section title={T.advanced} icon="faders">
            <div className="@container flex flex-col gap-xl">
              {resource ? (
                <AdvancedPart title={T.resources} icon="wallet" filled={resource}>
                  {resources}
                </AdvancedPart>
              ) : null}
              {milestones.length ? (
                <AdvancedPart title={T.milestones} icon="flag" filled={!!milestones.length}>
                  {timeline}
                </AdvancedPart>
              ) : null}
            </div>
          </Section>
        ) : null}
        {legacy}
      </>
    );
  return (
    <>
      <Collapsible
        className="@container flex flex-col gap-md"
        data-strategy-advanced
      >
        <SectionHeader
          title={`${T.advanced} (${T.filled} ${count}/2)`}
          icon="faders"
          help={T.advancedHelp}
          action={
            <CollapsibleTrigger asChild>
              <Button
                type="button"
                size="icon-md"
                variant="ghost"
                className="group"
                aria-label={T.advanced}
              >
                <Icon
                  name="chevron-down"
                  size="sm"
                  className="transition-transform group-data-[state=open]:rotate-180"
                />
              </Button>
            </CollapsibleTrigger>
          }
        />
        <CollapsibleContent className="flex flex-col gap-lg">
          <AdvancedPart title={T.resources} icon="wallet" filled={resource}>
            {resources}
          </AdvancedPart>
          <AdvancedPart
            title={T.milestones}
            icon="flag"
            filled={!!milestones.length}
          >
            {stages}
          </AdvancedPart>
        </CollapsibleContent>
      </Collapsible>
      {legacy}
    </>
  );
}

export function StrategyNovelty({
  value,
  onChange,
  label,
}: {
  readonly label?: string;
  readonly value: Novelty;
  readonly onChange?: (v: Novelty) => void;
}) {
  const { STRATEGY_RESULT_TEXT: T } = useMessages();
  return onChange ? (
    <FormChoice label={label ?? T.offeringAttribute} values={[value]} placeholder={T.unknown}
      options={(["unknown", "existing", "new"] as const).map(k => ({ value: k, label: T[k] }))}
      onChange={values => onChange(values[0] as Novelty)} />
  ) : (
    <span className="text-body-small text-muted-foreground">{T[value]}</span>
  );
}
export function StrategyConsistency({
  code,
  value,
  userKey,
}: {
  readonly code?: string;
  readonly value: StrategyResult;
  readonly userKey: string;
}) {
  const { STRATEGY_RESULT_TEXT: T } = useMessages();
  const warnings = consistencyWarnings(code, value),
    signature = JSON.stringify([code, value.markets, value.offerings]);
  const [dismissed, setDismissed] = useState("");
  const [never, setNever] = useState(false);
  const stored = () => {
    try {
      return (
        localStorage.getItem(`yucer.strategy-warning.${userKey}`) === "off"
      );
    } catch {
      return false;
    }
  };
  if (!warnings.length || dismissed === signature || never) return null;
  return (
    <div className="flex flex-col gap-sm" data-strategy-consistency>
      <Banner
        tone="warning"
        title={T.warning}
        description={warnings.map((k) => T[k as "new-market"]).join(" / ")}
      />
      <div className="flex items-center gap-sm">
        <Button
          type="button"
          variant="ghost"
          size="md"
          onClick={() => setDismissed(signature)}
        >
          {T.dismiss}
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="md"
          onClick={() => {
            try {
              localStorage.setItem(`yucer.strategy-warning.${userKey}`, "off");
            } catch {}
            setNever(true);
          }}
        >
          {T.never}
        </Button>
      </div>
      <RememberedWarning read={stored} onRemembered={() => setNever(true)} />
    </div>
  );
}
function RememberedWarning({
  read,
  onRemembered,
}: {
  read: () => boolean;
  onRemembered: () => void;
}) {
  useEffect(() => {
    if (read()) onRemembered();
  }, [read, onRemembered]);
  return null;
}
