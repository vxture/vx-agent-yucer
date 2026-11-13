"use client";

import { useMemo, useState } from "react";
import {
  Button,
  Combobox,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Field,
  FieldDescription,
  FieldLabel,
  Icon,
  Input,
  NativeSelect,
  Section,
  StatusBadge,
  Textarea,
} from "@vxture/design-ui";
import { useMessages } from "../lib/i18n/provider";
import {
  AssistPanel,
  FormFields,
  FormFieldWide,
  FormPage,
  useFormSubmit,
  type AssistSuggestion,
} from "./form-page";
import { knownValues, suggestNextCode } from "../../domains/shared/suggest";
import type { SolutionReference } from "../../domains/catalog/service";
import type { MarketView } from "../lib/market-strategy";
import type { NewPlanDraft, PlanEdit, TargetMarketDraft, TargetMarketIntent } from "../../domains/strategy/lib/lifecycle";

// 新建 / 修改战略计划 - a page since 2026-09-05 (owner ruling: content-rich
// operations get a page, with the assistant beside the work).
//
// ONE FORM PER FILE, deliberately: reachable-codes.test.ts associates error
// dictionaries with actions at FILE granularity, so a file holding two forms
// would demand every action's codes exist in every dictionary the file
// mentions. The constraint is the guard's, and it is a good one - it keeps
// "which dictionary translates this refusal" answerable by looking at one file.
//
// NO STATUS FIELD, in either mode: a new plan is a draft, and the lifecycle
// table owns every move after that. Offering status here would be a way to
// reach "approved" without the transition that records it - the same argument
// the create rule and the edit rule each make on their own side.
//
// THE NUMBER IS EDITABLE ONLY WHILE IT DOES NOT EXIST. It is the anchor every
// downstream record quotes and it carries no UPDATE grant, so in edit mode it
// is shown as the identity of the thing being edited rather than as a field
// that would be silently dropped.

type Saved = { ok: boolean; error?: string };
type MarketOption = Pick<MarketView, "id" | "name" | "segmentCode" | "status" | "criteria" | "matched" | "missing">;
type TargetSelection = TargetMarketDraft & { marketName: string };

function SolutionPicker({ options, ids, onChange, disabled }: {
  readonly options: readonly SolutionReference[] | null;
  readonly ids: readonly string[] | undefined;
  readonly onChange: (ids: readonly string[]) => void;
  readonly disabled: boolean;
}) {
  const { MARKET_STRATEGY_TEXT: T } = useMessages();
  if (options === null || ids === undefined) return <FieldDescription>{T.solutionOptionsUnavailable}</FieldDescription>;
  const selected = options.filter(s => ids.includes(s.id));
  const available = options.filter(s => s.status === "active" && !ids.includes(s.id));
  return <>
    <Combobox
      items={available.map(s => ({ value: s.id, label: `${s.name} · ${s.solutionCode}` }))}
      onValueChange={id => { if (id && !ids.includes(id)) onChange([...ids, id]); }}
      placeholder={available.length ? T.addSolution : T.noSelectableSolutions}
      searchPlaceholder={T.searchSolutions}
      emptyText={T.noMatches}
      disabled={disabled || !available.length}
      className="w-full text-body-small"
    />
    {selected.length ? <ul className="flex flex-wrap gap-sm" aria-label={T.primarySolutions}>
      {selected.map(s => <li key={s.id} className="flex max-w-full items-center gap-xs rounded-md bg-accent pl-sm text-body-small">
        <span className="min-w-0 break-words">{s.name}{s.status === "retired" ? ` · ${T.retiredSolution}` : ""}</span>
        <Button type="button" size="icon-md" variant="ghost" aria-label={`${T.removeSolution}: ${s.name}`}
          disabled={disabled} onClick={() => onChange(ids.filter(id => id !== s.id))}>
          <Icon name="x" size="sm" aria-hidden="true" />
        </Button>
      </li>)}
    </ul> : null}
  </>;
}

export interface PlanFormInitial {
  readonly id: string;
  readonly planNo: string;
  readonly name: string;
  readonly period: string;
  readonly objective: string | null;
  readonly ownerSub: string | null;
  readonly solutionIds: readonly string[] | undefined;
  readonly targetMarkets: readonly TargetSelection[];
}

export function NewPlanForm({
  existingPlanNos,
  existingPeriods,
  initial,
  solutionOptions,
  marketOptions,
  onCreate,
  onSave,
}: {
  readonly existingPlanNos: readonly string[];
  readonly existingPeriods: readonly string[];
  /** Present edits that plan; absent creates one. */
  readonly initial?: PlanFormInitial;
  readonly solutionOptions: readonly SolutionReference[] | null;
  readonly marketOptions: readonly MarketOption[] | null;
  readonly onCreate: (input: NewPlanDraft) => Promise<Saved>;
  readonly onSave: (id: string, input: PlanEdit) => Promise<Saved>;
}) {
  const { STRATEGY_TEXT, PLAN_ERROR, ASSIST_TEXT, MARKET_STRATEGY_TEXT: T } = useMessages();
  const [planNo, setPlanNo] = useState(initial?.planNo ?? "");
  const [name, setName] = useState(initial?.name ?? "");
  const [period, setPeriod] = useState(initial?.period ?? "");
  const [objective, setObjective] = useState(initial?.objective ?? "");
  const [ownerSub, setOwnerSub] = useState(initial?.ownerSub ?? "");
  const [solutionIds, setSolutionIds] = useState<readonly string[] | undefined>(initial ? initial.solutionIds : []);
  const [targets, setTargets] = useState<readonly TargetSelection[]>(initial?.targetMarkets ?? []);
  const [marketId, setMarketId] = useState("");
  const availableMarkets = marketOptions?.filter(m => m.status === "active" && !targets.some(t => t.segmentId === m.id)) ?? [];
  const candidate = availableMarkets.find(m => m.id === marketId);
  const solutionSelectionChanged = JSON.stringify(solutionIds) !== JSON.stringify(initial ? initial.solutionIds : []);
  const targetsChanged = JSON.stringify(targets) !== JSON.stringify(initial?.targetMarkets ?? []);
  const patchTarget = (segmentId: string, patch: Partial<TargetMarketDraft>) =>
    setTargets(rows => rows.map(row => row.segmentId === segmentId ? { ...row, ...patch } : row));
  const number = (n: number | null) => n === null ? T.unknown : n;
  const submit = useFormSubmit("/strategy");

  const nextNo = useMemo(() => suggestNextCode(existingPlanNos), [existingPlanNos]);
  const periods = useMemo(() => knownValues(existingPeriods), [existingPeriods]);

  const suggestions: AssistSuggestion[] = [];
  if (!initial && nextNo && planNo.trim() === "") {
    suggestions.push({
      id: "no",
      label: ASSIST_TEXT.codeNext(nextNo),
      reason: ASSIST_TEXT.codeNextWhy,
      apply: () => setPlanNo(nextNo),
    });
  }
  // The period format the workspace already writes ("2026H2", "2026-Q3"...).
  // Suggesting the EXISTING spelling is the point: two spellings of one period
  // split every report that groups by it - the same argument as categories.
  if (period.trim() === "" && periods.length > 0) {
    suggestions.push({
      id: "period",
      label: ASSIST_TEXT.periodKnown(periods[0]!),
      reason: ASSIST_TEXT.periodKnownWhy,
      apply: () => setPeriod(periods[0]!),
    });
  }

  const ready =
    name.trim() !== "" && period.trim() !== "" && (initial ? true : planNo.trim() !== "");

  return (
    <FormPage
      form={
        // The page ViewHeader owns the title - repeating it in the Section
        // rendered the same sentence twice within one viewport.
        <Section icon="flag">
          <div className="gap-xl flex flex-col">
            <FormFields>
            <Field>
              <FieldLabel>{STRATEGY_TEXT.newPlanNo}</FieldLabel>
              {initial ? (
                <>
                  <p className="text-foreground mono text-body">{initial.planNo}</p>
                  <FieldDescription>{STRATEGY_TEXT.planNoFixed}</FieldDescription>
                </>
              ) : (
                <Input value={planNo} onChange={(e) => setPlanNo(e.target.value)} />
              )}
            </Field>
            <Field>
              <FieldLabel>{STRATEGY_TEXT.newPlanName}</FieldLabel>
              <Input value={name} onChange={(e) => setName(e.target.value)} />
            </Field>
            <Field>
              <FieldLabel>{STRATEGY_TEXT.newPlanPeriod}</FieldLabel>
              <Input value={period} onChange={(e) => setPeriod(e.target.value)} />
              <FieldDescription>{T.parallelStrategies}</FieldDescription>
            </Field>
            <Field>
              <FieldLabel>{STRATEGY_TEXT.newPlanOwner}</FieldLabel>
              <Input value={ownerSub} onChange={(e) => setOwnerSub(e.target.value)} />
            </Field>
            <Field>
              <FieldLabel>{STRATEGY_TEXT.newPlanObjective}</FieldLabel>
              <Input value={objective} onChange={(e) => setObjective(e.target.value)} />
            </Field>
            </FormFields>
            <div id="target-markets">
            <Section title={T.currentMarkets} icon="target" description={T.currentMarketsWhy}>
              {marketOptions === null ? <p className="text-body-small text-muted-foreground">{T.marketOptionsUnavailable}</p> : <>
                <div className="flex flex-wrap items-center gap-sm" data-target-market-picker>
                  <Combobox
                    items={availableMarkets.map(m => ({ value: m.id, label: `${m.name} · ${m.segmentCode}` }))}
                    value={marketId}
                    onValueChange={setMarketId}
                    placeholder={availableMarkets.length ? T.chooseMarkets : T.noSelectableMarkets}
                    searchPlaceholder={T.searchMarkets}
                    emptyText={T.noMatches}
                    disabled={submit.pending || !availableMarkets.length}
                  />
                  <Button size="md" variant="secondary" disabled={submit.pending || !candidate} onClick={() => {
                    if (!candidate) return;
                    setTargets(rows => [...rows, { segmentId: candidate.id, marketName: candidate.name, intent: "focus", approach: null }]);
                    setMarketId("");
                  }}>{T.addTargetMarket}</Button>
                </div>
                {candidate ? <div className="flex flex-col gap-xs text-body-small text-muted-foreground" aria-live="polite">
                  <p>{[...candidate.criteria.industries, ...(candidate.criteria.sizes ?? []), ...candidate.criteria.regions].join(" / ") || T.undefined}</p>
                  {candidate.criteria.customerNeed ? <p>{candidate.criteria.customerNeed}</p> : null}
                  <p>{T.customerCount} {number(candidate.matched)} · {T.missing} {number(candidate.missing)}</p>
                </div> : null}
                {targets.map(t => {
                  const market = marketOptions.find(m => m.id === t.segmentId);
                  const original = initial?.targetMarkets.find(row => row.segmentId === t.segmentId);
                  return <Card key={t.segmentId}>
                    <CardHeader>
                      <div className="flex items-center justify-between gap-md">
                        <CardTitle>{t.marketName}</CardTitle>
                        <Button type="button" size="icon-md" variant="ghost" aria-label={`${T.removeTargetMarket}: ${t.marketName}`}
                          disabled={submit.pending || (!!original && original.solutionIds === undefined)} onClick={() => setTargets(rows => rows.filter(row => row.segmentId !== t.segmentId))}>
                          <Icon name="x" size="sm" aria-hidden="true" />
                        </Button>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <FormFields>
                        <Field>
                          <FieldLabel>{T.marketIntent}</FieldLabel>
                          <NativeSelect aria-label={T.marketIntent} value={t.intent ?? ""} onChange={e => patchTarget(t.segmentId, { intent: e.target.value as TargetMarketIntent })}>
                            {t.intent === null ? <option value="" disabled>{T.unclassifiedMarket}</option> : null}
                            <option value="focus">{T.focusMarket}</option><option value="validate">{T.validateMarket}</option>
                          </NativeSelect>
                          {market && market.status !== "active" ? <FieldDescription>{STRATEGY_TEXT.segmentStatusLabel[market.status]}</FieldDescription> : null}
                        </Field>
                        <Field>
                          <FieldLabel>{T.primarySolutions}</FieldLabel>
                          <SolutionPicker options={solutionOptions} ids={t.solutionIds ?? (original ? undefined : [])}
                            disabled={submit.pending} onChange={ids => patchTarget(t.segmentId, { solutionIds: ids })} />
                        </Field>
                        <FormFieldWide>
                          <Field>
                            <FieldLabel>{T.marketApproach}</FieldLabel>
                            <Textarea aria-label={T.marketApproach} rows={2} maxLength={4000} value={t.approach ?? ""} placeholder={T.marketApproachHint}
                              onChange={e => patchTarget(t.segmentId, { approach: e.target.value || null })} />
                          </Field>
                        </FormFieldWide>
                      </FormFields>
                    </CardContent>
                  </Card>;
                })}
                {!targets.length && !candidate ? <p className="text-body-small text-muted-foreground">{T.noPlanMarkets}</p> : null}
              </>}
            </Section>
            </div>
            <FormFields>
              <Field>
                <FieldLabel>{T.sharedSolutions}</FieldLabel>
                <SolutionPicker options={solutionOptions} ids={solutionIds} onChange={setSolutionIds} disabled={submit.pending} />
                <FieldDescription>{T.sharedSolutionsHint}</FieldDescription>
              </Field>
            </FormFields>
            {/* The number is the anchor: workspace-unique, no UPDATE grant, so
                it cannot be corrected later. Said before the first attempt. */}
            {initial ? null : (
              <p className="text-muted-foreground text-body-small">{STRATEGY_TEXT.newPlanAnchor}</p>
            )}
            <div className="flex items-center gap-md">
              <Button
                size="xl"
                disabled={submit.pending || !ready}
                onClick={() =>
                  submit.run(() => {
                    const fields = {
                      name: name.trim(),
                      period: period.trim(),
                      objective: objective.trim() === "" ? null : objective.trim(),
                      ownerSub: ownerSub.trim() === "" ? null : ownerSub.trim(),
                      ...(solutionOptions !== null && solutionSelectionChanged ? { solutionIds } : {}),
                      ...(marketOptions !== null && targetsChanged ? {
                        targetMarkets: targets.map(({ marketName: _name, solutionIds, ...t }) => {
                          const original = initial?.targetMarkets.find(row => row.segmentId === t.segmentId);
                          return { ...t, ...(JSON.stringify(solutionIds) !== JSON.stringify(original?.solutionIds) ? { solutionIds } : {}) };
                        }),
                      } : {}),
                    };
                    return initial
                      ? onSave(initial.id, fields)
                      : onCreate({ planNo: planNo.trim(), ...fields });
                  }, (c) => PLAN_ERROR[c] ?? PLAN_ERROR.denied)
                }
              >
                {initial ? STRATEGY_TEXT.planSave : STRATEGY_TEXT.newPlanSave}
              </Button>
              {submit.err ? <StatusBadge tone="danger">{submit.err}</StatusBadge> : null}
            </div>
          </div>
        </Section>
      }
      assist={<AssistPanel suggestions={suggestions} />}
    />
  );
}
