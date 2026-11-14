"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import {
  Button, Card, CardHeader, CardTitle, CardContent, Combobox, NativeSelect,
  Field,
  FieldLabel,
  Input,
  Section,
  StatusBadge, Popover, PopoverTrigger, PopoverContent,
} from "@vxture/design-ui";
import { useMessages } from "../lib/i18n/provider";
import {
  AssistPanel,
  FormPage,
  type AssistSuggestion,
} from "./form-page";
import { MemberName, useMemberName } from "../lib/member-names";
import { StrategyMarketCards, StrategySolutionCards } from "./strategy-selection-cards";
import { nextStrategyNumber } from "../../domains/strategy/lib/plan-number";
import { knownValues } from "../../domains/shared/suggest";
import type { SolutionReference } from "../../domains/catalog/service";
import { StrategyRelationsDrawer, type RelationTask, type RelationMarketOption, type RelationTarget } from "./strategy-relations-drawer";
import type { SegmentCriteria, NewPlanDraft, PlanEdit, PlanRelationChange } from "../../domains/strategy/lib/lifecycle";

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

type Saved = { ok: boolean; error?: string; id?: string };
type MarketOption = RelationMarketOption;
type TargetSelection = RelationTarget & { criteria?: SegmentCriteria };

export interface PlanFormInitial {
  readonly id: string;
  readonly editToken: number;
  readonly basePlanId: string | null;
  readonly changeReason: string;
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
  ownerOptions,
  creatorSub,
  onCreate,
  onSave,
}: {
  readonly existingPlanNos: readonly string[];
  readonly existingPeriods: readonly string[];
  /** Present edits that plan; absent creates one. */
  readonly initial?: PlanFormInitial;
  readonly solutionOptions: readonly SolutionReference[] | null;
  readonly marketOptions: readonly MarketOption[] | null;
  readonly ownerOptions: readonly { value: string; label: string }[] | null;
  readonly creatorSub: string | null;
  readonly onCreate: (input: NewPlanDraft, autoNumber?: boolean) => Promise<Saved>;
  readonly onSave: (id: string, input: PlanEdit, editToken: number) => Promise<Saved>;
}) {
  const { STRATEGY_TEXT, PLAN_ERROR, ASSIST_TEXT, MARKET_STRATEGY_TEXT: T } = useMessages();
  const nameOf = useMemberName();
  const [manualPlanNo, setManualPlanNo] = useState<string | null>(null);
  const [numberOpen, setNumberOpen] = useState(false);
  const [name, setName] = useState(initial?.name ?? "");
  const currentYear = new Date().getFullYear();
  const initialYear = Number(initial?.period.slice(0, 4));
  const years = [...new Set([currentYear - 1, currentYear, currentYear + 1, ...(Number.isInteger(initialYear) && initialYear >= 1900 ? [initialYear] : [])])].sort();
  const presetPeriods = years.flatMap(y => [String(y), ...[1,2,3,4].map(q => `${y}-Q${q}`)]);
  const [period, setPeriod] = useState(initial?.period ?? String(currentYear));
  const [customPeriod, setCustomPeriod] = useState(!!initial?.period && !presetPeriods.includes(initial.period));
  const [objective, setObjective] = useState(initial?.objective ?? "");
  const [changeReason,setChangeReason]=useState(initial?.changeReason ?? "");
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
  const router=useRouter();
  const [saveError,setSaveError]=useState<string|null>(null);
  const [saving,startSave]=useTransition();
  const submit={pending:saving,err:saveError,run:(save:()=>Promise<Saved>,errorOf:(code:string)=>string)=>{
    if(saving)return;startSave(async()=>{setSaveError(null);try{const r=await save();if(!r.ok){setSaveError(errorOf(r.error ?? "denied"));return;}
      router.push(r.id?`/strategy/${r.id}`:initial?`/strategy/${initial.id}`:"/strategy");router.refresh();
    }catch{setSaveError(errorOf("denied"));}});
  }};

  const nextNo = useMemo(() => nextStrategyNumber(period, existingPlanNos), [period, existingPlanNos]);
  const planNo = initial?.planNo ?? manualPlanNo ?? nextNo;
  const periods = useMemo(() => knownValues(existingPeriods), [existingPeriods]);

  const suggestions: AssistSuggestion[] = [];
  // The period format the workspace already writes ("2026H2", "2026-Q3"...).
  // Suggesting the EXISTING spelling is the point: two spellings of one period
  // split every report that groups by it - the same argument as categories.
  if (period.trim() === "" && periods.length > 0) {
    suggestions.push({
      id: "period",
      label: ASSIST_TEXT.periodKnown(periods[0]!),
      reason: ASSIST_TEXT.periodKnownWhy,
      apply: () => { setPeriod(periods[0]!); setCustomPeriod(!presetPeriods.includes(periods[0]!)); },
    });
  }

  const ready =
    name.trim() !== "" && period.trim() !== "" && (initial ? true : planNo.trim() !== "");

  return (
    <FormPage
      form={
        <div className="@container flex min-w-0 flex-col gap-xl" data-strategy-editor>
          <Card className="gap-lg py-lg" data-strategy-basic-card>
            <CardHeader><div className="flex flex-wrap items-center justify-between gap-sm"><CardTitle>{T.basicInfo}</CardTitle>
              <span className="text-body-small text-muted-foreground">{T.creator} <MemberName sub={creatorSub} fallback={T.creatorUnknown}/></span>
            </div></CardHeader>
            <CardContent><div className="grid grid-cols-1 gap-x-lg gap-y-lg @xl:grid-cols-2 @3xl:grid-cols-3">
              <Field className="@xl:col-span-2 @3xl:col-span-1"><FieldLabel htmlFor="strategy-name">{STRATEGY_TEXT.newPlanName}</FieldLabel>
                <Input id="strategy-name" value={name} disabled={submit.pending} onChange={e => setName(e.target.value)} aria-required="true"/>
              </Field>
              <Field><FieldLabel htmlFor="strategy-period">{STRATEGY_TEXT.newPlanPeriod}</FieldLabel>
                <NativeSelect id="strategy-period" value={customPeriod ? "custom" : period} disabled={submit.pending} onChange={e => {
                  const v = e.target.value; setCustomPeriod(v === "custom"); if (v !== "custom") setPeriod(v);
                }}>
                  {years.map(y => <optgroup key={y} label={String(y)}><option value={String(y)}>{y} {T.annual}</option>
                    {[1,2,3,4].map(q => <option key={q} value={`${y}-Q${q}`}>{y} Q{q}</option>)}
                  </optgroup>)}
                  <option value="custom">{T.periodCustom}</option>
                </NativeSelect>
                {customPeriod ? <Input aria-label={T.periodCustomLabel} maxLength={32} value={period} disabled={submit.pending} onChange={e => setPeriod(e.target.value)}/> : null}
              </Field>
              <Field><FieldLabel>{STRATEGY_TEXT.newPlanOwner}</FieldLabel>
                <Combobox items={[{ value: "__none", label: T.noOwner }, ...(ownerOptions ?? []),
                  ...(ownerSub && !ownerOptions?.some(m => m.value === ownerSub) ? [{ value: ownerSub, label: nameOf(ownerSub) ?? ownerSub }] : [])]}
                  value={ownerSub || "__none"} onValueChange={v => setOwnerSub(v === "__none" ? "" : v ?? "")}
                  placeholder={T.chooseOwner} searchPlaceholder={T.ownerSearch} emptyText={T.noOwnerOptions}
                  disabled={submit.pending || ownerOptions === null} className="w-full" aria-label={STRATEGY_TEXT.newPlanOwner}/>
              </Field>
              <Field className="@xl:col-span-2 @3xl:col-span-3"><FieldLabel htmlFor="strategy-direction">{T.direction}</FieldLabel>
                <Input id="strategy-direction" value={objective} disabled={submit.pending} onChange={e => setObjective(e.target.value)}/>
              </Field>
              {initial?.basePlanId ? <Field className="@xl:col-span-2 @3xl:col-span-3"><FieldLabel htmlFor="strategy-change-reason">{T.changeReason}</FieldLabel>
                <Input id="strategy-change-reason" value={changeReason} maxLength={4000} disabled={submit.pending} placeholder={T.changeReasonHint} onChange={e=>setChangeReason(e.target.value)}/>
              </Field> : null}
            </div>
            <div className="mt-lg flex flex-wrap items-center justify-between gap-x-lg gap-y-sm border-t border-dashed border-primary/10 pt-md text-body-small text-muted-foreground">
              {initial ? <span>{T.strategyNumber} <span className="tabular-nums">{planNo}</span></span> :
                <Popover open={numberOpen} onOpenChange={setNumberOpen}>
                  <PopoverTrigger asChild><Button type="button" size="md" variant="ghost" disabled={submit.pending} className="text-muted-foreground" data-strategy-number-trigger>
                    {T.strategyNumber}<span className="tabular-nums">{planNo}</span><span>{manualPlanNo === null ? T.numberAuto : T.numberManual}</span>
                  </Button></PopoverTrigger>
                  <PopoverContent align="start" className="max-w-full">
                    <div className="flex flex-col gap-md" data-strategy-number-editor>
                      <Field><FieldLabel htmlFor="strategy-number">{T.strategyNumber}</FieldLabel>
                        <Input id="strategy-number" maxLength={64} value={planNo} disabled={submit.pending} onChange={e => setManualPlanNo(e.target.value)} aria-required="true"/>
                      </Field>
                      <p className="text-body-small text-muted-foreground">{T.numberHint}</p>
                      <div className="flex justify-between gap-sm"><Button type="button" size="md" variant="secondary" onClick={() => setManualPlanNo(null)}>{T.numberReset}</Button>
                        <Button type="button" size="md" variant="secondary" onClick={() => setNumberOpen(false)}>{T.numberDone}</Button></div>
                    </div>
                  </PopoverContent>
                </Popover>}
              <span>{T.draftOnlyHint}</span>
            </div>
            </CardContent>
          </Card>
          <Section id="target-markets" title={T.linkMarkets} icon="target"
            action={<Button type="button" size="xl" variant="secondary" disabled={submit.pending || marketOptions === null} onClick={() => setRelationTask({kind:"markets"})}>{T.linkMarkets}</Button>}>
            <StrategyMarketCards markets={marketOptions === null ? null : targets.map(t => ({ ...t,
              criteria: initial?.targetMarkets.find(m => m.segmentId === t.segmentId)?.criteria ?? marketOptions.find(m => m.id === t.segmentId)?.criteria,
              // Current library counts may differ from an existing saved criteria snapshot.
              matched: initial ? undefined : marketOptions.find(m => m.id === t.segmentId)?.matched,
              status: marketOptions.find(m => m.id === t.segmentId)?.status,
              solutions: t.solutionIds === undefined || solutionOptions === null ? null : solutionOptions.filter(s => t.solutionIds?.includes(s.id)),
            }))} actions={m => <Button type="button" size="md" variant="secondary" disabled={submit.pending} onClick={() => setRelationTask({kind:"market",segmentId:m.segmentId})}>{T.marketSettings}</Button>}/>
          </Section>
          <Section id="primary-solutions" title={T.linkSolutions} icon="squares-four"
            action={<Button type="button" size="xl" variant="secondary" disabled={submit.pending || solutionOptions === null || solutionIds === undefined} onClick={() => setRelationTask({kind:"solutions"})}>{T.linkSolutions}</Button>}>
            <StrategySolutionCards solutions={solutionOptions === null || solutionIds === undefined || targets.some(t => t.solutionIds === undefined) ? null
              : solutionOptions.filter(s => solutionIds.includes(s.id) || targets.some(t => t.solutionIds?.includes(s.id)))} markets={targets} sharedIds={solutionIds}/>
          </Section>
            {relationTask ? <StrategyRelationsDrawer draft key={JSON.stringify(relationTask)} task={relationTask} planName={name || STRATEGY_TEXT.newPlanTitle}
              targets={targets} sharedSolutionIds={solutionIds} marketOptions={marketOptions} solutionOptions={solutionOptions}
              onSave={saveRelations} onClose={() => setRelationTask(null)}/> : null}
            <div className="flex items-center gap-md">
              <Button
                size="xl"
                disabled={submit.pending || !ready}
                onClick={() =>
                  submit.run(() => {
                    const fields = {
                      ...(initial?.basePlanId ? {changeReason:changeReason.trim()} : {}),
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
                      ? onSave(initial.id, fields, initial.editToken)
                      : onCreate({ planNo: planNo.trim(), ...fields }, manualPlanNo === null);
                  }, (c) => PLAN_ERROR[c] ?? PLAN_ERROR.denied)
                }
              >
                {initial ? STRATEGY_TEXT.planSave : STRATEGY_TEXT.newPlanSave}
              </Button>
              <Button asChild size="xl" variant="secondary" disabled={submit.pending}><Link href={initial ? `/strategy/${initial.id}` : "/strategy"}>{T.relationCancel}</Link></Button>
              {submit.err ? <StatusBadge tone="danger">{submit.err}</StatusBadge> : null}
            </div>
        </div>
      }
      assist={<AssistPanel suggestions={suggestions} />}
    />
  );
}
