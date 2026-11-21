"use client";

import { StrategyInfoCard as Card, StrategyInfoContent as CardContent } from "./strategy-info-card";

import { FormChoice } from "./form-choice";
import { StrategyGoals, StrategyAdvanced, StrategyConsistency, StrategyPaths } from "./strategy-result-fields";
import { StrategyDraftAssistant } from "./strategy-draft-assistant";
import { strategyToday, resultFromExpectations, strategyResultIssues, validStrategyResult, goalExpectations, type StrategyResult, type StrategyOption } from "../../domains/strategy/lib/strategy-result";
import type { PlanAssistInput, PlanAssistResult } from "../../domains/strategy/plan-assist-service";
import type { StrategicExpectation } from "../../domains/strategy/lib/expectations";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import {
  Button,
  Field,
  FieldLabel, FieldError,
  Input,
  StatusBadge, Popover, PopoverTrigger, PopoverContent,
} from "@vxture/design-ui";
import { Section } from "./help-section";
import { ViewHeader } from "./business-controls";
import { MemberPicker } from "./member-picker";
import { useMessages } from "../lib/i18n/provider";
import {
  FormPage,

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
  readonly result?: StrategyResult | null;
  readonly expectations?: readonly StrategicExpectation[];
  readonly id: string;
  readonly editToken: number;
  readonly basePlanId: string | null;
  readonly changeReason: string;
  readonly strategyTypeId?: string | null;
  readonly planNo: string;
  readonly name: string;
  readonly period: string;
  readonly objective: string | null;
  readonly ownerSub: string | null;
  readonly productIds: readonly string[] | undefined;
  readonly solutionIds: readonly string[] | undefined;
  readonly targetMarkets: readonly TargetSelection[];
}

function initialSelection(initial: PlanFormInitial | undefined, key: "productIds" | "solutionIds") {
  return initial ? initial[key] : [];
}

function StrategyTypeField({types,value,existing,disabled,onChange}: {
  readonly types: readonly StrategyType[] | null;
  readonly value: string; readonly existing?: string | null;
  readonly disabled: boolean; readonly onChange: (value: string)=>void;
}) {
  const { STRATEGY_RESULT_TEXT:R, MARKET_STRATEGY_TEXT:T }=useMessages();
  return <Field><FieldLabel required htmlFor="strategy-type">{T.strategyType}</FieldLabel>
    <FormChoice id="strategy-type" label={T.strategyType} values={value ? [value] : []} disabled={disabled || types === null}
      options={types?.filter(t => t.enabled || t.id === existing).flatMap(t => t.id ? [{ value: t.id, label: `${t.name}${t.enabled ? "" : ` (${T.typeDisabledLabel})`}` }] : []) ?? []}
      placeholder={R.choose} onChange={values => onChange(values[0] ?? "")} />
  </Field>;
}

export function NewPlanForm({ strategyTypes, strategyOptions, currency, userKey, canAssist, onAssist,
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
  readonly strategyOptions: readonly StrategyOption[];
  readonly currency: string;
  readonly userKey: string;
  readonly canAssist: boolean;
  readonly onAssist: (input:PlanAssistInput)=>Promise<PlanAssistResult>;
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
  const { STRATEGY_RESULT_TEXT:R, STRATEGY_TEXT, PLAN_ERROR, MARKET_STRATEGY_TEXT: T } = useMessages();
  const [manualPlanNo, setManualPlanNo] = useState<string | null>(null);
  const [numberOpen, setNumberOpen] = useState(false);
  const [name, setName] = useState(initial?.name ?? "");
  const [period, setPeriod] = useState(initial?.period ?? String(new Date().getFullYear()));
  const [result,setResult]=useState<StrategyResult>(()=>initial?.result ?? {...resultFromExpectations(initial?.expectations ?? [],parseStrategyPeriod(initial?.period ?? "")?.endOn ?? ""),goals:resultFromExpectations(initial?.expectations ?? [],parseStrategyPeriod(initial?.period ?? "")?.endOn ?? "").goals.map(g=>({...g,name:g.metric?R[g.metric]:g.name,unit:g.metric==="revenue"?currency:R.count}))});
  const [assisting,setAssisting]=useState(false);
  const [checking,setChecking]=useState(false);
  const expectations=goalExpectations(result,currency);
  const [objective, setObjective] = useState(initial?.objective ?? "");
  const [changeReason,setChangeReason]=useState(initial?.changeReason ?? "");
  const [ownerSub, setOwnerSub] = useState(initial?.ownerSub ?? "");
  const initialProductIds=initialSelection(initial,"productIds");
  const initialSolutionIds=initialSelection(initial,"solutionIds");
  const [productIds, setProductIds] = useState<readonly string[] | undefined>(initialProductIds);
  const [solutionIds, setSolutionIds] = useState<readonly string[] | undefined>(initialSolutionIds);
  const [targets, setTargets] = useState<readonly TargetSelection[]>(initial?.targetMarkets ?? []);
  const [relationTask, setRelationTask] = useState<RelationTask | null>(null);
  const productSelectionChanged = JSON.stringify(productIds) !== JSON.stringify(initialProductIds);
  const solutionSelectionChanged = JSON.stringify(solutionIds) !== JSON.stringify(initialSolutionIds);
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
      bypassLeave.current=true;router.push(r.id?`/strategy/${r.id}`:initial?`/strategy/${initial.id}`:"/strategy");router.refresh();
    }catch{setSaveError(errorOf("denied"));}});
  }};

  const [strategyTypeId,setStrategyTypeId]=useState(initial?.strategyTypeId ?? "");
  const nextNo = useMemo(() => nextStrategyNumber(period, existingPlanNos), [period, existingPlanNos]);
  const planNo = initial?.planNo ?? manualPlanNo ?? nextNo;
  const selectedResult={...result,
    markets:targets.map(t=>({id:t.segmentId,novelty:result.markets.find(m=>m.id===t.segmentId)?.novelty ?? "unknown" as const})),
    offerings:[...[...new Set([...(productIds ?? []),...targets.flatMap(t=>t.productIds ?? [])])].map(id=>({id,kind:"product" as const,novelty:productOptions?.find(p=>p.id===id)?.novelty ?? "unknown" as const})),
      ...[...new Set([...(solutionIds ?? []),...targets.flatMap(t=>t.solutionIds ?? [])])].map(id=>({id,kind:"solution" as const,novelty:solutionOptions?.find(p=>p.id===id)?.novelty ?? "unknown" as const}))],
  };
  const draft:PlanEdit={name,period,objective,ownerSub,strategyTypeId:strategyTypeId || null,result:selectedResult,expectations,changeReason,productIds,solutionIds,targetMarkets:targets};
  const signature=JSON.stringify({...draft,planNo});const originalSignature=useRef(signature);const bypassLeave=useRef(false);
  const dirty=signature!==originalSignature.current;
  useEffect(()=>{if(!dirty)return;const unload=(e:BeforeUnloadEvent)=>{if(bypassLeave.current)return;e.preventDefault();e.returnValue="";};
    const click=(e:MouseEvent)=>{if(bypassLeave.current || e.defaultPrevented || e.button!==0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey)return;const a=(e.target as Element)?.closest("a");if(!a || a.target==="_blank" || a.hasAttribute("download"))return;const target=new URL(a.href,location.href);if(target.pathname===location.pathname && target.search===location.search)return;if(!window.confirm(R.leave)){e.preventDefault();e.stopPropagation();}};
    let restoring=false;
    const pop=(e:PopStateEvent)=>{if(restoring){restoring=false;e.stopImmediatePropagation();return;}if(!bypassLeave.current && !window.confirm(R.leave)){e.stopImmediatePropagation();restoring=true;history.go(1);}};
    window.addEventListener("beforeunload",unload);document.addEventListener("click",click,true);window.addEventListener("popstate",pop,true);
    return()=>{window.removeEventListener("beforeunload",unload);document.removeEventListener("click",click,true);window.removeEventListener("popstate",pop,true);};
  },[dirty,R.leave]);
  const issues=checking?strategyResultIssues(result,{publish:true,today:strategyToday(),previous:initial?.result}):[];
  const requiredError=(field:string)=>checking && !({strategyTypeId,ownerSub,objective,markets:targets.length ? "yes":""}[field])?<FieldError>{R.required}</FieldError>:null;
  const applyAssist=(patch:PlanEdit)=>{setName(patch.name);setPeriod(patch.period);setObjective(patch.objective ?? "");setOwnerSub(patch.ownerSub ?? "");setStrategyTypeId(patch.strategyTypeId ?? "");setResult(patch.result ?? result);setChangeReason(patch.changeReason ?? "");setProductIds(patch.productIds);setSolutionIds(patch.solutionIds);if(patch.targetMarkets)setTargets(patch.targetMarkets.map(t=>({...t,marketName:marketOptions?.find(m=>m.id===t.segmentId)?.name ?? targets.find(m=>m.segmentId===t.segmentId)?.marketName ?? ""})));};
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
          <StrategyDraftAssistant values={draft} editId={initial?.id} enabled={canAssist && !saving} onAssist={onAssist} onApply={applyAssist} onBusy={setAssisting}/>
          <fieldset disabled={saving || assisting} className="flex min-w-0 flex-col gap-xl">
          <Section title={R.basic} icon="clipboard" help={<><p>{T.draftOnlyHint}</p><p>{T.numberHint}</p></>}
            action={<span className="inline-flex items-center gap-sm text-body-small text-muted-foreground">{T.creator} <MemberName sub={creatorSub} fallback={T.creatorUnknown}/></span>}>
            <Card data-strategy-basic-card><CardContent>
              <div className="grid grid-cols-1 gap-x-lg gap-y-lg @2xl:grid-cols-3">
                <Field><FieldLabel required htmlFor="strategy-name">{STRATEGY_TEXT.newPlanName}</FieldLabel>
                  <Input id="strategy-name" value={name} disabled={submit.pending} onChange={e=>setName(e.target.value)} aria-required="true"/>
                </Field>
                <StrategyPeriodField value={period} onChange={setPeriod} disabled={submit.pending}/>
                <Field><FieldLabel required>{STRATEGY_TEXT.newPlanOwner}</FieldLabel><MemberPicker options={ownerOptions} value={ownerSub} onValueChange={setOwnerSub} label={STRATEGY_TEXT.newPlanOwner} disabled={submit.pending}/>{requiredError("ownerSub")}</Field>
                <div><StrategyTypeField types={strategyTypes} value={strategyTypeId} existing={initial?.strategyTypeId} disabled={submit.pending} onChange={setStrategyTypeId}/>{requiredError("strategyTypeId")}</div>
                <Field><FieldLabel required htmlFor="strategy-value">{R.value}</FieldLabel><FormChoice id="strategy-value" label={R.value} values={result.valuePropositionId ? [result.valuePropositionId] : []}
                  options={strategyOptions.filter(o => o.kind === "value" && (o.enabled || o.id === result.valuePropositionId)).map(o => ({ value: o.id, label: o.name }))}
                  placeholder={R.choose} onChange={values => setResult({ ...result, valuePropositionId: values[0] ?? null })} />{issues.some(e=>e.field==="valuePropositionId")?<FieldError>{R.required}</FieldError>:null}</Field>
                <StrategyPaths value={result} options={strategyOptions} onChange={setResult}/>
                <Field className="col-span-full"><FieldLabel required htmlFor="strategy-direction">{R.positioning}</FieldLabel><Input id="strategy-direction" maxLength={100} placeholder={R.positioningExample} value={objective} onChange={e=>setObjective(e.target.value)}/>{requiredError("objective")}</Field>
                {initial?.basePlanId ? <Field className="col-span-full"><FieldLabel htmlFor="strategy-change-reason">{T.changeReason}</FieldLabel>
                  <Input id="strategy-change-reason" value={changeReason} maxLength={4000} disabled={submit.pending} placeholder={T.changeReasonHint} onChange={e=>setChangeReason(e.target.value)}/>
                </Field> : null}
              </div>
            </CardContent></Card>
          </Section>
          <StrategyGoals value={result} onChange={setResult} issues={issues} currency={currency}/>
          <Section id="target-markets" title={T.targetMarketsTitle} icon="target" help={T.relationMarketsHint}
            action={<Button type="button" size="xl" variant="secondary" disabled={submit.pending || marketOptions === null} onClick={() => setRelationTask({kind:"markets"})}>{T.linkMarketAction}</Button>}>
            {requiredError("markets")}
            <StrategyMarketCards markets={marketOptions === null ? null : targets.map(t => ({ ...t,
              criteria: initial?.targetMarkets.find(m => m.segmentId === t.segmentId)?.criteria ?? marketOptions.find(m => m.id === t.segmentId)?.criteria,
              // Current library counts may differ from an existing saved criteria snapshot.
              matched: initial ? undefined : marketOptions.find(m => m.id === t.segmentId)?.matched,
              status: marketOptions.find(m => m.id === t.segmentId)?.status,
              products: t.productIds === undefined || productOptions === null ? null : productOptions.filter(p => t.productIds?.includes(p.id)),
              solutions: t.solutionIds === undefined || solutionOptions === null ? null : solutionOptions.filter(s => t.solutionIds?.includes(s.id)),
            }))} actions={m => <Button type="button" size="md" variant="ghost" disabled={submit.pending} onClick={()=>setRelationTask({kind:"market",segmentId:m.segmentId})}>{T.marketSettings}</Button>}/>
          </Section>
          <Section id="primary-solutions" title={T.productSolutionsTitle} icon="squares-four" help={T.sharedSolutionsHint}
            action={<Button type="button" size="xl" variant="secondary" disabled={submit.pending || ((solutionOptions === null || solutionIds === undefined) && (productOptions === null || productIds === undefined))} onClick={() => setRelationTask({kind:"solutions"})}>{T.linkSolutions}</Button>}>
            <StrategySolutionCards products={productOptions === null || productIds === undefined || targets.some(t => t.productIds === undefined) ? null
              : productOptions.filter(p => productIds.includes(p.id) || targets.some(t => t.productIds?.includes(p.id)))} sharedProductIds={productIds} solutions={solutionOptions === null || solutionIds === undefined || targets.some(t => t.solutionIds === undefined) ? null
              : solutionOptions.filter(s => solutionIds.includes(s.id) || targets.some(t => t.solutionIds?.includes(s.id)))} markets={targets} sharedIds={solutionIds}/>
            <StrategyConsistency code={strategyTypes?.find(t=>t.id===strategyTypeId)?.code} value={selectedResult} userKey={userKey}/>
          </Section>
          <StrategyAdvanced value={result} currency={currency} onChange={setResult} ownerOptions={ownerOptions}/>
          </fieldset>
            {relationTask ? <StrategyRelationsDrawer draft marketNovelty={relationTask.kind==="market"?result.markets.find(m=>m.id===relationTask.segmentId)?.novelty:undefined} onMarketNoveltyChange={novelty=>{if(relationTask.kind==="market")setResult(current=>({...current,markets:selectedResult.markets.map(m=>m.id===relationTask.segmentId?{...m,novelty}:m)}));}} key={JSON.stringify(relationTask)} task={relationTask} planName={name || STRATEGY_TEXT.newPlanTitle}
              targets={targets} sharedSolutionIds={solutionIds} sharedProductIds={productIds} productOptions={productOptions} marketOptions={marketOptions} solutionOptions={solutionOptions}
              onSave={saveRelations} onClose={() => setRelationTask(null)}/> : null}
            <div className="sticky bottom-0 z-10 flex flex-wrap items-center justify-end gap-sm border-t border-dashed border-border bg-background/95 py-lg" data-strategy-save-bar>
              <Button asChild size="xl" variant="secondary" disabled={submit.pending || assisting}><Link href={initial ? `/strategy/${initial.id}` : "/strategy"}>{R.cancel}</Link></Button>
              <Button type="button" variant="secondary" size="md" onClick={()=>setChecking(true)} disabled={submit.pending || assisting}>{R.check}</Button>
              <Button
                size="xl"
                disabled={submit.pending || assisting || !ready}
                onClick={() =>
                  submit.run(() => {
                    if(!validStrategyResult(result)){setChecking(true);setSaveError(R.invalid);return Promise.resolve({ok:false,error:"strategy_result_invalid"});}
                    const fields = {
                      result:selectedResult,
                      ...(initial?.basePlanId ? {changeReason:changeReason.trim()} : {}),
                      ...(strategyTypes===null ? {} : {strategyTypeId:strategyTypeId || null}),
                      expectations,
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
                {R.saveDraft}
              </Button>
              {submit.err ? <StatusBadge tone="danger">{submit.err}</StatusBadge> : null}
            </div>
        </div>
      }
    />
  </>);
}
