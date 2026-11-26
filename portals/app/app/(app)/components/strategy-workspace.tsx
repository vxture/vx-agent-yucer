"use client";
import { useXiaoyuPageState } from "./use-xiaoyu-page-state";
import { StrategyFulfillmentPanel } from "./strategy-fulfillment-panel";
import { StrategyAdvanced } from "./strategy-result-fields";
import { StrategyDetailBasic, StrategyDetailGoals, StrategyDetailMarkets, StrategyDetailOfferings, StrategyDetailHandoff } from "./strategy-detail-reading";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState, useTransition } from "react";
import { Button, Card, CardContent, CardHeader, CardTitle, Drawer, EmptyState, FieldError, Icon, Input, NativeSelect, SegmentedControl, ViewLayout, useToast, type ActionMenuItem } from "@vxture/design-ui";
import { ViewHeader } from "./business-controls";
import { TitleHelp } from "./title-help";
import { FilterSlot, RowActions, SearchSlot, useTableSort } from "./table-fittings";
import { ModuleHeadline } from "./module-headline";
import { CollectionHistory, CollectionToolbar, collectionDrawerWidth } from "./collection-layout";
import { CollectionTable, CollectionTitleCell } from "./collection-table";
import { useCollectionView } from "./collection-view-provider";
import { PageActionButton } from "./page-header-actions";
import { PageCrumbs } from "./page-crumbs";
import { StrategyDetailLabel, StrategyQuantity } from "./strategy-detail-label";
import { MemberName } from "../lib/member-names";
import { useLocale, useMessages } from "../lib/i18n/provider";
import { nextPlanStatuses } from "../../domains/strategy/lib/lifecycle";
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
  const { STRATEGY_RESULT_TEXT:R, STRATEGY_DETAIL_TEXT:D, MARKET_STRATEGY_TEXT: T, PLAN_STATUS_LABEL, PLAN_ERROR, STRATEGY_TEXT, DATA_TABLE_LABELS, CAMPAIGN_TEXT } = useMessages();
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
  const [publication,setPublication]=useState<{plan:StrategyView;discard?:boolean}|null>(null);
  const [publicationError,setPublicationError]=useState<string|null>(null);
  const [pending,start]=useTransition();
  const {toast}=useToast();
  const detail=data.plans?.find(p=>p.id===detailId);
  const planFilter=view==="validation" ? params.get("plan") ?? "" : "";
  const scopedPlans=view==="overview"?currentStrategyPlans(data.plans ?? []):data.plans?.filter(p=>p.versionNo || !p.basePlanId) ?? [];
  const plans=scopedPlans.filter(p=>(!planFilter || p.id===planFilter) && (!period || p.period===period) && (!query.trim() || `${p.name} ${p.planNo} ${(p.previousNumbers ?? []).join(" ")} ${p.objective ?? ""}`.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase())));
  const allowedView = data.canPlan;
  useXiaoyuPageState({query:query.slice(0,160),period,plan:planFilter,view:layout});
  const switchView=(next:StrategyTab)=>{
    if(next === view)return;
    const q=new URLSearchParams(params);q.set("view",next);q.delete("market");q.delete("plan");
    start(()=>router.push(`/strategy?${q}`,{scroll:false}));
  };
  const run=(id:string,to:string)=>start(async()=>{
    try {const p=data.plans?.find(p=>p.id===id);const r=await movePlan(id,to,p?.editToken ?? 1);if(!r.ok)toast({tone:"danger",title:PLAN_ERROR[r.error ?? "denied"] ?? PLAN_ERROR.denied});else router.refresh();}
    catch {toast({tone:"danger",title:PLAN_ERROR.denied});}
  });
  const family=(p:StrategyView)=>(data.plans ?? []).filter(row=>(row.lineageId ?? row.id)===(p.lineageId ?? p.id));
  const latest=(p:StrategyView)=>family(p).filter(row=>row.versionNo).sort((a,b)=>(b.versionNo ?? 0)-(a.versionNo ?? 0))[0];
  const draftFor=(p:StrategyView)=>family(p).find(row=>row.status==="draft");
  const isLatest=(p:StrategyView)=>latest(p)?.id===p.id;
  const revise=(p:StrategyView)=>start(async()=>{
    const existing=draftFor(p);if(existing){router.push(`/strategy/new?id=${encodeURIComponent(existing.id)}`);return;}
    try{const r=await startStrategyRevision(p.id);if(!r.ok || !r.id){toast({tone:"danger",title:PLAN_ERROR[r.error ?? "denied"] ?? PLAN_ERROR.denied});return;}
      router.push(`/strategy/new?id=${encodeURIComponent(r.id)}`);router.refresh();
    }catch{toast({tone:"danger",title:PLAN_ERROR.denied});}
  });
  const openPublication=(plan:StrategyView,discard=false)=>{setPublicationError(null);setPublication({plan,discard});};
  const items=(p:StrategyView):ActionMenuItem[]=>[
    {id:"view",label:T.openPlan,onSelect:()=>router.push(`/strategy/${p.id}`)},
    ...(data.canEdit && p.status === "draft" ? [{id:"edit",label:T.editPlan,onSelect:()=>router.push(`/strategy/new?id=${encodeURIComponent(p.id)}`)}]:[]),
    ...(data.canEdit && p.versionNo && isLatest(p) && ["approved","active"].includes(p.status) ? [{id:"revise",label:draftFor(p)?T.resumeDraft:T.reviseStrategy,onSelect:()=>revise(p)}]:[]),
    ...(data.canApprove && p.status==="draft" ? [{id:"publish",label:p.basePlanId?T.publishNext:T.publishVersion,onSelect:()=>openPublication(p)}]:[]),
    {id:"versions",label:T.versionHistory,onSelect:()=>setVersionPlan(p)},
    ...(data.canEdit ? nextPlanStatuses(p.status).filter(s=>s!=="approved").map(s=>({id:s,label:p.status==="draft"&&s==="archived"?T.discardDraft:STRATEGY_TEXT.planMoveTo[s],
      onSelect:()=>p.status==="draft"&&s==="archived"?openPublication(p,true):run(p.id,s)})) : []),
  ];
  const versionBadge=(p:StrategyView)=><>{p.versionNo ? <Tag>{`V${p.versionNo}`}</Tag> : p.basePlanId ? <Tag>{T.revisionDraft}</Tag>:null}</>;
  const number=(n:number|null|undefined,unit:string)=><StrategyQuantity value={n==null ? T.unknown:n.toLocaleString(locale)} unit={n==null?undefined:unit}/>;
  const money=(n:number,currency:string)=><StrategyQuantity value={n.toLocaleString(locale,{maximumFractionDigits:0})} unit={currency}/>;
  const card = (p: StrategyView) => <StrategyCharterCard key={p.id} plan={p} currency={data.currency} actions={<RowActions items={items(p)} disabled={pending}/>} draftAvailable={!!draftFor(p) && p.status!=="draft"}/>;
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
    ]} rowActions={p=><RowActions items={items(p)} disabled={pending}/>}
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
  const viewActions = allowedView ? <SegmentedControl<StrategyTab> value={view} onChange={switchView} ariaLabel={T.strategy}
    items={views.filter(v=>v.allowed).map(v=>({value:v.id,label:v.label,icon:v.icon,disabled:pending}))}/> : null;
  const visiblePlanAdvice=data.planAdvice.filter(a=>!detailId || a.planId===detailId);
  const visibleSegmentAdvice=data.segmentAdvice.filter(a=>!detailId || detail?.marketIds?.includes(a.segmentId));
  const checkCount = (data.canPlan ? visiblePlanAdvice.length : 0) + (data.canMarkets ? visibleSegmentAdvice.length : 0);
  const checkButton = <PageActionButton onClick={() => setChecks(true)}>{T.checks}<span className="text-muted-foreground tabular-nums">{checkCount}</span></PageActionButton>;
  const periodFilter = <FilterSlot><NativeSelect aria-label={T.period} value={period} onChange={e=>setPeriod(e.target.value)}><option value="">{T.allPeriods}</option>{[...new Set(data.plans?.map(p=>p.period))].map(p=><option key={p} value={p}>{strategyPeriodLabel(p)}</option>)}</NativeSelect></FilterSlot>;
  const validationPlanFilter=<FilterSlot width="w-48 max-w-full"><NativeSelect aria-label={T.strategy} value={planFilter} onChange={e=>{
    const q=new URLSearchParams(params);if(e.target.value)q.set("plan",e.target.value);else q.delete("plan");
    router.replace(`/strategy?${q}`,{scroll:false});
  }}><option value="">{T.allPlans}</option>{data.plans?.filter(p=>!period || p.period===period).map(p=><option key={p.id} value={p.id}>{p.name}{p.versionNo ? ` \u00b7 V${p.versionNo}` : ""}</option>)}</NativeSelect></FilterSlot>;
  const overview=<>
    <CollectionToolbar title={activeView.label} icon={activeView.icon} mode={{value:layout,onChange:setLayout}}
      count={plans.length} actions={checkButton}
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
        ]} rowActions={({plan:p})=><RowActions items={[{id:"view",label:T.openPlan,onSelect:()=>router.push(`/strategy/${p.id}`)}]}/>}/>
      {selected.some(p=>p.results===null)?<p className="text-body-small text-muted-foreground">{T.unknown}</p>:null}
    </div>;
  };
  const detailFulfillment=detail ? data.fulfillment?.filter(r=>r.acceptance.lineageId===(detail.lineageId ?? detail.id)) ?? null : null;
  const detailContent=detail?<>
    <StrategyDetailGoals plan={detail}/>
    <StrategyDetailMarkets plan={detail} actions={id=>data.canCreateCampaign && detail.status==="active" && detail.targetMarkets?.find(m=>m.segmentId===id)?.status==="active"
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
    return <EmptyState title={filtered ? T.noMatches : T.noPlans} description={filtered ? undefined : T.noPlansWhy}/>;
  };
  const createAction = data.canCreate ? {href:"/strategy/new",label:T.newPlan} : undefined;
  const detailMenu = detail ? items(detail).filter(item => !["view", "publish", "revise"].includes(item.id)) : [];
  return <ViewLayout className="@container" data-strategy-workspace>
    {detail ? <><PageCrumbs trail={[{label:T.strategy,href:"/strategy"}]} current={detail.name}/>
      <div className="flex min-w-0 flex-col gap-lg" data-strategy-detail-intro>
      <ViewHeader icon="graph" title={detail.name} divider={false} data-strategy-detail-header
        secondary={<span className="flex flex-wrap items-center gap-sm">{versionBadge(detail)}<Tag tone={detail.status==="active"?"success":"neutral"}>{PLAN_STATUS_LABEL[detail.status]}</Tag>{detail.versionNo && !isLatest(detail)?<Tag>{T.historicalVersion}</Tag>:null}</span>}
        description={<span className="flex flex-wrap items-center gap-x-lg gap-y-xs text-body-small text-muted-foreground"><span title={detail.previousNumbers?.length ? `${T.previousNumbers}: ${detail.previousNumbers.join(" / ")}` : undefined}>{detail.planNo}</span>{detail.createdBySub?<span className="inline-flex min-w-0 items-center gap-xs text-body"><StrategyDetailLabel>{T.creator}</StrategyDetailLabel><MemberName sub={detail.createdBySub}/></span>:null}</span>}
        pageActions={{
          secondary: <>
            <PageActionButton asChild><Link href={`/strategy?${new URLSearchParams({view:"validation",period:detail.period,plan:detail.id})}`}><Icon name="chart-line" size="sm" aria-hidden="true"/>{T.validation}</Link></PageActionButton>
            {checkButton}
            {detail.status==="draft" && data.canEdit ? <PageActionButton asChild><Link href={`/strategy/new?id=${encodeURIComponent(detail.id)}`}><Icon name="edit" size="sm" aria-hidden="true"/>{R.edit}</Link></PageActionButton> : null}
          </>,
          primary: detail.status === "draft" && data.canApprove
            ? <PageActionButton intent="primary" disabled={pending} onClick={() => openPublication(detail)}>{detail.basePlanId ? T.publishNext : T.publishVersion}</PageActionButton>
            : detail.versionNo && data.canEdit && isLatest(detail) && ["approved","active"].includes(detail.status)
              ? <PageActionButton intent="primary" disabled={pending} onClick={() => revise(detail)}>{draftFor(detail) ? T.resumeDraft : T.reviseStrategy}</PageActionButton>
              : undefined,
          more: detailMenu.length ? <RowActions disabled={pending} items={detailMenu} /> : undefined,
        }} />
      <StrategyDetailBasic plan={detail}/>
      </div></> : <ModuleHeadline moduleKey="strategy" help={T.brief} create={createAction}
        pageActions={{
          view: viewActions,
          secondary: view === "overview" && data.canEdit ? <PageActionButton asChild><Link href="/admin/strategy" target="_blank" rel="noopener noreferrer"><Icon name="settings" size="sm" aria-hidden="true"/>{T.typeConfig}</Link></PageActionButton> : undefined,
        }} />}
    {!detail && view==="validation" ? <CollectionToolbar title={activeView.label} icon={activeView.icon} help={resultHelp} count={plans.length} actions={checkButton}>
      {periodFilter}{validationPlanFilter}
    </CollectionToolbar> : null}
    {workspaceContent()}
    <footer className="border-t border-dashed border-primary/10 pt-lg pb-2xl text-body-small text-muted-foreground">{T.dataAt} {new Date(data.at).toLocaleString(locale)}</footer>
    {publication ? <DialogForm open size="sm" title={publication.discard?T.discardConfirm:T.publishConfirm}
      description={publication.discard?T.discardHint:publication.plan.basePlanId?T.publishReplacementHint:T.publishHint}
      submitLabel={publication.discard?T.discardDraft:publication.plan.basePlanId?T.publishNext:T.publishVersion}
      submitting={pending} onOpenChange={open=>{if(!open && !pending)setPublication(null);}}
      onSubmit={e=>{e.preventDefault();if(pending)return;start(async()=>{
        try{const p=publication.plan;const r=publication.discard?await discardStrategyVersion(p.id,p.editToken ?? 1):await publishStrategyVersion(p.id,p.editToken ?? 1);
          if(!r.ok){setPublicationError(PLAN_ERROR[r.error ?? "denied"] ?? PLAN_ERROR.denied);return;}
          setPublication(null);toast({tone:"success",title:publication.discard?T.discardDraft:T.publishSuccess});router.refresh();
        }catch{setPublicationError(PLAN_ERROR.denied);}
      });}}>
      <div className="flex flex-col gap-md text-body-small" data-strategy-publication-confirm>
        <p className="font-medium">{publication.plan.name}</p><p className="text-muted-foreground">{publication.plan.planNo}{" \u00b7 "}{strategyPeriodLabel(publication.plan.period)}</p>
        {publication.plan.changeReason?<p>{T.changeReason}{" \u00b7 "}{publication.plan.changeReason}</p>:null}
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
              {p.status==="draft" && data.canEdit ? <Button asChild size="md" variant="secondary"><Link href={`/strategy/new?id=${encodeURIComponent(p.id)}`}>{T.resumeDraft}</Link></Button>:null}
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
