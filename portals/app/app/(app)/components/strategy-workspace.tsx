"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState, useTransition } from "react";
import { Button, Card, CardContent, CardHeader, CardTitle, Collapsible, CollapsibleContent, CollapsibleTrigger, DetailList, DetailRow, Drawer, EmptyState, FieldError, Icon, Input,  NativeSelect, ViewLayout, ViewModeSwitch, useToast, type ActionMenuItem, type FilterBarView } from "@vxture/design-ui";
import { DataTable, FilterBar, ViewHeader } from "./business-controls";
import { Section, SectionHeader } from "./help-section";
import { TitleHelp } from "./title-help";
import { RowActions, SearchSlot } from "./table-fittings";
import { ModuleHeadline } from "./module-headline";
import { PageCrumbs } from "./page-crumbs";
import { MemberName } from "../lib/member-names";
import { useLocale, useMessages } from "../lib/i18n/provider";
import { nextPlanStatuses } from "../../domains/strategy/lib/lifecycle";
import { PlanAdvicePanel } from "./plan-advice-panel";
import { SegmentAdvicePanel } from "./segment-advice-panel";
import { StrategyMarketCards, StrategySolutionCards } from "./strategy-selection-cards";
import { DialogForm } from "./dialog-form";
import { strategyPeriodRangeLabel, strategyPeriodLabel } from "../../domains/strategy/lib/plan-period";
import { currentStrategyPlans } from "../../domains/strategy/store";
import { StrategyCharterCard } from "./strategy-charter-card";
import { Tag } from "./tag";
import type { StrategyWorkspaceData } from "../strategy/workspace-data";
import type { StrategyView } from "../lib/market-strategy";
import { movePlan, startStrategyRevision, publishStrategyVersion, discardStrategyVersion } from "../strategy/actions";

export type StrategyTab = "overview" | "validation";
export function StrategyWorkspace({ data, view, detailId }: { readonly data: StrategyWorkspaceData; readonly view: StrategyTab; readonly detailId?: string }) {
  const { MARKET_STRATEGY_TEXT: T, PLAN_STATUS_LABEL, PLAN_ERROR, STRATEGY_TEXT, DATA_TABLE_LABELS, CAMPAIGN_TEXT } = useMessages();
  const locale=useLocale();
  const router=useRouter(), params=useSearchParams();
  const [layout,setLayout]=useState<FilterBarView>("cards");
  const [query,setQuery]=useState("");
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
  const [historyOpen,setHistoryOpen]=useState(false);
  const [pending,start]=useTransition();
  const {toast}=useToast();
  const detail=data.plans?.find(p=>p.id===detailId);
  const planFilter=view==="validation" ? params.get("plan") ?? "" : "";
  const scopedPlans=view==="overview"?currentStrategyPlans(data.plans ?? []):data.plans?.filter(p=>p.versionNo || !p.basePlanId) ?? [];
  const plans=scopedPlans.filter(p=>(!planFilter || p.id===planFilter) && (!period || p.period===period) && (!query.trim() || `${p.name} ${p.planNo} ${p.objective ?? ""}`.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase())));
  const allowedView = data.canPlan;
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
  const number=(n:number|null|undefined)=>n==null ? T.unknown:n.toLocaleString(locale);
  const money=(n:number,currency:string)=>new Intl.NumberFormat(locale,{style:"currency",currency,maximumFractionDigits:0}).format(n);
  const card = (p: StrategyView) => <StrategyCharterCard key={p.id} plan={p} actions={<RowActions items={items(p)} disabled={pending}/>} draftAvailable={!!draftFor(p) && p.status!=="draft"}/>;
  const table=(rows:StrategyView[])=><DataTable labels={DATA_TABLE_LABELS} rows={rows} rowKey={p=>p.id} indexStart={1}
    className="[&_table]:min-w-(--container-3xl)" columns={[
      {id:"name",header:T.strategy,align:"left",width:"lg",cell:p=><div className="flex flex-col gap-xs"><Link href={`/strategy/${p.id}`} className="font-medium transition-colors hover:text-primary">{p.name}</Link><span className="text-body-small text-muted-foreground">{strategyPeriodLabel(p.period)}{" \u00b7 "}{p.planNo} {p.versionNo ? `\u00b7 V${p.versionNo}` : ""}</span></div>},
      {id:"direction",header:T.direction,align:"left",width:"lg",cell:p=><span className="line-clamp-2 text-body-small" title={p.objective ?? undefined}>{p.objective || T.directionEmpty}</span>},
      {id:"markets",header:T.marketCount,cell:p=>number(p.marketIds?.length)},
      {id:"customers",header:T.customerCount,cell:p=>number(p.customerCount)},
      {id:"solutions",header:T.solutionCount,cell:p=>number(p.solutions === null || p.products === null ? null : p.solutions.length + p.products.length)},
      {id:"campaigns",header:T.campaignCount,cell:p=>number(p.campaigns?.length)},
      {id:"status",header:T.status,cell:p=><Tag tone={p.status==="active"?"success":"neutral"}>{PLAN_STATUS_LABEL[p.status]}</Tag>},
    ]} rowActions={p=><RowActions items={items(p)} disabled={pending}/>}
    empty={<EmptyState title={T.noMatches}/>}/>
  ;
  const current = plans.filter(p=>!["closed","archived"].includes(p.status));
  const history = plans.filter(p=>["closed","archived"].includes(p.status));
  const cards = (rows:StrategyView[]) => <div className="grid min-w-0 grid-cols-1 gap-xl">{rows.map(card)}</div>;
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
  const sectionHeading = <SectionHeader level={2} icon={activeView.icon} title={activeView.label} divider={false}
    help={resultHelp}
    data-strategy-section-heading data-view={view}/>;
  const viewActions = <div role="group" aria-label={T.strategy} aria-busy={pending}
    className="flex min-w-0 max-w-full flex-wrap items-center gap-2xs" data-strategy-view-actions>
    {views.filter(v=>v.allowed).map(v=><Button key={v.id} size="md" variant={view===v.id ? "secondary" : "ghost"}
      className="gap-2xs" aria-pressed={view===v.id} disabled={pending} onClick={()=>switchView(v.id)}>
      <Icon name={v.icon} size="sm" aria-hidden="true"/>{v.label}
    </Button>)}
  </div>;
  const visiblePlanAdvice=data.planAdvice.filter(a=>!detailId || a.planId===detailId);
  const visibleSegmentAdvice=data.segmentAdvice.filter(a=>!detailId || detail?.marketIds?.includes(a.segmentId));
  const checkButton = <Button size="md" variant="secondary" onClick={()=>setChecks(true)}>{T.checks}<span className="text-body-small text-muted-foreground tabular-nums">{(data.canPlan?visiblePlanAdvice.length:0)+(data.canMarkets?visibleSegmentAdvice.length:0)}</span></Button>;
  const periodFilter = <div className="w-36 max-w-full"><NativeSelect className="h-control-xl text-body-small font-medium" aria-label={T.period} value={period} onChange={e=>setPeriod(e.target.value)}><option value="">{T.allPeriods}</option>{[...new Set(data.plans?.map(p=>p.period))].map(p=><option key={p} value={p}>{strategyPeriodLabel(p)}</option>)}</NativeSelect></div>;
  const validationPlanFilter=<div className="w-56 max-w-full"><NativeSelect aria-label={T.strategy} value={planFilter} onChange={e=>{
    const q=new URLSearchParams(params);if(e.target.value)q.set("plan",e.target.value);else q.delete("plan");
    router.replace(`/strategy?${q}`,{scroll:false});
  }}><option value="">{T.allPlans}</option>{data.plans?.filter(p=>!period || p.period===period).map(p=><option key={p.id} value={p.id}>{p.name}{p.versionNo ? ` \u00b7 V${p.versionNo}` : ""}</option>)}</NativeSelect></div>;
  const layoutSwitch=<ViewModeSwitch value={layout} onChange={setLayout} ariaLabel={T.layout} labels={{list:T.listView,cards:T.cardsView}}/>;
  const overview=<>
    <FilterBar scope={<div className="flex flex-wrap items-center gap-lg">{sectionHeading}<div className="flex items-center gap-sm" data-strategy-layout-actions>
      {layoutSwitch}<span className="whitespace-nowrap text-body-small text-muted-foreground" data-strategy-plan-count>{T.planCount} <span className="tabular-nums">{number(plans.length)}</span></span>
    </div></div>} actions={checkButton}
      search={<SearchSlot><Input aria-label={T.searchPlans} placeholder={T.searchPlans} value={query} onChange={e=>setQuery(e.target.value)}/></SearchSlot>}
      onReset={query||period?()=>{setQuery("");setPeriod("");}:undefined}>
      <div className="@3xl:hidden">{periodFilter}</div>
    </FilterBar>
    {!plans.length ? <EmptyState title={data.plans?.length?T.noMatches:T.noPlans} description={T.noPlansWhy}/> : <>
      {current.length ? <div aria-label={T.live}>{layout==="cards" ? cards(current):table(current)}</div> : null}
      {history.length ? <Collapsible open={historyOpen} onOpenChange={setHistoryOpen}>
        <CollapsibleTrigger asChild><Button size="md" variant="ghost" className="text-muted-foreground"><Icon name={historyOpen?"chevron-up":"chevron-down"} size="sm"/>{T.history}<span className="tabular-nums">{history.length}</span></Button></CollapsibleTrigger>
        <CollapsibleContent className="pt-lg">{table(history)}</CollapsibleContent>
      </Collapsible>:null}
    </>}
  </>;
  const results=(selected:readonly StrategyView[])=>{
    const rows=selected.flatMap(p=>(p.results?.length?p.results:[null]).map(r=>({plan:p,result:r,empty:p.results===null?T.unknown:T.none,key:`${p.id}:${r?.currency ?? "empty"}`})));
    return <div className="flex min-w-0 flex-col gap-md" data-strategy-results>
      <DataTable labels={DATA_TABLE_LABELS} rows={rows} rowKey={r=>r.key} indexStart={1}
        className="[&_table]:min-w-(--container-3xl)" columns={[
          {id:"strategy",header:T.strategy,align:"left" as const,width:"lg" as const,cell:({plan:p}:typeof rows[number])=><div className="flex flex-col gap-xs">
            <Link href={`/strategy/${p.id}`} className="font-medium transition-colors hover:text-primary">{p.name}</Link>
            <div className="flex flex-wrap items-center gap-xs"><span className="text-body-small text-muted-foreground">{strategyPeriodLabel(p.period)}{p.versionNo ? ` \u00b7 V${p.versionNo}` : ""}</span>
              {hasResultGaps(p) ? <Tag tone="warning">{T.resultsPartial}</Tag> : null}
            </div>
          </div>},
          {id:"currency",header:T.currency,width:"xs",cell:({result:r,empty})=>r?.currency ?? empty},
          {id:"pipeline",header:T.pipeline,align:"numeric",width:"sm",cell:({result:r,empty})=>r?money(r.open,r.currency):empty},
          {id:"won",header:T.won,align:"numeric",width:"sm",cell:({result:r,empty})=>r?money(r.won,r.currency):empty},
          {id:"rate",header:T.winRate,align:"numeric",width:"sm",cell:({result:r,empty})=><span className="inline-flex flex-col gap-xs"><span>{r && r.wonCount+r.lostCount>0?`${Math.round(r.wonCount/(r.wonCount+r.lostCount)*100)}%`:empty}</span>{r?<span className="text-body-small text-muted-foreground" title={T.sample}>{r.wonCount} / {r.lostCount}</span>:null}</span>},
        ]} rowActions={({plan:p})=><RowActions items={[{id:"view",label:T.openPlan,onSelect:()=>router.push(`/strategy/${p.id}`)}]}/>}/>
      {selected.some(p=>p.results===null)?<p className="text-body-small text-muted-foreground">{T.unknown}</p>:null}
    </div>;
  };
  const detailContent=detail?<>
    <Collapsible defaultOpen className="flex flex-col gap-md" data-strategy-basic-section>
      <SectionHeader title={T.basicInfo} icon="clipboard" action={<div className="flex items-center gap-md">
        {detail.createdBySub ? <span className="inline-flex items-center gap-xs text-body-small text-muted-foreground">{T.creator}<MemberName sub={detail.createdBySub}/></span> : null}
        <CollapsibleTrigger asChild><Button size="icon-xl" variant="ghost" className="group" aria-label={T.basicInfo}><Icon name="chevron-down" size="sm" className="transition-transform group-data-[state=open]:rotate-180"/></Button></CollapsibleTrigger>
      </div>}/>
      <CollapsibleContent><Card className="py-lg" data-strategy-basic-card><CardContent><div className="flex flex-col gap-lg">
        <DetailList columns={3} data-strategy-basic-facts>
          <DetailRow label={T.strategyType}>{detail.strategyType?.name ?? T.typeUnclassified}</DetailRow>
          <DetailRow label={T.executionWindow}><span className="inline-flex min-h-control-md items-center tabular-nums">{strategyPeriodRangeLabel(detail.period) ?? T.periodNeedsDates}</span></DetailRow>
          <DetailRow label={T.owner}><MemberName sub={detail.ownerSub} name={detail.publishedOwnerName} fallback={T.noOwner}/></DetailRow>
          <DetailRow label={T.publishedAt}><span className="inline-flex min-h-control-md items-center tabular-nums">{detail.approvedAt ? new Date(detail.approvedAt).toLocaleDateString(locale) : "-"}</span></DetailRow>
        </DetailList>
        <dl className="grid grid-cols-[auto_minmax(0,1fr)] items-baseline gap-x-md gap-y-md border-t border-dashed border-primary/10 pt-md text-body-small" data-strategy-detail-direction>
          <dt className="text-muted-foreground">{T.direction}</dt><dd className="min-w-0 whitespace-pre-wrap break-words text-body">{detail.objective || T.directionEmpty}</dd>
          {detail.changeReason ? <><dt className="text-muted-foreground">{T.changeReason}</dt><dd className="min-w-0 whitespace-pre-wrap break-words">{detail.changeReason}</dd></> : null}
        </dl>
      </div></CardContent></Card></CollapsibleContent>
    </Collapsible>
    <Section title={T.targetMarketsTitle} icon="target" help={T.targetMarketBasis}>
      <StrategyMarketCards detail markets={detail.targetMarkets} actions={m => data.canCreateCampaign && detail.status === "active" && detail.targetMarkets?.find(t => t.segmentId === m.segmentId)?.status === "active"
        ? <Button asChild size="md" variant="secondary"><Link href={`/campaign/create?plan=${encodeURIComponent(detail.id)}&market=${encodeURIComponent(m.segmentId)}`}>{CAMPAIGN_TEXT.newCampaign}</Link></Button> : null}/>
    </Section>
    <Section title={T.featuredSolutions} icon="squares-four">
      <StrategySolutionCards detail products={detail.products} sharedProductIds={detail.sharedProducts?.map(p=>p.id)} solutions={detail.solutions} sharedIds={detail.sharedSolutions?.map(s => s.id)}
        markets={detail.targetMarkets?.map(m => ({marketName:m.marketName, productIds:m.products?.map(p=>p.id), solutionIds:m.solutions?.map(s => s.id)})) ?? []}/>
    </Section>
    <Section title={T.handoff} icon="workflow" action={<div className="flex flex-wrap items-center gap-sm">
      <Button asChild variant="secondary" size="md"><Link href="/planning">{T.openPlanning}</Link></Button>
      <Button asChild variant="secondary" size="md"><Link href="/campaign">{T.openCampaigns}</Link></Button>
    </div>}>
      <div className="flex flex-wrap items-center gap-sm text-body-small text-muted-foreground">
        <span>{T.campaignCount} {number(detail.campaigns?.length)}</span>
        {detail.campaigns?.length ? detail.campaigns.map(c=><Tag key={c.id}>{c.name}</Tag>) : <span>{detail.campaigns===null?T.unknown:T.noCampaigns}</span>}
      </div>
    </Section>
  </>:null;
  const workspaceContent = () => {
    if (detail) return detailContent;
    if (!allowedView || data.plans === null) return <EmptyState title={T.unknown}/>;
    if (view === "overview") return overview;
    if (plans.length) return results(plans);
    const filtered = !!(period || planFilter);
    return <EmptyState title={filtered ? T.noMatches : T.noPlans} description={filtered ? undefined : T.noPlansWhy}/>;
  };
  const createAction = data.canCreate ? <Button asChild size="xl"><Link href="/strategy/new">{T.newPlan}</Link></Button> : null;
  return <ViewLayout className="@container" data-strategy-workspace>
    {detail ? <><PageCrumbs trail={[{label:T.strategy,href:"/strategy"}]} current={detail.name}/>
      <ViewHeader icon="graph" title={detail.name} divider data-strategy-detail-header
        className="grid grid-cols-[auto_minmax(0,1fr)] [&>div:last-child]:col-start-2 [&>div:last-child]:justify-end @4xl:grid-cols-[auto_minmax(0,1fr)_auto] @4xl:[&>div:last-child]:col-start-3"
        secondary={<span className="flex flex-wrap items-center gap-sm">{versionBadge(detail)}<Tag tone={detail.status==="active"?"success":"neutral"}>{PLAN_STATUS_LABEL[detail.status]}</Tag>{detail.versionNo && !isLatest(detail)?<Tag>{T.historicalVersion}</Tag>:null}</span>}
        description={<span className="flex flex-wrap items-center gap-x-lg gap-y-xs text-body-small text-muted-foreground"><span>{T.period} <span className="text-foreground">{strategyPeriodLabel(detail.period)}</span></span><span>{detail.planNo}</span></span>}
        action={<div className="flex max-w-full flex-wrap items-center gap-sm">
          <Button asChild variant="secondary" size="xl"><Link href={`/strategy?${new URLSearchParams({view:"validation",period:detail.period,plan:detail.id})}`}><Icon name="chart-line" size="sm" aria-hidden="true"/>{T.validation}</Link></Button>
          {detail.status==="draft" && data.canApprove ? <Button size="xl" disabled={pending} onClick={()=>openPublication(detail)}>{detail.basePlanId?T.publishNext:T.publishVersion}</Button>:null}
          {detail.versionNo && data.canEdit && isLatest(detail) && ["approved","active"].includes(detail.status) ? <Button size="xl" variant="secondary" disabled={pending} onClick={()=>revise(detail)}>{draftFor(detail)?T.resumeDraft:T.reviseStrategy}</Button>:null}
          {checkButton}<RowActions disabled={pending} items={items(detail).filter(item=>!["view","publish","revise"].includes(item.id))}/>
        </div>}/></> : <ModuleHeadline moduleKey="strategy" help={T.brief} className="[&>div:last-child]:max-w-full"
      action={<div className="flex max-w-full flex-wrap items-center justify-end gap-sm" data-strategy-title-actions>{viewActions}<div className="hidden @3xl:block">{periodFilter}</div>{view==="overview" && data.canEdit ? <Button asChild size="md" variant="ghost"><Link href="/admin/strategy" target="_blank" rel="noopener noreferrer"><Icon name="settings" size="sm" aria-hidden="true"/>{T.typeConfig}</Link></Button>:null}{createAction}</div>}/>}
    {!detail && view==="validation" ? <FilterBar scope={sectionHeading} actions={checkButton}>
      {validationPlanFilter}<div className="@3xl:hidden">{periodFilter}</div>
    </FilterBar> : null}
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
    <Drawer open={!!versionPlan} onClose={()=>setVersionPlan(null)} width="md" title={<span className="inline-flex items-center gap-xs">{T.versionHistory}
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
    <Drawer open={checks} onClose={()=>setChecks(false)} width="lg" title={<span className="inline-flex items-center gap-xs">{T.checks}<TitleHelp topic={T.checks}><p>{T.checkWhy}</p></TitleHelp></span>} closeLabel={T.closed}>
      <div className="flex flex-col gap-xl">{data.plans===null||data.markets===null||data.markets.some(m=>m.customers===null)||data.plans.some(p=>p.campaigns===null)?<p className="text-body-small text-muted-foreground">{T.checkIncomplete}</p>:null}
        {data.canPlan && data.plans!==null?<PlanAdvicePanel advice={visiblePlanAdvice}/>:null}
        {data.canMarkets && data.markets!==null?<SegmentAdvicePanel advice={visibleSegmentAdvice}/>:null}
      </div>
    </Drawer>
  </ViewLayout>;
}
