"use client";

import { useMemo, useState } from "react";
import {
  Button,
  Field,
  FieldDescription,
  FieldLabel,
  Input,
  Section,
  StatusBadge,
} from "@vxture/design-ui";
import { useMessages } from "../lib/i18n/provider";
import {
  AssistPanel,
  FormFields,
  FormPage,
  useFormSubmit,
  type AssistSuggestion,
} from "./form-page";
import { knownValues, suggestNextCode } from "../../domains/shared/suggest";
import type { SolutionReference } from "../../domains/catalog/service";
import { StrategyRelationsDrawer, type RelationTask, type RelationMarketOption, type RelationTarget } from "./strategy-relations-drawer";
import type { NewPlanDraft, PlanEdit, PlanRelationChange } from "../../domains/strategy/lib/lifecycle";

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
type MarketOption = RelationMarketOption;
type TargetSelection = RelationTarget;

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
  const [relationTask, setRelationTask] = useState<RelationTask | null>(null);
  const solutionSelectionChanged = JSON.stringify(solutionIds) !== JSON.stringify(initial ? initial.solutionIds : []);
  const targetsChanged = JSON.stringify(targets) !== JSON.stringify(initial?.targetMarkets ?? []);
  const saveRelations = async (change: PlanRelationChange): Promise<Saved> => {
    if (change.kind === "solutions") setSolutionIds(change.solutionIds);
    else if (change.kind === "market") setTargets(rows => rows.map(row => row.segmentId === change.segmentId ? {
      ...row, intent: change.intent, approach: change.approach,
      ...(change.solutionIds === undefined ? {} : { solutionIds: change.solutionIds }),
    } : row));
    else setTargets(rows => [
      ...rows.filter(row => !change.remove.includes(row.segmentId)),
      ...change.add.filter(id => !rows.some(row => row.segmentId === id)).flatMap(id => {
        const market = marketOptions?.find(m => m.id === id);
        return market ? [{ segmentId: id, marketName: market.name, intent: "focus" as const, approach: null,
          ...(solutionOptions === null ? {} : { solutionIds: [] }),
        }] : [];
      }),
    ]);
    return { ok: true };
  };
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
              <Section title={T.currentMarkets} icon="target" description={T.relationNewPlanHint}
                action={<div className="flex flex-wrap gap-sm">
                  <Button type="button" size="xl" variant="secondary" disabled={submit.pending || marketOptions === null} onClick={() => setRelationTask({kind:"markets"})}>{T.linkMarkets}</Button>
                  <Button type="button" size="xl" variant="secondary" disabled={submit.pending || solutionOptions === null || solutionIds === undefined} onClick={() => setRelationTask({kind:"solutions"})}>{T.linkSolutions}</Button>
                </div>}>
                {marketOptions === null ? <p className="text-body-small text-muted-foreground">{T.marketOptionsUnavailable}</p>
                  : targets.length ? <div className="flex flex-col divide-y divide-dashed divide-primary/10">
                    {targets.map(t => <div key={t.segmentId} className="flex flex-wrap items-center justify-between gap-sm py-md">
                      <span className="flex min-w-0 flex-wrap items-center gap-sm text-body-small"><span className="font-medium">{t.marketName}</span>
                        <span className="text-muted-foreground">{t.intent === "focus" ? T.focusMarket : t.intent === "validate" ? T.validateMarket : T.unclassifiedMarket}</span>
                        <span className="text-muted-foreground">{T.primarySolutions} {t.solutionIds?.length ?? T.unknown}</span>
                      </span>
                      <Button type="button" size="md" variant="secondary" disabled={submit.pending} onClick={() => setRelationTask({kind:"market",segmentId:t.segmentId})}>{T.marketSettings}</Button>
                    </div>)}
                  </div> : <p className="text-body-small text-muted-foreground">{T.noPlanMarkets}</p>}
                <p className="text-body-small text-muted-foreground">{T.sharedSolutions} {solutionIds?.length ?? T.unknown}</p>
              </Section>
            </div>
            {relationTask ? <StrategyRelationsDrawer draft key={JSON.stringify(relationTask)} task={relationTask} planName={name || STRATEGY_TEXT.newPlanTitle}
              targets={targets} sharedSolutionIds={solutionIds} marketOptions={marketOptions} solutionOptions={solutionOptions}
              onSave={saveRelations} onClose={() => setRelationTask(null)}/> : null}
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
