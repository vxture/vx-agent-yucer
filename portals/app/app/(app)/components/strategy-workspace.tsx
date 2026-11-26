"use client";
import { useXiaoyuPageState } from "./use-xiaoyu-page-state";
import { StrategyFulfillmentPanel } from "./strategy-fulfillment-panel";
import { StrategyAdvanced } from "./strategy-result-fields";
import { StrategyDetailBasic, StrategyDetailGoals, StrategyDetailMarkets, StrategyDetailOfferings, StrategyDetailHandoff } from "./strategy-detail-reading";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState, useTransition } from "react";
import { Button, Card, CardContent, CardHeader, CardTitle, Drawer, EmptyState, FieldError, Icon, Input, NativeSelect, ViewLayout, useToast, type ActionMenuItem } from "@vxture/design-ui";
import { ViewHeader } from "./business-controls";
import { TitleHelp } from "./title-help";
import { FilterSlot, RowActions, SearchSlot, useTableSort } from "./table-fittings";
import { ModuleHeadline } from "./module-headline";
import { StrategyModuleSummary } from "./planning-module-summary";
import { CollectionHistory, CollectionToolbar, collectionDrawerWidth } from "./collection-layout";
import { CollectionTable, CollectionTitleCell } from "./collection-table";
import { useCollectionView } from "./collection-view-provider";
import { PageActionButton } from "./page-header-actions";
import { PageCrumbs } from "./page-crumbs";
import { StrategyDetailLabel, StrategyQuantity } from "./strategy-detail-label";
import { MemberName } from "../lib/member-names";
import { useLocale, useMessages } from "../lib/i18n/provider";
import { strategyOperations, type StrategyOperation } from "../lib/strategy-operations";
import { PlanAdvicePanel } from "./plan-advice-panel";
import { SegmentAdvicePanel } from "./segment-advice-panel";
import { DialogForm } from "./dialog-form";
import { strategyPeriodLabel } from "../../domains/strategy/lib/plan-period";
import { currentStrategyPlans } from "../../domains/strategy/lib/current-plans";
import { StrategyCharterCard } from "./strategy-charter-card";
import { Tag } from "./tag";
import type { StrategyWorkspaceData } from "../strategy/workspace-data";
import { strategySortAccessors } from "../lib/collection-sort";
import type { StrategyView } from "../lib/market-strategy";
import { movePlan, startStrategyRevision, publishStrategyVersion, discardStrategyVersion } from "../strategy/actions";

export type StrategyTab = "overview" | "validation";
export function StrategyWorkspace({ data, view, detailId }: { readonly data: StrategyWorkspaceData; readonly view: StrategyTab; readonly detailId?: string }) {
  const { STRATEGY_DETAIL_TEXT:D, MARKET_STRATEGY_TEXT: T, STRATEGY_CARD_TEXT: C, PLAN_STATUS_LABEL, PLAN_ERROR, DS_LABELS, DATA_TABLE_LABELS, CAMPAIGN_TEXT } = useMessages();
  const locale=useLocale();
  const router=useRouter(), params=useSearchParams();
  const [layout,setLayout]=useCollectionView("cards");
  const [query,setQuery]=useState("");
  const sorted=useTableSort<StrategyView>([],strategySortAccessors);
  const period=params.get("period") ?? "";
  const setPeriod=(value:string)=>{
    const q=new URLSearchParams(params);q.delete("plan");
    if(value)q.set("period",value);else q.delete("period");
    router.replace(`/strategy?${q}`,{scroll:false});
  };
  const [checks,setChecks]=useState(false);
  const [versionPlan,setVersionPlan]=useState<StrategyView|null>(null);
  const [publication,setPublication]=useState<StrategyView|null>(null);
  const [publicationError,setPublicationError]=useState<string|null>(null);
  const [activation,setActivation]=useState<StrategyView|null>(null);
  const [activationError,setActivationError]=useState<string|null>(null);
  const [pending,start]=useTransition();
  const {toast}=useToast();
  const detail=data.plans?.find(p=>p.id===detailId);
  const planFilter=view==="validation" ? params.get("plan") ?? "" : "";
  const scopedPlans=view==="overview"?currentStrategyPlans(data.plans ?? []):data.plans?.filter(p=>p.versionNo != null) ?? [];
  const plans=scopedPlans.filter(p=>(!planFilter || p.id===planFilter) && (!period || p.period===period) && (!query.trim() || `${p.name} ${p.planNo} ${(p.previousNumbers ?? []).join(" ")} ${p.objective ?? ""}`.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase())));
  const allowedView = data.canPlan;
  useXiaoyuPageState({query:query.slice(0,160),period,plan:planFilter,view:layout});
  const switchView=(next:StrategyTab)=>{
    if(next === view)return;
    const q=new URLSearchParams(params);q.set("view",next);q.delete("market");q.delete("plan");
    start(()=>router.push(`/strategy?${q}`,{scroll:false}));
  };
  const run=async(p:StrategyView,to:string)=>{
    let error:string|null=null;
    try {const r=await movePlan(p.id,to,p.editToken ?? 1);if(!r.ok)error=PLAN_ERROR[r.error ?? "denied"] ?? PLAN_ERROR.denied;}
    catch {error=PLAN_ERROR.denied;}
    if(error){toast({tone:"danger",title:error});throw new Error(error);}
    router.refresh();
  };
  const family=(p:StrategyView)=>(data.plans ?? []).filter(row=>(row.lineageId ?? row.id)===(p.lineageId ?? p.id));
  const latest=(p:StrategyView)=>family(p).filter(row=>row.versionNo).sort((a,b)=>(b.versionNo ?? 0)-(a.versionNo ?? 0))[0];
  const draftFor=(p:StrategyView)=>family(p).find(row=>row.status==="draft");
  const isLatest=(p:StrategyView)=>latest(p)?.id===p.id;
  const operations=(p:StrategyView)=>strategyOperations(p,data.plans ?? [],data);
  const revise=(p:StrategyView)=>start(async()=>{
    const existing=draftFor(p);if(existing){router.push(`/strategy/new?id=${encodeURIComponent(existing.id)}`);return;}
    try{const r=await startStrategyRevision(p.id);if(!r.ok || !r.id){toast({tone:"danger",title:PLAN_ERROR[r.error ?? "denied"] ?? PLAN_ERROR.denied});return;}
      router.push(`/strategy/new?id=${encodeURIComponent(r.id)}`);router.refresh();
    }catch{toast({tone:"danger",title:PLAN_ERROR.denied});}
  });
  const openPublication=(plan:StrategyView)=>{setPublicationError(null);setPublication(plan);};
  const discard=async(p:StrategyView)=>{
    let error:string|null=null;
    try{const r=await discardStrategyVersion(p.id,p.editToken ?? 1);if(!r.ok)error=PLAN_ERROR[r.error ?? "denied"] ?? PLAN_ERROR.denied;}
    catch{error=PLAN_ERROR.denied;}
    if(error){toast({tone:"danger",title:error});throw new Error(error);}
    router.refresh();
  };
  const validationHref=(p:StrategyView)=>`/strategy?${new URLSearchParams({view:"validation",period:p.period,plan:p.id})}`;
  const viewLabel=(p:StrategyView)=>{
    if(!p.versionNo)return T.viewDraft;
    return isLatest(p)?T.openPlan:T.versionRead;
  };
  const operationLabel=(p:StrategyView,action:StrategyOperation)=>({
    view:viewLabel(p),edit:T.editDraft,publish:p.basePlanId?T.publishNext:T.publishVersion,
    revise:T.reviseStrategy,resume:T.resumeDraft,versions:T.versionHistory,validation:T.validation,
    active:T.startExecution,closed:T.endStrategy,archived:T.archiveStrategy,discard:T.discardDraft,
  })[action];
  const selectOperation=(p:StrategyView,action:StrategyOperation)=>{
    if(action==="view")router.push(`/strategy/${p.id}`);
    else if(action==="edit")router.push(`/strategy/new?id=${encodeURIComponent(p.id)}`);
    else if(action==="revise"||action==="resume")revise(p);
    else if(action==="publish")openPublication(p);
    else if(action==="versions")setVersionPlan(p);
    else if(action==="validation")router.push(validationHref(p));
    else if(action==="active"){setActivationError(null);setActivation(p);}
  };
  const items=(p:StrategyView,omit:readonly StrategyOperation[]=[]):ActionMenuItem[]=>operations(p).actions.filter(a=>!omit.includes(a)).map(action=>{
    if(action==="closed"||action==="archived"||action==="discard"){
      const verb={closed:T.endVerb,archived:T.archiveVerb,discard:T.discardDraft}[action];
      const consequence={closed:T.endHint,archived:T.archiveHint,discard:p.basePlanId?T.discardHint:T.discardInitialHint}[action];
      return {id:action,label:operationLabel(p,action),danger:true,
        confirm:{verb,target:`\u300c${p.name}\u300d`,consequence,titleTemplate:DS_LABELS.confirmTitleTemplate,
          cancelLabel:DS_LABELS.confirmCancel,pendingLabel:DS_LABELS.confirmPending,onConfirm:()=>action==="discard"?discard(p):run(p,action)}};
    }
    return {id:action,label:operationLabel(p,action),onSelect:()=>selectOperation(p,action)};
  });
  const primaryAction=(p:StrategyView,action:StrategyOperation|undefined,intent:"primary"|"secondary"="secondary")=>action?
    <PageActionButton intent={intent} disabled={pending} onClick={()=>selectOperation(p,action)} data-strategy-primary-action={action}>{operationLabel(p,action)}</PageActionButton>:null;
  const versionBadge=(p:StrategyView)=><>{p.versionNo ? <Tag>{`V${p.versionNo}`}</Tag> : p.basePlanId ? <Tag>{T.revisionDraft}</Tag>:null}</>;
  const number=(n:number|null|undefined,unit:string)=><StrategyQuantity value={n==null ? T.unknown:n.toLocaleString(locale)} unit={n==null?undefined:unit}/>;
  const money=(n:number,currency:string)=><StrategyQuantity value={n.toLocaleString(locale,{maximumFractionDigits:0})} unit={currency}/>;
  const cardActions=(p:StrategyView)=><RowActions label={T.planActions} items={items(p)} disabled={pending}/>;
  const card = (p: StrategyView) => <StrategyCharterCard key={p.id} plan={p} currency={data.currency} actions={cardActions(p)} adoption={data.adoptions} draftAvailable={!!draftFor(p) && p.status!=="draft"}/>;
  const planTitle=(p:StrategyView)=><Link href={`/strategy/${p.id}`} className="block truncate transition-colors hover:text-primary-text">{p.name}</Link>;
  const planCode=(p:StrategyView)=>[p.planNo,strategyPeriodLabel(p.period),p.versionNo ? `V${p.versionNo}` : null].filter(Boolean).join(" \u00b7 ");
  const table=(rows:StrategyView[])=><CollectionTable labels={DATA_TABLE_LABELS} rows={[...sorted.sortRows(rows)]} sort={sorted.sort} onSortChange={sorted.onSortChange} rowKey={p=>p.id} indexStart={1} columns={[
      {id:"name",sortable:true,header:T.strategy,cell:p=><CollectionTitleCell title={planTitle(p)} description={planCode(p)} tooltip={`${p.name} / ${planCode(p)}`}/>},
      {id:"direction",header:T.direction,align:"left",track:"direction",cell:p=><span className="line-clamp-2" title={p.objective ?? undefined}>{p.objective || T.directionEmpty}</span>},
      {id:"markets",sortable:true,header:T.marketCount,track:"count",cell:p=>number(p.marketIds?.length,D.recordUnit)},
      {id:"customers",sortable:true,header:T.customerCount,track:"count",cell:p=>number(p.customerCount,D.customerUnit)},
      {id:"solutions",sortable:true,header:T.solutionCount,track:"count",cell:p=>number(p.solutions === null || p.products === null ? null : p.solutions.length + p.products.length,D.recordUnit)},
      {id:"campaigns",sortable:true,header:T.campaignCount,track:"count",cell:p=>number(p.campaigns?.length,D.campaignUnit)},
      {id:"status",sortable:true,header:T.status,track:"state",cell:p=><Tag tone={p.status==="active"?"success":"neutral"}>{PLAN_STATUS_LABEL[p.status]}</Tag>},
    ]} rowActions={p=><RowActions label={T.planActions} items={items(p)} disabled={pending}/>}
    empty={<EmptyState title={T.noMatches}/>}/>
  ;
  const current = plans.filter(p=>!["closed","archived"].includes(p.status));
  const history = plans.filter(p=>["closed","archived"].includes(p.status));
  const cards = (rows:StrategyView[]) => <div className="grid min-w-0 grid-cols-1 gap-xl">{sorted.sortRows(rows).map(card)}</div>;
  const views = [
    { id: "overview", label: T.overview, icon: "flag", allowed: data.canPlan },
    { id: "validation", label: T.validation, icon: "chart-line", allowed: data.canPlan },
  ] as const;
  const activeView = views.find(v=>v.id===view)!;
  const hasResultGaps = (p:StrategyView) => !!(p.attributionIncomplete || p.conflicts || p.results?.some(r=>r.unpriced>0));
  const resultHelp = view === "validation" ? <>
    <p>{T.validationScope}</p>
    <p>{T.versionResultsHint}</p>
    <p>{T.noDealsWhy}</p>
    {plans.filter(hasResultGaps).map(p=>
      <div key={p.id} className="flex flex-col gap-xs border-t border-border pt-md">
        <h3 className="text-heading-3">{p.name}</h3>
        {p.attributionIncomplete?<p>{T.attributionIncomplete}</p>:null}
        {p.conflicts?<p>{T.conflict} {"\u00b7"} {p.conflicts}</p>:null}
        {p.results?.some(r=>r.unpriced>0)?<p>{p.results.reduce((n,r)=>n+r.unpriced,0)} {T.unpriced}</p>:null}
      </div>)}
  </> : undefined;
  const visiblePlanAdvice=data.planAdvice.filter(a=>!detailId || a.planId===detailId);
  const visibleSegmentAdvice=data.segmentAdvice.filter(a=>!detailId || detail?.marketIds?.includes(a.segmentId));
  const checkCount = (data.canPlan ? visiblePlanAdvice.length : 0) + (data.canMarkets ? visibleSegmentAdvice.length : 0);
  const checkButton = <PageActionButton onClick={() => setChecks(true)}>{T.checks}<span className="text-muted-foreground tabular-nums">{checkCount}</span></PageActionButton>;
  const workspaceItems: ActionMenuItem[] = [
    ...views.filter(v=>v.allowed && v.id!==view).map(v=>({id:v.id,label:v.label,icon:v.icon,onSelect:()=>switchView(v.id)})),
    ...(data.canPlan || data.canMarkets ? [{id:"checks",label:`${T.checks} ${checkCount}`,icon:"list-checks" as const,onSelect:()=>setChecks(true)}]:[]),
    ...(data.canConfigure ? [{id:"settings",label:C.systemSettings,icon:"settings" as const,onSelect:()=>router.push("/admin/strategy")}]:[]),
  ];
  const periodFilter = <FilterSlot><NativeSelect aria-label={T.period} value={period} onChange={e=>setPeriod(e.target.value)}><option value="">{T.allPeriods}</option>{[...new Set(data.plans?.map(p=>p.period))].map(p=><option key={p} value={p}>{strategyPeriodLabel(p)}</option>)}</NativeSelect></FilterSlot>;
  const validationPlanFilter=<FilterSlot width="w-48 max-w-full"><NativeSelect aria-label={T.strategy} value={planFilter} onChange={e=>{
    const q=new URLSearchParams(params);if(e.target.value)q.set("plan",e.target.value);else q.delete("plan");
    router.replace(`/strategy?${q}`,{scroll:false});
  }}><option value="">{T.allPlans}</option>{data.plans?.filter(p=>p.versionNo != null && (!period || p.period===period)).map(p=><option key={p.id} value={p.id}>{p.name}{` \u00b7 V${p.versionNo}`}</option>)}</NativeSelect></FilterSlot>;
  const overview=<>
    <CollectionToolbar title={activeView.label} icon={activeView.icon} mode={{value:layout,onChange:setLayout}}
      count={plans.length}
      search={<SearchSlot><Input type="search" aria-label={T.searchPlans} placeholder={T.searchPlans} value={query} onChange={e=>setQuery(e.target.value)}/></SearchSlot>}
      onReset={query||period?()=>{setQuery("");setPeriod("");}:undefined}>
      {periodFilter}
    </CollectionToolbar>
    {!plans.length ? <EmptyState title={data.plans?.length?T.noMatches:T.noPlans} description={T.noPlansWhy}/> : <>
      {current.length ? <div aria-label={T.live}>{layout==="cards" ? cards(current):table(current)}</div> : null}
      <CollectionHistory title={T.history} count={history.length} mode={layout}
        revealMatches={!current.length && Boolean(query.trim() || period)}>{table(history)}</CollectionHistory>
    </>}
  </>;
  const results=(selected:readonly StrategyView[])=>{
    const rows=selected.flatMap(p=>(p.results?.length?p.results:[null]).map(r=>({plan:p,result:r,empty:p.results===null?T.unknown:T.none,key:`${p.id}:${r?.currency ?? "empty"}`})));
    return <div className="flex min-w-0 flex-col gap-md" data-strategy-results>
      <CollectionTable labels={DATA_TABLE_LABELS} rows={rows} rowKey={r=>r.key} indexStart={1} columns={[
          {id:"strategy",header:T.strategy,cell:({plan:p})=><CollectionTitleCell title={planTitle(p)} description={planCode(p)}
            titleSuffix={hasResultGaps(p) ? <Tag tone="warning">{T.resultsPartial}</Tag> : null} tooltip={`${p.name} / ${planCode(p)}`}/>},
          {id:"currency",header:T.currency,track:"unit",cell:({result:r,empty})=>r?.currency ?? empty},
          {id:"pipeline",header:T.pipeline,align:"numeric",track:"amount",cell:({result:r,empty})=>r?money(r.open,r.currency):empty},
          {id:"won",header:T.won,align:"numeric",track:"amount",cell:({result:r,empty})=>r?money(r.won,r.currency):empty},
          {id:"rate",header:T.winRate,track:"count",cell:({result:r,empty})=><span className="inline-flex flex-col gap-xs tabular-nums"><span>{r && r.wonCount+r.lostCount>0?`${Math.round(r.wonCount/(r.wonCount+r.lostCount)*100)}%`:empty}</span>{r?<span className="text-body-small text-muted-foreground" title={T.sample}>{r.wonCount} / {r.lostCount}</span>:null}</span>},
        ]} rowActions={({plan:p})=><RowActions label={T.planActions} items={[{id:"view",label:viewLabel(p),onSelect:()=>router.push(`/strategy/${p.id}`)}]}/>}/>
      {selected.some(p=>p.results===null)?<p className="text-body-small text-muted-foreground">{T.unknown}</p>:null}
    </div>;
  };
  const detailFulfillment=detail ? data.fulfillment?.filter(r=>r.acceptance.lineageId===(detail.lineageId ?? detail.id)) ?? null : null;
  const detailContent=detail?<>
    <StrategyDetailGoals plan={detail}/>
    <StrategyDetailMarkets plan={detail} actions={id=>data.canCreateCampaign && isLatest(detail) && detail.status==="active" && detail.targetMarkets?.find(m=>m.segmentId===id)?.status==="active"
      ? <Button asChild size="md" variant="ghost"><Link href={`/campaign/create?plan=${encodeURIComponent(detail.id)}&market=${encodeURIComponent(id)}`}>{CAMPAIGN_TEXT.newCampaign}</Link></Button>:null}/>
    <StrategyDetailOfferings plan={detail}/>
    {detail.result?<StrategyAdvanced value={detail.result} currency={data.currency}/>:null}
    <StrategyDetailHandoff plan={detail} rows={detailFulfillment}><StrategyFulfillmentPanel rows={detailFulfillment}/></StrategyDetailHandoff>
  </>:null;
  const workspaceContent = () => {
    if (detail) return detailContent;
    if (!allowedView || data.plans === null) return <EmptyState title={T.unknown}/>;
    if (view === "overview") return overview;
    if (plans.length) return results(plans);
    const filtered = !!(period || planFilter);
    return <EmptyState title={filtered ? T.noMatches : T.noPublishedPlans} description={filtered ? undefined : T.noPublishedPlansHint}/>;
  };
  const createAction = data.canCreate ? {href:"/strategy/new",label:T.newPlan} : undefined;
  const detailOperations=detail?operations(detail):null;
  const detailPrimary=detailOperations?.detailPrimary;
  const detailEdit=detailOperations?.actions.includes("edit") && detailPrimary!=="edit";
  const detailMenu = detail ? items(detail,["view","validation",...(detailPrimary?[detailPrimary]:[]),...(detailEdit?["edit" as const]:[])]) : [];
  return <ViewLayout className="@container" data-strategy-workspace>
    {detail ? <><PageCrumbs trail={[{label:T.strategy,href:"/strategy"}]} current={detail.name}/>
      <div className="flex min-w-0 flex-col gap-lg" data-strategy-detail-intro>
      <ViewHeader icon="graph" title={detail.name} divider={false} data-strategy-detail-header
        secondary={<span className="flex flex-wrap items-center gap-sm">{versionBadge(detail)}<Tag tone={detail.status==="active"?"success":"neutral"}>{PLAN_STATUS_LABEL[detail.status]}</Tag>{detail.versionNo && !isLatest(detail)?<Tag>{T.historicalVersion}</Tag>:null}</span>}
        description={<span className="flex flex-wrap items-center gap-x-lg gap-y-xs text-body-small text-muted-foreground"><span title={detail.previousNumbers?.length ? `${T.previousNumbers}: ${detail.previousNumbers.join(" / ")}` : undefined}>{detail.planNo}</span>{detail.createdBySub?<span className="inline-flex min-w-0 items-center gap-xs text-body"><StrategyDetailLabel>{T.creator}</StrategyDetailLabel><MemberName sub={detail.createdBySub}/></span>:null}</span>}
        pageActions={{
          secondary: <>
            {detail.versionNo?<PageActionButton asChild><Link href={validationHref(detail)}><Icon name="chart-line" size="sm" aria-hidden="true"/>{T.validation}</Link></PageActionButton>:null}
            {checkButton}
            {detailEdit ? primaryAction(detail,"edit") : null}
          </>,
          primary: primaryAction(detail,detailPrimary,"primary"),
          more: detailMenu.length ? <RowActions label={T.planActions} disabled={pending} items={detailMenu} /> : undefined,
        }} />
      {detailOperations?.staleDraft?<output className="block text-body-small text-warning-text">{T.staleDraftHint}</output>:null}
      <StrategyDetailBasic plan={detail}/>
      </div></> : <ModuleHeadline moduleKey="strategy" help={T.brief} create={createAction}
        description={<StrategyModuleSummary plans={data.plans} period={period} adoption={data.adoptions}/>}
        pageActions={{
          more: workspaceItems.length ? <RowActions label={T.workspaceActions} items={workspaceItems} disabled={pending}/> : undefined,
        }} />}
    {!detail && view==="validation" ? <CollectionToolbar title={activeView.label} icon={activeView.icon} help={resultHelp} count={plans.length}>
      {periodFilter}{validationPlanFilter}
    </CollectionToolbar> : null}
    {workspaceContent()}
    <footer className="border-t border-dashed border-primary/10 pt-lg pb-2xl text-body-small text-muted-foreground">{T.dataAt} {new Date(data.at).toLocaleString(locale)}</footer>
    {activation?<DialogForm open size="sm" title={T.startExecution} description={T.startHint} submitLabel={T.startExecution}
      submitting={pending} onOpenChange={open=>{if(!open&&!pending)setActivation(null);}}
      onSubmit={e=>{
        e.preventDefault();
        if(pending){return;}
        start(async()=>{
          try{await run(activation,"active");setActivation(null);}catch(error){setActivationError(error instanceof Error?error.message:PLAN_ERROR.denied);}
        });
      }}>
      <p className="text-body font-medium">{activation.name}</p>
      {activationError?<FieldError role="alert">{activationError}</FieldError>:null}
    </DialogForm>:null}
    {publication ? <DialogForm open size="sm" title={T.publishConfirm}
      description={publication.basePlanId?T.publishReplacementHint:T.publishHint}
      submitLabel={publication.basePlanId?T.publishNext:T.publishVersion}
      submitting={pending} onOpenChange={open=>{if(!open && !pending)setPublication(null);}}
      onSubmit={e=>{e.preventDefault();if(pending)return;start(async()=>{
        try{const p=publication;const r=await publishStrategyVersion(p.id,p.editToken ?? 1);
          if(!r.ok){setPublicationError(PLAN_ERROR[r.error ?? "denied"] ?? PLAN_ERROR.denied);return;}
          setPublication(null);toast({tone:"success",title:T.publishSuccess});router.refresh();
        }catch{setPublicationError(PLAN_ERROR.denied);}
      });}}>
      <div className="flex flex-col gap-md text-body-small" data-strategy-publication-confirm>
        <p className="font-medium">{publication.name}</p><p className="text-muted-foreground">{publication.planNo}{" \u00b7 "}{strategyPeriodLabel(publication.period)}</p>
        {publication.changeReason?<p>{T.changeReason}{" \u00b7 "}{publication.changeReason}</p>:null}
        {publicationError?<FieldError role="alert">{publicationError}</FieldError>:null}
      </div>
    </DialogForm>:null}
    <Drawer open={!!versionPlan} onClose={()=>setVersionPlan(null)} width={collectionDrawerWidth.standard} title={<span className="inline-flex items-center gap-xs">{T.versionHistory}
      {versionPlan && family(versionPlan).some(p=>p.snapshotLegacy) ? <TitleHelp topic={T.versionHistory}><p>{T.legacyVersionHelp}</p></TitleHelp> : null}
    </span>} description={versionPlan?.planNo} closeLabel={T.closed}>
      <div className="flex flex-col gap-lg" data-strategy-version-history>
        {versionPlan ? family(versionPlan).sort((a,b)=>(b.versionNo ?? Number.MAX_SAFE_INTEGER)-(a.versionNo ?? Number.MAX_SAFE_INTEGER)).map(p=><Card key={p.id} className="gap-md py-lg">
          <CardHeader><div className="flex flex-wrap items-center justify-between gap-sm"><CardTitle>{p.versionNo?`V${p.versionNo}`:p.basePlanId?T.revisionDraft:T.noPublication}</CardTitle>
            <span className="flex items-center gap-sm"><Tag>{PLAN_STATUS_LABEL[p.status]}</Tag>{isLatest(p)?<Tag>{T.currentVersion}</Tag>:null}</span></div></CardHeader>
          <CardContent><div className="flex flex-col gap-sm text-body-small"><Link href={`/strategy/${p.id}`} onClick={()=>setVersionPlan(null)} className="font-medium transition-colors hover:text-primary">{p.name}</Link>
            <span className="text-muted-foreground">{strategyPeriodLabel(p.period)}{p.approvedAt?` \u00b7 ${new Date(p.approvedAt).toLocaleString(locale)}`:""}</span>
            {p.publishedBySub ? <span className="text-muted-foreground">{T.publishedBy} <MemberName sub={p.publishedBySub}/></span>:null}
            {p.changeReason?<p>{p.changeReason}</p>:null}
            {p.basePlanId?<span className="text-muted-foreground">{T.baseVersion} V{data.plans?.find(base=>base.id===p.basePlanId)?.versionNo ?? "?"}</span>:null}
            <div className="flex flex-wrap gap-sm"><Button asChild size="md" variant="secondary"><Link href={`/strategy/${p.id}`} onClick={()=>setVersionPlan(null)}>{T.versionRead}</Link></Button>
              {operations(p).actions.includes("edit") ? <Button asChild size="md" variant="secondary"><Link href={`/strategy/new?id=${encodeURIComponent(p.id)}`}>{p.basePlanId?T.resumeDraft:T.editDraft}</Link></Button>:null}
            </div>
          </div></CardContent>
        </Card>):null}
      </div>
    </Drawer>
    <Drawer open={checks} onClose={()=>setChecks(false)} width={collectionDrawerWidth.standard} title={<span className="inline-flex items-center gap-xs">{T.checks}<TitleHelp topic={T.checks}><p>{T.checkWhy}</p></TitleHelp></span>} closeLabel={T.closed}>
      <div className="flex flex-col gap-xl">{data.plans===null||data.markets===null||data.markets.some(m=>m.customers===null)||data.plans.some(p=>p.campaigns===null)?<p className="text-body-small text-muted-foreground">{T.checkIncomplete}</p>:null}
        {data.canPlan && data.plans!==null?<PlanAdvicePanel advice={visiblePlanAdvice}/>:null}
        {data.canMarkets && data.markets!==null?<SegmentAdvicePanel advice={visibleSegmentAdvice}/>:null}
      </div>
    </Drawer>
  </ViewLayout>;
}
