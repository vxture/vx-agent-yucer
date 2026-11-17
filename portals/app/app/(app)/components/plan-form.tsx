"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import {
  Button, Card, CardContent,
  Field,
  FieldLabel, NativeSelect,
  Input,
  StatusBadge, Popover, PopoverTrigger, PopoverContent,
} from "@vxture/design-ui";
import { Section } from "./help-section";
import { ViewHeader } from "./business-controls";
import { MemberPicker } from "./member-picker";
import { useMessages } from "../lib/i18n/provider";
import {
  AssistPanel,
  FormPage,
  type AssistSuggestion,
} from "./form-page";
import { MemberName } from "../lib/member-names";
import { StrategyMarketCards, StrategySolutionCards } from "./strategy-selection-cards";
import { nextStrategyNumber } from "../../domains/strategy/lib/plan-number";
import { StrategyPeriodField } from "./strategy-period-field";
import { parseStrategyPeriod } from "../../domains/strategy/lib/plan-period";
import type { StrategyType } from "../../domains/strategy/lib/strategy-type";
import type { ProductReference, SolutionReference } from "../../domains/catalog/service";
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
  readonly strategyTypeCode?: string | null;
  readonly planNo: string;
  readonly name: string;
  readonly period: string;
  readonly objective: string | null;
  readonly ownerSub: string | null;
  readonly productIds: readonly string[] | undefined;
  readonly solutionIds: readonly string[] | undefined;
  readonly targetMarkets: readonly TargetSelection[];
}

export function NewPlanForm({ strategyTypes,
  existingPlanNos,
  initial,
  solutionOptions,
  productOptions,
  marketOptions,
  ownerOptions,
  creatorSub,
  onCreate,
  onSave,
}: {
  readonly strategyTypes: readonly StrategyType[] | null;
  readonly existingPlanNos: readonly string[];
  /** Present edits that plan; absent creates one. */
  readonly initial?: PlanFormInitial;
  readonly productOptions: readonly ProductReference[] | null;
  readonly solutionOptions: readonly SolutionReference[] | null;
  readonly marketOptions: readonly MarketOption[] | null;
  readonly ownerOptions: readonly { value: string; label: string }[] | null;
  readonly creatorSub: string | null;
  readonly onCreate: (input: NewPlanDraft, autoNumber?: boolean) => Promise<Saved>;
  readonly onSave: (id: string, input: PlanEdit, editToken: number) => Promise<Saved>;
}) {
  const { STRATEGY_TEXT, PLAN_ERROR, MARKET_STRATEGY_TEXT: T } = useMessages();
  const [manualPlanNo, setManualPlanNo] = useState<string | null>(null);
  const [numberOpen, setNumberOpen] = useState(false);
  const [name, setName] = useState(initial?.name ?? "");
  const [period, setPeriod] = useState(initial?.period ?? String(new Date().getFullYear()));
  const [objective, setObjective] = useState(initial?.objective ?? "");
  const [changeReason,setChangeReason]=useState(initial?.changeReason ?? "");
  const [ownerSub, setOwnerSub] = useState(initial?.ownerSub ?? "");
  const [productIds, setProductIds] = useState<readonly string[] | undefined>(initial ? initial.productIds : []);
  const [solutionIds, setSolutionIds] = useState<readonly string[] | undefined>(initial ? initial.solutionIds : []);
  const [targets, setTargets] = useState<readonly TargetSelection[]>(initial?.targetMarkets ?? []);
  const [relationTask, setRelationTask] = useState<RelationTask | null>(null);
  const productSelectionChanged = JSON.stringify(productIds) !== JSON.stringify(initial ? initial.productIds : []);
  const solutionSelectionChanged = JSON.stringify(solutionIds) !== JSON.stringify(initial ? initial.solutionIds : []);
  const targetsChanged = JSON.stringify(targets) !== JSON.stringify(initial?.targetMarkets ?? []);
  const saveRelations = async (change: PlanRelationChange): Promise<Saved> => {
    if (change.kind === "solutions") {
      if(change.solutionIds !== undefined)setSolutionIds(change.solutionIds);
      if(change.productIds !== undefined)setProductIds(change.productIds);
    }
    else if (change.kind === "market") setTargets(rows => rows.map(row => row.segmentId === change.segmentId ? {
      ...row, intent: change.intent, approach: change.approach,
      ...(change.productIds === undefined ? {} : { productIds: change.productIds }),
      ...(change.solutionIds === undefined ? {} : { solutionIds: change.solutionIds }),
    } : row));
    else setTargets(rows => [
      ...rows.filter(row => !change.remove.includes(row.segmentId)),
      ...change.add.filter(id => !rows.some(row => row.segmentId === id)).flatMap(id => {
        const market = marketOptions?.find(m => m.id === id);
        return market ? [{ segmentId: id, marketName: market.name, intent: "focus" as const, approach: null,
          ...(solutionOptions === null ? {} : { solutionIds: (market.solutionIds ?? []).filter(id => solutionOptions.some(s => s.id === id && s.status === "active")) }),
          ...(productOptions === null ? {} : { productIds: (market.productIds ?? []).filter(id => productOptions.some(p => p.id === id && p.status === "active")) }),
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

  const [strategyTypeCode,setStrategyTypeCode]=useState(initial?.strategyTypeCode ?? "");
  const nextNo = useMemo(() => nextStrategyNumber(period, existingPlanNos), [period, existingPlanNos]);
  const planNo = initial?.planNo ?? manualPlanNo ?? nextNo;
  const suggestions: AssistSuggestion[] = [];
  const hasExecutionWindow = !!parseStrategyPeriod(period);
  const ready =
    name.trim() !== "" && (hasExecutionWindow || initial?.period === period) && (initial ? true : planNo.trim() !== "");

  const numberLabel = initial ? <span className="tabular-nums" data-strategy-number>{planNo}</span> :
    <Popover open={numberOpen} onOpenChange={setNumberOpen}>
      <PopoverTrigger asChild><Button type="button" size="md" variant="ghost" disabled={submit.pending}
        className="px-0 text-muted-foreground" aria-label={T.strategyNumber} data-strategy-number-trigger>
        <span className="tabular-nums">{planNo}</span>
      </Button></PopoverTrigger>
      <PopoverContent align="start" className="max-w-full">
        <div className="flex flex-col gap-md" data-strategy-number-editor>
          <Field><FieldLabel htmlFor="strategy-number">{T.strategyNumber}</FieldLabel>
            <Input id="strategy-number" maxLength={64} value={planNo} disabled={submit.pending} onChange={e => setManualPlanNo(e.target.value)} aria-required="true"/>
          </Field>
          <div className="flex justify-between gap-sm"><Button type="button" size="md" variant="secondary" onClick={() => setManualPlanNo(null)}>{T.numberReset}</Button>
            <Button type="button" size="md" variant="secondary" onClick={() => setNumberOpen(false)}>{T.numberDone}</Button></div>
        </div>
      </PopoverContent>
    </Popover>;

  return (<>
    <ViewHeader icon="graph" title={name.trim() || initial?.name || STRATEGY_TEXT.newPlanTitle} description={numberLabel}
      help={initial ? STRATEGY_TEXT.editPlanWhy : STRATEGY_TEXT.newPlanWhy} data-strategy-editor-header/>
    <FormPage
      form={
        <div className="@container flex min-w-0 flex-col gap-xl" data-strategy-editor>
          <Section title={T.basicInfo} icon="clipboard" help={<><p>{T.draftOnlyHint}</p><p>{T.numberHint}</p></>}
            action={<span className="inline-flex items-center gap-sm text-body-small text-muted-foreground">{T.creator} <MemberName sub={creatorSub} fallback={T.creatorUnknown}/></span>}>
            <Card className="py-lg" data-strategy-basic-card><CardContent>
              <div className="grid grid-cols-1 gap-x-lg gap-y-lg @xl:grid-cols-2 @3xl:grid-cols-3">
                <Field className="@xl:col-span-2"><FieldLabel htmlFor="strategy-name">{STRATEGY_TEXT.newPlanName}</FieldLabel>
                  <Input id="strategy-name" value={name} disabled={submit.pending} onChange={e => setName(e.target.value)} aria-required="true"/>
                </Field>
                <Field><FieldLabel htmlFor="strategy-type">{T.strategyType}</FieldLabel>
                  <NativeSelect id="strategy-type" value={strategyTypeCode} disabled={submit.pending || strategyTypes===null} onChange={e=>setStrategyTypeCode(e.target.value)}>
                    <option value="">{T.typeUnclassified}</option>
                    {strategyTypes?.filter(t=>t.enabled || t.code===initial?.strategyTypeCode).map(t=><option key={t.code} value={t.code}>{t.name}{t.enabled ? "" : ` (${T.typeDisabledLabel})`}</option>)}
                  </NativeSelect>
                </Field>
                <Field><FieldLabel>{STRATEGY_TEXT.newPlanOwner}</FieldLabel>
                  <MemberPicker options={ownerOptions} value={ownerSub} onValueChange={setOwnerSub}
                    label={STRATEGY_TEXT.newPlanOwner} disabled={submit.pending}/>
                </Field>
                <div className="@xl:col-span-2"><StrategyPeriodField value={period} onChange={setPeriod} disabled={submit.pending}/></div>
                <Field className="@xl:col-span-2 @3xl:col-span-3"><FieldLabel htmlFor="strategy-direction">{T.direction}</FieldLabel>
                  <Input id="strategy-direction" value={objective} disabled={submit.pending} onChange={e => setObjective(e.target.value)}/>
                </Field>
                {initial?.basePlanId ? <Field className="@xl:col-span-2 @3xl:col-span-3"><FieldLabel htmlFor="strategy-change-reason">{T.changeReason}</FieldLabel>
                  <Input id="strategy-change-reason" value={changeReason} maxLength={4000} disabled={submit.pending} placeholder={T.changeReasonHint} onChange={e=>setChangeReason(e.target.value)}/>
                </Field> : null}
              </div>
            </CardContent></Card>
          </Section>
          <Section id="target-markets" title={T.linkMarkets} icon="target" help={T.relationMarketsHint}
            action={<Button type="button" size="xl" variant="secondary" disabled={submit.pending || marketOptions === null} onClick={() => setRelationTask({kind:"markets"})}>{T.linkMarketAction}</Button>}>
            <StrategyMarketCards markets={marketOptions === null ? null : targets.map(t => ({ ...t,
              criteria: initial?.targetMarkets.find(m => m.segmentId === t.segmentId)?.criteria ?? marketOptions.find(m => m.id === t.segmentId)?.criteria,
              // Current library counts may differ from an existing saved criteria snapshot.
              matched: initial ? undefined : marketOptions.find(m => m.id === t.segmentId)?.matched,
              status: marketOptions.find(m => m.id === t.segmentId)?.status,
              products: t.productIds === undefined || productOptions === null ? null : productOptions.filter(p => t.productIds?.includes(p.id)),
              solutions: t.solutionIds === undefined || solutionOptions === null ? null : solutionOptions.filter(s => t.solutionIds?.includes(s.id)),
            }))} actions={m => <Button type="button" size="md" variant="secondary" disabled={submit.pending} onClick={() => setRelationTask({kind:"market",segmentId:m.segmentId})}>{T.marketSettings}</Button>}/>
          </Section>
          <Section id="primary-solutions" title={T.linkSolutions} icon="squares-four" help={T.sharedSolutionsHint}
            action={<Button type="button" size="xl" variant="secondary" disabled={submit.pending || ((solutionOptions === null || solutionIds === undefined) && (productOptions === null || productIds === undefined))} onClick={() => setRelationTask({kind:"solutions"})}>{T.linkSolutions}</Button>}>
            <StrategySolutionCards products={productOptions === null || productIds === undefined || targets.some(t => t.productIds === undefined) ? null
              : productOptions.filter(p => productIds.includes(p.id) || targets.some(t => t.productIds?.includes(p.id)))} sharedProductIds={productIds} solutions={solutionOptions === null || solutionIds === undefined || targets.some(t => t.solutionIds === undefined) ? null
              : solutionOptions.filter(s => solutionIds.includes(s.id) || targets.some(t => t.solutionIds?.includes(s.id)))} markets={targets} sharedIds={solutionIds}/>
          </Section>
            {relationTask ? <StrategyRelationsDrawer draft key={JSON.stringify(relationTask)} task={relationTask} planName={name || STRATEGY_TEXT.newPlanTitle}
              targets={targets} sharedSolutionIds={solutionIds} sharedProductIds={productIds} productOptions={productOptions} marketOptions={marketOptions} solutionOptions={solutionOptions}
              onSave={saveRelations} onClose={() => setRelationTask(null)}/> : null}
            <div className="flex items-center gap-md">
              <Button
                size="xl"
                disabled={submit.pending || !ready}
                onClick={() =>
                  submit.run(() => {
                    const fields = {
                      ...(initial?.basePlanId ? {changeReason:changeReason.trim()} : {}),
                      ...(strategyTypes===null ? {} : {strategyTypeCode:strategyTypeCode || null}),
                      name: name.trim(),
                      period: period.trim(),
                      objective: objective.trim() === "" ? null : objective.trim(),
                      ownerSub: ownerSub.trim() === "" ? null : ownerSub.trim(),
                      ...(productOptions !== null && productSelectionChanged ? { productIds } : {}),
                      ...(solutionOptions !== null && solutionSelectionChanged ? { solutionIds } : {}),
                      ...(marketOptions !== null && targetsChanged ? {
                        targetMarkets: targets.map(({ marketName: _name, solutionIds, productIds, ...t }) => {
                          const original = initial?.targetMarkets.find(row => row.segmentId === t.segmentId);
                          return { ...t, ...(JSON.stringify(productIds) !== JSON.stringify(original?.productIds) ? { productIds } : {}), ...(JSON.stringify(solutionIds) !== JSON.stringify(original?.solutionIds) ? { solutionIds } : {}) };
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
  </>);
}
