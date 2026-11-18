"use client";

import { useEffect, useState, type ReactNode } from "react";
import {
  Banner,
  Button,
  Card,
  CardContent,
  Checkbox,
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
  Field,
  FieldError,
  FieldLabel,
  Icon,
  Input,
  NativeSelect,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@vxture/design-ui";
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
  const [preset, setPreset] = useState<StrategicMetric | "custom">("revenue");
  const patch = (id: string, p: Partial<StrategyGoal>) =>
    onChange?.({
      ...value,
      goals: value.goals.map((g) => (g.id === id ? { ...g, ...p } : g)),
    });
  const error = (id: string, k: string) => {
    const e = issues.find((e) => e.field === `goal.${id}.${k}`);
    return e ? <FieldError>{T[e.code]}</FieldError> : null;
  };
  return (
    <Section
      title={T.goals}
      icon="chart-line-up"
      help={T.fullHelp}
      action={
        onChange ? (
          <div className="flex items-center gap-sm">
            <NativeSelect
              aria-label={T.addGoal}
              value={preset}
              onChange={(e) => setPreset(e.target.value as typeof preset)}
            >
              {(
                ["revenue", "channels", "reference_cases", "custom"] as const
              ).map((k) => (
                <option
                  key={k}
                  value={k}
                  disabled={
                    k !== "custom" && value.goals.some((g) => g.metric === k)
                  }
                >
                  {T[k]}
                </option>
              ))}
            </NativeSelect>
            <Button
              type="button"
              size="md"
              variant="secondary"
              disabled={
                value.goals.length >= 30 ||
                (preset !== "custom" &&
                  value.goals.some((g) => g.metric === preset))
              }
              onClick={() =>
                onChange({
                  ...value,
                  goals: [
                    ...value.goals,
                    {
                      id: crypto.randomUUID(),
                      name: preset === "custom" ? "" : T[preset],
                      metric: preset === "custom" ? null : preset,
                      baseline: "",
                      target: "",
                      unit:
                        preset === "revenue"
                          ? currency
                          : preset === "custom"
                            ? ""
                            : T.count,
                      dueOn: "",
                      criterion: "",
                    },
                  ],
                })
              }
            >
              <Icon name="plus" size="sm" />
              {T.addGoal}
            </Button>
          </div>
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
                <div className="flex items-start gap-md">
                  <span className="pt-sm text-body-small tabular-nums text-muted-foreground">
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <div className="grid min-w-0 flex-1 grid-cols-1 gap-md @xl:grid-cols-2 @3xl:grid-cols-4">
                    {(
                      ["name", "baseline", "target", "unit", "dueOn"] as const
                    ).map((k) => (
                      <Field
                        key={k}
                        className={k === "name" ? "@3xl:col-span-2" : undefined}
                      >
                        <FieldLabel required htmlFor={`goal-${g.id}-${k}`}>
                          {T[k]}
                        </FieldLabel>
                        <Input
                          id={`goal-${g.id}-${k}`}
                          value={g[k]}
                          readOnly={k === "unit" && g.metric === "revenue"}
                          aria-invalid={issues.some(
                            (e) => e.field === `goal.${g.id}.${k}`,
                          )}
                          type={k === "dueOn" ? "date" : "text"}
                          inputMode={
                            k === "baseline" || k === "target"
                              ? "decimal"
                              : undefined
                          }
                          maxLength={
                            k === "name" ? 100 : k === "unit" ? 24 : 32
                          }
                          placeholder={
                            k === "name"
                              ? T.goalExample
                              : k === "baseline" || k === "target"
                                ? "0"
                                : undefined
                          }
                          onChange={(e) => patch(g.id, { [k]: e.target.value })}
                        />
                        {error(g.id, k)}
                      </Field>
                    ))}
                    <Field className="@xl:col-span-2">
                      <FieldLabel htmlFor={`goal-${g.id}-criterion`}>
                        {T.criterion}
                      </FieldLabel>
                      <Input
                        id={`goal-${g.id}-criterion`}
                        maxLength={1000}
                        placeholder={T.criterionExample}
                        value={g.criterion}
                        onChange={(e) =>
                          patch(g.id, { criterion: e.target.value })
                        }
                      />
                    </Field>
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-md"
                    aria-label={T.remove}
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
                    <span className="text-muted-foreground">{g.unit}</span>
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
  filled,
  children,
}: {
  readonly title: string;
  readonly filled: boolean;
  readonly children: ReactNode;
}) {
  return (
    <Collapsible className="flex flex-col gap-md border-t border-dashed border-border pt-lg">
      <CollapsibleTrigger asChild>
        <Button
          type="button"
          size="md"
          variant="ghost"
          className="group w-full justify-between"
        >
          <span
            className={filled ? "text-foreground" : "text-muted-foreground"}
          >
            {title}
          </span>
          <Icon
            name="chevron-down"
            size="sm"
            className="transition-transform group-data-[state=open]:rotate-180"
          />
        </Button>
      </CollapsibleTrigger>
      <CollapsibleContent className="flex flex-col gap-lg">
        {children}
      </CollapsibleContent>
    </Collapsible>
  );
}
export function StrategyAdvanced({
  value,
  options,
  onChange,
  currency = "CNY",
}: {
  readonly currency?: string;
  readonly value: StrategyResult;
  readonly options: readonly StrategyOption[];
  readonly onChange?: (value: StrategyResult) => void;
}) {
  const { STRATEGY_RESULT_TEXT: T } = useMessages();
  const count = advancedFilled(value);
  if (!onChange && !count) return null;
  const resource = Object.values(value.resources).some((v) => v.trim());
  const milestones = value.milestones.filter(
    (m) => m.name || m.startOn || m.endOn || m.deliverable,
  );
  const risks = value.risks.filter((r) => r.description || r.response);
  const paths = (
    <div className="flex flex-wrap gap-lg">
      {options
        .filter(
          (o) =>
            o.kind === "path" && (o.enabled || value.pathIds.includes(o.id)),
        )
        .map((o) =>
          onChange ? (
            <label
              key={o.id}
              className="inline-flex items-center gap-sm text-body"
            >
              <Checkbox
                checked={value.pathIds.includes(o.id)}
                onCheckedChange={(checked) =>
                  onChange({
                    ...value,
                    pathIds: checked
                      ? [...value.pathIds, o.id]
                      : value.pathIds.filter((id) => id !== o.id),
                  })
                }
              />
              {o.name}
            </label>
          ) : value.pathIds.includes(o.id) ? (
            <span key={o.id}>{o.name}</span>
          ) : null,
        )}
    </div>
  );
  const resources = (
    <div className="grid grid-cols-1 gap-lg @xl:grid-cols-3">
      {(["people", "funds", "technology"] as const).map((k) => (
        <div key={k} className="flex flex-col gap-md">
          <Field>
            <FieldLabel htmlFor={`resource-${k}`}>{T[k]}</FieldLabel>
            {onChange ? (
              <Input
                id={`resource-${k}`}
                inputMode="decimal"
                placeholder="0"
                value={value.resources[k]}
                onChange={(e) =>
                  onChange({
                    ...value,
                    resources: { ...value.resources, [k]: e.target.value },
                  })
                }
              />
            ) : (
              <span>{value.resources[k] || "-"}</span>
            )}
          </Field>
          <Field>
            <FieldLabel htmlFor={`resource-${k}-note`}>
              {T[`${k}Note`]}
            </FieldLabel>
            {onChange ? (
              <Input
                id={`resource-${k}-note`}
                maxLength={1000}
                placeholder={T.noteExample}
                value={value.resources[`${k}Note`]}
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
              <p className="text-body">{value.resources[`${k}Note`] || "-"}</p>
            )}
          </Field>
        </div>
      ))}
    </div>
  );
  const milestoneContent = !onChange ? (
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
                <time dateTime={m.startOn || undefined}>
                  {m.startOn || "-"}
                </time>
                {" ~ "}
                <time dateTime={m.endOn || undefined}>{m.endOn || "-"}</time>
              </span>
            </div>
            {m.deliverable ? (
              <p className="text-body-small text-muted-foreground">
                {m.deliverable}
              </p>
            ) : null}
          </li>
        ))}
    </ol>
  ) : (
    <div className="flex flex-col gap-lg">
      {value.milestones.map((m, i) => (
        <div key={m.id} className="flex items-start gap-md">
          <Icon
            name="calendar"
            size="sm"
            className="mt-sm shrink-0 text-primary-text"
          />
          <div className="grid min-w-0 flex-1 grid-cols-1 gap-md @xl:grid-cols-3">
            {(["name", "startOn", "endOn", "deliverable"] as const).map((k) => (
              <Field
                key={k}
                className={k === "deliverable" ? "col-span-full" : undefined}
              >
                <FieldLabel htmlFor={`milestone-${m.id}-${k}`}>
                  {k === "name"
                    ? T.stage
                    : k === "startOn"
                      ? T.start
                      : k === "endOn"
                        ? T.end
                        : T.deliverable}
                </FieldLabel>
                {onChange ? (
                  <Input
                    id={`milestone-${m.id}-${k}`}
                    type={k.endsWith("On") ? "date" : "text"}
                    maxLength={k === "name" ? 100 : 1000}
                    value={m[k]}
                    min={k === "endOn" ? m.startOn : undefined}
                    onChange={(e) =>
                      onChange({
                        ...value,
                        milestones: value.milestones.map((r, n) =>
                          i === n ? { ...r, [k]: e.target.value } : r,
                        ),
                      })
                    }
                  />
                ) : (
                  <span className="text-body">{m[k] || "-"}</span>
                )}
              </Field>
            ))}
          </div>
          {onChange ? (
            <Button
              type="button"
              variant="ghost"
              size="icon-md"
              aria-label={T.remove}
              onClick={() =>
                onChange({
                  ...value,
                  milestones: value.milestones.filter((r) => r.id !== m.id),
                })
              }
            >
              <Icon name="trash" size="sm" />
            </Button>
          ) : null}
        </div>
      ))}
      {onChange ? (
        <Button
          type="button"
          variant="secondary"
          size="md"
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
                  deliverable: "",
                },
              ],
            })
          }
        >
          {T.addStage}
        </Button>
      ) : null}
    </div>
  );
  const riskContent = (
    <div className="flex flex-col gap-lg">
      {(onChange ? value.risks : risks).map((r) => (
        <div key={r.id} className="flex items-start gap-md">
          <div className="grid min-w-0 flex-1 grid-cols-1 gap-md @xl:grid-cols-3">
            <Field>
              <FieldLabel>{T.risks}</FieldLabel>
              {onChange ? (
                <NativeSelect
                  aria-label={T.risks}
                  value={r.kind}
                  onChange={(e) =>
                    onChange({
                      ...value,
                      risks: value.risks.map((x) =>
                        x.id === r.id
                          ? { ...x, kind: e.target.value as typeof r.kind }
                          : x,
                      ),
                    })
                  }
                >
                  <option value="assumption">{T.assumption}</option>
                  <option value="risk">{T.risk}</option>
                </NativeSelect>
              ) : (
                <span>{T[r.kind]}</span>
              )}
            </Field>
            {(["description", "response"] as const).map((k) => (
              <Field key={k}>
                <FieldLabel htmlFor={`risk-${r.id}-${k}`}>{T[k]}</FieldLabel>
                {onChange ? (
                  <Input
                    id={`risk-${r.id}-${k}`}
                    maxLength={1000}
                    value={r[k]}
                    onChange={(e) =>
                      onChange({
                        ...value,
                        risks: value.risks.map((x) =>
                          x.id === r.id ? { ...x, [k]: e.target.value } : x,
                        ),
                      })
                    }
                  />
                ) : (
                  <p className="text-body">{r[k] || "-"}</p>
                )}
              </Field>
            ))}
          </div>
          {onChange ? (
            <Button
              type="button"
              variant="ghost"
              size="icon-md"
              aria-label={T.remove}
              onClick={() =>
                onChange({
                  ...value,
                  risks: value.risks.filter((x) => x.id !== r.id),
                })
              }
            >
              <Icon name="trash" size="sm" />
            </Button>
          ) : null}
        </div>
      ))}
      {onChange ? (
        <Button
          type="button"
          variant="secondary"
          size="md"
          className="self-start"
          disabled={value.risks.length >= 30}
          onClick={() =>
            onChange({
              ...value,
              risks: [
                ...value.risks,
                {
                  id: crypto.randomUUID(),
                  kind: "assumption",
                  description: "",
                  response: "",
                },
              ],
            })
          }
        >
          {T.addRisk}
        </Button>
      ) : null}
    </div>
  );
  const parts = [
    { key: "paths" as const, filled: !!value.pathIds.length, content: paths },
    { key: "resources" as const, filled: resource, content: resources },
    {
      key: "milestones" as const,
      filled: !!milestones.length,
      content: milestoneContent,
    },
    { key: "risks" as const, filled: !!risks.length, content: riskContent },
  ];
  const content = parts
    .filter((p) => onChange || p.filled)
    .map((p) =>
      onChange ? (
        <AdvancedPart key={p.key} title={T[p.key]} filled={p.filled}>
          {p.content}
        </AdvancedPart>
      ) : (
        <Section key={p.key} title={T[p.key]}>
          {p.content}
        </Section>
      ),
    );
  if (!onChange)
    return (
      <Section title={T.advanced} icon="faders">
        <div className="@container flex flex-col gap-xl">{content}</div>
      </Section>
    );
  return (
    <Collapsible
      className="@container flex flex-col gap-md"
      data-strategy-advanced
    >
      <SectionHeader
        title={`${T.advanced} (${T.filled} ${count}/4)`}
        icon="faders"
        help={T.advancedHelp}
        action={
          <CollapsibleTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon-md"
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
        {content}
      </CollapsibleContent>
    </Collapsible>
  );
}

export function StrategyNovelty({
  value,
  onChange,
}: {
  readonly value: Novelty;
  readonly onChange?: (v: Novelty) => void;
}) {
  const { STRATEGY_RESULT_TEXT: T } = useMessages();
  return onChange ? (
    <NativeSelect
      aria-label={T.offeringAttribute}
      value={value}
      onChange={(e) => onChange(e.target.value as Novelty)}
      className="w-auto"
    >
      {(["unknown", "existing", "new"] as const).map((k) => (
        <option key={k} value={k}>
          {T[k]}
        </option>
      ))}
    </NativeSelect>
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
